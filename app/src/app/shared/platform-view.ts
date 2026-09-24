/**
 * The station page's view model — and, since Phase 7, the home screen's too.
 *
 * The departure board itself is `shared/board-view.ts` — the same one the home
 * screen renders, including the last-train wording, which is the copy this
 * product cannot afford two versions of. What is here is the rest of the page:
 * the reference facts that do not move with the clock, and the fare list.
 *
 * The fare list is also the answer to "which platform". "Towards Tripunithura"
 * means nothing to a passenger who wants Kaloor (MVP scope item 2), and a list
 * of every station this platform can take you to, with the price, answers the
 * platform question and the fare question in the same 24 rows.
 *
 * **Phase 6 split this in two, and the split is the point.** The facts come
 * from `shared/page-facts.ts` and are language-free numbers and clock strings;
 * this file turns them into words. The server computes the facts from
 * `network.json` on disk and puts them in `TransferState`; the browser reads
 * them back during bootstrap and runs the very same function over them. So the
 * prerendered HTML carries the fares and the first and last train — which is
 * what a crawler indexes — and the client's first render reproduces it exactly
 * rather than throwing it away as a hydration mismatch.
 */

import type { Direction, Rupees } from '../core/data/network.types';
import { stationName, type StationEntry } from '../core/data/station-directory';
import { routePath } from '../core/data/slugs';
import { localDays } from '../core/i18n/format';
import { localised, type AppLocale } from '../core/i18n/locale';
import type { PatternFacts, StationFacts } from './page-facts';

export interface DestinationRow {
  readonly id: string;
  /** In the reader's language. */
  readonly name: string;
  /** Straight from the 625-pair table. Never computed — see `fares.ts`. */
  readonly fare: Rupees;
  /** Stations travelled. Aluva to Edapally is 8. */
  readonly hops: number;
  readonly path: string;
}

/** One service pattern, said out loud. */
export interface PatternRow {
  readonly serviceId: string;
  /** "Monday to Saturday" / "Sunday", in the reader's language. */
  readonly dayLabel: string;
  readonly trains: number;
  readonly firstClock: string;
  readonly lastClock: string;
  readonly lastTerminusName: string;
  /** True when the final departure stops short of the end of the line. */
  readonly lastShortTurn: boolean;
  readonly lastThroughClock: string | null;
  readonly strandMinutes: number | null;
  readonly finalGapMinutes: number | null;
}

export interface PlatformView {
  readonly direction: Direction;
  /** "Aluva" / "Tripunithura" — read from the end of the line, never hardcoded. */
  readonly towardsName: string;
  /** Every station reachable from this platform, in travel order. */
  readonly destinations: readonly DestinationRow[];
  /** First, last and last-through, one entry per service pattern. */
  readonly patterns: readonly PatternRow[];
}

function patternRow(
  facts: PatternFacts,
  stations: readonly StationEntry[],
  endOfLineIndex: number,
  locale: AppLocale,
): PatternRow {
  const terminus = stations[facts.lastTerminusIndex];
  return {
    serviceId: facts.serviceId,
    dayLabel: localDays(facts.days, locale),
    trains: facts.trains,
    firstClock: facts.firstClock,
    lastClock: facts.lastClock,
    lastTerminusName: terminus === undefined ? '' : stationName(terminus, locale),
    lastShortTurn: facts.lastTerminusIndex !== endOfLineIndex,
    lastThroughClock: facts.lastThroughClock,
    strandMinutes: facts.strandMinutes,
    finalGapMinutes: facts.finalGapMinutes,
  };
}

/**
 * Both platforms at a station, with fares and reference timings.
 *
 * A terminus yields one platform, not two — `stationFactsOf` has already
 * dropped the direction it cannot be boarded for.
 *
 * `stations` is the directory that is already in the document, which is why
 * the slice carries indexes and fares rather than names and hrefs. The href is
 * always built from the English name: the slug is the same in both languages
 * and only the prefix changes.
 */
export function platformViews(
  facts: StationFacts,
  stations: readonly StationEntry[],
  locale: AppLocale,
): readonly PlatformView[] {
  const origin = stations[facts.index];
  if (origin === undefined) return [];

  return facts.platforms.map((platform) => {
    const endOfLineIndex = platform.direction === 0 ? stations.length - 1 : 0;
    const step = platform.direction === 0 ? 1 : -1;
    const destinations: DestinationRow[] = platform.fares.map((fare, offset) => {
      const destination = stations[origin.index + step * (offset + 1)];
      return {
        id: destination.id,
        name: stationName(destination, locale),
        fare,
        hops: offset + 1,
        path: localised(routePath(origin.name, destination.name), locale),
      };
    });
    const towards = stations[endOfLineIndex];
    return {
      direction: platform.direction,
      towardsName: towards === undefined ? '' : stationName(towards, locale),
      destinations,
      patterns: platform.patterns.map((pattern) =>
        patternRow(pattern, stations, endOfLineIndex, locale),
      ),
    };
  });
}
