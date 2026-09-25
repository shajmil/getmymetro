/**
 * First train, last train, and how many — per service pattern.
 *
 * The departure board answers "what leaves next", which is a function of the
 * clock. These are the *reference* facts, which are not: "first metro from MG
 * Road" has one answer all day, and it is the query both incumbents lose
 * (CLAUDE.md search strategy 3 — keralam.co drops every pre-06:00 trip and
 * answers 6-something where the feed says 5:25 AM).
 *
 * Three things this file refuses to do.
 *
 * **It does not name the days.** `WK` is Monday to *Saturday* in this feed, not
 * Monday to Friday, and copy that says "weekday" is wrong six days a week. The
 * label is built from `Service.days`, so a feed that changes the pattern
 * changes the sentence.
 *
 * **It does not lead with the last departure.** At the 20 stations south of
 * Muttom the final towards-Aluva train terminates at Muttom, 51-53 minutes
 * after the last one that actually reaches Aluva (CLAUDE.md finding 9). At MG
 * Road that is 11:44 PM against 10:52 PM. Advertising the 11:44 strands the
 * passenger the feature exists to protect, so {@link lastThrough} leads
 * wherever the two differ and the short-turn is reported as the shorter,
 * later option it is.
 *
 * **It does not count arrivals as departures.** A trip's final stop cannot be
 * boarded, so it is excluded — otherwise Tripunithura advertises trains
 * towards Tripunithura.
 */

import type {
  Direction,
  IsoWeekday,
  NetworkData,
  Service,
  ServiceId,
  Stop,
  Trip,
} from '../core/data/network.types';
import type { Seconds } from '../core/data/seconds';
import { formatClock } from '../core/engine/clock';

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * `{1,2,3,4,5,6}` → `'Monday to Saturday'`. `{7}` → `'Sunday'`.
 *
 * Derived, never written down. See the note above about "weekday".
 */
export function dayLabel(service: Service): string {
  const days = [...service.days].sort((a, b) => a - b);
  if (days.length === 0) return 'no days';
  if (days.length === 7) return 'Every day';
  const names = days.map((day) => WEEKDAY_NAMES[day - 1]);
  const contiguous = days.every((day, i) => i === 0 || day === days[i - 1] + 1);
  if (days.length === 1) return names[0];
  if (contiguous) return `${names[0]} to ${names[names.length - 1]}`;
  return names.join(', ');
}

/** A boardable call: this trip stops here and you can get on. */
interface Call {
  readonly trip: Trip;
  readonly position: number;
  readonly departure: Seconds;
}

/** Every boardable call at `stopIndex` on trips running `direction` under `service`. */
function callsAt(
  network: NetworkData,
  stopIndex: number,
  direction: Direction,
  service: ServiceId,
): Call[] {
  const calls: Call[] = [];
  for (const trip of network.trips) {
    if (trip.direction !== direction || trip.service !== service) continue;
    // `length - 1`: you cannot board a train where it terminates.
    for (let position = 0; position < trip.stops.length - 1; position++) {
      if (trip.stops[position].stopIndex === stopIndex) {
        calls.push({ trip, position, departure: trip.stops[position].departure });
      }
    }
  }
  return calls.sort((a, b) => a.departure - b.departure);
}

const terminusIndexOf = (trip: Trip): number => trip.stops[trip.stops.length - 1].stopIndex;

