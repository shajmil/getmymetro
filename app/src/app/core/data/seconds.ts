/**
 * Transit time, in the only representation this app allows.
 *
 * GTFS times are an offset from the start of the service day, not a clock and
 * not a date. `24:01:15` is a real, ordinary value meaning 86,475 seconds —
 * the last train of the night, one minute past midnight, still belonging to
 * yesterday's service day.
 *
 * Handing that to JavaScript's `Date` is the single most common way to break a
 * transit app, and the competitor's app breaks at midnight every night for
 * exactly this reason (CLAUDE.md finding 7): it compares 86,475 against
 * `getHours() * 3600 + …`, which can never exceed 86,399, so the last train
 * disappears the moment the clock rolls over.
 *
 * So there is deliberately no `toDate`, no `fromDate` and no parser for
 * `"HH:MM:SS"` anywhere in this module. Turning a wall clock into a service-day
 * offset needs a service day to anchor it, and that is the engine's job, not
 * the data layer's.
 */

declare const SECONDS: unique symbol;
declare const METRES: unique symbol;

/**
 * Seconds since the start of the service day. May exceed 86,400.
 *
 * Branded so it cannot be confused with a Unix timestamp, a millisecond count,
 * a `Metres`, or a raw number that happened to be lying around.
 */
export type Seconds = number & { readonly [SECONDS]: true };

/** Distance along the line, in metres. Branded for the same reason. */
export type Metres = number & { readonly [METRES]: true };

/** One service day. Not a calendar day: a service day can be longer. */
export const SERVICE_DAY: Seconds = 86_400 as Seconds;

/**
 * The only way to mint a `Seconds`. Validates at the boundary so a NaN from a
 * malformed bundle surfaces here rather than as a blank departure board.
 */
export function asSeconds(value: number): Seconds {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`not a service-day offset in whole seconds: ${value}`);
  }
  return value as Seconds;
}

/** The only way to mint a `Metres`. */
export function asMetres(value: number): Metres {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`not a distance in metres: ${value}`);
  }
  return value as Metres;
}
