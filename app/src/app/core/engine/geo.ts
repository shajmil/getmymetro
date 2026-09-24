/**
 * Nearest station, by great-circle distance over 25 points.
 *
 * This is the whole of the "zero-tap open" feature's location logic (CLAUDE.md
 * MVP item 1). No index, no quadtree, no PostGIS: 25 haversines is a few
 * microseconds, and anything cleverer would be more code to be wrong in.
 *
 * It resolves reliably because the line is sparse. Measured from the feed,
 * adjacent stations are a median 1,051 m apart and never closer than 465 m
 * (Kaloor to Town Hall), while consumer GPS in the open is good to 5–20 m and
 * degrades to perhaps 50 m between buildings. The distance comes back with the
 * answer so the UI can decide when to stop trusting it — 900 m from anything
 * means the user is not at a station and should be offered the picker, not a
 * confident guess.
 */

import type { NetworkData, Stop } from '../data/network.types';
import { asMetres, type Metres } from '../data/seconds';
import { EngineError } from './errors';

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** IUGG mean Earth radius. The sphere model is good to ~0.5% and this line is 25 km long. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function assertPoint(point: GeoPoint): void {
  if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
    throw new EngineError(`latitude out of range: ${point.lat}`);
  }
  if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) {
    throw new EngineError(`longitude out of range: ${point.lon}`);
  }
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the law of cosines: it keeps its precision at short
 * distances, and 465 m between Kaloor and Town Hall is the distinction the
 * nearest-station answer turns on.
 */
export function haversineMetres(a: GeoPoint, b: GeoPoint): Metres {
  assertPoint(a);
  assertPoint(b);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return asMetres(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface NearbyStop {
  readonly stop: Stop;
  /** Straight-line distance from the query point. Not walking distance. */
  readonly distance: Metres;
}

/**
 * The `limit` closest stations, nearest first.
 *
 * Returns the runner-up as well by default, because "Town Hall, 180 m — or
 * Kaloor, 480 m" is a better answer than a single confident wrong one when the
 * fix is ambiguous.
 */
export function nearestStops(
  network: NetworkData,
  point: GeoPoint,
  limit = 2,
): NearbyStop[] {
  assertPoint(point);
  if (network.stops.length === 0) throw new EngineError('network has no stops');
  return network.stops
    .map((stop) => ({ stop, distance: haversineMetres(point, stop) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, limit));
}

/** The single closest station. Always answers; read `distance` before believing it. */
export function nearestStop(network: NetworkData, point: GeoPoint): NearbyStop {
  return nearestStops(network, point, 1)[0];
}
