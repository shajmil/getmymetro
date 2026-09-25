/**
 * URL slugs for stations and origin-destination pairs.
 *
 * The rule is `build_pages.py`'s `slugify`, reimplemented rather than imported
 * because the two runtimes cannot share code: lowercase, drop `.` and `'`,
 * collapse everything else to single hyphens, trim. `M.G Road` → `mg-road`.
 * The two are asserted equal in `slugs.spec.ts` against all 25 names, so a
 * drift between the prerender manifest and the router is a failing test rather
 * than a 404 in production.
 *
 * Slugs are derived from the feed's own station names, never from a table
 * written here. A hardcoded map would be the one thing in the app that a KMRL
 * rename could silently break.
 *
 * **Spelling variants.** KMRL's site and the feed disagree, and passengers
 * search all of them (CLAUDE.md, search strategy 7). An alias resolves to the
 * canonical station so the page answers instead of 404ing. The 301 that makes
 * the canonical URL the only indexed one is a hosting concern and belongs to
 * Phase 6; this is the half that keeps a typed or linked variant working.
 */

import type { StopId } from './network.types';

/** `'M.G Road'` → `'mg-road'`. Must match `build_pages.py:slugify` exactly. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Spellings that are not the feed's, mapped to the slug that is.
 *
 * Every one of these is a spelling KMRL itself publishes somewhere. They are
 * not guesses at typos — an open-ended fuzzy match would happily resolve a
 * wrong station, which is worse than a not-found page.
 */
export const STATION_SLUG_ALIASES: Readonly<Record<string, string>> = {
  petta: 'pettah',
  thaikoodam: 'thykoodam',
  thrippunithura: 'tripunithura',
  thripunithura: 'tripunithura',
  edappally: 'edapally',
  'm-g-road': 'mg-road',
};

/**
 * Anything with a name and an id — `StationEntry` or a decoded `Stop`.
 *
 * `name` is always the feed's **English** name, because that is what the slug
 * is built from and the slug is the same in both languages. `ml` is what a
 * Malayalam page displays; it never reaches a URL.
 */
export interface SluggableStation {
  readonly id: StopId;
  readonly name: string;
  readonly ml?: string;
}

/** The separator in `aluva-to-edapally`. No station slug contains it. */
const PAIR_SEPARATOR = '-to-';

/** Canonical path for a station page. */
export function stationPath(name: string): string {
  return `/station/${slugify(name)}`;
}

/** Canonical path for an origin-destination page. */
export function routePath(originName: string, destinationName: string): string {
  return `/route/${slugify(originName)}${PAIR_SEPARATOR}${slugify(destinationName)}`;
}

/**
 * The choose-destination screen for one origin. DESIGN.md §6, screen 05.
 *
 * Unlike the two above, this path is **not** in `build/pages.json` and is not
 * prerendered — see the note in `app.routes.ts`. It is still built here rather
 * than string-concatenated at the call site so that `slugify` is applied in
 * exactly one place and a station whose name grows a full stop cannot produce
 * a working station link and a broken destination one.
 */
export function destinationPath(name: string): string {
  return `/from/${slugify(name)}`;
}

function normalise(slug: string): string {
  const lowered = slugify(slug);
  return STATION_SLUG_ALIASES[lowered] ?? lowered;
}

/**
 * The station a slug names, or `null`.
 *
 * `null` rather than a throw: a bad slug is a URL somebody typed, not a
 * programming error, and the page it lands on has to be a real page with the
 * station list on it.
 */
export function stationForSlug<T extends SluggableStation>(
  stations: readonly T[],
  slug: string | null | undefined,
): T | null {
  if (slug == null || slug === '') return null;
  const wanted = normalise(slug);
  return stations.find((station) => slugify(station.name) === wanted) ?? null;
}

export interface StationPair<T> {
  readonly origin: T;
  readonly destination: T;
}

/**
 * `'aluva-to-edapally'` → both stations, or `null`.
 *
 * Every candidate split is tried rather than the first or the last, because a
 * future station named with a `-to-` in it would otherwise resolve to the
 * wrong pair silently. Two hyphens is a cheap price for that not being a
 * latent bug.
 */
export function pairForSlug<T extends SluggableStation>(
  stations: readonly T[],
  slug: string | null | undefined,
): StationPair<T> | null {
  if (slug == null || slug === '') return null;
  const lowered = slug.toLowerCase();
  for (let i = lowered.indexOf(PAIR_SEPARATOR); i !== -1; i = lowered.indexOf(PAIR_SEPARATOR, i + 1)) {
    const origin = stationForSlug(stations, lowered.slice(0, i));
    const destination = stationForSlug(stations, lowered.slice(i + PAIR_SEPARATOR.length));
    if (origin !== null && destination !== null) return { origin, destination };
  }
  return null;
}
