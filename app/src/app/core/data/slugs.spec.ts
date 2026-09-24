/**
 * Slugs, against the prerender manifest rather than against themselves.
 *
 * `build_pages.py` decides the URL of all 1,250 pages and this module decides
 * what the router matches. If the two rules drift, every prerendered page is a
 * 404 and nothing in either program notices — so the parity test reads the
 * sitemap the Python actually emitted and checks every URL resolves here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadNetwork } from '../engine/testing/network';
import {
  pairForSlug,
  routePath,
  slugify,
  stationForSlug,
  stationPath,
  type SluggableStation,
} from './slugs';

const network = loadNetwork();

const stations: readonly SluggableStation[] = network.stops.map((stop) => ({
  id: stop.id,
  name: stop.name.en,
}));

/** Vitest runs from `app/`; the manifest is emitted one level up. */
const SITEMAP = join(process.cwd(), '..', 'build', 'sitemap.xml');

describe('slugify', () => {
  it('reproduces the Python rule on the awkward names', () => {
    expect(slugify('M.G Road')).toBe('mg-road');
    expect(slugify('MG Road')).toBe('mg-road');
    expect(slugify('Maharajas College')).toBe('maharajas-college');
    expect(slugify("Maharaja's College")).toBe('maharajas-college');
    expect(slugify('Changampuzha Park')).toBe('changampuzha-park');
    expect(slugify('  Aluva  ')).toBe('aluva');
  });

  it('gives all 25 stations a distinct slug', () => {
    const slugs = new Set(stations.map((station) => slugify(station.name)));
    expect(slugs.size).toBe(25);
  });
});

describe('resolving a station slug', () => {
  it('round-trips every station through its own path', () => {
    for (const station of stations) {
      const path = stationPath(station.name);
      const resolved = stationForSlug(stations, path.replace('/station/', ''));
      expect(resolved?.id).toBe(station.id);
    }
  });

  it('accepts the spellings KMRL and passengers use that the feed does not', () => {
    // CLAUDE.md search strategy 7. Every one of these is published somewhere.
    expect(stationForSlug(stations, 'petta')?.id).toBe('PETT');
    expect(stationForSlug(stations, 'thaikoodam')?.id).toBe('THYK');
    expect(stationForSlug(stations, 'thrippunithura')?.id).toBe('TPHT');
    expect(stationForSlug(stations, 'edappally')?.id).toBe('EDAP');
    expect(stationForSlug(stations, 'm-g-road')?.id).toBe('MGRD');
  });

  it('refuses a name that is not a station rather than guessing at one', () => {
    expect(stationForSlug(stations, 'aluv')).toBeNull();
    expect(stationForSlug(stations, 'kochi')).toBeNull();
    expect(stationForSlug(stations, '')).toBeNull();
    expect(stationForSlug(stations, undefined)).toBeNull();
  });
});

describe('resolving a route pair', () => {
  it('splits a pair into its two ends', () => {
    const pair = pairForSlug(stations, 'aluva-to-edapally');
    expect(pair?.origin.id).toBe('ALVA');
    expect(pair?.destination.id).toBe('EDAP');
  });

  it('handles a multi-word station on either side', () => {
    const pair = pairForSlug(stations, 'changampuzha-park-to-sn-junction');
    expect(pair?.origin.id).toBe('CGPP');
    expect(pair?.destination.id).toBe('SNJN');
  });

  it('resolves a station to itself, leaving the refusal to the page', () => {
    // The feed prices self-pairs at ₹10 and the licence forbids editing it, so
    // the slug is legible and the UI is what says no.
    const pair = pairForSlug(stations, 'aluva-to-aluva');
    expect(pair?.origin.id).toBe('ALVA');
    expect(pair?.destination.id).toBe('ALVA');
  });

  it('refuses a pair that is not two stations', () => {
    expect(pairForSlug(stations, 'aluva-to-narnia')).toBeNull();
    expect(pairForSlug(stations, 'aluva')).toBeNull();
    expect(pairForSlug(stations, 'to')).toBeNull();
    expect(pairForSlug(stations, '')).toBeNull();
  });
});

describe('parity with the prerender manifest', () => {
  const found = existsSync(SITEMAP);

  it.skipIf(!found)('resolves every URL build_pages.py emitted', () => {
    const xml = readFileSync(SITEMAP, 'utf8');
    const paths = [...xml.matchAll(/<loc>[^<]*?(\/(?:station|route)\/[^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    // 1,250: 25 stations and 600 ordered pairs, in English and Malayalam.
    // Phase 6 gave the Malayalam URLs their own <loc> — before that only the
    // English half was listed, and the other 625 pages had no <loc> anywhere
    // in the sitemap. The `/ml` prefix is stripped by the capture group, so
    // both languages resolve through the same slug rules, which is the point.
    expect(paths.length).toBe(1250);

    for (const path of paths) {
      if (path.startsWith('/station/')) {
        expect(stationForSlug(stations, path.slice('/station/'.length))).not.toBeNull();
      } else {
        const pair = pairForSlug(stations, path.slice('/route/'.length));
        expect(pair).not.toBeNull();
        // And the manifest URL is the one this module would generate.
        expect(routePath(pair!.origin.name, pair!.destination.name)).toBe(path);
      }
    }
  });
});
