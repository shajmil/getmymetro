/**
 * The reference content, computed on the server and carried into the document.
 *
 * Phase 5 left a hole that this closes. First train, last train, fares, the
 * service patterns and the stops between two stations are all pure functions
 * of the feed with **no clock input**, so they belong in the prerendered HTML
 * — that is search priority 1, and the whole advantage over a competitor whose
 * content sits behind a 1.6 MB fetch. But the engine that computes them only
 * exists after the *browser* has fetched `network.json`, so until Phase 6 the
 * prerendered page carried headings and a schematic and nothing else.
 *
 * The server can read `network.json` off disk. What it cannot do is hand the
 * browser a rendered page the browser's first pass would not reproduce — that
 * is an NG0500 hydration mismatch, the same class of failure as an element
 * inside `noscript`. So the facts travel in `TransferState`, the client reads
 * them back **synchronously during bootstrap**, and both sides render from the
 * same input.
 *
 * ---------------------------------------------------------------------------
 * What is here, and what is deliberately not
 * ---------------------------------------------------------------------------
 *
 * Here: `platformTimings`, `routeTimings` and the fare lookup. None of them
 * take a clock.
 *
 * **Not here: departure boards.** A countdown is a function of the reader's
 * wall clock. Baking one into a static page produces a page that is wrong the
 * moment it is served and wronger every hour after — and 1,250 of them, served
 * from a CDN edge cache, would be wrong for as long as the cache lives. The
 * honesty rules forbid it outright. Departures stay client-computed, and the
 * prerendered document shows the same "Loading the timetable" line the
 * client's first render shows.
 *
 * ---------------------------------------------------------------------------
 * Why this is a compact slice and not the bundle
 * ---------------------------------------------------------------------------
 *
 * The obvious shortcut is to put all 7.2 KB of `network.json` into
 * `TransferState` and let the page compute whatever it likes. Multiplied by
 * 1,250 documents that is ~34 MB of prerendered HTML — a real cost on
 * Cloudflare Pages, which caps both file count and total size, and a real cost
 * to every reader, who downloads it in the document *and* fetches the same
 * data again for the interactive part.
 *
 * So the slice carries only what the page renders, and carries it by index
 * wherever a name can be looked up in the station directory that is already in
 * the document. A station page's destination list is 24 fares, not 24 rows of
 * `{id, name, fare, hops, path}`. Measured: ~1 KB per document.
 *
 * Every field is language-free. The same slice serves `/station/aluva` and
 * `/ml/station/aluva`, and the day label, the terminus name and the
 * destination names are built at render time from the directory and the
 * catalogue.
 */

import { makeStateKey } from '@angular/core';

import { fareFor } from '../core/engine/fares';
import { platformTimings, routeTimings } from './schedule-view';
import type {
  Direction,
  IsoWeekday,
  NetworkData,
  Rupees,
  ServiceId,
  Stop,
} from '../core/data/network.types';

/** One service pattern at one platform. Names and labels resolved at render. */
export interface PatternFacts {
  readonly serviceId: ServiceId;
  /** ISO weekdays. Monday 1 … Sunday 7. The label is built from this. */
  readonly days: readonly IsoWeekday[];
  /** Boardable departures in this direction on this pattern. */
  readonly trains: number;
  /** "5:25 AM". Includes the four pre-06:00 trips the competitor loses. */
  readonly firstClock: string;
  /** "11:44 PM". Correct past midnight: 24:01 is 12:01 AM. */
  readonly lastClock: string;
  /** Where the last departure ends, as a `Stop.index`. */
  readonly lastTerminusIndex: number;
  /** The last train that runs the whole way. The deadline that matters. */
  readonly lastThroughClock: string | null;
  /** Minutes between {@link lastThroughClock} and {@link lastClock}. */
  readonly strandMinutes: number | null;
  /** Minutes between the second-to-last departure and the last one. */
  readonly finalGapMinutes: number | null;
}

