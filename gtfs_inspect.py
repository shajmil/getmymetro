#!/usr/bin/env python3
"""
KMRL GTFS inspector + schedule-based position engine proof.

Phase 0 of the Kochi Transit plan, in one file. No dependencies beyond the
Python standard library.

Usage:
    python3 gtfs_inspect.py KMRLOpenData.zip
    python3 gtfs_inspect.py KMRLOpenData.zip --at 08:40
    python3 gtfs_inspect.py path/to/unzipped/folder

It answers, from the feed itself:
  1. Is the feed still valid today, or has its service period expired?
  2. Is the timetable exact (stop_times) or headway-based (frequencies)?
     -> this decides whether you can say "the 08:37 train" at all.
  3. Are there shapes to interpolate train positions along?
  4. What do the fares look like (flat / zone / origin-destination)?
  5. Right now, how many trains are running, and where is each one?

Step 5 is the whole "live map" that kochimetro.keralam.co shows. If it prints
trains with positions, you can build that map.
"""

from __future__ import annotations

import argparse
import csv
import io
import math
import os
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

IST = timedelta(hours=5, minutes=30)

# ---------------------------------------------------------------- feed loading


class Feed:
    """Reads GTFS from a .zip or a directory. Tolerates BOM and stray spaces."""

    def __init__(self, path: str):
        self.path = path
        self._zip = None
        if os.path.isdir(path):
            self.names = sorted(
                n for n in os.listdir(path) if n.lower().endswith(".txt")
            )
        else:
            self._zip = zipfile.ZipFile(path)
            # GTFS files can sit inside a folder in the archive.
            self.names = sorted(
                os.path.basename(n)
                for n in self._zip.namelist()
                if n.lower().endswith(".txt") and not n.endswith("/")
            )
        self._cache: dict[str, list[dict]] = {}

    def has(self, name: str) -> bool:
        return name in self.names

    def _raw(self, name: str) -> bytes:
        if self._zip is None:
            with open(os.path.join(self.path, name), "rb") as fh:
                return fh.read()
        for n in self._zip.namelist():
            if os.path.basename(n) == name:
                return self._zip.read(n)
        raise KeyError(name)

    def rows(self, name: str) -> list[dict]:
        """All rows of a GTFS file as dicts, with keys and values stripped."""
        if name in self._cache:
            return self._cache[name]
        if not self.has(name):
            self._cache[name] = []
            return []
        text = self._raw(name).decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        out = []
        for row in reader:
            clean = {}
            for k, v in row.items():
                if k is None:
                    continue
                clean[k.strip()] = (v or "").strip()
            out.append(clean)
        self._cache[name] = out
        return out


# ------------------------------------------------------------ time and geometry


def parse_gtfs_time(value: str) -> int | None:
    """'25:10:00' -> seconds since the start of the service day. Not a clock time."""
    if not value:
        return None
    parts = value.split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) > 2 and parts[2] else 0
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def fmt_seconds(total: int) -> str:
    """Seconds since service-day start -> a label a person can read."""
    day = total // 86400
    rem = total % 86400
    label = f"{rem // 3600:02d}:{rem % 3600 // 60:02d}"
    return f"{label}+{day}d" if day else label


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def now_ist() -> datetime:
    return datetime.utcnow() + IST


# ------------------------------------------------------------------- reporting


