/**
 * Which timetable is running, and how sure we are about it.
 *
 * A **service day** is not a calendar day. It starts at midnight and runs until
 * the last train of the night is off the network, which in this feed is
 * 24:03:45 — 86,625 seconds, three and three-quarter minutes into the *next*
 * calendar day. So at 00:01 on a Tuesday two timetables are live at once:
 * Monday's, three minutes from finishing, and Tuesday's, five hours from
 * starting. Both must be searched or the last train of the night vanishes at
 * midnight, which is exactly what keralam.co does (CLAUDE.md finding 7).
 *
 * The horizon is measured from the data, not assumed. If KMRL ever publishes a
 * 25:30 trip, the previous-day window widens on its own.
 *
 * Services come from `calendar.txt` by day of week and **never** from
 * `feed_start_date`/`feed_end_date`. That window lapsed on 2025-12-31 while the
 * timings stayed accurate (CLAUDE.md finding 6); a spec-compliant consumer that
 * filters on it resolves zero services for any 2026 date and renders an empty
 * app. The dates are provenance, and `FeedProvenance` is where they live.
 */

import type { IsoWeekday, NetworkData, ServiceId } from '../data/network.types';
import { asSeconds, type Seconds } from '../data/seconds';
import {
  addDays,
  formatCivilDate,
  istDateOf,
  istMidnight,
  istSecondsOfDay,
  isoWeekdayOf,
  type CivilDate,
  type Instant,
} from './civil-time';
import type { HolidayCalendar, HolidayRuling } from './holiday';

/** One service day, positioned relative to the instant that was asked about. */
export interface ServiceWindow {
  /** The calendar date the service day is named for. */
  readonly date: CivilDate;
  /** The real day of the week. Monday 1 … Sunday 7. */
  readonly weekday: IsoWeekday;
  /**
   * The day of the week whose timetable actually runs.
   *
   * Equal to {@link weekday} unless a holiday has been declared, in which case
   * it is 7 and the `WE` timetable applies.
   */
  readonly effectiveWeekday: IsoWeekday;
  /** The services active on this service day, from `calendar.txt`. */
  readonly services: readonly ServiceId[];
  /**
   * Where the query instant falls inside this service day, in seconds.
   *
   * 86,520 means the instant is 00:02 the following morning and this window is
   * yesterday, nearly done. A negative value means the window has not started:
   * −43,200 is tomorrow, twelve hours out. A departure at offset `s` is still
   * catchable when `s >= offset`.
   */
  readonly offset: number;
  /** Epoch milliseconds of offset 0, i.e. midnight IST on {@link date}. */
  readonly origin: Instant;
  /** Why we believe this timetable applies — or why we cannot say. */
  readonly ruling: HolidayRuling;
}

/**
 * The latest departure anywhere in the feed, in service-day seconds.
 *
 * 86,625 for this feed: `WK_253` reaching Muttom at 24:03:45. Everything about
 * how far back the engine looks for a still-running service day derives from
 * this number, so it is measured rather than written down.
 */
export function serviceDayHorizon(network: NetworkData): Seconds {
  let latest = 0;
  for (const trip of network.trips) {
    const last = trip.stops[trip.stops.length - 1];
    if (last.departure > latest) latest = last.departure;
    if (last.arrival > latest) latest = last.arrival;
  }
  return asSeconds(latest);
}

const SUNDAY: IsoWeekday = 7;

function servicesOn(network: NetworkData, weekday: IsoWeekday): ServiceId[] {
  return network.services.filter((s) => s.days.has(weekday)).map((s) => s.id);
}

/** Build the window for one calendar date, given where the clock sits inside it. */
export function serviceWindowFor(
  network: NetworkData,
  date: CivilDate,
  offset: number,
  holidays: HolidayCalendar,
): ServiceWindow {
  const ruling = holidays.ruleFor(date);
  const weekday = isoWeekdayOf(date);
  // An `unverified` ruling does not change which timetable we run: day-of-week
  // is still the best available guess, and pre-emptively switching to Sunday
  // would be a different lie. It changes what we are willing to claim, and
  // that travels in `ServiceOutlook`.
  const effectiveWeekday = ruling.kind === 'sunday-service' ? SUNDAY : weekday;
  return {
    date,
    weekday,
    effectiveWeekday,
    services: servicesOn(network, effectiveWeekday),
    offset,
    origin: istMidnight(date),
    ruling,
  };
}

export interface ResolveOptions {
  /** How many calendar days forward to consider. Default 1 — tonight and tomorrow. */
  readonly daysAhead?: number;
  /** Override the measured horizon. Tests only. */
  readonly horizon?: number;
}

