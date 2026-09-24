#!/usr/bin/env python3
"""
Emit the prerender manifest: every station and origin-destination page.

The competitor serves one URL with an empty <div id="root">, so it can only
rank for head terms. This produces 625 pages per language (25 stations +
25x24 ordered pairs), each carrying real timings, fares and stop lists from
the feed, so they are substantive answers rather than doorway pages.

No dependencies beyond the standard library. Reuses the feed loader from
gtfs_inspect.py so there is one place that knows how to read GTFS.

Usage:
    python3 build_pages.py KMRLOpenData
    python3 build_pages.py KMRLOpenData.zip --out build
    python3 build_pages.py KMRLOpenData --base-url https://getmymetro.com

Outputs:
    build/pages.json    one entry per page, ready for a prerenderer
    build/sitemap.xml   every URL, with the feed's build date
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import quote

from gtfs_inspect import Feed, parse_gtfs_time

# Service ids in this feed. WK is Monday-Saturday, not Monday-Friday: naming it
# "weekday" would be wrong and would leak into the page copy.
SERVICE_LABELS = {"WK": "mon_sat", "WE": "sunday"}

# KMRL's own "Book a Ticket" button, lifted verbatim from corporate.kochimetro.org.
# Third-party articles give a different number (90486 90486) and a different
# syntax ("BOOK <route> <date>"); both are wrong. This is the one KMRL ships.
BOOKING_NUMBER = "919188957488"
BOOKING_TEXT = "Book Ticket"

# Appending the journey would be more useful, but we do not know the bot's
# grammar and a message it cannot parse is worse than a generic one. Flip this
# only after testing a real conversation end to end.
BOOKING_PREFILL_JOURNEY = False

# Copy templates per language. The Malayalam strings are a starting point and
# SHOULD BE REVIEWED BY A NATIVE SPEAKER before launch - machine-shaped meta
# copy reads badly and is exactly the kind of thing that loses trust.
COPY = {
    "en": {
        "station_title": "{name} Metro Station - Timings, First & Last Train",
        "station_desc": (
            "Kochi Metro timings at {name}. First train {first}, last train "
            "{last}, {trains} trains a day. Fares, next departures and full "
            "schedule for both directions."
        ),
        "route_title": "{origin} to {destination} Metro - Timings & Fare {fare}",
        "route_desc": (
            "Kochi Metro from {origin} to {destination}. First train {first}, "
            "last train {last}, {trains} trains daily, journey {duration} "
            "minutes, fare {fare}. Full timetable and stops."
        ),
    },
    "ml": {
        "station_title": "{name} മെട്രോ സ്റ്റേഷൻ - സമയം, ആദ്യ, അവസാന ട്രെയിൻ",
        "station_desc": (
            "{name} കൊച്ചി മെട്രോ സമയം. ആദ്യ ട്രെയിൻ {first}, അവസാന ട്രെയിൻ "
            "{last}, പ്രതിദിനം {trains} ട്രെയിനുകൾ. നിരക്ക്, അടുത്ത ട്രെയിനുകൾ, "
            "പൂർണ്ണ സമയവിവരം."
        ),
        "route_title": "{origin} മുതൽ {destination} വരെ മെട്രോ - സമയം, നിരക്ക് {fare}",
        "route_desc": (
            "{origin} മുതൽ {destination} വരെ കൊച്ചി മെട്രോ. ആദ്യ ട്രെയിൻ {first}, "
            "അവസാന ട്രെയിൻ {last}, പ്രതിദിനം {trains} ട്രെയിനുകൾ, യാത്ര "
            "{duration} മിനിറ്റ്, നിരക്ക് {fare}."
        ),
    },
}


# ------------------------------------------------------------------- formatting


def slugify(name: str) -> str:
    """'M.G Road' -> 'mg-road'. Latin slugs in every language: Malayalam URLs
    percent-encode into unreadable strings and gain nothing for ranking."""
    s = name.lower().replace(".", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def booking_url(origin: str = "", destination: str = "") -> str:
    """Deep link to KMRL's official WhatsApp booking chat.

    wa.me opens the chat with the text ready and the passenger presses send
    themselves - nothing is sent on their behalf. Label it in the UI as KMRL's
    channel, not ours; the licence forbids implying endorsement.
    """
    text = BOOKING_TEXT
    if BOOKING_PREFILL_JOURNEY and origin and destination:
        text = f"{BOOKING_TEXT} {origin} to {destination}"
    return f"https://wa.me/{BOOKING_NUMBER}?text={quote(text)}"


def fmt_clock(total: int) -> str:
    """Seconds since service-day start -> '12:03 AM'.

    Handles times past 24:00 properly, which is where the competitor's app
    shows 24:01 as '12:01 PM'. Rolling over is the whole point.
    """
    rem = total % 86400
    h, m = rem // 3600, rem % 3600 // 60
    suffix = "AM" if h < 12 else "PM"
    hh = h % 12 or 12
    return f"{hh}:{m:02d} {suffix}"


# ------------------------------------------------------------------ feed indexes


def load_names(feed: Feed) -> dict[str, dict[str, str]]:
    """stop_id -> {'en': ..., 'ml': ..., 'hi': ...}"""
    names: dict[str, dict[str, str]] = {}
    for s in feed.rows("stops.txt"):
        names[s["stop_id"]] = {"en": s.get("stop_name", "")}
    for t in feed.rows("translations.txt"):
        if t.get("table_name") != "stops" or t.get("field_name") != "stop_name":
            continue
        rid, lang = t.get("record_id", ""), t.get("language", "")
        if rid in names and lang:
            names[rid][lang] = t.get("translation", "")
    return names


def load_fares(feed: Feed) -> dict[tuple[str, str], float]:
    price = {
        a["fare_id"]: float(a["price"])
        for a in feed.rows("fare_attributes.txt")
        if a.get("price")
    }
    fares = {}
    for r in feed.rows("fare_rules.txt"):
        o, d, fid = r.get("origin_id"), r.get("destination_id"), r.get("fare_id")
        if o and d and fid in price:
            fares[(o, d)] = price[fid]
    return fares


def load_trips(feed: Feed) -> dict[str, list[dict]]:
    """trip_id -> ordered stop rows with times resolved to seconds."""
    trips = {t["trip_id"]: t for t in feed.rows("trips.txt")}
    by_trip: dict[str, list[dict]] = defaultdict(list)
    for st in feed.rows("stop_times.txt"):
        tid = st.get("trip_id")
        if tid not in trips:
            continue
        by_trip[tid].append(
            {
                "seq": int(float(st.get("stop_sequence", 0))),
                "stop_id": st.get("stop_id", ""),
                "arr": parse_gtfs_time(st.get("arrival_time", "")),
                "dep": parse_gtfs_time(st.get("departure_time", "")),
            }
        )
    for tid, rows in by_trip.items():
        rows.sort(key=lambda r: r["seq"])
        rows[0]["service"] = trips[tid].get("service_id", "")
        rows[0]["direction"] = trips[tid].get("direction_id", "")
    return by_trip


def index_pairs(by_trip: dict[str, list[dict]]):
    """(origin, destination, service) -> list of (departure, arrival) seconds.

    Every trip contributes every forward pair it serves, so short-turn trips
    are counted for the segments they actually run. Dropping them is how the
    competitor lost its first four trains of the day.
    """
    pairs = defaultdict(list)
    for rows in by_trip.values():
        service = rows[0].get("service", "")
        ids = [r["stop_id"] for r in rows]
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                dep, arr = rows[i]["dep"], rows[j]["arr"]
                if dep is None or arr is None:
                    continue
                pairs[(ids[i], ids[j], service)].append((dep, arr))
    for key in pairs:
        pairs[key].sort()
    return pairs


# ----------------------------------------------------------------- page building


def index_through(by_trip: dict[str, list[dict]], order: dict[str, int]):
    """(stop_id, service) -> last boardable departure that runs to the end of the line.

    CLAUDE.md finding 9 is the reason this exists, and it is the single most
    dangerous fact in the dataset. The last departure from a platform is not
    the last train that gets you anywhere: at the 20 stations from Kalamassery
    south the final towards-Aluva train terminates at Muttom 51-53 minutes
    after the last one that actually reaches Aluva, and the four northernmost
    stations mirror it southbound. A page - or a meta description in a search
    result, where nothing can correct it - that answers "last train 11:44 PM"
    for MG Road strands the passenger it exists to help. The honest answer is
    10:52 PM.

    A trip's own final stop is an arrival, not a boardable departure, so it is
    excluded. Direction is read from the stop order rather than direction_id,
    so this stays correct if the feed's direction_id convention ever flips.
    """
    last: dict[tuple[str, str], int] = {}
    ends = (min(order.values()), max(order.values()))
    for rows in by_trip.values():
        service = rows[0].get("service", "")
        ids = [r["stop_id"] for r in rows]
        if len(ids) < 2:
            continue
        forward = order[ids[-1]] > order[ids[0]]
        terminus = order[ids[-1]]
        if terminus != (ends[1] if forward else ends[0]):
            continue  # a short-turn: it reaches no end of the line
        for i in range(len(ids) - 1):
            dep = rows[i]["dep"]
            if dep is None:
                continue
            key = (ids[i], service)
            if dep > last.get(key, -1):
                last[key] = dep
    return last


def service_summary(runs: list[tuple[int, int]]) -> dict | None:
    if not runs:
        return None
    durations = sorted(round((a - d) / 60) for d, a in runs)
    return {
        "trains": len(runs),
        "first_departure": fmt_clock(runs[0][0]),
        "first_arrival": fmt_clock(runs[0][1]),
        "last_departure": fmt_clock(runs[-1][0]),
        "last_arrival": fmt_clock(runs[-1][1]),
        "duration_min": durations[0],
        "duration_typical": durations[len(durations) // 2],
        "departures": [fmt_clock(d) for d, _ in runs],
    }


def build_pages(feed: Feed) -> list[dict]:
    stops = feed.rows("stops.txt")
    names = load_names(feed)
    fares = load_fares(feed)
    by_trip = load_trips(feed)
    order = {s["stop_id"]: i for i, s in enumerate(stops)}
    pairs = index_pairs(by_trip)
    through = index_through(by_trip, order)

    pages: list[dict] = []

    for lang in ("en", "ml"):
        copy = COPY[lang]
        prefix = "" if lang == "en" else "/ml"

        def label(stop_id: str) -> str:
            return names[stop_id].get(lang) or names[stop_id]["en"]

        for s in stops:
            sid = s["stop_id"]
            i = order[sid]
            summaries = {}
            for svc, key in SERVICE_LABELS.items():
                runs = [
                    run
                    for (o, _d, service), rs in pairs.items()
                    if o == sid and service == svc
                    for run in rs
                ]
                # Departures from this station, deduplicated across destinations.
                deps = sorted({d for d, _ in runs})
                if deps:
                    # `last_departure` is the last train off the platform,
                    # whatever it does. `last_through_departure` is the last
                    # one that runs to an end of the line - see
                    # index_through(). They differ by 51-53 minutes at 20
                    # stations, and it is the second one a passenger needs.
                    last_through = through.get((sid, svc))
                    summaries[key] = {
                        "trains": len(deps),
                        "first_departure": fmt_clock(deps[0]),
                        "last_departure": fmt_clock(deps[-1]),
                        "last_through_departure": (
                            fmt_clock(last_through) if last_through is not None else None
                        ),
                    }
            headline = summaries.get("mon_sat") or {}
            pages.append(
                {
                    "type": "station",
                    "lang": lang,
                    "path": f"{prefix}/station/{slugify(names[sid]['en'])}",
                    "stop_id": sid,
                    "name": label(sid),
                    "names": names[sid],
                    "lat": float(s["stop_lat"]),
                    "lon": float(s["stop_lon"]),
                    "wheelchair": s.get("wheelchair_boarding") == "1",
                    "title": copy["station_title"].format(name=label(sid)),
                    "description": copy["station_desc"].format(
                        name=label(sid),
                        first=headline.get("first_departure", "-"),
                        # The through train, never the short-turn. A search
                        # result that advertises a train terminating at Muttom
                        # depot is worse than no result at all.
                        last=(
                            headline.get("last_through_departure")
                            or headline.get("last_departure", "-")
                        ),
                        trains=headline.get("trains", 0),
                    ),
                    "service": summaries,
                    "booking_url": booking_url(),
                    # "Towards Tripunithura" means nothing to someone who wants
                    # Kaloor. Ship the served list so the UI can answer the
                    # question actually being asked: which platform?
                    "platforms": [
                        {
                            "direction": "0",
                            "towards": label(stops[-1]["stop_id"]),
                            "serves": [label(s["stop_id"]) for s in stops[i + 1 :]],
                        },
                        {
                            "direction": "1",
                            "towards": label(stops[0]["stop_id"]),
                            "serves": [
                                label(s["stop_id"]) for s in stops[:i][::-1]
                            ],
                        },
                    ],
                    "destinations": [
                        {
                            "stop_id": d["stop_id"],
                            "name": label(d["stop_id"]),
                            "fare": fares.get((sid, d["stop_id"])),
                            "path": f"{prefix}/route/{slugify(names[sid]['en'])}"
                            f"-to-{slugify(names[d['stop_id']]['en'])}",
                        }
                        for d in stops
                        if d["stop_id"] != sid
                    ],
                }
            )

        for o in stops:
            for d in stops:
                oid, did = o["stop_id"], d["stop_id"]
                if oid == did:
                    continue
                summaries = {}
                for svc, key in SERVICE_LABELS.items():
                    got = service_summary(pairs.get((oid, did, svc), []))
                    if got:
                        summaries[key] = got
                if not summaries:
                    continue  # no direct service in this direction
                headline = summaries.get("mon_sat") or next(iter(summaries.values()))
                fare = fares.get((oid, did))
                lo, hi = sorted((order[oid], order[did]))
                between = [
                    label(s["stop_id"])
                    for s in stops[lo + 1 : hi]
                ]
                pages.append(
                    {
                        "type": "route",
                        "lang": lang,
                        "path": f"{prefix}/route/{slugify(names[oid]['en'])}"
                        f"-to-{slugify(names[did]['en'])}",
                        "origin": oid,
                        "destination": did,
                        "origin_name": label(oid),
                        "destination_name": label(did),
                        "fare": fare,
                        "title": copy["route_title"].format(
                            origin=label(oid),
                            destination=label(did),
                            fare=f"Rs {fare:.0f}" if fare else "",
                        ),
                        "description": copy["route_desc"].format(
                            origin=label(oid),
                            destination=label(did),
                            first=headline["first_departure"],
                            last=headline["last_departure"],
                            trains=headline["trains"],
                            duration=headline["duration_typical"],
                            fare=f"Rs {fare:.0f}" if fare else "",
                        ),
                        "service": summaries,
                        "stops_between": between,
                        "booking_url": booking_url(
                            names[oid]["en"], names[did]["en"]
                        ),
                    }
                )

    return pages


def write_sitemap(pages: list[dict], base_url: str, path: str) -> None:
    """Every URL, in both languages, with a complete hreflang set on each.

    Three things that were wrong before, and all three cost indexing:

    * Only the English URL got a <loc>. Google's rule is that every language
      version is listed and that each one declares every version including
      itself; declaring the pair once from the English side leaves 625
      Malayalam URLs with no <loc> anywhere. They are now separate <url>
      entries carrying the same alternate set.
    * No x-default. Without it a searcher in a third language gets whichever
      version Google guesses.
    * The home pages were missing entirely - / and /ml, the two URLs most
      likely to be linked to.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    base = base_url.rstrip("/")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]

    # Canonical (English) paths, home first, each emitted once per language.
    canonical = ["/"] + [p["path"] for p in pages if p["lang"] == "en"]

    for canon in canonical:
        en = f"{base}{canon}"
        ml = f"{base}/ml" if canon == "/" else f"{base}/ml{canon}"
        for loc in (en, ml):
            lines.append("  <url>")
            lines.append(f"    <loc>{loc}</loc>")
            lines.append(
                f'    <xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
            )
            lines.append(
                f'    <xhtml:link rel="alternate" hreflang="ml" href="{ml}"/>'
            )
            lines.append(
                f'    <xhtml:link rel="alternate" hreflang="x-default" href="{en}"/>'
            )
            lines.append(f"    <lastmod>{stamp}</lastmod>")
            lines.append("  </url>")

    lines.append("</urlset>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("feed", help="KMRLOpenData.zip, a GTFS .zip, or a folder")
    ap.add_argument("--out", default="build", help="output directory")
    ap.add_argument(
        "--base-url",
        default="https://example.com",
        help="site origin, used for the sitemap",
    )
    args = ap.parse_args()

    if not os.path.exists(args.feed):
        print(f"No such file or folder: {args.feed}", file=sys.stderr)
        return 2

    feed = Feed(args.feed)
    os.makedirs(args.out, exist_ok=True)

    pages = build_pages(feed)

    info = feed.rows("feed_info.txt")
    manifest = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feed_version": info[0].get("feed_version", "") if info else "",
        "feed_end_date": info[0].get("feed_end_date", "") if info else "",
        "page_count": len(pages),
        "pages": pages,
    }
    pages_path = os.path.join(args.out, "pages.json")
    with open(pages_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))

    sitemap_path = os.path.join(args.out, "sitemap.xml")
    write_sitemap(pages, args.base_url, sitemap_path)

    by_kind = defaultdict(int)
    for p in pages:
        by_kind[(p["lang"], p["type"])] += 1
    print(f"Feed version {manifest['feed_version']} -> {len(pages)} pages")
    for (lang, kind), n in sorted(by_kind.items()):
        print(f"  {lang}  {kind:<8} {n}")
    print(f"  {pages_path} ({os.path.getsize(pages_path)/1024:,.0f} KB)")
    print(f"  {sitemap_path} ({os.path.getsize(sitemap_path)/1024:,.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
