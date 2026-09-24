/**
 * The engine, as one object.
 *
 * Everything below is a thin composition of the pure modules either side of
 * it: resolve which service days are in play, ask the index, and wrap the
 * answer in what we are prepared to claim about the date. There is no Angular
 * in this file, so the whole product can be exercised in a plain unit test
 * with an explicit clock — `metro-engine.service.ts` is the only part that
 * needs a TestBed, and it does almost nothing.
 *
 * The date-dependent methods return {@link ServiceOutlook}. That is the
 * holiday guard, and it is a type-level one: the `unverified` variant carries
 * its payload as `provisional` rather than `result`, so a caller that has not
 * narrowed the union cannot reach the departure times at all. See
 * `service-day.ts` for why a boolean flag was not enough.
 */

import type { Direction, NetworkData, Rupees, Stop } from '../data/network.types';
import type { Seconds } from '../data/seconds';
import type { Instant } from './civil-time';
import {
  buildDepartureIndex,
  departureBoard,
  type DepartureBoard,
  type DepartureIndex,
} from './departures';
import { fareFor, publishedFare } from './fares';
import { nearestStop, nearestStops, type GeoPoint, type NearbyStop } from './geo';
import { NO_HOLIDAY_DATA, type HolidayCalendar } from './holiday';
import { planJourney, type JourneyPlan } from './journey';
import { buildPositionIndex, trainsAt, type TrainPosition } from './positions';
import {
  outlookOver,
  resolveServiceWindows,
  serviceDayHorizon,
  type ServiceOutlook,
  type ServiceWindow,
} from './service-day';
import { DIRECTIONS, resolveStop, type StopRef } from './stops';

export interface EngineOptions {
  /** Defaults to {@link NO_HOLIDAY_DATA}, which vouches for Sundays and nothing else. */
  readonly holidays?: HolidayCalendar;
  /** Calendar days of lookahead when today is exhausted. Default 1. */
  readonly daysAhead?: number;
}

/** Both platforms at one station, which is what the zero-tap home screen shows. */
export interface StationDepartures {
  readonly stop: Stop;
  /** One board per direction that has any departure at this station. */
  readonly boards: readonly DepartureBoard[];
}

export interface MetroEngine {
  readonly network: NetworkData;
  /** The latest departure anywhere in the feed. 86,625 — 24:03:45. */
  readonly horizon: Seconds;

  // Date-free. No outlook, because nothing about them can be made uncertain
  // by a holiday.
  stop(ref: StopRef): Stop;
  nearest(point: GeoPoint, limit?: number): NearbyStop[];
  nearestStation(point: GeoPoint): NearbyStop;
  fare(origin: StopRef, destination: StopRef): Rupees;
  publishedFare(origin: StopRef, destination: StopRef): Rupees;

  /** The service days in play at `at`. Exposed so a UI can explain itself. */
  windows(at: Instant): ServiceWindow[];

  /**
   * Every train on the network at `at`, placed on the published alignment.
   *
   * **Interpolated from the timetable, never measured** — there is no realtime
   * feed (CLAUDE.md finding 2). The outlook is here for the same reason it is
   * on the boards: on an unverified date these are the positions the weekday
   * timetable implies, and the UI has to say so.
   */
  trains(at: Instant): ServiceOutlook<readonly TrainPosition[]>;

  board(stop: StopRef, direction: Direction, at: Instant, limit?: number): ServiceOutlook<DepartureBoard>;
  station(stop: StopRef, at: Instant, limit?: number): ServiceOutlook<StationDepartures>;
  journey(
    origin: StopRef,
    destination: StopRef,
    at: Instant,
    limit?: number,
  ): ServiceOutlook<JourneyPlan>;
}

export function createMetroEngine(
  network: NetworkData,
  options: EngineOptions = {},
): MetroEngine {
  const holidays = options.holidays ?? NO_HOLIDAY_DATA;
  const daysAhead = options.daysAhead ?? 1;
  const index: DepartureIndex = buildDepartureIndex(network);
  const horizon = serviceDayHorizon(network);

  // Built on first use, not at construction. It costs a few hundred kilobytes
  // of typed arrays for 450 trips, and only the map asks for it — which is
  // itself lazy-loaded, so a reader who never scrolls to it never pays.
  let positions: ReturnType<typeof buildPositionIndex> | undefined;

  const windowsAt = (at: Instant): ServiceWindow[] =>
    resolveServiceWindows(network, at, holidays, { daysAhead, horizon });

  return {
    network,
    horizon,

    stop: (ref) => resolveStop(network, ref),
    nearest: (point, limit) => nearestStops(network, point, limit),
    nearestStation: (point) => nearestStop(network, point),
    fare: (origin, destination) => fareFor(network, origin, destination),
    publishedFare: (origin, destination) => publishedFare(network, origin, destination),
    windows: windowsAt,

    trains(at) {
      positions ??= buildPositionIndex(network);
      const windows = windowsAt(at);
      // Attributed per window rather than over all of them. At 00:02 on a
      // Monday every running train belongs to Sunday's service day, which the
      // calendar vouches for; caveating them because Monday is unverified
      // would overstate the uncertainty, and the honesty rules forbid that as
      // firmly as understating it.
      const used: ServiceWindow[] = [];
      const found: TrainPosition[] = [];
      for (const window of windows) {
        const here = trainsAt(positions, [window]);
        if (here.length === 0) continue;
        used.push(window);
        found.push(...here);
      }
      return outlookOver(used.length > 0 ? used : windows, found);
    },

    board(stop, direction, at, limit) {
      const board = departureBoard(index, {
        stop,
        direction,
        at,
        windows: windowsAt(at),
        limit,
      });
      return outlookOver(board.windows, board);
    },

    station(stop, at, limit) {
      const resolved = resolveStop(network, stop);
      const windows = windowsAt(at);
      const boards = DIRECTIONS.map((direction) =>
        departureBoard(index, { stop: resolved, direction, at, windows, limit }),
      ).filter((board) => board.departures.length > 0 || board.lastTrain !== null);
      const used = windows.filter((window) =>
        boards.some((board) => board.windows.includes(window)),
      );
      return outlookOver(used.length > 0 ? used : windows, { stop: resolved, boards });
    },

    journey(origin, destination, at, limit) {
      const plan = planJourney(index, {
        origin,
        destination,
        at,
        windows: windowsAt(at),
        limit,
      });
      return outlookOver(plan.windows, plan);
    },
  };
}
