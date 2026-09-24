/**
 * Numbers and durations, said in the reader's language.
 *
 * `core/engine/clock.ts` already anticipated this and says so: the *parts* are
 * the API and `formatWait` / `formatClock` are the English convenience. So
 * nothing in the engine is touched here — these build their own strings from
 * `durationParts` and the catalogue.
 *
 * **Clock faces are not translated, on purpose.** `5:25 AM` is what KMRL
 * prints on the platform, what their own station pages render, and what
 * `build_pages.py` already writes into the Malayalam meta descriptions. A
 * Malayalam meridiem invented here would make the page disagree with the sign
 * the reader is standing under, which is a worse failure than an untranslated
 * two-letter abbreviation. The same reasoning covers fares: `₹40` is the
 * symbol on the ticket.
 */

import { durationParts } from '../engine/clock';
import type { IsoWeekday } from '../data/network.types';
import type { AppLocale } from './locale';
import { translate } from './translate';
import type { StringKey } from './strings';

/**
 * `0` → `'Due'` / `'ഇപ്പോൾ'`, `150` → `'2 min'`, `4320` → `'1 h 12 min'`.
 *
 * Minutes round **down**, because that is what `durationParts` does and the
 * reason matters: "3 min" has to mean at least three minutes, and on this
 * network the penalty for missing the wrong train is 45 minutes.
 */
export function localWait(seconds: number, locale: AppLocale): string {
  const p = durationParts(seconds);
  if (p.hours === 0 && p.minutes === 0) return translate(locale, 'time.due');
  if (p.hours === 0) return translate(locale, 'time.minutes', { minutes: p.minutes });
  if (p.minutes === 0) return translate(locale, 'time.hours', { hours: p.hours });
  return translate(locale, 'time.hoursMinutes', { hours: p.hours, minutes: p.minutes });
}

/** `240` → `'240 m'`, `1240` → `'1.2 km'`. Same rounding as `core/location/nearest.ts`. */
export function localDistance(metres: number, locale: AppLocale): string {
  const rounded = Math.round(metres / 10) * 10;
  if (rounded < 1000) return translate(locale, 'time.metres', { metres: rounded });
  return translate(locale, 'time.kilometres', { kilometres: (metres / 1000).toFixed(1) });
}

/**
 * `[1,2,3,4,5,6]` → `'Monday to Saturday'`. `[7]` → `'Sunday'`.
 *
 * Derived from the feed's own calendar, never written down. `WK` is Monday to
 * **Saturday** in this feed, so copy that says "weekday" is wrong six days a
 * week — and a hardcoded label would go on being wrong after KMRL changed the
 * pattern.
 */
export function localDays(days: readonly IsoWeekday[], locale: AppLocale): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return translate(locale, 'day.none');
  if (sorted.length === 7) return translate(locale, 'day.every');
  const name = (day: number): string => translate(locale, `day.${day}` as StringKey);
  if (sorted.length === 1) return name(sorted[0]);
  const contiguous = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);
  if (contiguous) {
    return translate(locale, 'day.range', {
      first: name(sorted[0]),
      last: name(sorted[sorted.length - 1]),
    });
  }
  return sorted.map(name).join(', ');
}

/** `'2026-09'` → `'September 2026'`. Falls back to the raw value unchanged. */
export function localMonth(value: string, locale: AppLocale): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match === null) return value;
  const index = Number(match[2]);
  if (index < 1 || index > 12) return value;
  return `${translate(locale, `month.${index}` as StringKey)} ${match[1]}`;
}
