/**
 * Where every train is, right now, from the timetable alone.
 *
 * This is the whole "live map" trick and it is the one piece of the product
 * that is easy to get *visibly* wrong, so it is a pure module with no Angular
 * and no DOM: `(index, windows) -> TrainPosition[]`.
 *
 * ---------------------------------------------------------------------------
 * Honesty
 * ---------------------------------------------------------------------------
 *
 * Nothing here is measured. There is no GTFS-RT feed for Kochi (CLAUDE.md
 * finding 2) and KMRL's own site derives "Next Trains (Live GTFS Schedule)"
 * from the same static file we do. Every position this module returns is an
 * interpolation of a published schedule, and the type is named
 * {@link TrainPosition} rather than `VehiclePosition` for that reason. The UI
 * must label it "Scheduled position"; see `shared/map/line-map.ts`.
 *
 * ---------------------------------------------------------------------------
 * Snapped to the alignment, not to a straight line
 * ---------------------------------------------------------------------------
 *
 * CLAUDE.md's sketch of this algorithm interpolates latitude and longitude
 * directly between two stations. That is wrong on this line: the viaduct
 * curves hard at Edapally and again south of Vyttila, and a straight chord
 * puts the train visibly off the track — in places in the middle of a
 * different road. So the interpolation is done in **chainage** (distance along
 * the alignment, the feed's own `shape_dist_traveled`) and the chainage is
 * then resolved to a coordinate on `shapes.txt`. Both `stop_dist` and the
 * per-point `dist` come from the feed, so no geometry is invented here.
 *
 * ---------------------------------------------------------------------------
 * Cost
 * ---------------------------------------------------------------------------
 *
 * The competitor re-parses ~27,000 `"HH:MM:SS"` strings a second and then
 * walks 549 shape points linearly per train (CLAUDE.md finding 7). Ours pays
 * once, at load:
 *
 *   * every trip becomes a flat `Float64Array` of event times and a matching
 *     array of chainages, so a tick is a binary search and two multiplies;
 *   * trips are grouped by service and sorted by start, with a running maximum
 *     end time, so finding the ~17 active trains out of 450 is a binary search
 *     and a short walk backwards, not a scan.
 *
 * Per tick the work is proportional to the trains actually running.
 */

import type {
  Direction,
  NetworkData,
  ServiceId,
  Shape,
  Trip,
  TripId,
} from '../data/network.types';
import { EngineError } from './errors';
import type { ServiceWindow } from './service-day';

/**
 * One train, placed.
 *
 * `lat`/`lon` are a point on the published alignment. They are not a
 * measurement and must never be rendered as one.
 */
export interface TrainPosition {
  readonly tripId: TripId;
  readonly direction: Direction;
  readonly lat: number;
  readonly lon: number;
  /** Degrees clockwise from north, the way the train is travelling. */
  readonly bearing: number;
  /** `Stop.index` of the last station on this trip. 20 of 450 stop short. */
  readonly terminusIndex: number;
  /** `Stop.index` of the station it is approaching, or standing at. */
  readonly nextStopIndex: number;
  /** True while it is standing at a platform. */
  readonly atStation: boolean;
  /**
   * True when this trip **terminates before the end of the line**.
   *
   * 38 of 450 trips are partial, but the split is what matters: 20 terminate
   * early and 20 merely start late (CLAUDE.md finding 10). Only the first
   * group can strand a passenger, so only the first group is flagged — a train
   * that joined the line at Muttom and is running through to Aluva is an
   * ordinary train and labelling it would be noise. A map that draws all 450
   * identically is the departure-board mistake in another medium.
   */
  readonly shortTurn: boolean;
}

/** @internal One trip, flattened for arithmetic. */
interface TripTrack {
  readonly trip: Trip;
  readonly shape: Shape;
  /** `[arrival0, departure0, arrival1, departure1, …]`, service-day seconds. */
  readonly times: Float64Array;
  /** Chainage along {@link shape} at each stop event, metres. */
  readonly chain: Float64Array;
  /** Arrival at the first stop — the train is on the platform from here. */
  readonly start: number;
  /** Arrival at the last stop. After this the trip is over. */
  readonly end: number;
  readonly terminusIndex: number;
  readonly shortTurn: boolean;
}

/** @internal Every trip of one service, sorted so the active ones are findable. */
interface ServiceTrack {
  readonly tracks: readonly TripTrack[];
  readonly starts: Float64Array;
  /** Running maximum of `end` over `tracks[0..i]`, so the walk can stop early. */
  readonly maxEnd: Float64Array;
}