def h1(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def kv(key: str, value) -> None:
    print(f"  {key:<34} {value}")


# --------------------------------------------------------------- the inspection


def report_files(feed: Feed) -> None:
    h1("1. FILES PRESENT")
    required = [
        "agency.txt",
        "stops.txt",
        "routes.txt",
        "trips.txt",
        "stop_times.txt",
    ]
    optional = [
        "calendar.txt",
        "calendar_dates.txt",
        "shapes.txt",
        "frequencies.txt",
        "fare_attributes.txt",
        "fare_rules.txt",
        "transfers.txt",
        "feed_info.txt",
        "pathways.txt",
        "levels.txt",
        "translations.txt",
    ]
    for name in required:
        mark = "ok  " if feed.has(name) else "MISSING"
        kv(f"{mark} {name}", f"{len(feed.rows(name))} rows" if feed.has(name) else "")
    for name in optional:
        if feed.has(name):
            kv(f"ok   {name}", f"{len(feed.rows(name))} rows")
        else:
            kv(f"--   {name}", "not present")
    extras = set(feed.names) - set(required) - set(optional)
    if extras:
        kv("non-standard files", ", ".join(sorted(extras)))


def report_agency(feed: Feed) -> str:
    h1("2. AGENCY AND TIMEZONE")
    tz = ""
    for row in feed.rows("agency.txt"):
        kv("agency_name", row.get("agency_name", ""))
        tz = row.get("agency_timezone", "")
        kv("agency_timezone", tz or "(missing)")
        kv("agency_lang", row.get("agency_lang", "(none)"))
    if tz and tz != "Asia/Kolkata":
        print(f"  WARNING: timezone is {tz}, not Asia/Kolkata.")
    for row in feed.rows("feed_info.txt"):
        kv("feed_version", row.get("feed_version", "(none)"))
        kv("feed_start_date", row.get("feed_start_date", "(none)"))
        kv("feed_end_date", row.get("feed_end_date", "(none)"))
        kv("feed_publisher", row.get("feed_publisher_name", "(none)"))
    return tz


def report_validity(feed: Feed, today: date) -> bool:
    """The staleness check. A feed whose service period ended is the top risk."""
    h1("3. IS THE FEED STILL VALID TODAY?")
    starts, ends = [], []
    for row in feed.rows("calendar.txt"):
        for key, bucket in (("start_date", starts), ("end_date", ends)):
            raw = row.get(key, "")
            if len(raw) == 8 and raw.isdigit():
                bucket.append(date(int(raw[:4]), int(raw[4:6]), int(raw[6:])))
    exception_dates = []
    for row in feed.rows("calendar_dates.txt"):
        raw = row.get("date", "")
        if len(raw) == 8 and raw.isdigit():
            exception_dates.append(date(int(raw[:4]), int(raw[4:6]), int(raw[6:])))

    kv("today (IST)", today.isoformat())
    if starts and ends:
        kv("calendar.txt service period", f"{min(starts)}  ->  {max(ends)}")
    if exception_dates:
        kv(
            "calendar_dates.txt range",
            f"{min(exception_dates)}  ->  {max(exception_dates)}",
        )

    latest = max(ends + exception_dates) if (ends or exception_dates) else None
    if latest is None:
        print("  UNKNOWN: no calendar data, so service validity cannot be checked.")
        return False
    if latest < today:
        days = (today - latest).days
        print()
        print(f"  EXPIRED: service ended {latest} ({days} days ago).")
        print("  No service is active today. Anything schedule-based will show")
        print("  zero trains until KMRL republishes, or until you shift dates.")
        return False
    print()
    print(f"  VALID: service runs through {latest}.")
    return True


def report_network(feed: Feed) -> None:
    h1("4. NETWORK SHAPE")
    stops = feed.rows("stops.txt")
    platforms = [s for s in stops if s.get("location_type", "0") in ("", "0")]
    stations = [s for s in stops if s.get("location_type") == "1"]
    entrances = [s for s in stops if s.get("location_type") == "2"]
    kv("stops.txt rows", len(stops))
    kv("  platforms / plain stops", len(platforms))
    kv("  parent stations", len(stations))
    kv("  entrances", len(entrances))
    if not entrances:
        print("  NOTE: no entrances. Walking time must be estimated to the stop")
        print("        point, which for a metro is the middle of the viaduct.")

    non_ascii = [s for s in stops if any(ord(c) > 127 for c in s.get("stop_name", ""))]
    kv("stop names with non-ASCII", f"{len(non_ascii)} (Malayalam present? )")
    if feed.has("translations.txt"):
        kv("translations.txt", "present -> bilingual names available")
    else:
        kv("translations.txt", "absent -> you must source Malayalam names yourself")

    lats = [float(s["stop_lat"]) for s in stops if s.get("stop_lat")]
    lons = [float(s["stop_lon"]) for s in stops if s.get("stop_lon")]
    if lats and lons:
        kv("bounding box lat", f"{min(lats):.5f} .. {max(lats):.5f}")
        kv("bounding box lon", f"{min(lons):.5f} .. {max(lons):.5f}")
        if not (9.7 <= min(lats) and max(lats) <= 10.3):
            print("  WARNING: coordinates fall outside the Kochi area.")

    routes = feed.rows("routes.txt")
    kv("routes", len(routes))
    for r in routes[:10]:
        kv(
            f"  route {r.get('route_id','')}",
            f"{r.get('route_short_name','')} {r.get('route_long_name','')}".strip(),
        )

    trips = feed.rows("trips.txt")
    kv("trips", len(trips))
    kv("direction_id values", dict(Counter(t.get("direction_id", "") for t in trips)))
    kv("services referenced", len({t.get("service_id", "") for t in trips}))
    with_shape = sum(1 for t in trips if t.get("shape_id"))
    kv("trips carrying shape_id", f"{with_shape} of {len(trips)}")


def report_schedule_kind(feed: Feed) -> str:
    """The question that decides the whole leave-by design."""
    h1("5. EXACT TIMETABLE OR HEADWAYS?")
    freqs = feed.rows("frequencies.txt")
    stop_times = feed.rows("stop_times.txt")
    kv("stop_times.txt rows", len(stop_times))
    kv("frequencies.txt rows", len(freqs))

    filled = sum(1 for st in stop_times if st.get("departure_time"))
    kv("stop_times with departure_time", f"{filled} of {len(stop_times)}")

    times = [
        parse_gtfs_time(st.get("departure_time", ""))
        for st in stop_times
        if st.get("departure_time")
    ]
    times = [t for t in times if t is not None]
    if times:
        kv("earliest departure", fmt_seconds(min(times)))
        kv("latest departure", fmt_seconds(max(times)))
        past_midnight = sum(1 for t in times if t >= 86400)
        kv("times at or past 24:00:00", past_midnight)
        if past_midnight:
            print("  -> Do not parse these with JavaScript Date. Treat as offsets.")

    print()
    if freqs:
        exact = {f.get("exact_times", "0") for f in freqs}
        if exact <= {"1"}:
            print("  VERDICT: frequencies.txt with exact_times=1.")
            print("  Trips are generated at fixed headways, but each generated trip")
            print("  has a real departure time. You CAN name a departure.")
            return "frequencies_exact"
        print("  VERDICT: headway-based (frequencies.txt, exact_times=0).")
        print("  There is no such thing as 'the 08:37 train' in this feed. Only")
        print("  'a train every N minutes'. Leave-by must be phrased as:")
        print("     'Leave by 08:24 to catch any train arriving by 09:00.'")
        print("  A live map can only show plausible trains, not real ones.")
        return "frequencies"
    if filled:
        print("  VERDICT: exact timetable (stop_times.txt).")
        print("  Every trip has real times, so you can name a departure and")
        print("  interpolate a position between two stations. This is the good case.")
        return "stop_times"
    print("  VERDICT: no usable times. Feed is unusable for scheduling.")
    return "none"


def report_shapes(feed: Feed) -> None:
    h1("6. SHAPES (needed to draw trains on the line)")
    shapes = feed.rows("shapes.txt")
    if not shapes:
        print("  No shapes.txt. Trains can only be placed on the straight line")
        print("  between two stations, which will visibly cut corners on the map.")
        print("  Fallback: trace the alignment yourself from OpenStreetMap.")
        return
    by_shape = defaultdict(list)
    for row in shapes:
        try:
            by_shape[row["shape_id"]].append(
                (
                    int(float(row["shape_pt_sequence"])),
                    float(row["shape_pt_lat"]),
                    float(row["shape_pt_lon"]),
                )
            )
        except (KeyError, ValueError):
            continue
    kv("distinct shapes", len(by_shape))
    for sid, pts in list(by_shape.items())[:6]:
        pts.sort()
        length = sum(
            haversine_m((pts[i][1], pts[i][2]), (pts[i + 1][1], pts[i + 1][2]))
            for i in range(len(pts) - 1)
        )
        kv(f"  {sid}", f"{len(pts)} points, {length/1000:.1f} km")
    has_dist = any(r.get("shape_dist_traveled") for r in shapes)
    kv("shape_dist_traveled present", "yes" if has_dist else "no (compute it yourself)")


def report_fares(feed: Feed) -> None:
    h1("7. FARES")
    attrs = feed.rows("fare_attributes.txt")
    rules = feed.rows("fare_rules.txt")
    if not attrs:
        print("  No fare_attributes.txt. Fares must come from KMRL's fare chart")
        print("  page instead, and will need manual updating when prices change.")
        return
    kv("fare_attributes rows", len(attrs))
    kv("fare_rules rows", len(rules))
    prices = sorted({a.get("price", "") for a in attrs})
    kv("distinct prices", ", ".join(prices[:20]))
    kv("currency", ", ".join({a.get("currency_type", "") for a in attrs}))

    uses_od = any(r.get("origin_id") and r.get("destination_id") for r in rules)
    uses_contains = any(r.get("contains_id") for r in rules)
    print()
    if uses_od:
        print("  Origin/destination zone fares. Map each stop's zone_id, then look")
        print("  up the (origin_zone, destination_zone) pair. This is the usual")
        print("  metro pattern and gives exact fares.")
    elif uses_contains:
        print("  Zone-containment fares.")
    elif rules:
        print("  Route-based fares only. Probably a flat fare per route.")
    else:
        print("  fare_attributes with no rules: a single flat fare.")
    zones = {s.get("zone_id", "") for s in feed.rows("stops.txt") if s.get("zone_id")}
    kv("stops carrying zone_id", len(zones))


# ------------------------------------------- the live-map engine, run against now


def build_index(feed: Feed):
    stops = {s["stop_id"]: s for s in feed.rows("stops.txt") if s.get("stop_id")}
    trips = {t["trip_id"]: t for t in feed.rows("trips.txt") if t.get("trip_id")}
    by_trip = defaultdict(list)
    for st in feed.rows("stop_times.txt"):
        tid = st.get("trip_id")
        if not tid:
            continue
        seq = st.get("stop_sequence", "0")
        try:
            seq_i = int(float(seq))
        except ValueError:
            seq_i = 0
        by_trip[tid].append(
            {
                "seq": seq_i,
                "stop_id": st.get("stop_id", ""),
                "arr": parse_gtfs_time(st.get("arrival_time", "")),
                "dep": parse_gtfs_time(st.get("departure_time", "")),
            }
        )
    for tid in by_trip:
        by_trip[tid].sort(key=lambda r: r["seq"])
        # Fill missing times so interpolation never divides by None.
        rows = by_trip[tid]
        for r in rows:
            if r["arr"] is None:
                r["arr"] = r["dep"]
            if r["dep"] is None:
                r["dep"] = r["arr"]
    return stops, trips, by_trip


def active_services(feed: Feed, service_day: date) -> set[str]:
    """Which service_ids run on this service day, honouring calendar_dates."""
    weekday = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ][service_day.weekday()]
    stamp = service_day.strftime("%Y%m%d")
    active = set()
    for row in feed.rows("calendar.txt"):
        sid = row.get("service_id", "")
        start, end = row.get("start_date", ""), row.get("end_date", "")
        if start and end and not (start <= stamp <= end):
            continue
        if row.get(weekday, "0") == "1":
            active.add(sid)
    for row in feed.rows("calendar_dates.txt"):
        if row.get("date", "") != stamp:
            continue
        sid = row.get("service_id", "")
        if row.get("exception_type", "") == "1":
            active.add(sid)
        elif row.get("exception_type", "") == "2":
            active.discard(sid)
    if not feed.rows("calendar.txt") and not feed.rows("calendar_dates.txt"):
        # No calendar at all: assume every service runs, so the demo still works.
        active = {t.get("service_id", "") for t in feed.rows("trips.txt")}
    return active


