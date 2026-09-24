/**
 * The holiday problem, and the mechanism for not lying about it.
 *
 * KMRL's feed ships no `calendar_dates.txt` (CLAUDE.md finding 4). There are
 * exactly two services — `WK` Monday to Saturday and `WE` Sunday — and nothing
 * anywhere in the data says what runs on Onam, Vishu, Christmas or a bandh.
 * What is known is what it costs to be wrong: Sunday service starts 90 to 92
 * minutes later than Monday-to-Saturday at every station (measured across the
 * feed; up to 103 minutes at Muttom towards Aluva). Showing a weekday first
 * train on a holiday morning puts someone on an empty platform for an hour and
 * a half.
 *
 * So this module does not guess. It provides a place to *put* an answer, and a
 * vocabulary for saying there isn't one:
 *
 *   `ordinary`        — day-of-week service, and we stand behind that
 *   `sunday-service`  — a declared holiday; the `WE` timetable applies
 *   `unverified`      — we do not know, and the caller must say so
 *
 * There is deliberately no holiday list in this file. Kerala's public holidays
 * move with the lunar and solar calendars, KMRL announces changes on social
 * media rather than in the feed, and a list invented here would be indis-
 * tinguishable to the UI from one that had been checked. Populate
 * {@link declaredHolidays} from a reviewed source, with the range it was
 * reviewed for, or ship {@link NO_HOLIDAY_DATA} and caveat honestly.
 */

import { compareCivilDates, formatCivilDate, isoWeekdayOf, parseCivilDate, type CivilDate } from './civil-time';
import { EngineError } from './errors';

export type HolidayRuling =
  /** Normal service for this day of the week, and the calendar vouches for it. */
  | { readonly kind: 'ordinary' }
  /** A declared holiday. The Sunday (`WE`) timetable runs. */
  | { readonly kind: 'sunday-service'; readonly name: string }
  /**
   * The calendar has no coverage for this date.
   *
   * Day-of-week service is still the best available assumption and the engine
   * will use it — but the result is marked `unverified` all the way up, so the
   * UI cannot render it as fact without deleting the caveat on purpose.
   */
  | { readonly kind: 'unverified'; readonly reason: string };

/** The injection point. One method, so a test or a later phase can supply anything. */
export interface HolidayCalendar {
  /** What runs on `date`, and how sure we are. */
  ruleFor(date: CivilDate): HolidayRuling;
}

/**
 * Why a Sunday is never `unverified`.
 *
 * The documented failure mode is a *holiday running the Sunday timetable*. A
 * Sunday already runs the Sunday timetable, so no holiday declaration can
 * change what a Sunday looks like. Caveating Sundays would be overstating the
 * uncertainty, which CLAUDE.md's honesty rules forbid as squarely as
 * understating it.
 */
const SUNDAY: 7 = 7;

const NO_DATA_REASON =
  'KMRL publishes no holiday calendar (no calendar_dates.txt), and public ' +
  'holidays run the Sunday timetable, which starts about 90 minutes later.';

/**
 * The shipped default: knows nothing, and says so.
 *
 * Sundays resolve `ordinary`. Every other date resolves `unverified`, because
 * for every other date the honest answer is that we have not checked. That is
 * a loud default on purpose — the way to quieten it is to supply a reviewed
 * calendar, not to suppress the flag.
 */
export const NO_HOLIDAY_DATA: HolidayCalendar = {
  ruleFor(date: CivilDate): HolidayRuling {
    return isoWeekdayOf(date) === SUNDAY
      ? { kind: 'ordinary' }
      : { kind: 'unverified', reason: NO_DATA_REASON };
  },
};

/**
 * A calendar that vouches for nothing at all, including Sundays.
 *
 * Only useful for proving that the uncertainty really does propagate. Not for
 * production: a Sunday is a Sunday.
 */
export const VOUCHES_FOR_NOTHING: HolidayCalendar = {
  ruleFor(): HolidayRuling {
    return { kind: 'unverified', reason: 'no calendar configured' };
  },
};

export interface DeclaredHolidays {
  /**
   * Dates that run the Sunday timetable, as `YYYY-MM-DD`, with a name to show.
   * `{ '2026-08-26': 'Thiruvonam' }`.
   */
  readonly sundayService: Readonly<Record<string, string>>;
  /** First date this list was reviewed for, inclusive, `YYYY-MM-DD`. */
  readonly vouchedFrom: string;
  /** Last date this list was reviewed for, inclusive, `YYYY-MM-DD`. */
  readonly vouchedThrough: string;
  /** Who checked it and against what. Travels with the ruling so provenance survives. */
  readonly source: string;
}

/**
 * Build a calendar from a list that somebody actually checked.
 *
 * The vouched-for range is not optional and not inferred from the list. A list
 * of holidays says which dates *are* holidays; only the range says which dates
 * have been *looked at*. Without it, an empty list and a complete one are the
 * same object, and every unchecked date silently becomes "ordinary" — which is
 * the exact failure this module exists to prevent.
 *
 * Sundays outside the range still resolve `ordinary`, for the reason above.
 */
export function declaredHolidays(declared: DeclaredHolidays): HolidayCalendar {
  const from = parseCivilDate(declared.vouchedFrom);
  const through = parseCivilDate(declared.vouchedThrough);
  if (compareCivilDates(from, through) > 0) {
    throw new EngineError(
      `vouched range runs backwards: ${declared.vouchedFrom} to ${declared.vouchedThrough}`,
    );
  }
  for (const key of Object.keys(declared.sundayService)) {
    const date = parseCivilDate(key);
    if (compareCivilDates(date, from) < 0 || compareCivilDates(date, through) > 0) {
      throw new EngineError(`declared holiday ${key} lies outside the vouched range`);
    }
  }
  const outOfRange =
    `${declared.source} covers ${declared.vouchedFrom} to ${declared.vouchedThrough} only. ` +
    NO_DATA_REASON;

  return {
    ruleFor(date: CivilDate): HolidayRuling {
      const name = declared.sundayService[formatCivilDate(date)];
      if (name !== undefined) return { kind: 'sunday-service', name };
      if (isoWeekdayOf(date) === SUNDAY) return { kind: 'ordinary' };
      const inRange =
        compareCivilDates(date, from) >= 0 && compareCivilDates(date, through) <= 0;
      return inRange ? { kind: 'ordinary' } : { kind: 'unverified', reason: outOfRange };
    },
  };
}
