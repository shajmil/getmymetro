/**
 * The independent oracle: `KMRLOpenData/` read straight off disk.
 *
 * Test scaffolding, excluded from the app build by `tsconfig.app.json`.
 *
 * The engine specs assert against *this*, not against the bundle the engine
 * loads, wherever it is practical. A fixture derived from `network.json` would
 * only prove that the bundle agrees with itself, and the same wrong assumption
 * about the timetable could then live in the encoder and the expectation at
 * once and never be caught. `network-codec.spec.ts` already established this
 * pattern for Phase 2; the engine reuses it rather than inventing a second one.
 *
 * Nothing here imports anything from the engine. That is deliberate: an oracle
 * that shares code with the thing it checks is not an oracle.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEED_DIR = join(process.cwd(), '..', 'KMRLOpenData');

/** Enough CSV for this feed: verified to contain no quoted fields at all. */
export function readFeedCsv(name: string): Record<string, string>[] {
  const text = readFileSync(join(FEED_DIR, name), 'utf8').replace(/^\uFEFF/, '');
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.length > 0);
  const columns = header.split(',').map((c) => c.trim());
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    columns.forEach((column, i) => {
      row[column] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

/**
 * `'24:01:15'` → `86475`.
 *
 * The four-line reference implementation, written out here so the specs never
 * have to borrow the engine's own idea of what a GTFS time means.
 */
export function gtfsSeconds(value: string): number {
  const [h, m, s] = value.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0);
}

export interface RawStopTime {
  readonly stopId: string;
  readonly arrival: number;
  readonly departure: number;
}

export interface RawTrip {
  readonly id: string;
  readonly service: string;
  readonly direction: number;
  readonly stops: readonly RawStopTime[];
}

/** Every trip in the feed, stop times sorted by `stop_sequence`. */
export function rawTrips(): RawTrip[] {
  const meta = new Map(readFeedCsv('trips.txt').map((t) => [t['trip_id'], t]));
  const rows = new Map<string, Record<string, string>[]>();
  for (const st of readFeedCsv('stop_times.txt')) {
    const list = rows.get(st['trip_id']) ?? [];
    list.push(st);
    rows.set(st['trip_id'], list);
  }
  const out: RawTrip[] = [];
  for (const [id, list] of rows) {
    list.sort((a, b) => Number(a['stop_sequence']) - Number(b['stop_sequence']));
    const t = meta.get(id);
    if (t === undefined) throw new Error(`stop_times references unknown trip ${id}`);
    out.push({
      id,
      service: t['service_id'],
      direction: Number(t['direction_id']),
      stops: list.map((r) => ({
        stopId: r['stop_id'],
        arrival: gtfsSeconds(r['arrival_time']),
        departure: gtfsSeconds(r['departure_time']),
      })),
    });
  }
  return out;
}

/** Stop ids in line order, straight from `stops.txt`. */
export function rawStopIds(): string[] {
  return readFeedCsv('stops.txt').map((s) => s['stop_id']);
}

/**
 * Boardable departures at one stop, one direction, one service, sorted.
 *
 * A trip's final stop is excluded — you cannot board where a train terminates.
 * This is the oracle for every departure-board assertion.
 */
export function rawDepartures(
  stopId: string,
  direction: number,
  service: string,
): { time: number; tripId: string; terminus: string }[] {
  const out: { time: number; tripId: string; terminus: string }[] = [];
  for (const trip of rawTrips()) {
    if (trip.service !== service || trip.direction !== direction) continue;
    for (let i = 0; i < trip.stops.length - 1; i++) {
      if (trip.stops[i].stopId !== stopId) continue;
      out.push({
        time: trip.stops[i].departure,
        tripId: trip.id,
        terminus: trip.stops[trip.stops.length - 1].stopId,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time || (a.tripId < b.tripId ? -1 : 1));
}