def report_live_positions(feed: Feed, when: datetime, limit: int = 12) -> int:
    """This is the whole 'live map' trick, computed from the timetable alone."""
    h1(f"8. TRAINS RUNNING AT {when.strftime('%Y-%m-%d %H:%M')} IST (from schedule)")
    stops, trips, by_trip = build_index(feed)
    if not by_trip:
        print("  No stop_times, so no positions can be computed.")
        return 0

    seconds_today = when.hour * 3600 + when.minute * 60 + when.second

    # A trip that started yesterday can still be running after midnight, so
    # check both service days.
    candidates = []
    for offset_days, sec in (
        (0, seconds_today),
        (1, seconds_today + 86400),  # yesterday's service day, still in progress
    ):
        service_day = when.date() - timedelta(days=offset_days)
        running = active_services(feed, service_day)
        for tid, rows in by_trip.items():
            trip = trips.get(tid, {})
            if trip.get("service_id", "") not in running:
                continue
            if not rows or rows[0]["dep"] is None or rows[-1]["arr"] is None:
                continue
            if not (rows[0]["dep"] <= sec <= rows[-1]["arr"]):
                continue
            candidates.append((tid, trip, rows, sec, service_day))

    if not candidates:
        print("  Zero trains. Either the service has ended for the day, or the")
        print("  feed's calendar does not cover today (see section 3).")
        return 0

    kv("trains running", len(candidates))
    print()
    print(
        f"  {'trip':<14} {'dir':<4} {'from':<18} {'to':<18} "
        f"{'progress':<9} position"
    )
    print("  " + "-" * 86)

    shown = 0
    for tid, trip, rows, sec, _svc in sorted(candidates)[:limit]:
        prev_row, next_row = None, None
        for i in range(len(rows) - 1):
            if rows[i]["dep"] <= sec <= rows[i + 1]["arr"]:
                prev_row, next_row = rows[i], rows[i + 1]
                break
        if prev_row is None:
            # Dwelling at a station.
            for r in rows:
                if r["arr"] <= sec <= r["dep"]:
                    prev_row = next_row = r
                    break
        if prev_row is None:
            continue

        a = stops.get(prev_row["stop_id"], {})
        b = stops.get(next_row["stop_id"], {})
        try:
            lat1, lon1 = float(a["stop_lat"]), float(a["stop_lon"])
            lat2, lon2 = float(b["stop_lat"]), float(b["stop_lon"])
        except (KeyError, ValueError):
            continue

        span = max(1, (next_row["arr"] or sec) - (prev_row["dep"] or sec))
        t = 0.0 if prev_row is next_row else min(
            1.0, max(0.0, (sec - prev_row["dep"]) / span)
        )
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t

        print(
            f"  {tid[:14]:<14} {trip.get('direction_id','?'):<4} "
            f"{a.get('stop_name','?')[:18]:<18} {b.get('stop_name','?')[:18]:<18} "
            f"{t*100:>6.0f}%   {lat:.5f},{lon:.5f}"
        )
        shown += 1

    if len(candidates) > shown:
        print(f"  ... and {len(candidates) - shown} more")

    print()
    print("  These coordinates are INTERPOLATED, not measured. Whatever you build,")
    print("  label them as scheduled positions, never as live GPS.")
    return len(candidates)