export interface PlatformFacts {
  readonly direction: Direction;
  /**
   * The fare to every station this platform serves, in travel order.
   *
   * Positional, because the destinations *are* the stations from this one to
   * the end of the line in this direction — there is nothing to identify. Each
   * value is a lookup in KMRL's published 625-pair table, never a calculation:
   * a distance model misprices 104 of the 600 travelled pairs, and the
   * hop-count formula that happens to match today is exactly what the feed
   * could change under us without changing its version.
   */
  readonly fares: readonly Rupees[];
  readonly patterns: readonly PatternFacts[];
}

export interface StationFacts {
  /** `Stop.index`. Also how a client-side navigation knows the slice is stale. */
  readonly index: number;
  readonly platforms: readonly PlatformFacts[];
}

export interface RoutePatternFacts {
  readonly serviceId: ServiceId;
  readonly days: readonly IsoWeekday[];
  /** Trains that call at both stations, origin first. */
  readonly trains: number;
  readonly firstClock: string;
  /** The last train that *reaches the destination*, not the last one out. */
  readonly lastClock: string;
  readonly fastestMinutes: number;
  readonly slowestMinutes: number;
  /** The last departure from this platform, whatever it does. */
  readonly lastFromPlatformClock: string;
  /** Minutes between the two. 0 when they are the same train. */
  readonly strandMinutes: number;
}

export interface RouteFacts {
  readonly originIndex: number;
  readonly destinationIndex: number;
  readonly fare: Rupees;
  readonly patterns: readonly RoutePatternFacts[];
}

/** One page's slice. Exactly one of the two is present. */
export interface PageFacts {
  readonly station?: StationFacts;
  readonly route?: RouteFacts;
}

/**
 * The key the server writes and the browser reads back during bootstrap.
 *
 * `null` on the home page, which has no reference content: everything it shows
 * is a function of where the reader is standing and what time it is.
 */
export const PAGE_FACTS_KEY = makeStateKey<PageFacts | null>('gm.facts');

/** Everything `/station/:slug` renders that does not move with the clock. */
export function stationFactsOf(network: NetworkData, stop: Stop): StationFacts {
  const platforms: PlatformFacts[] = [];
  for (const direction of [0, 1] as const) {
    const endOfLineIndex = direction === 0 ? network.stops.length - 1 : 0;
    const step = direction === 0 ? 1 : -1;
    const fares: Rupees[] = [];
    for (let i = stop.index + step; i >= 0 && i < network.stops.length; i += step) {
      fares.push(fareFor(network, stop, network.stops[i]));
    }
    // A terminus yields one platform, not two. Rendering an empty "Towards
    // Tripunithura" at Tripunithura would be a list of trains nobody can catch.
    if (fares.length === 0) continue;
    platforms.push({
      direction,
      fares,
      patterns: platformTimings(network, stop, direction, endOfLineIndex).map((t) => ({
        serviceId: t.serviceId,
        days: t.days,
        trains: t.trains,
        firstClock: t.firstClock,
        lastClock: t.lastClock,
        lastTerminusIndex: t.lastTerminusIndex,
        lastThroughClock: t.lastThroughClock,
        strandMinutes: t.strandMinutes,
        finalGapMinutes: t.finalGapMinutes,
      })),
    });
  }
  return { index: stop.index, platforms };
}

/** Everything `/route/:pair` renders that does not move with the clock. */
export function routeFactsOf(
  network: NetworkData,
  origin: Stop,
  destination: Stop,
): RouteFacts {
  return {
    originIndex: origin.index,
    destinationIndex: destination.index,
    fare: fareFor(network, origin, destination),
    patterns: routeTimings(network, origin, destination).map((t) => ({
      serviceId: t.serviceId,
      days: t.days,
      trains: t.trains,
      firstClock: t.firstClock,
      lastClock: t.lastClock,
      fastestMinutes: t.fastestMinutes,
      slowestMinutes: t.slowestMinutes,
      lastFromPlatformClock: t.lastFromPlatformClock,
      strandMinutes: t.strandMinutes,
    })),
  };
}
