/**
 * Stops, directions and the labels that hang off them.
 *
 * `direction_id` is a number in the feed and means nothing to a passenger.
 * Verified from the data rather than assumed (CLAUDE.md finding 10), 0 travels
 * in increasing stop index and 1 in decreasing — but the *label* is derived
 * from whichever station sits at the end of the line, never written down. A
 * feed that extends past Tripunithura would silently invalidate a hardcoded
 * "towards Tripunithura"; it cannot invalidate `network.stops.at(-1)`.
 */

import type { Direction, NetworkData, Stop, StopId } from '../data/network.types';
import { EngineError } from './errors';

/** Anything that can name a station: its GTFS id, its index along the line, or itself. */
export type StopRef = StopId | number | Stop;

/** Resolve a reference to the real `Stop`, or refuse. */
export function resolveStop(network: NetworkData, ref: StopRef): Stop {
  if (typeof ref === 'number') {
    const stop = network.stops[ref];
    if (stop === undefined) throw new EngineError(`no station at index ${ref}`);
    return stop;
  }
  if (typeof ref === 'string') {
    const stop = network.stopsById.get(ref);
    if (stop === undefined) throw new EngineError(`no station with id '${ref}'`);
    return stop;
  }
  const known = network.stops[ref.index];
  if (known === undefined || known.id !== ref.id) {
    throw new EngineError(`'${ref.id}' does not belong to this network`);
  }
  return known;
}

export const DIRECTIONS: readonly Direction[] = [0, 1];

/** The station a train in this direction ends at, if it runs the whole line. */
export function terminusOf(network: NetworkData, direction: Direction): Stop {
  const stop = direction === 0 ? network.stops[network.stops.length - 1] : network.stops[0];
  if (stop === undefined) throw new EngineError('network has no stops');
  return stop;
}

/** The index a full run in this direction ends on. */
export function terminusIndex(network: NetworkData, direction: Direction): number {
  return direction === 0 ? network.stops.length - 1 : 0;
}

/**
 * The direction that gets you from `origin` to `destination`.
 *
 * On a single line this is the entire routing problem, which is why CLAUDE.md
 * decision 1 drops Dijkstra: the answer is the sign of a subtraction. Equal
 * indices are refused rather than returned as a direction, because a journey
 * from a station to itself is not a journey — see `fares.ts`.
 */
export function directionBetween(origin: Stop, destination: Stop): Direction {
  if (origin.index === destination.index) {
    throw new EngineError(`${origin.id} and ${destination.id} are the same station`);
  }
  return destination.index > origin.index ? 0 : 1;
}

/** The stations strictly between two stops, in travel order. */
export function stopsBetween(
  network: NetworkData,
  origin: Stop,
  destination: Stop,
): readonly Stop[] {
  const step = destination.index > origin.index ? 1 : -1;
  const out: Stop[] = [];
  for (let i = origin.index + step; i !== destination.index; i += step) {
    out.push(network.stops[i]);
  }
  return out;
}
