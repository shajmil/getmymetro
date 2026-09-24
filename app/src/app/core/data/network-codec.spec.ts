/**
 * The shipped decoder, checked against the raw GTFS feed.
 *
 * `test_network.py` already proves the bundle reproduces the feed, but it
 * proves it with a Python decoder. This is the decoder that actually runs in
 * someone's browser, and a bug here ships wrong departure times just as
 * effectively as a bug in the encoder. So this repeats the whole comparison —
 * 450 trips, 10,726 stop events, 625 fare pairs — through `decodeNetwork`.
 *
 * It reads `KMRLOpenData/` directly rather than trusting a fixture: a fixture
 * derived from the bundle would only prove the bundle agrees with itself.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeNetwork, NetworkDataError } from './network-codec';
import { NETWORK_FORMAT, type NetworkBundle } from './network.types';
import { asSeconds } from './seconds';

// Vitest runs from `app/`; the feed and the bundle sit either side of it.
const FEED_DIR = join(process.cwd(), '..', 'KMRLOpenData');
const BUNDLE_PATH = join(process.cwd(), 'public', 'data', 'network.json');

/** Enough CSV for this feed: verified to contain no quoted fields at all. */
function readCsv(name: string): Record<string, string>[] {
  const text = readFileSync(join(FEED_DIR, name), 'utf8').replace(/^﻿/, '');
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.length > 0);
  const columns = header.split(',').map((c) => c.trim());
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    columns.forEach((column, i) => (row[column] = (cells[i] ?? '').trim()));
    return row;
  });
}

