#!/usr/bin/env python3
"""
Emit the runtime data bundle: the whole network, small enough to ship.

This is NOT build_pages.py. That one emits build/pages.json, a ~4 MB prerender
manifest which is build-time only and must never reach a browser. This emits
app/public/data/network.json, which every visitor downloads and the service
worker precaches, so the app works offline forever (there is no live data to
degrade - see CLAUDE.md finding 2).

Budget: 20 KB gzipped for the entire network. That is met by four choices:

  1. Columnar layout. One array per field instead of one object per record,
     so gzip sees runs of similar tokens instead of repeated key names.
  2. A trip-pattern dictionary. 450 trips reduce to 72 distinct stopping
     patterns; a trip is then a pattern id plus the time it starts.
  3. Delta encoding on the two long monotonic columns (trip start times,
     shape coordinates).
  4. Shape simplification (see --shape-tolerance).

Times are ALWAYS integer seconds from the start of the service day, never
clock strings and never anything a JS Date could touch. 24:01:15 is 86475.
That is the bug that breaks the competitor's app every night at midnight
(CLAUDE.md finding 7) and the encoding makes it unrepresentable here.

The output carries no build timestamp on purpose, so it is byte-reproducible
from the feed: if network.json changes in a diff, the DATA changed. Provenance
lives in `feed.sha256` plus the KMRL confirmation date instead.

No dependencies beyond the standard library. Reuses the feed loader from
gtfs_inspect.py so there is one place that knows how to read GTFS.

Usage:
    python3 build_network.py KMRLOpenData
    python3 build_network.py KMRLOpenData.zip --out app/public/data/network.json
    python3 build_network.py KMRLOpenData --shape-tolerance 5

Output:
    app/public/data/network.json

Verify with:
    python3 test_network.py
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import sys
from collections import defaultdict
from decimal import Decimal

from gtfs_inspect import Feed, parse_gtfs_time

# Schema version of network.json itself. Bump it when the shape of the file
# changes so the TypeScript loader can refuse a bundle it cannot decode rather
# than silently misreading one.
FORMAT_VERSION = 1

# Required verbatim by KMRL's open-data licence. Shipped inside the data so the
# UI can render it from the bundle and it cannot drift out of the app by being
# hardcoded somewhere and forgotten. See CLAUDE.md finding 1.
ATTRIBUTION = "Contains data provided by Kochi Metro Rail Limited"

# feed_end_date lapsed on 2025-12-31 but KMRL confirmed in correspondence that
# the timings themselves are still accurate (CLAUDE.md finding 6). The EXPIRED
# state fires on THIS date going stale, never on feed_end_date - warning about
# a feed the operator has confirmed is correct would itself be dishonest.
#
# Month precision, because that is the precision the correspondence is recorded
# at in CLAUDE.md. Do not invent a day. Re-confirm and move it forward.
TIMINGS_CONFIRMED = "2026-09"

# Perpendicular error allowed when simplifying the two alignment polylines.
# The schematic is drawn at 320-430 CSS px wide with no pan or zoom
# (docs/build-checklist.md, Phase 5). The line spans ~17.7 km north to south,
# so at a 600 px tall render one CSS pixel is ~30 m of ground and one device
# pixel at 3x DPR is ~10 m. 5 m is therefore half a device pixel on the
# sharpest phone this app targets: simplification that cannot be seen.
DEFAULT_SHAPE_TOLERANCE_M = 5.0

# Shape coordinates are emitted as integers scaled by 10^6 (~0.11 m). Verified
# against this feed: no shapes.txt coordinate carries more than 6 decimals, so
# every retained point is byte-exact, not rounded.
SHAPE_PRECISION = 6


# ------------------------------------------------------------------- geometry


def _planar(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """(lat, lon) -> local metres. Good to centimetres over a 28 km line."""
    kx = 111320.0 * math.cos(math.radians(points[0][0]))
    ky = 110540.0
    return [(lon * kx, lat * ky) for lat, lon in points]


def simplify(points: list[tuple[float, float]], tolerance_m: float) -> list[int]:
    """Ramer-Douglas-Peucker. Returns the indices of the points to keep.

    Iterative rather than recursive: 549 points would not blow the stack, but a
    republished feed with a denser alignment could, and this script must not be
    the reason a data refresh fails.
    """
    if len(points) < 3 or tolerance_m <= 0:
        return list(range(len(points)))

    flat = _planar(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = flat[a]
        bx, by = flat[b]
        dx, dy = bx - ax, by - ay
        den = math.hypot(dx, dy)
        worst, worst_i = -1.0, -1
        for i in range(a + 1, b):
            px, py = flat[i]
            if den == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / den
            if dist > worst:
                worst, worst_i = dist, i
        if worst > tolerance_m:
            keep[worst_i] = True
            stack.append((a, worst_i))
            stack.append((worst_i, b))

    return [i for i, k in enumerate(keep) if k]


def max_deviation_m(
    original: list[tuple[float, float]], kept: list[int]
) -> float:
    """Worst distance from a dropped point to the simplified polyline.

    RDP's tolerance is an input; this measures the error actually incurred, so
    the number published in the bundle is observed rather than claimed.
    """
    if len(kept) == len(original):
        return 0.0
    flat = _planar(original)
    line = [flat[i] for i in kept]
    worst = 0.0
    for px, py in flat:
        best = float("inf")
        for i in range(len(line) - 1):
            ax, ay = line[i]
            bx, by = line[i + 1]
            dx, dy = bx - ax, by - ay
            den = dx * dx + dy * dy
            t = 0.0 if den == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / den))
            best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
        worst = max(worst, best)
    return worst


# ------------------------------------------------------------------- encoding


def scaled(value: str, places: int) -> int:
    """'10.111073' -> 10111073, exactly. Decimal, not float, so a coordinate
    never lands a unit away because of binary rounding."""
    return int(Decimal(value).scaleb(places).to_integral_value())


def deltas(values: list[int]) -> list[int]:
    """[100, 103, 109] -> [100, 3, 6]. First value absolute, rest relative."""
    out = []
    previous = 0
    for v in values:
        out.append(v - previous)
        previous = v
    return out


def number(value: float) -> int | float:
    """10.0 -> 10, 12.5 -> 12.5. Keeps whole fares out of the JSON as '10.0'."""
    return int(value) if float(value).is_integer() else value


# --------------------------------------------------------------- feed indexes


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


def load_stop_times(feed: Feed) -> dict[str, list[dict]]:
    """trip_id -> stop rows in sequence order, times already in seconds."""
    by_trip: dict[str, list[dict]] = defaultdict(list)
    for st in feed.rows("stop_times.txt"):
        by_trip[st["trip_id"]].append(
            {
                "seq": int(float(st.get("stop_sequence", 0))),
                "stop_id": st.get("stop_id", ""),
                "arr": parse_gtfs_time(st.get("arrival_time", "")),
                "dep": parse_gtfs_time(st.get("departure_time", "")),
                "dist": st.get("shape_dist_traveled", ""),
            }
        )
    for rows in by_trip.values():
        rows.sort(key=lambda r: r["seq"])
    return by_trip


# ------------------------------------------------------------------- sections


def encode_stops(feed: Feed) -> tuple[dict, list[str]]:
    """25 stations in line order, trilingual, with coordinates unrounded.

    Array position IS the line order index; nothing else defines it, and
    build_trips asserts the feed agrees.

    Coordinates keep every digit the feed publishes (one stop has 7 decimals).
    They cost ~40 bytes to keep exact and they are the input to nearest-station,
    so there is no reason to round them.
    """
    rows = feed.rows("stops.txt")
    names = load_names(feed)
    ids = [s["stop_id"] for s in rows]
    missing = [i for i in ids if not names[i].get("ml") or not names[i].get("hi")]
    if missing:
        raise SystemExit(f"stops missing a translation: {missing}")
    return (
        {
            "id": ids,
            "en": [names[i]["en"] for i in ids],
            "ml": [names[i]["ml"] for i in ids],
            "hi": [names[i]["hi"] for i in ids],
            "lat": [float(s["stop_lat"]) for s in rows],
            "lon": [float(s["stop_lon"]) for s in rows],
        },
        ids,
    )


def encode_services(feed: Feed) -> tuple[dict, list[str]]:
    """Which weekdays each service runs, Monday first.

    Deliberately does NOT carry start_date/end_date as anything the app could
    filter on. calendar.txt ends both services on 20251231, so a spec-compliant
    consumer resolves zero services for any 2026 date and renders an empty
    timetable (CLAUDE.md finding 6). Service is resolved by day of week; the
    lapsed window is provenance, and lives under `feed`.
    """
    week = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    rows = feed.rows("calendar.txt")
    if not rows:
        raise SystemExit("calendar.txt is empty; service days cannot be derived")
    ids = [c["service_id"] for c in rows]
    return {"id": ids, "days": ["".join(c.get(d, "0") for d in week) for c in rows]}, ids


def encode_fares(feed: Feed, stop_ids: list[str]) -> dict:
    """The 625-pair table as 25 strings of 25 band digits.

    A lookup, never a calculation: fare is not a function of distance in this
    feed and computing it misprices 104 of the 600 travelled pairs.

    Self-pairs are kept at their published price because the feed prices them
    and the licence forbids modifying the data. Blocking A->A is the UI's job.
    """
    price = {
        a["fare_id"]: float(a["price"])
        for a in feed.rows("fare_attributes.txt")
        if a.get("price")
    }
    currency = {a.get("currency_type", "") for a in feed.rows("fare_attributes.txt")}
    lookup: dict[tuple[str, str], float] = {}
    for r in feed.rows("fare_rules.txt"):
        o, d, fid = r.get("origin_id"), r.get("destination_id"), r.get("fare_id")
        if o and d and fid in price:
            lookup[(o, d)] = price[fid]

    expected = len(stop_ids) ** 2
    if len(lookup) != expected:
        gaps = [(o, d) for o in stop_ids for d in stop_ids if (o, d) not in lookup]
        raise SystemExit(
            f"fare table has {len(lookup)} of {expected} pairs; missing {gaps[:5]}"
        )

    bands = sorted(set(lookup.values()))
    if len(bands) > 10:
        raise SystemExit(f"{len(bands)} fare bands will not fit one digit per pair")
    index = {p: str(i) for i, p in enumerate(bands)}
    return {
        "currency": sorted(currency)[0] if currency else "",
        "bands": [number(b) for b in bands],
        "matrix": ["".join(index[lookup[(o, d)]] for d in stop_ids) for o in stop_ids],
    }


def encode_trips(
    feed: Feed, stop_ids: list[str], service_ids: list[str]
) -> tuple[dict, int]:
    """450 trips as 72 stopping patterns plus a start time each.

    Every trip in this feed visits a contiguous run of stations in line order -
    ascending for direction 0, descending for direction 1 - which the loop below
    asserts rather than assumes. That is what lets a trip be (first station,
    stop count, direction) plus a list of hop times, and it is what collapses
    450 trips into 72 patterns.

    A pattern is the interleaved [run, dwell, run, dwell, ...] from the trip's
    first departure onwards. The trip carries its first ARRIVAL as the base and
    its opening dwell separately, because the opening dwell is the layover at
    the terminal and varies from 30 s to 692 s - folding it into the pattern
    would shatter the dictionary.

    Short-turn trips fall out for free: 20 of the 450 stop early, and they get
    their own patterns rather than being dropped. Dropping trips is exactly how
    the competitor lost the first four trains of the day.
    """
    trips = {t["trip_id"]: t for t in feed.rows("trips.txt")}
    by_trip = load_stop_times(feed)

    orphans = set(by_trip) ^ set(trips)
    if orphans:
        raise SystemExit(f"trips.txt and stop_times.txt disagree on {sorted(orphans)[:5]}")

    order = {sid: i for i, sid in enumerate(stop_ids)}
    service_index = {s: i for i, s in enumerate(service_ids)}

    pattern_index: dict[tuple, int] = {}
    patterns: list[tuple] = []
    records: list[dict] = []
    stop_events = 0

    for trip_id, rows in by_trip.items():
        trip = trips[trip_id]
        stop_events += len(rows)

        if [r["seq"] for r in rows] != list(range(1, len(rows) + 1)):
            raise SystemExit(f"{trip_id}: stop_sequence is not 1..n")
        if any(r["arr"] is None or r["dep"] is None for r in rows):
            raise SystemExit(f"{trip_id}: a stop_time has no arrival or departure")

        indexes = [order[r["stop_id"]] for r in rows]
        step = 1 if int(trip["direction_id"]) == 0 else -1
        if indexes != list(range(indexes[0], indexes[0] + step * len(rows), step)):
            raise SystemExit(
                f"{trip_id}: stops are not a contiguous run in line order "
                f"({indexes}). The pattern encoding depends on this."
            )

        hops: list[int] = []
        previous_departure = rows[0]["dep"]
        for r in rows[1:]:
            hops.append(r["arr"] - previous_departure)
            hops.append(r["dep"] - r["arr"])
            previous_departure = r["dep"]

        key = (int(trip["direction_id"]), indexes[0], len(rows), tuple(hops))
        if key not in pattern_index:
            pattern_index[key] = len(patterns)
            patterns.append(key)

        records.append(
            {
                "id": trip_id,
                "service": service_index[trip["service_id"]],
                "t0": rows[0]["arr"],
                "dwell0": rows[0]["dep"] - rows[0]["arr"],
                "pattern": pattern_index[key],
            }
        )

    # Chronological within each service. The delta column then counts forward
    # instead of jumping around, which is worth ~0.8 KB gzipped, and it happens
    # to be the order a departure board wants to read them in anyway.
    records.sort(key=lambda r: (r["service"], r["t0"], r["id"]))

    return (
        {
            "count": len(records),
            "stop_events": stop_events,
            "pattern": {
                "dir": [p[0] for p in patterns],
                "first": [p[1] for p in patterns],
                "n": [p[2] for p in patterns],
                "hops": [list(p[3]) for p in patterns],
            },
            "id": [r["id"] for r in records],
            # One digit per trip: 450 characters instead of a 450-element array.
            "service": "".join(str(r["service"]) for r in records),
            "t0": deltas([r["t0"] for r in records]),
            "dwell0": [r["dwell0"] for r in records],
            "pat": [r["pattern"] for r in records],
        },
        stop_events,
    )


def encode_shapes(
    feed: Feed, stop_ids: list[str], tolerance_m: float
) -> tuple[dict, list[tuple[str, int, int, float]]]:
    """Both alignment polylines, simplified, plus each station's chainage.

    `dist` is the feed's own shape_dist_traveled for the points that survive
    simplification, in metres, so chainage never has to be recomputed from the
    simplified geometry (which is fractionally shorter than the real one).
    `stop_dist` gives every station's position along its direction's shape, so
    the scheduled-position marker can be placed on the drawn line rather than
    on a straight hop between two stations.
    """
    points: dict[str, list[tuple[int, str, str, float]]] = defaultdict(list)
    for r in feed.rows("shapes.txt"):
        points[r["shape_id"]].append(
            (
                int(float(r["shape_pt_sequence"])),
                r["shape_pt_lat"],
                r["shape_pt_lon"],
                float(r["shape_dist_traveled"]),
            )
        )
    for v in points.values():
        v.sort()

    trips = {t["trip_id"]: t for t in feed.rows("trips.txt")}
    chainage: dict[str, dict[str, int]] = defaultdict(dict)
    for trip_id, rows in load_stop_times(feed).items():
        shape_id = trips[trip_id].get("shape_id", "")
        for r in rows:
            metres = int(round(float(r["dist"]) * 1000))
            seen = chainage[shape_id].setdefault(r["stop_id"], metres)
            if seen != metres:
                raise SystemExit(
                    f"{shape_id}/{r['stop_id']}: chainage differs between trips "
                    f"({seen} vs {metres} m)"
                )

    shape_ids = sorted(points)
    report: list[tuple[str, int, int, float]] = []
    out = {
        "id": shape_ids,
        "precision": SHAPE_PRECISION,
        "tolerance_m": number(tolerance_m),
        "lat": [],
        "lon": [],
        "dist": [],
        "stop_dist": [],
        "max_deviation_m": 0.0,
    }

    worst_overall = 0.0
    for shape_id in shape_ids:
        raw = points[shape_id]
        latlon = [(float(p[1]), float(p[2])) for p in raw]
        kept = simplify(latlon, tolerance_m)
        deviation = max_deviation_m(latlon, kept)
        worst_overall = max(worst_overall, deviation)
        report.append((shape_id, len(raw), len(kept), deviation))

        out["lat"].append(deltas([scaled(raw[i][1], SHAPE_PRECISION) for i in kept]))
        out["lon"].append(deltas([scaled(raw[i][2], SHAPE_PRECISION) for i in kept]))
        out["dist"].append(deltas([int(round(raw[i][3] * 1000)) for i in kept]))

        by_stop = chainage[shape_id]
        unknown = [s for s in stop_ids if s not in by_stop]
        if unknown:
            raise SystemExit(f"{shape_id}: no chainage for {unknown}")
        out["stop_dist"].append([by_stop[s] for s in stop_ids])

    out["max_deviation_m"] = round(worst_overall, 2)
    return out, report


def encode_feed_info(feed: Feed, digest: str) -> dict:
    """Provenance. `end_date` is here and nowhere else, on purpose."""
    info = feed.rows("feed_info.txt")
    row = info[0] if info else {}
    agency = feed.rows("agency.txt")
    return {
        "version": row.get("feed_version", ""),
        "start_date": row.get("feed_start_date", ""),
        # Lapsed 2025-12-31 and never rolled forward. Provenance only - it is
        # NOT a validity filter. See CLAUDE.md finding 6.
        "end_date": row.get("feed_end_date", ""),
        "confirmed": TIMINGS_CONFIRMED,
        "sha256": digest,
        "timezone": agency[0].get("agency_timezone", "") if agency else "",
        "attribution": ATTRIBUTION,
    }


def feed_digest(feed: Feed) -> str:
    """One hash over every .txt in the feed, name and bytes, in a fixed order.

    This is what the weekly feed-watch job compares. A KMRL republish that
    changes a single departure changes this string.
    """
    h = hashlib.sha256()
    for name in sorted(feed.names):
        h.update(name.encode())
        h.update(b"\0")
        h.update(feed._raw(name))
    return h.hexdigest()


# ----------------------------------------------------------------------- main


def build(feed: Feed, tolerance_m: float) -> tuple[dict, list]:
    stops, stop_ids = encode_stops(feed)
    services, service_ids = encode_services(feed)
    trips, _ = encode_trips(feed, stop_ids, service_ids)
    shapes, shape_report = encode_shapes(feed, stop_ids, tolerance_m)
    return (
        {
            "format": FORMAT_VERSION,
            "feed": encode_feed_info(feed, feed_digest(feed)),
            "stops": stops,
            "services": services,
            "fares": encode_fares(feed, stop_ids),
            "trips": trips,
            "shapes": shapes,
        },
        shape_report,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("feed", help="KMRLOpenData.zip, a GTFS .zip, or a folder")
    ap.add_argument(
        "--out",
        default=os.path.join("app", "public", "data", "network.json"),
        help="output path (default: app/public/data/network.json)",
    )
    ap.add_argument(
        "--shape-tolerance",
        type=float,
        default=DEFAULT_SHAPE_TOLERANCE_M,
        help=f"polyline simplification, metres (default: {DEFAULT_SHAPE_TOLERANCE_M})",
    )
    ap.add_argument(
        "--budget-kb",
        type=float,
        default=20.0,
        help="fail if the gzipped bundle exceeds this (default: 20)",
    )
    args = ap.parse_args()

    if not os.path.exists(args.feed):
        print(f"No such file or folder: {args.feed}", file=sys.stderr)
        return 2

    feed = Feed(args.feed)
    bundle, shape_report = build(feed, args.shape_tolerance)

    text = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    raw = text.encode("utf-8")
    compressed = gzip.compress(raw, 9)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)

    # Per-section gzip sizes are measured alone, so they overstate slightly:
    # gzipped together the sections share a dictionary and the total is smaller
    # than their sum. Useful for seeing where the bytes are, not for budgeting.
    print(f"Feed {bundle['feed']['version']}  sha256 {bundle['feed']['sha256'][:16]}...")
    print(f"  timings confirmed with KMRL: {bundle['feed']['confirmed']}")
    print()
    print(f"  {'section':<12}{'raw':>10}{'gzip':>10}")
    print("  " + "-" * 32)
    for key in ("stops", "services", "fares", "trips", "shapes"):
        part = json.dumps(bundle[key], ensure_ascii=False, separators=(",", ":")).encode()
        print(f"  {key:<12}{len(part):>10,}{len(gzip.compress(part, 9)):>10,}")
    print("  " + "-" * 32)
    print(f"  {'bundle':<12}{len(raw):>10,}{len(compressed):>10,}")
    print()
    print(f"  stops            {len(bundle['stops']['id'])}")
    print(
        f"  trips            {bundle['trips']['count']} "
        f"({bundle['trips']['stop_events']:,} stop events, "
        f"{len(bundle['trips']['pattern']['n'])} patterns)"
    )
    print(f"  fare pairs       {len(bundle['fares']['matrix']) ** 2}")
    for shape_id, before, after, deviation in shape_report:
        print(
            f"  shape {shape_id:<10} {before} -> {after} points, "
            f"max deviation {deviation:.2f} m"
        )
    print()
    print(f"  {args.out}")

    budget = int(args.budget_kb * 1024)
    if len(compressed) > budget:
        print(
            f"\n  x  {len(compressed)/1024:.2f} KB gzipped is over the "
            f"{args.budget_kb:.0f} KB budget",
            file=sys.stderr,
        )
        return 1
    print(
        f"  ok  {len(compressed)/1024:.2f} KB gzipped against a "
        f"{args.budget_kb:.0f} KB budget "
        f"({(budget - len(compressed))/1024:.2f} KB headroom)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