/**
 * Every service day that could still contain a train, at `at`, in order.
 *
 * Yesterday is included only while the clock is still inside its span — before
 * 00:03:45 IST for this feed — so the list is normally one or two entries and
 * momentarily three. Nothing hardcodes "before 04:00" or any other cutover:
 * the test is `offset <= horizon`, which is the actual question.
 */
export function resolveServiceWindows(
  network: NetworkData,
  at: Instant,
  holidays: HolidayCalendar,
  options: ResolveOptions = {},
): ServiceWindow[] {
  const horizon = options.horizon ?? serviceDayHorizon(network);
  const daysAhead = options.daysAhead ?? 1;
  const today = istDateOf(at);
  const secondsIntoToday = istSecondsOfDay(at);

  const windows: ServiceWindow[] = [];
  for (let delta = -1; delta <= daysAhead; delta++) {
    const offset = secondsIntoToday - delta * 86_400;
    // That service day finished before this instant; nothing left to board.
    if (offset > horizon) continue;
    windows.push(serviceWindowFor(network, addDays(today, delta), offset, holidays));
  }
  return windows;
}

// --------------------------------------------------------------- uncertainty

/**
 * A result, plus what we are prepared to claim about it.
 *
 * The three variants are not cosmetic. `timetabled` and `holiday-sunday` carry
 * the payload as `result`; `unverified` carries it as **`provisional`**. Under
 * `strict` TypeScript that makes `outlook.result` a compile error until the
 * union has been narrowed, so a component cannot bind departure times to a
 * template without having written code that acknowledges the date might be a
 * holiday. A boolean flag would have been ignorable; a missing property is not.
 *
 * {@link payloadIgnoringCertainty} exists for the cases that genuinely do not
 * care — counting departures in a test, say. It is named to be conspicuous in
 * review, because in a template it would be a bug.
 */
export type ServiceOutlook<T> =
  | {
      readonly certainty: 'timetabled';
      readonly windows: readonly ServiceWindow[];
      readonly result: T;
    }
  | {
      readonly certainty: 'holiday-sunday';
      readonly windows: readonly ServiceWindow[];
      /** Names of the declared holidays in play, for the UI to attribute. */
      readonly holidays: readonly string[];
      readonly result: T;
    }
  | {
      readonly certainty: 'unverified';
      readonly windows: readonly ServiceWindow[];
      /** One sentence, ready to render. Say this or say nothing. */
      readonly caveat: string;
      /** The dates we could not vouch for, `YYYY-MM-DD`. */
      readonly dates: readonly string[];
      /** Day-of-week service, offered without a guarantee. Not `result`. */
      readonly provisional: T;
    };

/**
 * Wrap a value in the weakest claim any contributing service day supports.
 *
 * `windows` must be the windows the value was actually built from, not every
 * candidate. A Sunday board that happens to have been computed alongside an
 * unchecked Monday window is still a Sunday board, and caveating it would
 * overstate the uncertainty.
 */
export function outlookOver<T>(windows: readonly ServiceWindow[], value: T): ServiceOutlook<T> {
  const unverified: { date: CivilDate; reason: string }[] = [];
  const declared: string[] = [];
  for (const window of windows) {
    if (window.ruling.kind === 'unverified') {
      unverified.push({ date: window.date, reason: window.ruling.reason });
    } else if (window.ruling.kind === 'sunday-service') {
      declared.push(window.ruling.name);
    }
  }

  if (unverified.length > 0) {
    return {
      certainty: 'unverified',
      windows,
      caveat: unverified[0].reason,
      dates: unverified.map((u) => formatCivilDate(u.date)),
      provisional: value,
    };
  }
  if (declared.length > 0) {
    return { certainty: 'holiday-sunday', windows, holidays: declared, result: value };
  }
  return { certainty: 'timetabled', windows, result: value };
}

/**
 * Read the payload whatever the certainty.
 *
 * Correct in a test, in a log line, or anywhere the answer is not being shown
 * to a passenger. Wrong in a template: rendering a provisional departure board
 * without its caveat is the failure this type was built to prevent.
 */
export function payloadIgnoringCertainty<T>(outlook: ServiceOutlook<T>): T {
  return outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
}

/** Re-wrap with a different payload, keeping the claim. Useful for mapping a result. */
export function mapOutlook<T, U>(
  outlook: ServiceOutlook<T>,
  map: (value: T) => U,
): ServiceOutlook<U> {
  switch (outlook.certainty) {
    case 'unverified':
      return {
        certainty: 'unverified',
        windows: outlook.windows,
        caveat: outlook.caveat,
        dates: outlook.dates,
        provisional: map(outlook.provisional),
      };
    case 'holiday-sunday':
      return {
        certainty: 'holiday-sunday',
        windows: outlook.windows,
        holidays: outlook.holidays,
        result: map(outlook.result),
      };
    case 'timetabled':
      return { certainty: 'timetabled', windows: outlook.windows, result: map(outlook.result) };
  }
}