def report_integrity(feed: Feed) -> None:
    h1("9. REFERENTIAL INTEGRITY")
    stop_ids = {s.get("stop_id") for s in feed.rows("stops.txt")}
    trip_ids = {t.get("trip_id") for t in feed.rows("trips.txt")}
    route_ids = {r.get("route_id") for r in feed.rows("routes.txt")}
    service_ids = {c.get("service_id") for c in feed.rows("calendar.txt")}
    service_ids |= {c.get("service_id") for c in feed.rows("calendar_dates.txt")}
    shape_ids = {s.get("shape_id") for s in feed.rows("shapes.txt")}

    problems = []
    bad = {st.get("stop_id") for st in feed.rows("stop_times.txt")} - stop_ids
    if bad:
        problems.append(f"stop_times references {len(bad)} unknown stop_id")
    bad = {st.get("trip_id") for st in feed.rows("stop_times.txt")} - trip_ids
    if bad:
        problems.append(f"stop_times references {len(bad)} unknown trip_id")
    bad = {t.get("route_id") for t in feed.rows("trips.txt")} - route_ids
    if bad:
        problems.append(f"trips references {len(bad)} unknown route_id")
    bad = {t.get("service_id") for t in feed.rows("trips.txt")} - service_ids
    if bad and service_ids:
        problems.append(f"trips references {len(bad)} unknown service_id")
    bad = {t.get("shape_id") for t in feed.rows("trips.txt") if t.get("shape_id")}
    bad -= shape_ids
    if bad:
        problems.append(f"trips references {len(bad)} unknown shape_id")

    counts = Counter(st.get("trip_id") for st in feed.rows("stop_times.txt"))
    short = [tid for tid, n in counts.items() if n < 2]
    if short:
        problems.append(f"{len(short)} trips have fewer than 2 stop_times")

    if problems:
        for p in problems:
            print(f"  PROBLEM: {p}")
    else:
        print("  No broken references found.")


