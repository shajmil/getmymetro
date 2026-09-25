/**
 * The route page's view model: a journey plan, turned into strings.
 *
 * The engine does the hard part — direction is the sign of a subtraction, the
 * options are the trips that call at both stations *in order*, and the fare is
 * a lookup in KMRL's 625-pair table. What is here is the rendering, and one
 * thing that is easy to get wrong: a journey has two clocks, the one you leave
 * on and the one you arrive on, and only the first is a countdown.
 *
 * Note what is deliberately *absent*: a short-turn warning. On a departure
 * board it is essential, because a board lists trains that go somewhere the
 * reader is not going. Here the filter has already removed them — a train that
 * terminates at Muttom is simply not an option for Aluva — so labelling the
 * remaining ones would be warning about a hazard that this page cannot
 * produce. The hazard shows up instead as the last *useful* train being
 * earlier than the last train off the platform, which `routeTimings` reports
 * and the template leads with.
 *
 * **Phase 6 split the page in two.** {@link routeReference} is everything that
 * is a property of the timetable — the fare, the stations between, the first
 * and last train per service pattern — and it is computed from a slice the
 * server put in the document, so it is in the prerendered HTML and a crawler
 * reads it without running anything. {@link journeyView} is the part that is a
 * property of *now*, and it stays in the browser, because a departure time
 * baked into a static page is a wrong time.
 */

import type {
  NetworkData,
  Rupees,
  Stop,
  TripId,
} from '../../core/data/network.types';
import { stationName, type StationEntry } from '../../core/data/station-directory';
import { istDateOf, sameCivilDate, type Instant } from '../../core/engine/civil-time';
import { formatClock } from '../../core/engine/clock';
import type { JourneyOption, JourneyPlan } from '../../core/engine/journey';
import { localDays, localWait } from '../../core/i18n/format';
import type { AppLocale } from '../../core/i18n/locale';
import type { RouteFacts, RoutePatternFacts } from '../../shared/page-facts';

/**
 * A wait longer than this can only be across the overnight gap.
 *
 * Same reasoning as the departure board: service runs 05:00 to 24:03:45, so the
 * shortest possible night is about 4h 56m and the longest gap inside service is
 * the 45m56s cliff. The calendar date is checked as well, so the 12:01 AM train
 * — tonight's train, on tomorrow's date — is never labelled as tomorrow's.
 */
export const NEXT_DAY_SECONDS = 4 * 60 * 60;

export interface JourneyRow {
  readonly key: string;
  /** "Due", "6 min", "1 h 12 min". Rounded down. */
  readonly countdown: string;
  /** Departure from the origin. "11:44 PM", correct past midnight. */
  readonly clock: string;
  /** Arrival at the destination. */
  readonly arrivalClock: string;
  /** Riding time, whole minutes. No walking, no waiting. */
  readonly durationMinutes: number;
  readonly nextDay: boolean;
}

export interface RouteJourneyView {
  readonly originName: string;
  readonly destinationName: string;
  /** The end of the line for this direction — the platform sign to look for. */
  readonly towardsName: string;
  readonly fare: Rupees;
  /** Stations passed through, exclusive of both ends. */
  readonly stopsBetween: readonly string[];
  /** How many stations the journey is. Aluva to Edapally is 8. */
  readonly hops: number;
  readonly rows: readonly JourneyRow[];
}

function isNextDay(option: JourneyOption, now: Instant): boolean {
  return (
    option.board.waitSeconds > NEXT_DAY_SECONDS &&
    !sameCivilDate(istDateOf(option.board.at), istDateOf(now))
  );
}

export function journeyView(
  plan: JourneyPlan,
  now: Instant,
  limit: number,
  locale: AppLocale = 'en',
): RouteJourneyView {
  return {
    originName: plan.origin.name[locale],
    destinationName: plan.destination.name[locale],
    towardsName: plan.towards.name[locale],
    fare: plan.fare,
    stopsBetween: plan.stopsBetween.map((stop: Stop) => stop.name[locale]),
    hops: plan.hops,
    rows: plan.options.slice(0, limit).map((option) => ({
      key: `${option.tripId}:${option.board.time}`,
      countdown: localWait(option.board.waitSeconds, locale),
      clock: formatClock(option.board.time),
      arrivalClock: formatClock(option.arrival),
      durationMinutes: Math.round(option.durationSeconds / 60),
      nextDay: isNextDay(option, now),
    })),
  };
}

// --------------------------------------------------------- the static half

/** One service pattern on this pair, said out loud. */
export interface RoutePatternRow {
  readonly serviceId: string;
  /** "Monday to Saturday" / "Sunday", in the reader's language. */
  readonly dayLabel: string;
  readonly trains: number;
  readonly firstClock: string;
  /** The last train that *reaches the destination*. */
  readonly lastClock: string;
  readonly fastestMinutes: number;
  readonly slowestMinutes: number;
  /** The last departure from this platform, whatever it does. */
  readonly lastFromPlatformClock: string;
  /** Minutes between the two. 0 when they are the same train. */
  readonly strandMinutes: number;
}