export interface PositionIndex {
  readonly network: NetworkData;
  /** @internal */
  readonly byService: ReadonlyMap<ServiceId, ServiceTrack>;
  /** Every trip in the feed is indexed. 450 today; asserted by the spec. */
  readonly tripCount: number;
}

/**
 * The shape a trip in `direction` runs along, derived rather than named.
 *
 * The feed happens to call them `R1_0` and `R1_1`, but matching on that string
 * would break the day KMRL renames a shape, and the data already says which is
 * which: each shape carries every station's chainage indexed by `Stop.index`,
 * so the one whose chainage *rises* with the stop index is the one travelled by
 * `direction_id = 0` (increasing stop index — CLAUDE.md finding 10).
 */
export function shapeForDirection(network: NetworkData, direction: Direction): Shape {
  for (const shape of network.shapes) {
    const distances = shape.stopDistance;
    if (distances.length < 2) continue;
    const ascending = distances[distances.length - 1] > distances[0];
    if (ascending === (direction === 0)) return shape;
  }
  throw new EngineError(`no shape runs in direction ${direction}`);
}

function trackFor(trip: Trip, shape: Shape, stopCount: number): TripTrack {
  const n = trip.stops.length;
  const times = new Float64Array(n * 2);
  const chain = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const event = trip.stops[k];
    times[k * 2] = event.arrival;
    times[k * 2 + 1] = event.departure;
    const distance = shape.stopDistance[event.stopIndex];
    if (distance === undefined) {
      throw new EngineError(`${trip.id}: no chainage for stop index ${event.stopIndex}`);
    }
    chain[k] = distance;
  }
  // The end of the line in this trip's direction: the highest stop index when
  // travelling up the line, index 0 when travelling down it.
  const lineEnd = trip.direction === 0 ? stopCount - 1 : 0;
  const terminusIndex = trip.stops[n - 1].stopIndex;

  return {
    trip,
    shape,
    times,
    chain,
    start: times[0],
    end: times[(n - 1) * 2],
    terminusIndex,
    shortTurn: terminusIndex !== lineEnd,
  };
}

/** Build the index once, at load. ~450 trips, a couple of milliseconds. */
export function buildPositionIndex(network: NetworkData): PositionIndex {
  const shapes = new Map<Direction, Shape>([
    [0, shapeForDirection(network, 0)],
    [1, shapeForDirection(network, 1)],
  ]);

  const grouped = new Map<ServiceId, TripTrack[]>();
  for (const trip of network.trips) {
    const shape = shapes.get(trip.direction);
    if (shape === undefined) throw new EngineError(`${trip.id}: unknown direction`);
    const track = trackFor(trip, shape, network.stops.length);
    const list = grouped.get(trip.service);
    if (list === undefined) grouped.set(trip.service, [track]);
    else list.push(track);
  }

  const byService = new Map<ServiceId, ServiceTrack>();
  for (const [service, tracks] of grouped) {
    tracks.sort((a, b) => a.start - b.start);
    const starts = new Float64Array(tracks.length);
    const maxEnd = new Float64Array(tracks.length);
    let running = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < tracks.length; i++) {
      starts[i] = tracks[i].start;
      running = Math.max(running, tracks[i].end);
      maxEnd[i] = running;
    }
    byService.set(service, { tracks, starts, maxEnd });
  }

  return { network, byService, tripCount: network.trips.length };
}

