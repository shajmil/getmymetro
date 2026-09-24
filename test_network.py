#!/usr/bin/env python3
"""
Prove app/public/data/network.json still reproduces the raw feed, exactly.

The bundle is a compressed re-encoding of KMRLOpenData/: trips collapsed into
72 stopping patterns, times turned into deltas, shapes simplified. Every one of
those transforms is a chance to lose a train, and losing trains is not
hypothetical - the competitor's converter silently drops the first four
departures of the day and breaks the last one at midnight (CLAUDE.md finding 7).

So this decodes the shipped artifact with its own decoder - it does NOT import
build_network - and compares the result against the CSVs field by field:

    450 trips          id, service, direction, and the stops they actually serve
    10,726 stop events every arrival and every departure, to the second
    625 fare pairs     every ordered pair, including the self-pairs
    25 stops           id, three names, coordinates, line order
    2 shapes           retained points byte-identical to the feed's, in order
    feed metadata      version, dates, and a sha256 recomputed from the files

Run it:
    python3 test_network.py                  # from the repo root
    python3 -m unittest test_network -v

Exit code is non-zero on any mismatch, so it can gate a build.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import unittest
from collections import defaultdict
from decimal import Decimal

from gtfs_inspect import Feed, parse_gtfs_time

ROOT = os.path.dirname(os.path.abspath(__file__))
FEED_DIR = os.path.join(ROOT, "KMRLOpenData")
BUNDLE = os.path.join(ROOT, "app", "public", "data", "network.json")

# Counted as the tests run and printed at the end, so a pass reports how much
# it actually looked at rather than just saying "ok".
TALLY: dict[str, int] = defaultdict(int)


# ---------------------------------------------------------------- the decoder
# Deliberately written from the format description, not shared with the writer.
# A decoder that imports the encoder's helpers can only prove they agree with
# themselves.


def undelta(values: list[int]) -> list[int]:
    out, running = [], 0
    for v in values:
        running += v
        out.append(running)
    return out


def decode_stops(bundle: dict) -> list[dict]:
    s = bundle["stops"]
    return [
        {
            "id": s["id"][i],
            "en": s["en"][i],
            "ml": s["ml"][i],
            "hi": s["hi"][i],
            "lat": s["lat"][i],
            "lon": s["lon"][i],
            "index": i,
        }
        for i in range(len(s["id"]))
    ]


def decode_trips(bundle: dict) -> list[dict]:
    """Rebuild every trip's full stop list with absolute seconds."""
    t = bundle["trips"]
    p = t["pattern"]
    stop_ids = bundle["stops"]["id"]
    service_ids = bundle["services"]["id"]
    starts = undelta(t["t0"])

    trips = []
    for i, trip_id in enumerate(t["id"]):
        pattern = t["pat"][i]
        direction = p["dir"][pattern]
        first = p["first"][pattern]
        count = p["n"][pattern]
        hops = p["hops"][pattern]
        step = 1 if direction == 0 else -1

        arrival = starts[i]
        departure = arrival + t["dwell0"][i]
        events = [
            {"stop_id": stop_ids[first], "arr": arrival, "dep": departure}
        ]
        for k in range(1, count):
            arrival = departure + hops[2 * (k - 1)]
            departure = arrival + hops[2 * (k - 1) + 1]
            events.append(
                {
                    "stop_id": stop_ids[first + step * k],
                    "arr": arrival,
                    "dep": departure,
                }
            )

        trips.append(
            {
                "id": trip_id,
                "service": service_ids[int(t["service"][i])],
                "direction": direction,
                "stops": events,
            }
        )
    return trips


def decode_fares(bundle: dict) -> dict[tuple[str, str], float]:
    f = bundle["fares"]
    ids = bundle["stops"]["id"]
    return {
        (origin, ids[j]): f["bands"][int(digit)]
        for origin, row in zip(ids, f["matrix"])
        for j, digit in enumerate(row)
    }


def decode_shapes(bundle: dict) -> dict[str, dict]:
    s = bundle["shapes"]
    scale = 10 ** s["precision"]
    out = {}
    for i, shape_id in enumerate(s["id"]):
        lat = undelta(s["lat"][i])
        lon = undelta(s["lon"][i])
        dist = undelta(s["dist"][i])
        out[shape_id] = {
            # Kept as scaled integers as well as degrees: comparing integers
            # against the feed is exact, comparing floats is a judgement call.
            "scaled": list(zip(lat, lon)),
            "points": [(a / scale, b / scale) for a, b in zip(lat, lon)],
            "dist": dist,
            "stop_dist": dict(zip(bundle["stops"]["id"], s["stop_dist"][i])),
        }
    return out


