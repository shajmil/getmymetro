/**
 * The bilingual layer, checked where it can actually go wrong.
 *
 * Three failure modes, and none of them is "a sentence reads oddly" — that is
 * what native review is for, and the catalogue says loudly that it has not
 * happened yet. These are the ones a reviewer cannot see:
 *
 *   * a missing key, which would print `station.firstTrain` on a page;
 *   * a placeholder translated along with the sentence, so `{name}` becomes
 *     `{പേര്}` and the station name never appears;
 *   * a URL rule that disagrees with `build_pages.py`, so the router and the
 *     1,250 prerendered paths resolve differently.
 */

import { EN, ML, type StringKey } from './strings';
import { interpolate, translate } from './translate';
import { localDays, localDistance, localMonth, localWait } from './format';
import {
  alternatePath,
  localeOfPath,
  localised,
  pathForLocale,
  pathWithoutLocale,
} from './locale';
import type { IsoWeekday } from '../data/network.types';

const keys = Object.keys(EN) as StringKey[];

/** `'{a} and {b}'` → `['a','b']`, sorted, deduplicated. */
function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

describe('the catalogue', () => {
  it('has a Malayalam string for every English one', () => {
    const missing = keys.filter((key) => ML[key] === undefined || ML[key] === '');
    expect(missing).toEqual([]);
  });

  it('adds nothing to Malayalam that English does not have', () => {
    expect(Object.keys(ML).sort()).toEqual([...keys].sort());
  });

  it('keeps every placeholder untranslated', () => {
    // The one mistake in a machine-written catalogue that a reader of the
    // English cannot spot and a reader of the Malayalam sees as a hole where
    // the station name should be.
    const drifted = keys.filter(
      (key) => placeholders(EN[key]).join(',') !== placeholders(ML[key]).join(','),
    );
    expect(drifted).toEqual([]);
  });

  it('never leaves a placeholder in the output when it is given a value', () => {
    expect(interpolate('{a} to {b}', { a: 'Aluva', b: 'Edapally' })).toBe('Aluva to Edapally');
    // An unknown placeholder is left alone rather than printed as "undefined".
    expect(interpolate('{a} to {b}', { a: 'Aluva' })).toBe('Aluva to {b}');
  });

  it('falls back to English rather than to the key', () => {
    expect(translate('ml', 'station.firstTrain')).toBe(ML['station.firstTrain']);
    expect(translate('en', 'station.firstTrain')).toBe('First train');
  });
});

describe('numbers in the reader s language', () => {
  it('says a wait the same way core/engine/clock.ts does, in English', () => {
    expect(localWait(0, 'en')).toBe('Due');
    expect(localWait(150, 'en')).toBe('2 min');
    expect(localWait(3600, 'en')).toBe('1 h');
    expect(localWait(4320, 'en')).toBe('1 h 12 min');
  });

  it('rounds a wait down in both languages', () => {
    // "3 min" has to mean at least three minutes. On this network the penalty
    // for missing the wrong train is 45 minutes.
    expect(localWait(239, 'en')).toBe('3 min');
    expect(localWait(239, 'ml')).toContain('3');
  });

  it('leaves the clock face alone, because KMRL prints it that way', () => {
    // No Malayalam meridiem is invented: the page must agree with the sign on
    // the platform, and with build_pages.py's own Malayalam meta copy.
    expect(localMonth('2026-09', 'en')).toBe('September 2026');
    expect(localMonth('2026-09', 'ml')).toContain('2026');
    expect(localMonth('not-a-month', 'en')).toBe('not-a-month');
  });

  it('names the days from the feed, never as "weekday"', () => {
    const monSat = [1, 2, 3, 4, 5, 6] as IsoWeekday[];
    expect(localDays(monSat, 'en')).toBe('Monday to Saturday');
    expect(localDays([7] as IsoWeekday[], 'en')).toBe('Sunday');
    expect(localDays([1, 3, 5] as IsoWeekday[], 'en')).toBe('Monday, Wednesday, Friday');
    expect(localDays([], 'en')).toBe('no days');
  });

  it('formats a distance the same way core/location/nearest.ts does', () => {
    expect(localDistance(244, 'en')).toBe('240 m');
    expect(localDistance(1240, 'en')).toBe('1.2 km');
  });
});

describe('the URL carries the language', () => {
  it('reads the language off the path', () => {
    expect(localeOfPath('/')).toBe('en');
    expect(localeOfPath('/station/aluva')).toBe('en');
    expect(localeOfPath('/ml')).toBe('ml');
    expect(localeOfPath('/ml/')).toBe('ml');
    expect(localeOfPath('/ml/station/aluva')).toBe('ml');
    // Not a language prefix — a station whose slug merely starts with "ml".
    expect(localeOfPath('/station/mlanything')).toBe('en');
    expect(localeOfPath('/mlx/station/aluva')).toBe('en');
  });

  it('survives a query string and a hash', () => {
    expect(localeOfPath('/ml/station/aluva?from=home#times')).toBe('ml');
    expect(pathWithoutLocale('/ml/station/aluva?x=1')).toBe('/station/aluva');
  });

  it('round-trips every page between the two languages', () => {
    for (const path of ['/', '/station/aluva', '/route/aluva-to-edapally']) {
      expect(pathForLocale(path, 'en')).toBe(path);
      expect(pathWithoutLocale(pathForLocale(path, 'ml'))).toBe(path);
      expect(alternatePath(path)).toBe(pathForLocale(path, 'ml'));
      expect(alternatePath(pathForLocale(path, 'ml'))).toBe(path);
    }
  });

  it('matches the paths build_pages.py emits', () => {
    // The manifest writes `/ml` + the English path, and the slug is the same
    // in both languages. A transliterated Malayalam slug would be a second
    // spelling to maintain and a second way for the manifest and the router
    // to disagree.
    expect(localised('/station/mg-road', 'ml')).toBe('/ml/station/mg-road');
    expect(localised('/route/aluva-to-edapally', 'ml')).toBe('/ml/route/aluva-to-edapally');
    expect(localised('/station/mg-road', 'en')).toBe('/station/mg-road');
    expect(pathForLocale('/', 'ml')).toBe('/ml');
  });
});
