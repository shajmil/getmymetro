/**
 * The runtime data bundle, in two shapes.
 *
 *   `NetworkBundle` — the wire format exactly as `build_network.py` writes it:
 *      columnar, delta-encoded, short keys. Nothing outside `network-codec.ts`
 *      should ever touch it.
 *
 *   `NetworkData` — the decoded form the rest of the app uses: whole objects,
 *      absolute times, `Seconds` and `Metres` instead of bare numbers.
 *
 * Hand-written, and deliberately so: the point of these types is to be
 * stricter than the JSON, not to mirror it. Keep them in step with
 * `build_network.py`; `test_network.py` and `network-codec.spec.ts` fail if
 * they drift.
 */

import type { Metres, Seconds } from './seconds';

/** Schema version this build understands. Bumped by `build_network.py`. */
export const NETWORK_FORMAT = 1;

export type StopId = string;
export type TripId = string;
export type ServiceId = string;
export type ShapeId = string;

/** Whole rupees. The feed publishes six flat bands, no paise. */
export type Rupees = number;

/**
 * ISO 8601 weekday: Monday is 1, Sunday is 7.
 *
 * Not `Date.prototype.getDay()`, which makes Sunday 0 — and Sunday is the day
 * the whole `WE` timetable hangs on, so an off-by-one here shows the wrong
 * schedule to everyone for a whole day. Excluding 0 from the type means
 * passing `getDay()` straight in will not compile.
 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * `direction_id` from the feed.
 *
 * Verified from the data rather than assumed (CLAUDE.md finding 10): 0 travels
 * in increasing stop index, 1 in decreasing. The passenger-facing label
 * ("towards …") is derived from the terminus, never hardcoded here — a feed
 * that adds a station would silently invalidate a hardcoded one.
 */
export type Direction = 0 | 1;

export type Language = 'en' | 'ml' | 'hi';

// ---------------------------------------------------------------- wire format

/** @internal Only `network-codec.ts` should read these. */
export interface NetworkBundle {
  readonly format: number;
  readonly feed: WireFeed;
  readonly stops: WireStops;
  readonly services: WireServices;
  readonly fares: WireFares;
  readonly trips: WireTrips;
  readonly shapes: WireShapes;
}

export interface WireFeed {
  readonly version: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly confirmed: string;
  readonly sha256: string;
  readonly timezone: string;
  readonly attribution: string;
}

export interface WireStops {
  readonly id: readonly StopId[];
  readonly en: readonly string[];
  readonly ml: readonly string[];
  readonly hi: readonly string[];
  readonly lat: readonly number[];
  readonly lon: readonly number[];
}

export interface WireServices {
  readonly id: readonly ServiceId[];
  /** Seven characters, Monday first. */
  readonly days: readonly string[];
}

export interface WireFares {
  readonly currency: string;
  readonly bands: readonly Rupees[];
  /** 25 rows of 25 digits; each digit indexes `bands`. */
  readonly matrix: readonly string[];
}

export interface WireTrips {
  readonly count: number;
  readonly stop_events: number;
  readonly pattern: WirePatterns;
  readonly id: readonly TripId[];
  /** One digit per trip, indexing `services.id`. */
  readonly service: string;
  /** Delta-encoded first arrival, in service-day seconds. */
  readonly t0: readonly number[];
  readonly dwell0: readonly number[];
  readonly pat: readonly number[];
}

export interface WirePatterns {
  readonly dir: readonly number[];
  readonly first: readonly number[];
  readonly n: readonly number[];
  /** Interleaved [run, dwell, run, dwell, …] from the first departure on. */
  readonly hops: readonly (readonly number[])[];
}

export interface WireShapes {
  readonly id: readonly ShapeId[];
  readonly precision: number;
  readonly tolerance_m: number;
  readonly max_deviation_m: number;
  readonly lat: readonly (readonly number[])[];
  readonly lon: readonly (readonly number[])[];
  readonly dist: readonly (readonly number[])[];
  readonly stop_dist: readonly (readonly number[])[];
}

// -------------------------------------------------------------- decoded form