# ------------------------------------------------------------------ the feed


def raw_trips(feed: Feed) -> dict[str, dict]:
    trips = {t["trip_id"]: t for t in feed.rows("trips.txt")}
    rows = defaultdict(list)
    for st in feed.rows("stop_times.txt"):
        rows[st["trip_id"]].append(st)
    out = {}
    for trip_id, sts in rows.items():
        sts.sort(key=lambda r: int(float(r["stop_sequence"])))
        out[trip_id] = {
            "id": trip_id,
            "service": trips[trip_id]["service_id"],
            "direction": int(trips[trip_id]["direction_id"]),
            "shape": trips[trip_id]["shape_id"],
            "stops": [
                {
                    "stop_id": r["stop_id"],
                    "arr": parse_gtfs_time(r["arrival_time"]),
                    "dep": parse_gtfs_time(r["departure_time"]),
                }
                for r in sts
            ],
        }
    return out


def raw_fares(feed: Feed) -> dict[tuple[str, str], float]:
    price = {a["fare_id"]: float(a["price"]) for a in feed.rows("fare_attributes.txt")}
    return {
        (r["origin_id"], r["destination_id"]): price[r["fare_id"]]
        for r in feed.rows("fare_rules.txt")
    }


def raw_names(feed: Feed) -> dict[str, dict[str, str]]:
    names = {s["stop_id"]: {"en": s["stop_name"]} for s in feed.rows("stops.txt")}
    for t in feed.rows("translations.txt"):
        if t["table_name"] == "stops" and t["field_name"] == "stop_name":
            names[t["record_id"]][t["language"]] = t["translation"]
    return names


def raw_shapes(feed: Feed) -> dict[str, list[tuple[str, str, float]]]:
    pts = defaultdict(list)
    for r in feed.rows("shapes.txt"):
        pts[r["shape_id"]].append(
            (
                int(float(r["shape_pt_sequence"])),
                r["shape_pt_lat"],
                r["shape_pt_lon"],
                float(r["shape_dist_traveled"]),
            )
        )
    return {k: [(a, b, c) for _, a, b, c in sorted(v)] for k, v in pts.items()}


# ------------------------------------------------------------------ fixtures


class Fixture(unittest.TestCase):
    bundle: dict
    feed: Feed

    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.exists(BUNDLE):
            raise unittest.SkipTest(
                f"{BUNDLE} is missing. Run: python3 build_network.py KMRLOpenData"
            )
        with open(BUNDLE, encoding="utf-8") as fh:
            cls.bundle = json.load(fh)
        cls.feed = Feed(FEED_DIR)


# ------------------------------------------------------------------ the tests


class TestStops(Fixture):
    def test_every_stop_matches_the_feed(self) -> None:
        rows = self.feed.rows("stops.txt")
        names = raw_names(self.feed)
        decoded = decode_stops(self.bundle)

        self.assertEqual(len(decoded), len(rows), "stop count changed")
        for i, (got, want) in enumerate(zip(decoded, rows)):
            sid = want["stop_id"]
            with self.subTest(stop=sid):
                self.assertEqual(got["id"], sid)
                self.assertEqual(got["index"], i, "line order index drifted")
                self.assertEqual(got["en"], names[sid]["en"])
                self.assertEqual(got["ml"], names[sid]["ml"])
                self.assertEqual(got["hi"], names[sid]["hi"])
                # Coordinates are compared as decimals: float(x) == float(y) is
                # true for values that print differently, and the published
                # digits are what feeds nearest-station.
                self.assertEqual(
                    Decimal(str(got["lat"])), Decimal(want["stop_lat"]), "lat rounded"
                )
                self.assertEqual(
                    Decimal(str(got["lon"])), Decimal(want["stop_lon"]), "lon rounded"
                )
            TALLY["stops"] += 1

    def test_line_order_is_the_order_trips_travel(self) -> None:
        """Position in the stops array is load-bearing - it IS the line order.

        Nothing in stops.txt declares it, so it is only true as long as every
        trip walks a contiguous run of it.
        """
        order = {s["id"]: s["index"] for s in decode_stops(self.bundle)}
        for trip in raw_trips(self.feed).values():
            indexes = [order[s["stop_id"]] for s in trip["stops"]]
            step = 1 if trip["direction"] == 0 else -1
            self.assertEqual(
                indexes,
                list(range(indexes[0], indexes[0] + step * len(indexes), step)),
                f"{trip['id']} does not walk the line in order",
            )