export interface PatternTiming {
  readonly serviceId: ServiceId;
  /**
   * The days this pattern runs, as ISO weekdays. Monday is 1, Sunday is 7.
   *
   * Carried alongside {@link dayLabel} rather than instead of it because the
   * label has to be said in the reader's language, and a translated string
   * cannot be un-translated. This is the fact; the label is one rendering of
   * it. `core/i18n/format.ts:localDays` is the other.
   */
  readonly days: readonly IsoWeekday[];
  /** "Monday to Saturday" / "Sunday", in English. From the feed's own calendar. */
  readonly dayLabel: string;
  /** Boardable departures in this direction on this pattern. */
  readonly trains: number;
  /** "5:25 AM". Includes the four pre-06:00 trips the competitor loses. */
  readonly firstClock: string;
  /** "11:44 PM". Correct past midnight: 24:01 is 12:01 AM. */
  readonly lastClock: string;
  readonly lastTerminusName: string;
  /** Where the final departure ends, as a `Stop.index`. Language-free. */
  readonly lastTerminusIndex: number;
  /** True when the final departure stops short of the end of the line. */
  readonly lastShortTurn: boolean;
  /**
   * The last train that runs the whole way. This is the deadline that matters.
   *
   * `null` only if no trip in this direction reaches the end of the line at
   * all, which no station in this feed manages.
   */
  readonly lastThroughClock: string | null;
  /** Minutes between {@link lastThroughClock} and {@link lastClock}. */
  readonly strandMinutes: number | null;
  /** Minutes between the second-to-last departure and the last one. */
  readonly finalGapMinutes: number | null;
}

/** First, last and last-through for one platform, one pattern per service. */
export function platformTimings(
  network: NetworkData,
  stop: Stop,
  direction: Direction,
  endOfLineIndex: number,
): readonly PatternTiming[] {
  const timings: PatternTiming[] = [];
  for (const service of network.services) {
    const calls = callsAt(network, stop.index, direction, service.id);
    if (calls.length === 0) continue;
    const last = calls[calls.length - 1];
    const previous = calls.length > 1 ? calls[calls.length - 2] : null;
    const through = [...calls].reverse().find((call) => terminusIndexOf(call.trip) === endOfLineIndex);
    const lastTerminus = network.stops[terminusIndexOf(last.trip)];

    timings.push({
      serviceId: service.id,
      days: [...service.days].sort((a, b) => a - b),
      dayLabel: dayLabel(service),
      trains: calls.length,
      firstClock: formatClock(calls[0].departure),
      lastClock: formatClock(last.departure),
      lastTerminusName: lastTerminus.name.en,
      lastTerminusIndex: lastTerminus.index,
      lastShortTurn: lastTerminus.index !== endOfLineIndex,
      lastThroughClock: through === undefined ? null : formatClock(through.departure),
      // Floored, not rounded, and for the same reason `clock.ts` floors a
      // wait: these numbers go into sentences a passenger acts on, and the
      // departure board already renders the same gap as "a 45 minute gap".
      // Two numbers for one gap on one page is worse than being a minute shy.
      strandMinutes:
        through === undefined ? null : Math.floor((last.departure - through.departure) / 60),
      finalGapMinutes:
        previous === null ? null : Math.floor((last.departure - previous.departure) / 60),
    });
  }
  return timings;
}

export interface RoutePatternTiming {
  readonly serviceId: ServiceId;
  /** ISO weekdays this pattern runs. See {@link PatternTiming.days}. */
  readonly days: readonly IsoWeekday[];
  readonly dayLabel: string;
  /** Trains that call at both stations, origin first. */
  readonly trains: number;
  readonly firstClock: string;
  readonly lastClock: string;
  /** Shortest riding time on this pattern, whole minutes. */
  readonly fastestMinutes: number;
  /** Longest riding time on this pattern. The spread is real — see below. */
  readonly slowestMinutes: number;
  /**
   * The last departure from this platform in this direction, whatever it does.
   *
   * Equal to {@link lastClock} unless a later train leaves and stops short of
   * the destination, which at the 20 stations south of Muttom it does by 51-53
   * minutes towards Aluva. Keeping both is what lets the page say "there is a
   * later train and it is no use to you" instead of either hiding it or
   * advertising it.
   */
  readonly lastFromPlatformClock: string;
  /** Minutes between {@link lastClock} and {@link lastFromPlatformClock}. 0 when equal. */
  readonly strandMinutes: number;
}

