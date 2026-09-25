/**
 * Rendering a `Seconds` as a clock time, and a wait as a duration.
 *
 * The whole point of this module is the rollover. `24:01:15` is 86,475 seconds
 * and it is **12:01 AM**, not 12:01 PM. keralam.co renders the last train of
 * the night as a lunchtime service (CLAUDE.md finding 7) because it converts
 * GTFS times through a `Date`, where 86,475 is out of range and the arithmetic
 * silently lands in the afternoon.
 *
 * There is no `Date` here at all. A service-day offset is divided by 3,600 and
 * 60 and nothing else, so 86,475 and 75 produce the same clock face — which is
 * correct, because 24:01:15 and 00:01:15 *are* the same clock face. Which day
 * they fall on is `dayOffset`, reported separately, so a caller that needs to
 * say "tomorrow" can and a caller that does not is never wrong by twelve hours.
 */

import { SERVICE_DAY, type Seconds } from '../data/seconds';
import { EngineError } from './errors';

export type Meridiem = 'AM' | 'PM';

export interface ClockParts {
  /** 0–23. The hour on a 24-hour face, after the service day is folded away. */
  readonly hour24: number;
  /** 1–12. Midnight and noon are both 12, as on a real clock. */
  readonly hour12: number;
  readonly minute: number;
  readonly second: number;
  readonly meridiem: Meridiem;
  /**
   * Whole service days the offset has crossed. 0 for 23:59, 1 for 24:01.
   *
   * This is the bit a `Date` throws away. Keeping it means a departure board
   * can print "12:01 AM" and still know the train belongs to last night.
   */
  readonly dayOffset: number;
}

/** Decompose a service-day offset. Total, non-throwing for any valid `Seconds`. */
export function clockParts(time: Seconds): ClockParts {
  const dayOffset = Math.floor(time / SERVICE_DAY);
  const withinDay = time - dayOffset * SERVICE_DAY;
  const hour24 = Math.floor(withinDay / 3600);
  const minute = Math.floor((withinDay % 3600) / 60);
  const second = withinDay % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour24,
    hour12,
    minute,
    second,
    meridiem: hour24 < 12 ? 'AM' : 'PM',
    dayOffset,
  };
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export interface ClockFormat {
  /** Include seconds. Off by default: a passenger reads minutes. */
  readonly seconds?: boolean;
}

/**
 * `86475` → `'12:01 AM'`.
 *
 * Latin digits and an English meridiem. Malayalam uses the same digits, but
 * "AM"/"PM" needs translating, so localised output builds its own string from
 * {@link clockParts} rather than post-processing this one.
 */
export function formatClock(time: Seconds, format: ClockFormat = {}): string {
  const p = clockParts(time);
  const tail = format.seconds ? `:${pad2(p.second)}` : '';
  return `${p.hour12}:${pad2(p.minute)}${tail} ${p.meridiem}`;
}

/** `86475` → `'00:01'`. The 24-hour face, still folded at midnight. */
export function formatClock24(time: Seconds, format: ClockFormat = {}): string {
  const p = clockParts(time);
  const tail = format.seconds ? `:${pad2(p.second)}` : '';
  return `${pad2(p.hour24)}:${pad2(p.minute)}${tail}`;
}

/** True for a departure at or after 24:00:00 — last night's train, this morning. */
export function crossesMidnight(time: Seconds): boolean {
  return time >= SERVICE_DAY;
}

export interface DurationParts {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  /** The input, unrounded. */
  readonly total: number;
}

/**
 * Split a wait into h/m/s, **rounding minutes down**.
 *
 * Down, not to nearest: "3 min" has to mean you have at least three minutes.
 * Rounding 3:29 up to 4 is how someone misses a train that a countdown told
 * them they would catch, and on this network the penalty for missing the wrong
 * one is 45 minutes (CLAUDE.md finding 9).
 */
export function durationParts(seconds: number): DurationParts {
  if (!Number.isFinite(seconds)) {
    throw new EngineError(`not a duration in seconds: ${seconds}`);
  }
  const whole = Math.max(0, Math.floor(seconds));
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
    total: seconds,
  };
}

/** Whole minutes remaining, rounded down. `119` → `1`. */
export function waitMinutes(seconds: number): number {
  return Math.max(0, Math.floor(seconds / 60));
}

/**
 * `0` → `'Arriving'`, `150` → `'2 min'`, `4320` → `'1 h 12 min'`.
 *
 * English. Same reasoning as {@link formatClock}: the parts are the API, this
 * is the convenience.
 */
export function formatWait(seconds: number): string {
  const p = durationParts(seconds);
  if (p.hours === 0 && p.minutes === 0) return 'Arriving';
  if (p.hours === 0) return `${p.minutes} min`;
  if (p.minutes === 0) return `${p.hours} h`;
  return `${p.hours} h ${p.minutes} min`;
}