class TestServices(Fixture):
    def test_service_days_match_calendar(self) -> None:
        week = (
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        )
        rows = {c["service_id"]: c for c in self.feed.rows("calendar.txt")}
        services = self.bundle["services"]
        self.assertEqual(set(services["id"]), set(rows))
        for sid, days in zip(services["id"], services["days"]):
            self.assertEqual(days, "".join(rows[sid][d] for d in week), sid)
            TALLY["services"] += 1

    def test_wk_is_monday_to_saturday_not_monday_to_friday(self) -> None:
        """Naming WK 'weekday' would be wrong and would leak into copy."""
        days = dict(zip(self.bundle["services"]["id"], self.bundle["services"]["days"]))
        self.assertEqual(days["WK"], "1111110")
        self.assertEqual(days["WE"], "0000001")

    def test_no_validity_window_is_exposed_as_a_filter(self) -> None:
        """calendar.txt ends both services on 20251231. A consumer that treats
        that as a filter renders an empty timetable for every 2026 date
        (CLAUDE.md finding 6), so the dates live under `feed` as provenance and
        must not appear on a service."""
        blob = json.dumps(self.bundle["services"])
        self.assertNotIn("20251231", blob)
        self.assertNotIn("start_date", blob)
        self.assertNotIn("end_date", blob)


class TestTrips(Fixture):
    def test_every_trip_and_stop_event_round_trips(self) -> None:
        want = raw_trips(self.feed)
        got = {t["id"]: t for t in decode_trips(self.bundle)}

        self.assertEqual(
            sorted(got), sorted(want), "the set of trip ids changed"
        )
        self.assertEqual(len(got), 450, "this feed has 450 trips")

        events = 0
        for trip_id in sorted(want):
            a, b = got[trip_id], want[trip_id]
            with self.subTest(trip=trip_id):
                self.assertEqual(a["service"], b["service"])
                self.assertEqual(a["direction"], b["direction"])
                self.assertEqual(
                    len(a["stops"]), len(b["stops"]), "stop count changed"
                )
                for i, (x, y) in enumerate(zip(a["stops"], b["stops"])):
                    self.assertEqual(x["stop_id"], y["stop_id"], f"stop {i + 1}")
                    self.assertEqual(x["arr"], y["arr"], f"arrival at stop {i + 1}")
                    self.assertEqual(x["dep"], y["dep"], f"departure at stop {i + 1}")
                    events += 1
            TALLY["trips"] += 1
        TALLY["stop_events"] = events
        self.assertEqual(events, 10726, "this feed has 10,726 stop events")

    def test_times_are_seconds_not_clock_strings(self) -> None:
        for trip in decode_trips(self.bundle):
            for event in trip["stops"]:
                self.assertIsInstance(event["arr"], int)
                self.assertIsInstance(event["dep"], int)

    def test_the_midnight_crossing_survives(self) -> None:
        """WK_253 runs past 24:00. Its last arrival is 86,475 s, which is
        00:01:15 the next morning - not 12:01 PM, and not a smaller number.
        The competitor's app cannot represent this; the encoding must."""
        trips = {t["id"]: t for t in decode_trips(self.bundle)}
        self.assertIn("WK_253", trips)
        latest = max(e["dep"] for e in trips["WK_253"]["stops"])
        self.assertGreaterEqual(latest, 86400, "WK_253 no longer crosses midnight")

        past_midnight = [
            (t["id"], e["stop_id"], e["arr"])
            for t in trips.values()
            for e in t["stops"]
            if e["arr"] >= 86400
        ]
        self.assertTrue(past_midnight, "no times past 24:00 survived the encoding")
        self.assertEqual(max(e["dep"] for t in trips.values() for e in t["stops"]), 86625)

    def test_the_first_four_trains_of_the_day_survive(self) -> None:
        """The four pre-06:00 departures are revenue service, not depot moves,
        and the competitor's converter drops all four (CLAUDE.md finding 7)."""
        trips = decode_trips(self.bundle)
        early = sorted(
            (t["stops"][0]["dep"], t["id"]) for t in trips if t["stops"][0]["dep"] < 6 * 3600
        )
        self.assertEqual(
            early,
            [(18000, "WK_4"), (19200, "WK_256"), (20700, "WK_18"), (21420, "WK_12")],
        )

    def test_short_turn_trips_are_kept_whole(self) -> None:
        """Partial trips must survive AND stay partial, so a departure board
        can label them (CLAUDE.md finding 10).

        Counted from the feed, which CLAUDE.md gets slightly wrong. It says
        "20 of 450 trips do not run the full line". 38 do not. Its breakdown
        (15 + 2 direction-0 and 3 direction-1) is right, but it only counts
        trips that TERMINATE early; another 20 START late, and 2 do both.

        The distinction matters: a train that ends early strands a passenger
        and must be labelled. A train that starts late simply never appears at
        the stations before its origin, so it is harmless. 20 is the number
        that needs labelling; 38 is the number that must survive the encoding.
        """
        stops = self.bundle["stops"]["id"]
        trips = decode_trips(self.bundle)

        partial = [t for t in trips if len(t["stops"]) < len(stops)]
        self.assertEqual(len(partial), 38, "partial-trip count changed")

        terminates_early = defaultdict(int)
        starts_late = 0
        for t in trips:
            end_of_line = stops[-1] if t["direction"] == 0 else stops[0]
            start_of_line = stops[0] if t["direction"] == 0 else stops[-1]
            if t["stops"][-1]["stop_id"] != end_of_line:
                terminates_early[(t["direction"], t["stops"][-1]["stop_id"])] += 1
            if t["stops"][0]["stop_id"] != start_of_line:
                starts_late += 1

        self.assertEqual(sum(terminates_early.values()), 20)
        self.assertEqual(dict(terminates_early), {(0, "MUTT"): 15, (0, "KVTR"): 2, (1, "MUTT"): 3})
        self.assertEqual(starts_late, 20)


