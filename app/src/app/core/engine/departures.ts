/**
 * The departure board: what leaves next, what leaves after that, and whether
 * the one you can see is the last one.
 *
 * Three things here are not optional.
 *
 * **Short turns are labelled.** 20 of 450 trips end before the end of the line
 * (CLAUDE.md finding 10) — 18 at Muttom, the depot, and 2 at Kadavanthra. A
 * board that lists a time without its terminus puts an Aluva passenger on a
 * train that stops at a depot. The most vicious instance is the last train of
 * the night: from Kalamassery towards Aluva, the 12:01 AM runs one station and
 * terminates at Muttom, while the last train that actually reaches Aluva left
 * at 23:10. Both facts are on this board, and `lastThrough` is how the second
 * one is asked for.
 *
 * **Departures are merged across service days.** The list is sorted by real
 * instant, not by service-day offset, so a 24:01 departure from yesterday's
 * timetable sits ahead of a 05:00 departure from today's — which is the order
 * a passenger standing on the platform at midnight experiences.
 *
 * **Nothing is boardable at a trip's final stop.** GTFS gives the last stop a
 * `departure_time` equal to its arrival; the index drops it. Otherwise every
 * terminus advertises a train that only opens its doors to let people off.
 */

import type {
  Direction,
  NetworkData,
  ServiceId,
  Stop,
  Trip,
} from '../data/network.types';
import type { Seconds } from '../data/seconds';
import type { Instant } from './civil-time';
import { EngineError } from './errors';
import type { ServiceWindow } from './service-day';
import { resolveStop, terminusIndex, terminusOf, type StopRef } from './stops';

interface IndexEntry {
  readonly trip: Trip;
  /** Departure from this stop, in service-day seconds. May exceed 86,400. */
  readonly time: Seconds;
  /** Position of this stop within `trip.stops`. */
  readonly position: number;
}

/**
 * Boardable departures, grouped by stop, direction and service and sorted.
 *
 * Built once per decoded network and reused. ~10,300 entries across 100
 * buckets; a query is a binary search plus a short walk, which is what makes a
 * one-second countdown free. (The competitor re-parses ~27,000 time strings a
 * second with no index at all — CLAUDE.md finding 7.)
 */
export interface DepartureIndex {
  readonly network: NetworkData;
  /** @internal */
  readonly buckets: ReadonlyMap<string, readonly IndexEntry[]>;
}

const bucketKey = (stopIndex: number, direction: Direction, service: ServiceId): string =>
  `${stopIndex}:${direction}:${service}`;

export function buildDepartureIndex(network: NetworkData): DepartureIndex {
  const buckets = new Map<string, IndexEntry[]>();
  for (const trip of network.trips) {
    // `length - 1`: you cannot board a train where it terminates.
    for (let position = 0; position < trip.stops.length - 1; position++) {
      const event = trip.stops[position];
      const key = bucketKey(event.stopIndex, trip.direction, trip.service);
      const bucket = buckets.get(key);
      const entry: IndexEntry = { trip, time: event.departure, position };
      if (bucket === undefined) buckets.set(key, [entry]);
      else bucket.push(entry);
    }
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.time - b.time || (a.trip.id < b.trip.id ? -1 : 1));
  }
  return { network, buckets };
}

