/**
 * A to B, on a line with no branches and no interchanges.
 *
 * There is no graph search here and there will not be one until Line 2 lands
 * (CLAUDE.md decision 1). The direction is the sign of `destination.index −
 * origin.index`; the trips are the ones that call at both stops in that order;
 * the fare is a table lookup. keralam.co reaches the same conclusion in four
 * lines, and being right is not improved by being clever.
 *
 * What the four-line version misses is short turns. A trip from Aluva that
 * terminates at Muttom does not serve Edapally, and filtering on "contains
 * both stops, in order" is what keeps it off the list — the one place the
 * competitor's design protects it by accident, and a departure board does not
 * (see `departures.ts`).
 */

import type { Direction, NetworkData, Rupees, ServiceId, Stop, Trip } from '../data/network.types';
import type { Seconds } from '../data/seconds';
import type { Instant } from './civil-time';
import { departuresFrom, type Departure, type DepartureIndex } from './departures';
import { EngineError } from './errors';
import { fareFor } from './fares';
import type { ServiceWindow } from './service-day';
import {
  directionBetween,
  resolveStop,
  stopsBetween,
  terminusOf,
  type StopRef,
} from './stops';

export interface JourneyOption {
  readonly tripId: string;
  readonly serviceId: ServiceId;
  readonly window: ServiceWindow;
  /** The boarding half, including the short-turn label and everything it serves. */
  readonly board: Departure;
  /** Arrival at the destination, as a service-day offset. May exceed 86,400. */
  readonly arrival: Seconds;
  /** The same moment as a real instant. */
  readonly arrivalAt: Instant;
  /** Departure to arrival, in seconds. Riding time, with no walking or waiting. */
  readonly durationSeconds: number;
}

export interface JourneyPlan {
  readonly origin: Stop;
  readonly destination: Stop;
  readonly direction: Direction;
  /** The end of the line for this direction — the platform sign to look for. */
  readonly towards: Stop;
  readonly fare: Rupees;
  /** Stations passed through, exclusive of both ends. */
  readonly stopsBetween: readonly Stop[];
  /** How many stops the journey is. Aluva to Edapally is 8. */
  readonly hops: number;
  readonly options: readonly JourneyOption[];
  readonly next: JourneyOption | null;
  /** The service days these options came from. */
  readonly windows: readonly ServiceWindow[];
}

export interface JourneyQuery {
  readonly origin: StopRef;
  readonly destination: StopRef;
  readonly at: Instant;
  readonly windows: readonly ServiceWindow[];
  readonly limit?: number;
}

/**
 * Where a trip calls at a stop after `fromPosition`, or −1.
 *
 * A linear scan over at most 25 events. Every trip in this feed walks a
 * contiguous run of the line, so this could be arithmetic — but the scan holds
 * if a future feed ever skips a station, and it costs nothing.
 */
function positionOf(trip: Trip, stopIndex: number, fromPosition: number): number {
  for (let i = fromPosition + 1; i < trip.stops.length; i++) {
    if (trip.stops[i].stopIndex === stopIndex) return i;
  }
  return -1;
}

/**
 * Plan a journey.
 *
 * Throws for a journey from a station to itself — the feed prices those at ₹10
 * and they are still not journeys (CLAUDE.md finding 5). Nothing else about an
 * ordered pair can be invalid: any two distinct stations on one line are
 * connected in exactly one direction, and picking the direction is what stops
 * an origin that does not precede its destination from producing a result.
 */
export function planJourney(index: DepartureIndex, query: JourneyQuery): JourneyPlan {
  const network: NetworkData = index.network;
  const origin = resolveStop(network, query.origin);
  const destination = resolveStop(network, query.destination);
  if (origin.index === destination.index) {
    throw new EngineError(`${origin.id} to ${origin.id} is not a journey`);
  }
  const direction = directionBetween(origin, destination);

  const boardings = departuresFrom(index, {
    stop: origin,
    direction,
    at: query.at,
    windows: query.windows,
    limit: query.limit ?? 3,
    accepts: (trip, position) => positionOf(trip, destination.index, position) !== -1,
  });

  const options: JourneyOption[] = boardings.map((board) => {
    const trip = network.tripsById.get(board.tripId);
    if (trip === undefined) throw new EngineError(`trip ${board.tripId} vanished from the network`);
    const alightingPosition = positionOf(trip, destination.index, board.position);
    if (alightingPosition === -1) {
      throw new EngineError(`trip ${board.tripId} does not reach ${destination.id}`);
    }
    const arrival = trip.stops[alightingPosition].arrival;
    return {
      tripId: board.tripId,
      serviceId: board.serviceId,
      window: board.window,
      board,
      arrival,
      arrivalAt: board.window.origin + arrival * 1000,
      durationSeconds: arrival - board.time,
    };
  });

  const used = new Set<ServiceWindow>(options.map((option) => option.window));
  const windows = query.windows.filter((window) => used.has(window));

  return {
    origin,
    destination,
    direction,
    towards: terminusOf(network, direction),
    fare: fareFor(network, origin, destination),
    stopsBetween: stopsBetween(network, origin, destination),
    hops: Math.abs(destination.index - origin.index),
    options,
    next: options[0] ?? null,
    windows: windows.length > 0 ? windows : query.windows,
  };
}