def verdict(feed: Feed, kind: str, valid: bool, running: int) -> None:
    h1("10. WHAT THIS MEANS FOR THE BUILD")
    print("  Schedule-based live map (what kochimetro.keralam.co does):")
    if kind in ("stop_times", "frequencies_exact") and running:
        print("    YES - the engine above already produced train positions.")
    elif kind in ("stop_times", "frequencies_exact") and not valid:
        print("    YES, but the feed's calendar has expired. Republished data needed.")
    elif kind == "frequencies":
        print("    APPROXIMATE ONLY - headways give plausible trains, not real ones.")
    else:
        print("    NO - the feed has no usable times.")

    print()
    print("  Leave-by engine:")
    if kind == "stop_times":
        print("    Can name a departure: 'Leave by 08:24 for the 08:37 from Kaloor.'")
    elif kind == "frequencies":
        print("    Must be phrased by headway: 'Leave by 08:24, trains every N min.'")
    else:
        print("    Blocked until times are available.")

    print()
    print("  Still missing for leave-by, from any GTFS:")
    print("    - walking time from the user to the station (needs OSM routing)")
    print("    - time inside the station: security, ticket, stairs (3-6 min, guess it")
    print("      per station and make it configurable)")
    print()
    print("  Attribution required by KMRL's terms, put it in the UI:")
    print('    "Contains data provided by Kochi Metro Rail Limited"')
    print("    and do not imply KMRL endorses the app.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("feed", help="KMRLOpenData.zip, a GTFS .zip, or a folder")
    ap.add_argument("--at", help="time to evaluate, HH:MM (default: now IST)")
    ap.add_argument("--date", help="date to evaluate, YYYY-MM-DD (default: today IST)")
    args = ap.parse_args()

    if not os.path.exists(args.feed):
        print(f"No such file or folder: {args.feed}", file=sys.stderr)
        return 2

    try:
        feed = Feed(args.feed)
    except zipfile.BadZipFile:
        print("That file is not a valid zip archive.", file=sys.stderr)
        return 2

    when = now_ist()
    if args.date:
        d = datetime.strptime(args.date, "%Y-%m-%d")
        when = when.replace(year=d.year, month=d.month, day=d.day)
    if args.at:
        hh, mm = args.at.split(":")[:2]
        when = when.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)

    print(f"Feed: {args.feed}")
    print(f"Evaluating at: {when.strftime('%Y-%m-%d %H:%M')} IST")

    report_files(feed)
    report_agency(feed)
    valid = report_validity(feed, when.date())
    report_network(feed)
    kind = report_schedule_kind(feed)
    report_shapes(feed)
    report_fares(feed)
    running = report_live_positions(feed, when)
    report_integrity(feed)
    verdict(feed, kind, valid, running)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