class TestFares(Fixture):
    def test_all_625_pairs_round_trip(self) -> None:
        want = raw_fares(self.feed)
        got = decode_fares(self.bundle)
        self.assertEqual(len(want), 625, "this feed prices 25 x 25 pairs")
        self.assertEqual(set(got), set(want), "the set of priced pairs changed")
        for pair in sorted(want):
            self.assertEqual(float(got[pair]), want[pair], pair)
            TALLY["fares"] += 1

    def test_currency_and_bands_come_from_the_feed(self) -> None:
        attrs = self.feed.rows("fare_attributes.txt")
        self.assertEqual(
            sorted(float(b) for b in self.bundle["fares"]["bands"]),
            sorted({float(a["price"]) for a in attrs}),
        )
        self.assertEqual(
            self.bundle["fares"]["currency"],
            sorted({a["currency_type"] for a in attrs})[0],
        )

    def test_self_pairs_are_kept_at_the_published_price(self) -> None:
        """The feed prices A->A at KMRL's minimum. The licence forbids
        modifying the data to make it inaccurate, so the bundle keeps them and
        the UI blocks the journey instead."""
        fares = decode_fares(self.bundle)
        for sid in self.bundle["stops"]["id"]:
            self.assertEqual(fares[(sid, sid)], 10)


class TestShapes(Fixture):
    def test_retained_points_are_the_feed_s_own_points_in_order(self) -> None:
        """Simplification may drop points. It may never move, reorder or
        invent one, so every retained point must be byte-identical to a feed
        point and the retained sequence must be a subsequence of the original.
        """
        raw = raw_shapes(self.feed)
        decoded = decode_shapes(self.bundle)
        scale = self.bundle["shapes"]["precision"]
        self.assertEqual(set(decoded), set(raw))

        for shape_id, shape in decoded.items():
            original = [
                (
                    int(Decimal(lat).scaleb(scale)),
                    int(Decimal(lon).scaleb(scale)),
                    int(round(dist * 1000)),
                )
                for lat, lon, dist in raw[shape_id]
            ]
            kept = [
                (lat, lon, d)
                for (lat, lon), d in zip(shape["scaled"], shape["dist"])
            ]
            cursor = 0
            for point in kept:
                while cursor < len(original) and original[cursor] != point:
                    cursor += 1
                self.assertLess(
                    cursor, len(original), f"{shape_id}: {point} is not a feed point"
                )
                cursor += 1
                TALLY["shape_points"] += 1
            self.assertEqual(kept[0], original[0], f"{shape_id}: start moved")
            self.assertEqual(kept[-1], original[-1], f"{shape_id}: end moved")

    def test_deviation_is_within_the_declared_tolerance(self) -> None:
        """The bundle publishes max_deviation_m. Recompute it rather than
        trusting it: a wrong number here is a claim about how wrong the drawn
        line is allowed to be."""
        raw = raw_shapes(self.feed)
        decoded = decode_shapes(self.bundle)
        tolerance = float(self.bundle["shapes"]["tolerance_m"])
        claimed = float(self.bundle["shapes"]["max_deviation_m"])

        worst = 0.0
        for shape_id, shape in decoded.items():
            lat0 = float(raw[shape_id][0][0])
            kx = 111320.0 * math.cos(math.radians(lat0))
            ky = 110540.0
            line = [(lon * kx, lat * ky) for lat, lon in shape["points"]]
            for lat, lon, _ in raw[shape_id]:
                px, py = float(lon) * kx, float(lat) * ky
                best = float("inf")
                for i in range(len(line) - 1):
                    ax, ay = line[i]
                    bx, by = line[i + 1]
                    dx, dy = bx - ax, by - ay
                    den = dx * dx + dy * dy
                    t = (
                        0.0
                        if den == 0
                        else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / den))
                    )
                    best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
                worst = max(worst, best)

        self.assertLessEqual(worst, tolerance + 1e-6, "simplification exceeded tolerance")
        self.assertAlmostEqual(worst, claimed, places=1, msg="max_deviation_m is wrong")

    def test_station_chainage_matches_stop_times(self) -> None:
        """stop_dist places a station on the drawn line. It comes from the
        feed's shape_dist_traveled, so it must equal it for every station in
        every direction."""
        trips = {t["trip_id"]: t for t in self.feed.rows("trips.txt")}
        want: dict[tuple[str, str], int] = {}
        for st in self.feed.rows("stop_times.txt"):
            key = (trips[st["trip_id"]]["shape_id"], st["stop_id"])
            want[key] = int(round(float(st["shape_dist_traveled"]) * 1000))

        decoded = decode_shapes(self.bundle)
        for (shape_id, stop_id), metres in sorted(want.items()):
            self.assertEqual(decoded[shape_id]["stop_dist"][stop_id], metres)
            TALLY["chainage"] += 1
        self.assertEqual(len(want), 50, "25 stations on each of 2 shapes")