/** Index of the last entry `<= value`, or -1. `values` must be non-decreasing. */
function lastAtOrBefore(values: Float64Array, value: number, limit: number): number {
  let low = 0;
  let high = limit;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (values[mid] <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Where on the alignment a chainage falls, and which way the track runs there. */
interface Placed {
  readonly lat: number;
  readonly lon: number;
  readonly bearing: number;
}

const DEG = Math.PI / 180;

/**
 * Cached per shape: the point distances as a typed array for binary search.
 *
 * Two shapes exist and neither ever changes, so this memoises on the object
 * rather than threading another structure through the index.
 */
const DISTANCE_CACHE = new WeakMap<Shape, Float64Array>();

function shapeDistances(shape: Shape): Float64Array {
  let cached = DISTANCE_CACHE.get(shape);
  if (cached === undefined) {
    cached = new Float64Array(shape.points.length);
    for (let i = 0; i < shape.points.length; i++) cached[i] = shape.points[i].distance;
    DISTANCE_CACHE.set(shape, cached);
  }
  return cached;
}

/**
 * Resolve a chainage to a coordinate on the alignment.
 *
 * `points` carry the feed's own `shape_dist_traveled`, so this is a lookup and
 * a linear interpolation inside one simplified segment — at most 4.99 m of
 * simplification error, which is under a pixel at any zoom a phone shows.
 */
export function placeOnShape(shape: Shape, metres: number): Placed {
  const points = shape.points;
  const last = points.length - 1;
  if (last < 1) throw new EngineError(`${shape.id}: needs at least two points`);

  let i = lastAtOrBefore(shapeDistances(shape), metres, last);
  if (i < 0) i = 0;
  if (i === last) i = last - 1;

  const a = points[i];
  const b = points[i + 1];
  const span = b.distance - a.distance;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (metres - a.distance) / span)) : 0;

  const lat = a.lat + (b.lat - a.lat) * fraction;
  const lon = a.lon + (b.lon - a.lon) * fraction;

  // Longitude degrees are shorter than latitude degrees away from the equator.
  // Kochi is at ~10°N, where the factor is 0.985 — small, but it is the
  // difference between an arrow that points along the track and one that does
  // not, and it costs one cosine.
  const east = (b.lon - a.lon) * Math.cos(lat * DEG);
  const north = b.lat - a.lat;
  const bearing = (Math.atan2(east, north) / DEG + 360) % 360;

  return { lat, lon, bearing };
}

/** Place one trip at `sec` seconds into its service day, or `null` if it is not running. */
function positionOf(track: TripTrack, sec: number): TrainPosition | null {
  if (sec < track.start || sec > track.end) return null;

  const lastEvent = track.chain.length * 2 - 2; // the final arrival
  const i = lastAtOrBefore(track.times, sec, lastEvent);
  if (i < 0) return null;

  let metres: number;
  let nextStopIndex: number;
  let atStation: boolean;

  if ((i & 1) === 0) {
    // An arrival index: the train is standing at stop i/2.
    const k = i >> 1;
    metres = track.chain[k];
    nextStopIndex = track.trip.stops[k].stopIndex;
    atStation = true;
  } else {
    // A departure index: running from stop (i-1)/2 to the next one.
    const k = (i - 1) >> 1;
    const departed = track.times[i];
    const arrives = track.times[(k + 1) * 2];
    const span = arrives - departed;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (sec - departed) / span)) : 0;
    metres = track.chain[k] + (track.chain[k + 1] - track.chain[k]) * fraction;
    nextStopIndex = track.trip.stops[k + 1].stopIndex;
    atStation = false;
  }

  const placed = placeOnShape(track.shape, metres);
  return {
    tripId: track.trip.id,
    direction: track.trip.direction,
    lat: placed.lat,
    lon: placed.lon,
    bearing: placed.bearing,
    terminusIndex: track.terminusIndex,
    nextStopIndex,
    atStation,
    shortTurn: track.shortTurn,
  };
}

/**
 * Every train on the network at the instant the windows describe.
 *
 * `windows` comes from `MetroEngine.windows(at)`, which is what makes the
 * midnight case correct: at 00:10 the previous service day is still open and
 * the trains that left at 23:40 are still running, at offsets past 86,400.
 * Comparing a wall clock against a service-day offset is exactly the bug that
 * makes the competitor's last train vanish at midnight (CLAUDE.md finding 7).
 *
 * A trip can match at most one window — consecutive windows are a day apart
 * and no trip runs for 24 hours — so no de-duplication is needed.
 */
export function trainsAt(
  index: PositionIndex,
  windows: readonly ServiceWindow[],
): TrainPosition[] {
  const out: TrainPosition[] = [];
  for (const window of windows) {
    const sec = window.offset;
    if (sec < 0) continue; // The service day has not started yet.
    for (const service of window.services) {
      const group = index.byService.get(service);
      if (group === undefined) continue;
      // Trips are sorted by start, so everything that could have started is a
      // prefix; walk it backwards and stop as soon as no earlier trip can
      // still be running.
      let i = lastAtOrBefore(group.starts, sec, group.tracks.length - 1);
      for (; i >= 0; i--) {
        if (group.maxEnd[i] < sec) break;
        const position = positionOf(group.tracks[i], sec);
        if (position !== null) out.push(position);
      }
    }
  }
  return out;
}