export interface NetworkData {
  readonly format: number;
  readonly feed: FeedProvenance;
  /** In line order. Index 0 is the northern terminus. */
  readonly stops: readonly Stop[];
  readonly stopsById: ReadonlyMap<StopId, Stop>;
  readonly services: readonly Service[];
  readonly servicesById: ReadonlyMap<ServiceId, Service>;
  /** Chronological within each service. */
  readonly trips: readonly Trip[];
  readonly tripsById: ReadonlyMap<TripId, Trip>;
  readonly fares: FareTable;
  readonly shapes: readonly Shape[];
  readonly shapesById: ReadonlyMap<ShapeId, Shape>;
}

export interface FeedProvenance {
  readonly version: string;
  /** `YYYYMMDD`. Provenance. */
  readonly startDate: string;
  /**
   * `YYYYMMDD`. **Provenance, never a filter.**
   *
   * This lapsed on 2025-12-31 and KMRL never rolled it forward, while
   * confirming the timings themselves are still accurate (CLAUDE.md finding
   * 6). Treating it as a validity window resolves zero services for any 2026
   * date and renders an empty timetable.
   */
  readonly endDate: string;
  /**
   * `YYYY-MM`, the date KMRL last confirmed the timings are current.
   *
   * This — not `endDate` — is what the EXPIRED state watches. The assurance
   * has a shelf life; the declared window does not mean anything.
   */
  readonly confirmed: string;
  /** Of the whole feed. Changes if KMRL republishes so much as one second. */
  readonly sha256: string;
  /** `Asia/Kolkata`. Store UTC, display IST. */
  readonly timezone: string;
  /** Required verbatim by the licence. Render it; do not retype it. */
  readonly attribution: string;
}

export interface Stop {
  readonly id: StopId;
  /** Position along the line, 0-based. This is also its index in `stops`. */
  readonly index: number;
  readonly name: Readonly<Record<Language, string>>;
  readonly lat: number;
  readonly lon: number;
}

export interface Service {
  readonly id: ServiceId;
  /**
   * The weekdays this service runs, as ISO weekdays (Monday 1 … Sunday 7).
   *
   * Derived from `calendar.txt`, never hardcoded: `WK` is Monday to *Saturday*
   * in this feed, not Monday to Friday, and copy that says "weekday" is wrong.
   */
  readonly days: ReadonlySet<IsoWeekday>;
}

export interface StopEvent {
  /** Index into `NetworkData.stops`. */
  readonly stopIndex: number;
  readonly arrival: Seconds;
  readonly departure: Seconds;
}

export interface Trip {
  readonly id: TripId;
  readonly service: ServiceId;
  readonly direction: Direction;
  /**
   * Every stop this trip actually serves, in travel order.
   *
   * 38 of the 450 trips serve only part of the line. They are here in full,
   * exactly as short as the feed says, so a departure board can label the 20
   * that terminate early instead of stranding someone at Muttom.
   */
  readonly stops: readonly StopEvent[];
}

export interface FareTable {
  readonly currency: string;
  /**
   * `fares[originIndex][destinationIndex]`, indexed by `Stop.index`.
   *
   * A complete 25 × 25 lookup, never a calculation. Fare is not a function of
   * distance in this feed and computing it misprices 104 of the 600 travelled
   * pairs. Self-pairs carry KMRL's published minimum because the licence
   * forbids modifying the data; blocking an A→A journey is the UI's job.
   */
  readonly matrix: readonly (readonly Rupees[])[];
}

export interface ShapePoint {
  readonly lat: number;
  readonly lon: number;
  /** Chainage from the start of the shape, straight from the feed. */
  readonly distance: Metres;
}

export interface Shape {
  readonly id: ShapeId;
  /**
   * The alignment, simplified. Every point here is one of the feed's own
   * points, unmoved; only redundant ones were dropped.
   */
  readonly points: readonly ShapePoint[];
  /** Each station's chainage along this shape, indexed by `Stop.index`. */
  readonly stopDistance: readonly Metres[];
  /** Simplification budget, metres. */
  readonly toleranceM: number;
  /** Worst error actually incurred, measured at build time. */
  readonly maxDeviationM: number;
}