/**
 * Everything the route page shows that is true at any hour.
 *
 * Built from the slice in the document, so it renders identically on the
 * server and on the browser's first pass, and identically again once the
 * engine has loaded — the engine recomputes the same slice rather than a
 * second, subtly different one.
 */
export interface RouteReference {
  readonly originName: string;
  readonly destinationName: string;
  /** The end of the line for this direction — the platform sign to look for. */
  readonly towardsName: string;
  readonly fare: Rupees;
  /** Stations passed through, exclusive of both ends. */
  readonly stopsBetween: readonly string[];
  readonly hops: number;
  readonly patterns: readonly RoutePatternRow[];
}

export function routeReference(
  facts: RouteFacts,
  stations: readonly StationEntry[],
  locale: AppLocale,
): RouteReference | null {
  const origin = stations[facts.originIndex];
  const destination = stations[facts.destinationIndex];
  if (origin === undefined || destination === undefined) return null;

  // Direction is the sign of a subtraction. There is no routing algorithm on
  // this network and there is nothing for one to decide (CLAUDE.md decision 1).
  const forward = facts.destinationIndex > facts.originIndex;
  const endOfLine = stations[forward ? stations.length - 1 : 0];
  const between: string[] = [];
  for (
    let i = facts.originIndex + (forward ? 1 : -1);
    forward ? i < facts.destinationIndex : i > facts.destinationIndex;
    i += forward ? 1 : -1
  ) {
    between.push(stationName(stations[i], locale));
  }

  return {
    originName: stationName(origin, locale),
    destinationName: stationName(destination, locale),
    towardsName: endOfLine === undefined ? '' : stationName(endOfLine, locale),
    fare: facts.fare,
    stopsBetween: between,
    hops: Math.abs(facts.destinationIndex - facts.originIndex),
    patterns: facts.patterns.map((pattern: RoutePatternFacts) => ({
      serviceId: pattern.serviceId,
      dayLabel: localDays(pattern.days, locale),
      trains: pattern.trains,
      firstClock: pattern.firstClock,
      lastClock: pattern.lastClock,
      fastestMinutes: pattern.fastestMinutes,
      slowestMinutes: pattern.slowestMinutes,
      lastFromPlatformClock: pattern.lastFromPlatformClock,
      strandMinutes: pattern.strandMinutes,
    })),
  };
}

// ------------------------------------------- the stop list, with real times

/**
 * One station on the way, with the time the chosen train calls there.
 *
 * DESIGN.md §6, screen 04: the route page lists **every** stop between the two
 * ends with the time against each, not just the origin and destination.
 */
export interface JourneyStopRow {
  readonly id: string;
  readonly name: string;
  /** Arrival at this station on the chosen train. "6:24". */
  readonly clock: string;
  /** True for the boarding station. */
  readonly isOrigin: boolean;
  /** True for the one that says "Get off here". */
  readonly isDestination: boolean;
}

/**
 * Every stop the chosen train makes between the two ends, with its time.
 *
 * Walks the trip the engine already picked rather than re-planning anything,
 * which is what makes the times on this list the same train's times. Building
 * it from `stopsBetween` and an interpolation would produce a plausible list
 * that belongs to no actual train — and the whole product rests on never doing
 * that.
 *
 * The origin's time is its **departure** and every other row's is its
 * **arrival**, because that is what the reader does at each: they board at the
 * first and they are carried through the rest. A single "time" column that
 * silently meant two different things would be off by the dwell at the origin,
 * which is small enough never to be noticed and wrong every time.
 *
 * Returns an empty list when the trip is not in the network — which cannot
 * happen for an option the engine produced, but the lookup is a `Map#get` and
 * inventing a stop list to cover for a missing one would be worse than
 * rendering none.
 */
export function journeyStops(
  network: NetworkData,
  plan: JourneyPlan,
  option: JourneyOption,
  locale: AppLocale = 'en',
): readonly JourneyStopRow[] {
  const trip = network.tripsById.get(option.tripId as TripId);
  if (trip === undefined) return [];

  const rows: JourneyStopRow[] = [];
  let boarded = false;

  for (const event of trip.stops) {
    const stop = network.stops[event.stopIndex];
    if (stop === undefined) continue;

    if (!boarded) {
      if (stop.index !== plan.origin.index) continue;
      boarded = true;
      rows.push({
        id: stop.id,
        name: stop.name[locale],
        clock: formatClock(event.departure),
        isOrigin: true,
        isDestination: false,
      });
      continue;
    }

    const isDestination = stop.index === plan.destination.index;
    rows.push({
      id: stop.id,
      name: stop.name[locale],
      clock: formatClock(event.arrival),
      isOrigin: false,
      isDestination,
    });
    if (isDestination) break;
  }

  return rows;
}