/** `'24:01:15'` → `86475`. The reference implementation, in four lines. */
function gtfsSeconds(value: string): number {
  const [h, m, s] = value.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8')) as NetworkBundle;
const network = decodeNetwork(bundle);

interface RawTrip {
  service: string;
  direction: number;
  stops: { stopId: string; arr: number; dep: number }[];
}

function rawTrips(): Map<string, RawTrip> {
  const meta = new Map(readCsv('trips.txt').map((t) => [t['trip_id'], t]));
  const rows = new Map<string, Record<string, string>[]>();
  for (const st of readCsv('stop_times.txt')) {
    const list = rows.get(st['trip_id']) ?? [];
    list.push(st);
    rows.set(st['trip_id'], list);
  }
  const out = new Map<string, RawTrip>();
  for (const [tripId, list] of rows) {
    list.sort((a, b) => Number(a['stop_sequence']) - Number(b['stop_sequence']));
    const t = meta.get(tripId)!;
    out.set(tripId, {
      service: t['service_id'],
      direction: Number(t['direction_id']),
      stops: list.map((r) => ({
        stopId: r['stop_id'],
        arr: gtfsSeconds(r['arrival_time']),
        dep: gtfsSeconds(r['departure_time']),
      })),
    });
  }
  return out;
}

describe('decodeNetwork against the raw feed', () => {
  it('reproduces all 450 trips and all 10,726 stop events', () => {
    const want = rawTrips();
    expect(network.trips.length).toBe(450);
    expect(want.size).toBe(450);
    expect([...network.tripsById.keys()].sort()).toEqual([...want.keys()].sort());

    let events = 0;
    // One assertion per trip rather than per event: 10,726 `expect` calls are
    // slow and a mismatch is reported just as precisely by the message.
    for (const trip of network.trips) {
      const expected = want.get(trip.id)!;
      const actual = trip.stops.map((e) => ({
        stopId: network.stops[e.stopIndex].id,
        arr: e.arrival as number,
        dep: e.departure as number,
      }));
      expect(trip.service, trip.id).toBe(expected.service);
      expect(trip.direction, trip.id).toBe(expected.direction);
      expect(actual, trip.id).toEqual(expected.stops);
      events += actual.length;
    }
    expect(events).toBe(10726);
  });

  it('reproduces all 625 fare pairs', () => {
    const price = new Map(
      readCsv('fare_attributes.txt').map((a) => [a['fare_id'], Number(a['price'])]),
    );
    const rules = readCsv('fare_rules.txt');
    expect(rules.length).toBe(625);

    for (const rule of rules) {
      const origin = network.stopsById.get(rule['origin_id'])!;
      const destination = network.stopsById.get(rule['destination_id'])!;
      expect(
        network.fares.matrix[origin.index][destination.index],
        `${rule['origin_id']}->${rule['destination_id']}`,
      ).toBe(price.get(rule['fare_id']));
    }
  });

  it('reproduces all 25 stops in line order with all three names', () => {
    const stops = readCsv('stops.txt');
    const names = new Map<string, Record<string, string>>();
    for (const t of readCsv('translations.txt')) {
      if (t['table_name'] !== 'stops' || t['field_name'] !== 'stop_name') continue;
      names.set(t['record_id'], {
        ...names.get(t['record_id']),
        [t['language']]: t['translation'],
      });
    }

    expect(network.stops.length).toBe(25);
    network.stops.forEach((stop, i) => {
      expect(stop.id).toBe(stops[i]['stop_id']);
      expect(stop.index).toBe(i);
      expect(stop.name.en).toBe(stops[i]['stop_name']);
      expect(stop.name.ml).toBe(names.get(stop.id)!['ml']);
      expect(stop.name.hi).toBe(names.get(stop.id)!['hi']);
      expect(stop.lat).toBe(Number(stops[i]['stop_lat']));
      expect(stop.lon).toBe(Number(stops[i]['stop_lon']));
    });
  });

  it('derives service days from calendar.txt, Monday-first', () => {
    // WK is Monday to Saturday. Calling it "weekday" would be wrong, and
    // Sunday is 7 here, never 0, so Date.getDay() cannot be passed in.
    const wk = network.servicesById.get('WK')!;
    expect([...wk.days].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const we = network.servicesById.get('WE')!;
    expect([...we.days]).toEqual([7]);
  });

  it('keeps the last train of the night past 24:00', () => {
    const wk253 = network.tripsById.get('WK_253')!;
    const last = Math.max(...wk253.stops.map((e) => e.departure));
    expect(last).toBeGreaterThanOrEqual(86_400);

    const latest = Math.max(
      ...network.trips.flatMap((t) => t.stops.map((e) => e.departure as number)),
    );
    // 24:03:45. A Date-based decoder cannot produce this number at all.
    expect(latest).toBe(86_625);
  });

  it('keeps the four pre-06:00 departures the competitor drops', () => {
    const early = network.trips
      .filter((t) => t.stops[0].departure < 6 * 3600)
      .map((t) => [t.stops[0].departure as number, t.id])
      .sort((a, b) => (a[0] as number) - (b[0] as number));
    expect(early).toEqual([
      [18000, 'WK_4'],
      [19200, 'WK_256'],
      [20700, 'WK_18'],
      [21420, 'WK_12'],
    ]);
  });

  it('keeps short-turn trips short so they can be labelled', () => {
    const partial = network.trips.filter((t) => t.stops.length < network.stops.length);
    expect(partial.length).toBe(38);

    const lastIndex = network.stops.length - 1;
    const terminatesEarly = network.trips.filter((t) => {
      const end = t.stops[t.stops.length - 1].stopIndex;
      return t.direction === 0 ? end !== lastIndex : end !== 0;
    });
    expect(terminatesEarly.length).toBe(20);
  });

  it('keeps every shape point the bundle carries on the feed alignment', () => {
    const feedPoints = new Map<string, Set<string>>();
    for (const r of readCsv('shapes.txt')) {
      const set = feedPoints.get(r['shape_id']) ?? new Set<string>();
      set.add(`${Number(r['shape_pt_lat'])},${Number(r['shape_pt_lon'])}`);
      feedPoints.set(r['shape_id'], set);
    }
    expect(network.shapes.length).toBe(2);
    for (const shape of network.shapes) {
      expect(shape.maxDeviationM).toBeLessThanOrEqual(shape.toleranceM);
      expect(shape.stopDistance.length).toBe(network.stops.length);
      for (const p of shape.points) {
        expect(feedPoints.get(shape.id)!.has(`${p.lat},${p.lon}`), shape.id).toBe(true);
      }
    }
  });

  it('carries the licence attribution and the confirmation date', () => {
    expect(network.feed.attribution).toBe('Contains data provided by Kochi Metro Rail Limited');
    expect(network.feed.confirmed).toMatch(/^\d{4}-\d{2}$/);
    // The lapsed window is provenance. It must be present and it must not be
    // what anything filters on.
    expect(network.feed.endDate).toBe('20251231');
    expect(network.feed.timezone).toBe('Asia/Kolkata');
  });
});

describe('decodeNetwork refuses bad input', () => {
  it('rejects a bundle in an unknown format', () => {
    expect(() => decodeNetwork({ ...bundle, format: NETWORK_FORMAT + 1 })).toThrow(
      NetworkDataError,
    );
  });

  it('rejects a bundle whose declared trip count does not match', () => {
    const broken = { ...bundle, trips: { ...bundle.trips, count: 449 } };
    expect(() => decodeNetwork(broken)).toThrow(/decoded 450 trips/);
  });

  it('rejects a bundle whose declared stop-event count does not match', () => {
    const broken = { ...bundle, trips: { ...bundle.trips, stop_events: 10_725 } };
    expect(() => decodeNetwork(broken)).toThrow(/decoded 10726 stop events/);
  });
});

describe('Seconds', () => {
  it('refuses anything that is not a whole, non-negative offset', () => {
    expect(() => asSeconds(Number.NaN)).toThrow(RangeError);
    expect(() => asSeconds(-1)).toThrow(RangeError);
    expect(() => asSeconds(1.5)).toThrow(RangeError);
    // 24:01:15 is ordinary, not an error.
    expect(asSeconds(86_475)).toBe(86_475);
  });
});