class TestProvenance(Fixture):
    def test_feed_metadata_matches_feed_info(self) -> None:
        info = self.feed.rows("feed_info.txt")[0]
        feed = self.bundle["feed"]
        self.assertEqual(feed["version"], info["feed_version"])
        self.assertEqual(feed["start_date"], info["feed_start_date"])
        self.assertEqual(feed["end_date"], info["feed_end_date"])
        self.assertEqual(
            feed["timezone"], self.feed.rows("agency.txt")[0]["agency_timezone"]
        )

    def test_sha256_identifies_this_exact_feed(self) -> None:
        h = hashlib.sha256()
        for name in sorted(self.feed.names):
            h.update(name.encode())
            h.update(b"\0")
            h.update(self.feed._raw(name))
        self.assertEqual(self.bundle["feed"]["sha256"], h.hexdigest())

    def test_the_confirmation_date_is_present_and_dated(self) -> None:
        """The EXPIRED state fires on this going stale, not on feed_end_date."""
        confirmed = self.bundle["feed"]["confirmed"]
        self.assertRegex(confirmed, r"^\d{4}-\d{2}(-\d{2})?$")
        self.assertGreater(confirmed, self.bundle["feed"]["end_date"][:4])

    def test_attribution_is_verbatim(self) -> None:
        """Breaching attribution terminates the data licence automatically."""
        self.assertEqual(
            self.bundle["feed"]["attribution"],
            "Contains data provided by Kochi Metro Rail Limited",
        )

    def test_bundle_is_within_its_gzip_budget(self) -> None:
        import gzip

        with open(BUNDLE, "rb") as fh:
            raw = fh.read()
        size = len(gzip.compress(raw, 9))
        TALLY["gzip_bytes"] = size
        TALLY["raw_bytes"] = len(raw)
        self.assertLessEqual(size, 20 * 1024, f"{size / 1024:.2f} KB gzipped, over 20 KB")

    def test_no_clock_strings_leaked_into_the_bundle(self) -> None:
        """A single 'HH:MM:SS' in here means someone reintroduced the format
        that breaks at midnight."""
        with open(BUNDLE, encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotRegex(text, r"\d{1,2}:\d{2}:\d{2}")


def _summary() -> None:
    print()
    print("  checked")
    print(f"    trips              {TALLY['trips']:,}")
    print(f"    stop events        {TALLY['stop_events']:,}")
    print(f"    fare pairs         {TALLY['fares']:,}")
    print(f"    stops              {TALLY['stops']:,}")
    print(f"    services           {TALLY['services']:,}")
    print(f"    shape points       {TALLY['shape_points']:,}")
    print(f"    station chainages  {TALLY['chainage']:,}")
    print(
        f"    bundle             {TALLY['raw_bytes']:,} B raw, "
        f"{TALLY['gzip_bytes']:,} B gzipped"
    )
    print()


if __name__ == "__main__":
    import sys

    result = unittest.main(exit=False, verbosity=2).result
    _summary()
    sys.exit(0 if result.wasSuccessful() else 1)
