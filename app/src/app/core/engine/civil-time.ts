/**
 * Calendar dates in Kochi, and the arithmetic that turns an instant into one.
 *
 * Two rules hold this module together.
 *
 * **Nothing here depends on the host's timezone.** A phone in Dubai, a CI
 * runner in UTC and a prerender in GitHub Actions must all agree about which
 * day it is in Kochi, so every conversion goes through an explicit +05:30 and
 * the UTC accessors. `getFullYear`, `getMonth`, `getDate` and `getHours` are
 * host-local and appear nowhere.
 *
 * **`Date.prototype.getDay()` appears nowhere either.** It numbers Sunday 0,
 * and Sunday is the only day the `WE` timetable runs, so an off-by-one shows
 * 255 weekday trips to everyone for an entire Sunday. {@link isoWeekdayOf}
 * counts from the epoch instead and returns Phase 2's `IsoWeekday`, which
 * excludes 0 by construction.
 *
 * Asia/Kolkata is a fixed UTC+05:30. India has observed no daylight saving
 * since 1945 and has one national timezone, so the offset is a constant rather
 * than a lookup — the only place in this codebase where that shortcut is safe.
 */

import type { IsoWeekday } from '../data/network.types';
import { EngineError } from './errors';

/** Milliseconds since the Unix epoch. A real point in time, not a service-day offset. */
export type Instant = number;

/** UTC+05:30, in seconds. */
export const IST_OFFSET_SECONDS = 19_800;

/** UTC+05:30, in milliseconds. */
export const IST_OFFSET_MS = IST_OFFSET_SECONDS * 1000;

const MS_PER_DAY = 86_400_000;

/**
 * A date on the wall calendar in Kochi. `month` is 1–12, like a human writes it
 * and unlike `Date`, whose 0-based month is a perennial off-by-one.
 */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Mint a `CivilDate`, rejecting 2026-02-30 and friends rather than rolling them over. */
export function civilDate(year: number, month: number, day: number): CivilDate {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new EngineError(`not a supported year: ${year}`);
  }
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    throw new EngineError(`not a whole calendar date: ${year}-${month}-${day}`);
  }
  const ms = Date.UTC(year, month - 1, day);
  const probe = new Date(ms);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new EngineError(`no such date: ${year}-${month}-${day}`);
  }
  return { year, month, day };
}

/** `'2026-09-22'` → `CivilDate`. Strict: the format is exact, not best-effort. */
export function parseCivilDate(text: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new EngineError(`not an ISO calendar date: ${text}`);
  return civilDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** `CivilDate` → `'2026-09-22'`. */
export function formatCivilDate(date: CivilDate): string {
  const mm = date.month < 10 ? `0${date.month}` : String(date.month);
  const dd = date.day < 10 ? `0${date.day}` : String(date.day);
  return `${date.year}-${mm}-${dd}`;
}

/** Whole days from 1970-01-01. The canonical form for comparing and stepping dates. */
export function epochDayOf(date: CivilDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY;
}

export function civilDateFromEpochDay(day: number): CivilDate {
  const probe = new Date(day * MS_PER_DAY);
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

/** Negative `days` steps backwards. Month and year boundaries fall out of the epoch-day form. */
export function addDays(date: CivilDate, days: number): CivilDate {
  return civilDateFromEpochDay(epochDayOf(date) + days);
}

/** Negative when `a` is earlier. Suitable for `Array.prototype.sort`. */
export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  return epochDayOf(a) - epochDayOf(b);
}

export function sameCivilDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Monday 1 … Sunday 7, derived from the epoch rather than from `getDay()`.
 *
 * 1970-01-01 was a Thursday, ISO weekday 4, which anchors the modulo. The extra
 * `+ 7) % 7` keeps pre-epoch dates correct even though {@link civilDate}
 * refuses them — cheap, and it means the function is not quietly wrong if that
 * guard is ever relaxed.
 */
export function isoWeekdayOf(date: CivilDate): IsoWeekday {
  const day = epochDayOf(date);
  return ((((day + 3) % 7) + 7) % 7) + 1 as IsoWeekday;
}

/** The instant midnight IST begins on `date`. */
export function istMidnight(date: CivilDate): Instant {
  return epochDayOf(date) * MS_PER_DAY - IST_OFFSET_MS;
}

/** The calendar date in Kochi at `at`, whatever the host thinks the date is. */
export function istDateOf(at: Instant): CivilDate {
  return civilDateFromEpochDay(Math.floor((at + IST_OFFSET_MS) / MS_PER_DAY));
}

/** Seconds since midnight IST, 0–86,399. Never a service-day offset: see `service-day.ts`. */
export function istSecondsOfDay(at: Instant): number {
  const shifted = at + IST_OFFSET_MS;
  const since = shifted - Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY;
  return Math.floor(since / 1000);
}

/** The instant `secondsOfDay` seconds after midnight IST on `date`. May exceed 86,400. */
export function istInstant(date: CivilDate, secondsOfDay: number): Instant {
  return istMidnight(date) + secondsOfDay * 1000;
}