/** First index whose entry departs at or after `time`. `length` when none does. */
function lowerBound(entries: readonly IndexEntry[], time: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Every boardable departure at a stop in a direction on one service day, in order. */
function entriesFor(
  index: DepartureIndex,
  stopIndex: number,
  direction: Direction,
  window: ServiceWindow,
): readonly IndexEntry[] {
  const parts = window.services
    .map((service) => index.buckets.get(bucketKey(stopIndex, direction, service)))
    .filter((bucket): bucket is readonly IndexEntry[] => bucket !== undefined);
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts[0];
  return parts.flat().sort((a, b) => a.time - b.time || (a.trip.id < b.trip.id ? -1 : 1));
}

export interface Departure {
  readonly tripId: string;
  readonly serviceId: ServiceId;
  /** The service day this train belongs to — not necessarily today. */
  readonly window: ServiceWindow;
  readonly direction: Direction;
  readonly stop: Stop;
  /** Where this stop sits in the trip's own stop list. */
  readonly position: number;
  /**
   * Departure time as a service-day offset. `86475` is the 12:01 AM train.
   *
   * Render it with `clock.ts`. Do not hand it to a `Date`.
   */
  readonly time: Seconds;
  /** The same moment as a real instant, which is what sorting and countdowns use. */
  readonly at: Instant;
  /** Seconds from the query instant. Negative only for a departure already gone. */
  readonly waitSeconds: number;
  /** Where this train actually finishes. Not the end of the line for 20 trips. */
  readonly terminus: Stop;
  /** True when {@link terminus} is short of the end of the line for this direction. */
  readonly shortTurn: boolean;
  /** Stations this train serves after this one, in travel order. */
  readonly serves: readonly Stop[];
}

function toDeparture(
  index: DepartureIndex,
  entry: IndexEntry,
  stop: Stop,
  window: ServiceWindow,
  at: Instant,
): Departure {
  const { network } = index;
  const events = entry.trip.stops;
  const terminus = network.stops[events[events.length - 1].stopIndex];
  const serves: Stop[] = [];
  for (let i = entry.position + 1; i < events.length; i++) {
    serves.push(network.stops[events[i].stopIndex]);
  }
  const instant = window.origin + entry.time * 1000;
  return {
    tripId: entry.trip.id,
    serviceId: entry.trip.service,
    window,
    direction: entry.trip.direction,
    stop,
    position: entry.position,
    time: entry.time,
    at: instant,
    waitSeconds: (instant - at) / 1000,
    terminus,
    shortTurn: terminus.index !== terminusIndex(network, entry.trip.direction),
    serves,
  };
}

export interface DepartureQuery {
  readonly stop: StopRef;
  readonly direction: Direction;
  /** The moment to answer for. */
  readonly at: Instant;
  /** From `resolveServiceWindows`. Ordered, and normally one or two long. */
  readonly windows: readonly ServiceWindow[];
  /** How many to return. Default 3 — next, following, and one in hand. */
  readonly limit?: number;
  /**
   * Extra condition on the trip. Applied *before* the limit, so a journey
   * search does not lose its third option to two short turns.
   */
  readonly accepts?: (trip: Trip, position: number) => boolean;
}

/**
 * Departures at or after `at`, nearest first, merged across service days.
 *
 * Only takes `limit` candidates from each window before merging, which is
 * sound: the global first `limit` cannot contain a departure that was not
 * among its own window's first `limit`.
 */
export function departuresFrom(index: DepartureIndex, query: DepartureQuery): Departure[] {
  const stop = resolveStop(index.network, query.stop);
  const limit = query.limit ?? 3;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new EngineError(`limit must be a positive whole number, got ${limit}`);
  }

  const found: Departure[] = [];
  for (const window of query.windows) {
    const entries = entriesFor(index, stop.index, query.direction, window);
    let taken = 0;
    for (let i = lowerBound(entries, window.offset); i < entries.length && taken < limit; i++) {
      const entry = entries[i];
      if (query.accepts && !query.accepts(entry.trip, entry.position)) continue;
      found.push(toDeparture(index, entry, stop, window, query.at));
      taken++;
    }
  }
  return found.sort((a, b) => a.at - b.at || (a.tripId < b.tripId ? -1 : 1)).slice(0, limit);
}

// ------------------------------------------------------------------ last train

export interface LastTrainReport {
  /** The final boardable departure of the service day in play. */
  readonly departure: Departure;
  /** The one before it. `null` at a stop with a single departure all day. */
  readonly previous: Departure | null;
  /**
   * Seconds between {@link previous} and {@link departure} — the cliff.
   *
   * 2,756 seconds (45 min 56 s) towards Aluva at the 20 stations the last train
   * serves. CLAUDE.md finding 9 rounds it to "45 minutes"; it is not 45 minutes
   * everywhere, and the direction matters — see the note there.
   */
  readonly gapBeforeSeconds: number | null;
  /** Seconds until the last train leaves. 0 once it has. */
  readonly remainingSeconds: number;
  /** True when the last train of this service day has already gone. */
  readonly departed: boolean;
  /**
   * The last departure that runs all the way to the end of the line.
   *
   * Differs from {@link departure} wherever the final train short-turns, which
   * is the single most expensive thing to get wrong on this network.
   */
  readonly lastThrough: Departure | null;
  /** The service day this report is about. */
  readonly window: ServiceWindow;
}

export interface LastTrainQuery {
  readonly stop: StopRef;
  readonly direction: Direction;
  readonly at: Instant;
  readonly windows: readonly ServiceWindow[];
}

/**
 * The last train of the service day that is currently running.
 *
 * "Currently running" is the first candidate window with any departure at this
 * stop — which, because `resolveServiceWindows` drops a service day the moment
 * the clock passes its horizon, is yesterday only while yesterday's trains are
 * still out. So at 00:02 this reports last night's 12:01 AM as gone, and at
 * 00:10, with last night finished, it reports tonight's.
 *
 * `null` at a terminus in the direction it cannot be boarded for.
 */
