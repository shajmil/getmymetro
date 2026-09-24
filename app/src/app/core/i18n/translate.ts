/**
 * Look a string up, and fill in its placeholders.
 *
 * Separate from `i18n.ts` so that everything except the service itself — the
 * view models, the formatters, and the server-side prerender — can translate
 * without pulling in the router. It is a pure function of
 * `(locale, key, params)`, which is also what makes a translated view model
 * testable without a TestBed.
 */

import { CATALOGUES, EN, type StringKey, type StringParams } from './strings';
import type { AppLocale } from './locale';

/** `'{count} stations'` + `{count: 25}` → `'25 stations'`. */
export function interpolate(template: string, params?: StringParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Translate one key.
 *
 * Falls back to English rather than to the key. A missing Malayalam string is
 * a review failure, not a rendering failure, and an English sentence in a
 * Malayalam paragraph is far better than `station.firstTrain` on the screen.
 * `ML` is typed against `EN`'s keys, so this branch is unreachable today and
 * exists for the day the catalogue is generated rather than written.
 */
export function translate(locale: AppLocale, key: StringKey, params?: StringParams): string {
  const table = CATALOGUES[locale] as Readonly<Record<StringKey, string>>;
  return interpolate(table[key] ?? EN[key], params);
}
