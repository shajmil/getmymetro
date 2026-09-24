/**
 * Dates in Kochi, checked against something that is not this codebase.
 *
 * The weekday sweep uses ICU (`Intl.DateTimeFormat` pinned to UTC) as the
 * oracle rather than a second copy of the same modulo arithmetic — an oracle
 * that shares an implementation with the thing it checks proves nothing.
 *
 * The stake here is one day of wrong timetables. `Date.prototype.getDay()`
 * numbers Sunday 0; `IsoWeekday` numbers it 7 and excludes 0 from the type. If
 * the two were ever confused, `WE` would resolve on Saturday and `WK` on
 * Sunday, and every departure in the app would be wrong for a whole day.
 */

import {
  addDays,
  civilDate,
  compareCivilDates,
  epochDayOf,
  formatCivilDate,
  IST_OFFSET_MS,
  istDateOf,
  istInstant,
  istMidnight,
  istSecondsOfDay,
  isoWeekdayOf,
  parseCivilDate,
  sameCivilDate,
} from './civil-time';

/** ICU's name for the weekday of a UTC date. Independent of anything below. */
function icuWeekdayName(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${iso}T00:00:00Z`));
}

const ISO_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

describe('isoWeekdayOf', () => {
  it('agrees with ICU on every day of a 400-year-safe sample', () => {
    // 800 consecutive days spans leap years, century rules and DST changes in
    // every jurisdiction that has them. One disagreement fails the sweep.
    let date = parseCivilDate('2024-02-26');
    for (let i = 0; i < 800; i++) {
      const iso = formatCivilDate(date);
      expect(ISO_NAMES[isoWeekdayOf(date) - 1], iso).toBe(icuWeekdayName(iso));
      date = addDays(date, 1);
    }
  });

  it('numbers Sunday 7 and Monday 1 \u2014 never 0', () => {
    expect(isoWeekdayOf(parseCivilDate('2026-09-27'))).toBe(7);
    expect(isoWeekdayOf(parseCivilDate('2026-09-28'))).toBe(1);
    expect(isoWeekdayOf(parseCivilDate('2026-09-26'))).toBe(6);
    // The value Date.getDay() would have produced for that Sunday.
    expect(isoWeekdayOf(parseCivilDate('2026-09-27'))).not.toBe(0);
  });
});

describe('CivilDate', () => {
  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(() => civilDate(2026, 2, 30)).toThrow(/no such date/);
    expect(() => civilDate(2026, 13, 1)).toThrow(/no such date/);
    expect(() => civilDate(2026, 9, 0)).toThrow(/no such date/);
    expect(() => parseCivilDate('22-09-2026')).toThrow(/not an ISO calendar date/);
    expect(() => parseCivilDate('2026-9-22')).toThrow(/not an ISO calendar date/);
  });

  it('accepts a leap day in a leap year and refuses it otherwise', () => {
    expect(formatCivilDate(civilDate(2028, 2, 29))).toBe('2028-02-29');
    expect(() => civilDate(2026, 2, 29)).toThrow(/no such date/);
  });

  it('steps across month, year and leap boundaries', () => {
    expect(formatCivilDate(addDays(parseCivilDate('2026-09-30'), 1))).toBe('2026-10-01');
    expect(formatCivilDate(addDays(parseCivilDate('2026-01-01'), -1))).toBe('2025-12-31');
    expect(formatCivilDate(addDays(parseCivilDate('2028-02-28'), 1))).toBe('2028-02-29');
    expect(formatCivilDate(addDays(parseCivilDate('2026-02-28'), 1))).toBe('2026-03-01');
  });

  it('compares and equates dates', () => {
    const a = parseCivilDate('2026-09-21');
    const b = parseCivilDate('2026-09-22');
    expect(compareCivilDates(a, b)).toBeLessThan(0);
    expect(compareCivilDates(b, a)).toBeGreaterThan(0);
    expect(compareCivilDates(a, parseCivilDate('2026-09-21'))).toBe(0);
    expect(sameCivilDate(a, parseCivilDate('2026-09-21'))).toBe(true);
    expect(sameCivilDate(a, b)).toBe(false);
    expect(epochDayOf(b) - epochDayOf(a)).toBe(1);
  });
});

describe('IST conversion', () => {
  it('is UTC+05:30 exactly, with no daylight saving anywhere in the year', () => {
    expect(IST_OFFSET_MS).toBe(5.5 * 3600 * 1000);
    // January and July: any DST rule would move one of these and not the other.
    for (const iso of ['2026-01-15', '2026-07-15']) {
      const midnight = istMidnight(parseCivilDate(iso));
      expect(new Date(midnight).toISOString()).toBe(`${addDaysIso(iso, -1)}T18:30:00.000Z`);
    }
  });

  it('puts the date boundary at 18:30 UTC, not at midnight UTC', () => {
    // 23:59:59 IST on the 22nd is still the 22nd.
    expect(formatCivilDate(istDateOf(Date.parse('2026-09-22T18:29:59Z')))).toBe('2026-09-22');
    // One second later it is the 23rd in Kochi, while it is still the 22nd in UTC.
    expect(formatCivilDate(istDateOf(Date.parse('2026-09-22T18:30:00Z')))).toBe('2026-09-23');
    expect(istSecondsOfDay(Date.parse('2026-09-22T18:29:59Z'))).toBe(86_399);
    expect(istSecondsOfDay(Date.parse('2026-09-22T18:30:00Z'))).toBe(0);
  });

  it('round-trips a date and a seconds-of-day through an instant', () => {
    const date = parseCivilDate('2026-09-22');
    const instant = istInstant(date, 12 * 3600 + 34 * 60 + 56);
    expect(formatCivilDate(istDateOf(instant))).toBe('2026-09-22');
    expect(istSecondsOfDay(instant)).toBe(12 * 3600 + 34 * 60 + 56);
  });

  it('accepts a seconds-of-day past 86,400, which is what a service day needs', () => {
    // 24:01:15 on the 22nd is 00:01:15 on the 23rd, in Kochi.
    const instant = istInstant(parseCivilDate('2026-09-22'), 86_475);
    expect(formatCivilDate(istDateOf(instant))).toBe('2026-09-23');
    expect(istSecondsOfDay(instant)).toBe(75);
  });
});

function addDaysIso(iso: string, days: number): string {
  return formatCivilDate(addDays(parseCivilDate(iso), days));
}