export function lastTrainAt(
  index: DepartureIndex,
  query: LastTrainQuery,
): LastTrainReport | null {
  const stop = resolveStop(index.network, query.stop);
  const endOfLine = terminusIndex(index.network, query.direction);

  for (const window of query.windows) {
    const entries = entriesFor(index, stop.index, query.direction, window);
    if (entries.length === 0) continue;

    const last = toDeparture(index, entries[entries.length - 1], stop, window, query.at);
    const previous =
      entries.length > 1
        ? toDeparture(index, entries[entries.length - 2], stop, window, query.at)
        : null;

    let lastThrough: Departure | null = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      const events = entries[i].trip.stops;
      if (events[events.length - 1].stopIndex === endOfLine) {
        lastThrough = toDeparture(index, entries[i], stop, window, query.at);
        break;
      }
    }

    return {
      departure: last,
      previous,
      gapBeforeSeconds: previous === null ? null : last.time - previous.time,
      remainingSeconds: Math.max(0, last.waitSeconds),
      departed: last.waitSeconds <= 0,
      lastThrough,
      window,
    };
  }
  return null;
}

// ------------------------------------------------------------------ run nudge

/** "Next ≤ 2 min" — the point past which walking will not do. */
export const NUDGE_CATCH_SECONDS = 120;

/**
 * "Following ≥ 8 min" — the point past which missing it actually costs you.
 *
 * Read literally from docs/build-checklist.md: the *following train's* wait
 * from now, not the gap between the two. The two readings differ by the length
 * of the first wait (at most two minutes), and both quantities are on
 * {@link RunNudge} so a later phase can move the trigger without touching this
 * file.
 */
export const NUDGE_PENALTY_SECONDS = 480;

export interface RunNudge {
  readonly next: Departure;
  readonly following: Departure;
  /** Seconds between the two. This is the number worth showing: it is the penalty. */
  readonly gapSeconds: number;
}

/**
 * "Run — 2 min, then 9."
 *
 * Only fires when both halves hold. A train in two minutes with another in
 * three is not worth running for, and telling someone to run for it spends
 * credibility that the last-train warning needs.
 */
export function runNudge(departures: readonly Departure[]): RunNudge | null {
  const [next, following] = departures;
  if (next === undefined || following === undefined) return null;
  // Service-day offsets are whole seconds, so a departure returned as "next"
  // can sit up to one second behind a query instant with milliseconds on it.
  if (next.waitSeconds < -1) return null;
  if (next.waitSeconds > NUDGE_CATCH_SECONDS) return null;
  if (following.waitSeconds < NUDGE_PENALTY_SECONDS) return null;
  return { next, following, gapSeconds: (following.at - next.at) / 1000 };
}

// ---------------------------------------------------------------------- board

export interface DepartureBoard {
  readonly stop: Stop;
  readonly direction: Direction;
  /** "Towards Aluva" / "Towards Tripunithura", derived from the end of the line. */
  readonly towards: Stop;
  readonly departures: readonly Departure[];
  readonly next: Departure | null;
  readonly following: Departure | null;
  /** Seconds between `next` and `following`. The number that changes behaviour. */
  readonly gapSeconds: number | null;
  readonly nudge: RunNudge | null;
  readonly lastTrain: LastTrainReport | null;
  /**
   * The service days this board actually drew on.
   *
   * Not every candidate window — only the ones that contributed — so a Sunday
   * board is not caveated by an unchecked Monday that supplied nothing.
   */
  readonly windows: readonly ServiceWindow[];
}

export interface BoardQuery {
  readonly stop: StopRef;
  readonly direction: Direction;
  readonly at: Instant;
  readonly windows: readonly ServiceWindow[];
  readonly limit?: number;
}

export function departureBoard(index: DepartureIndex, query: BoardQuery): DepartureBoard {
  const stop = resolveStop(index.network, query.stop);
  const departures = departuresFrom(index, { ...query, stop, limit: query.limit ?? 3 });
  const lastTrain = lastTrainAt(index, { ...query, stop });

  const next = departures[0] ?? null;
  const following = departures[1] ?? null;

  const used = new Set<ServiceWindow>();
  for (const departure of departures) used.add(departure.window);
  if (lastTrain !== null) used.add(lastTrain.window);
  // Keep the caller's ordering rather than insertion order.
  const windows = query.windows.filter((window) => used.has(window));

  return {
    stop,
    direction: query.direction,
    towards: terminusOf(index.network, query.direction),
    departures,
    next,
    following,
    gapSeconds: next !== null && following !== null ? (following.at - next.at) / 1000 : null,
    nudge: runNudge(departures),
    lastTrain,
    windows: windows.length > 0 ? windows : query.windows,
  };
}