/**
 * The same facts for an origin-destination pair.
 *
 * `fastest` and `slowest` are both reported because the spread is not noise:
 * Aluva to Tripunithura runs 49-54 minutes on Mon-Sat and 47-58 on Sunday. A
 * single "journey time" would be a number that is wrong for most trains, and
 * the honesty rules rule out presenting an average as a promise.
 *
 * A trip only counts when it calls at the destination **after** the origin.
 * That is what keeps a train terminating at Muttom off an Aluva-bound list,
 * and it is the one place the competitor's design protects itself by accident.
 */
export function routeTimings(
  network: NetworkData,
  origin: Stop,
  destination: Stop,
): readonly RoutePatternTiming[] {
  const direction: Direction = destination.index > origin.index ? 0 : 1;
  const timings: RoutePatternTiming[] = [];

  for (const service of network.services) {
    const boardings: { departure: Seconds; durationSeconds: number }[] = [];
    for (const call of callsAt(network, origin.index, direction, service.id)) {
      const events = call.trip.stops;
      for (let i = call.position + 1; i < events.length; i++) {
        if (events[i].stopIndex === destination.index) {
          boardings.push({
            departure: call.departure,
            durationSeconds: events[i].arrival - call.departure,
          });
          break;
        }
      }
    }
    if (boardings.length === 0) continue;
    const durations = boardings.map((b) => b.durationSeconds);
    const lastUseful = boardings[boardings.length - 1].departure;
    const platformCalls = callsAt(network, origin.index, direction, service.id);
    const lastFromPlatform = platformCalls[platformCalls.length - 1].departure;
    timings.push({
      serviceId: service.id,
      days: [...service.days].sort((a, b) => a - b),
      dayLabel: dayLabel(service),
      trains: boardings.length,
      firstClock: formatClock(boardings[0].departure),
      lastClock: formatClock(lastUseful),
      fastestMinutes: Math.round(Math.min(...durations) / 60),
      slowestMinutes: Math.round(Math.max(...durations) / 60),
      lastFromPlatformClock: formatClock(lastFromPlatform),
      strandMinutes: Math.floor((lastFromPlatform - lastUseful) / 60),
    });
  }
  return timings;
}

/**
 * The typical ride, in minutes, from one station to every other one.
 *
 * The choose-destination screen (DESIGN.md §6, screen 05) lists all 24
 * destinations with "N stops · M min" against each. Asking
 * {@link routeTimings} 24 times would scan all 450 trips 24 times over; this
 * scans them **once** and fills every destination on the way, because a single
 * trip's stop list already contains the ride to every station it calls at
 * after this one.
 *
 * The number returned is the *shortest* observed ride, matching
 * `RoutePatternTiming.fastestMinutes` — the same figure the route page quotes
 * as "time on the train". Rides on this line vary by a minute or two between
 * trips and the fastest is the one that is reproducible: it is what a
 * timetable would print.
 *
 * The result is indexed by `Stop.index`, with `null` where no trip in the feed
 * runs between the two — which on a single line means the origin itself and
 * nothing else, but is not assumed.
 *
 * **Riding time only.** No walking, no security queue, no ticket line.
 * CLAUDE.md's leave-by gaps 1 and 2 are still open, and a number that silently
 * folded a guess at either into this one would be exactly the kind of invented
 * precision the honesty rules forbid.
 */
export function rideMinutesFrom(
  network: NetworkData,
  origin: Stop,
): readonly (number | null)[] {
  const best: (number | null)[] = network.stops.map(() => null);

  for (const trip of network.trips) {
    // Where this trip calls at the origin. A trip's final stop is an arrival,
    // so boarding there is not possible and the loop stops one short.
    for (let position = 0; position < trip.stops.length - 1; position++) {
      if (trip.stops[position].stopIndex !== origin.index) continue;
      const departure = trip.stops[position].departure;
      for (let i = position + 1; i < trip.stops.length; i++) {
        const event = trip.stops[i];
        const minutes = Math.round((event.arrival - departure) / 60);
        const current = best[event.stopIndex];
        if (current === null || minutes < current) best[event.stopIndex] = minutes;
      }
      break;
    }
  }

  return best;
}
