import {
  ApplicationConfig,
  TransferState,
  inject,
  mergeApplicationConfig,
  provideAppInitializer,
} from '@angular/core';
import { DOCUMENT, PlatformLocation } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appConfig } from './app.config';
import { pageMetaFor, serverRoutes } from './app.routes.server';
import {
  FEED_CONFIRMED_KEY,
  STATION_DIRECTORY_KEY,
  type StationEntry,
} from './core/data/station-directory';
import { pairForSlug, stationForSlug, stationPath } from './core/data/slugs';
import type { NetworkBundle, NetworkData } from './core/data/network.types';
import { decodeNetwork } from './core/data/network-codec';
import {
  PAGE_FACTS_KEY,
  routeFactsOf,
  stationFactsOf,
  type PageFacts,
} from './shared/page-facts';
import { platformViews } from './shared/platform-view';
import { routeReference } from './pages/route/route-view';
import { HTML_LANG, localeOfPath, pathForLocale, pathWithoutLocale } from './core/i18n/locale';
import { translate } from './core/i18n/translate';
import type { AppLocale } from './core/i18n/locale';
import { SITE_ORIGIN } from './core/seo/site';
import {
  homeStructuredData,
  routeStructuredData,
  stationStructuredData,
} from './core/seo/structured-data';

/**
 * Everything the prerender puts in the document that the browser cannot.
 *
 * Phase 5 left the hole this closes: the reference content — first train, last
 * train, fares, service patterns, the stations between two stops — is a pure
 * function of the feed with no clock input, and it was only reaching the
 * screen after the *browser* had fetched `network.json`. So the prerendered
 * HTML carried headings and a schematic, which undercuts the single decisive
 * advantage over both incumbents: content in the HTML source (CLAUDE.md search
 * strategy 1).
 *
 * The server can read the same bundle off disk. What it must not do is render
 * something the browser's first pass would not reproduce, so the facts travel
 * in `TransferState` and both sides render from them. See
 * `shared/page-facts.ts` for why that is a per-page slice and not the whole
 * 7.2 kB bundle.
 *
 * Read with `readFileSync`, never `import`. Same rule as `pages.json` in
 * `app.routes.server.ts`: there is exactly one sanctioned way for server code
 * to read a data file, and `network.json` follows it even though it is small
 * enough not to hurt.
 *
 * **Departure times are still not here and cannot be.** They are a function of
 * the reader's wall clock, and a time baked into a page cached at a CDN edge is
 * a wrong time for as long as that cache lives. The honesty rules forbid it.
 */
const CANDIDATE_PATHS = [
  join(process.cwd(), 'public', 'data', 'network.json'),
  join(process.cwd(), 'app', 'public', 'data', 'network.json'),
  join(process.cwd(), 'dist', 'getmymetro', 'browser', 'data', 'network.json'),
];

/** Decoded once per process, not once per prerendered document. */
let network: NetworkData | null | undefined;

function loadNetwork(): NetworkData | null {
  if (network !== undefined) return network;
  network = null;
  for (const path of CANDIDATE_PATHS) {
    if (!existsSync(path)) continue;
    try {
      network = decodeNetwork(JSON.parse(readFileSync(path, 'utf8')) as NetworkBundle);
      break;
    } catch {
      // A malformed bundle is a build problem that `check-bundle-size.mjs` and
      // the codec tests catch loudly. Failing the prerender here would only
      // hide it behind a stack trace, and the page still works: the browser
      // fetches the same file a moment later.
    }
  }
  return network;
}

/** The 25 stations, carrying Malayalam names only on a page that shows them. */
function directoryFor(data: NetworkData, locale: AppLocale): readonly StationEntry[] {
  return data.stops.map((stop) =>
    locale === 'ml'
      ? { id: stop.id, index: stop.index, name: stop.name.en, ml: stop.name.ml }
      : { id: stop.id, index: stop.index, name: stop.name.en },
  );
}

function setHead(
  document: Document,
  rel: string,
  attributes: Readonly<Record<string, string>>,
): void {
  const link = document.createElement('link');
  link.setAttribute('rel', rel);
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  document.head.appendChild(link);
}

function setJsonLd(document: Document, data: unknown): void {
  const script = document.createElement('script');
  script.setAttribute('type', 'application/ld+json');
  // `</script>` cannot appear inside a script element, and a station name
  // never contains one — but the JSON is built from feed data, so the escape
  // is cheap insurance against a feed that one day does.
  script.textContent = JSON.stringify(data).replace(/<\//g, '<\\/');
  document.head.appendChild(script);
}

/**
 * Title, description, canonical and `hreflang`, per document.
 *
 * KMRL's 25 station pages carry one identical title and one identical
 * description between them (CLAUDE.md finding 8) — they hold the domain
 * authority and discarded every on-page signal. The titles here come from
 * `build/pages.json`, which is generated from the feed, so all 1,250 differ
 * and all 1,250 say something true.
 */
function applyMeta(
  document: Document,
  title: Title,
  meta: Meta,
  path: string,
  locale: AppLocale,
): void {
  // The manifest covers the 1,250 station and route pages. The two home pages
  // are not in it — `build_pages.py` emits content pages only — so they get
  // their own title and description from the catalogue rather than inheriting
  // index.html's, which would make them a duplicate pair.
  const found = pageMetaFor(path);
  title.setTitle(found?.title ?? translate(locale, 'meta.homeTitle'));
  meta.updateTag({
    name: 'description',
    content: found?.description ?? translate(locale, 'meta.homeDescription'),
  });

  const canonical = pathWithoutLocale(path);
  setHead(document, 'canonical', { href: `${SITE_ORIGIN}${path}` });
  // Both languages plus x-default, on both versions of the page. Google's
  // rule is that every version lists every version including itself; the
  // sitemap `build_pages.py` writes declares the same pairs.
  for (const other of ['en', 'ml'] as const) {
    setHead(document, 'alternate', {
      hreflang: HTML_LANG[other],
      href: `${SITE_ORIGIN}${pathForLocale(path, other)}`,
    });
  }
  setHead(document, 'alternate', { hreflang: 'x-default', href: `${SITE_ORIGIN}${canonical}` });
  meta.updateTag({ property: 'og:locale', content: locale === 'ml' ? 'ml_IN' : 'en_IN' });
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideAppInitializer(() => {
      const document = inject(DOCUMENT);
      const state = inject(TransferState);
      const title = inject(Title);
      const meta = inject(Meta);

      const raw = inject(PlatformLocation).pathname;
      const path = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
      const locale = localeOfPath(path);
      const canonical = pathWithoutLocale(path);
      const url = `${SITE_ORIGIN}${path}`;
      const homePath = pathForLocale('/', locale);

      applyMeta(document, title, meta, path, locale);

      const data = loadNetwork();
      if (data === null) {
        // No bundle on disk: the document still renders, and the browser
        // fetches the same file a moment later. Nothing is invented.
        setJsonLd(document, homeStructuredData(locale, SITE_ORIGIN, url));
        return;
      }

      const stations = directoryFor(data, locale);
      state.set(STATION_DIRECTORY_KEY, stations);
      state.set(FEED_CONFIRMED_KEY, data.feed.confirmed);

      let facts: PageFacts | null = null;

      if (canonical.startsWith('/station/')) {
        const entry = stationForSlug(stations, canonical.slice('/station/'.length));
        const stop = entry === null ? null : data.stopsById.get(entry.id);
        if (stop !== undefined && stop !== null) {
          const station = stationFactsOf(data, stop);
          facts = { station };
          setJsonLd(
            document,
            stationStructuredData({
              locale,
              origin: SITE_ORIGIN,
              url,
              homePath,
              name: stop.name[locale],
              lat: stop.lat,
              lon: stop.lon,
              platforms: platformViews(station, stations, locale),
            }),
          );
        }
      } else if (canonical.startsWith('/route/')) {
        const ends = pairForSlug(stations, canonical.slice('/route/'.length));
        const origin = ends === null ? undefined : data.stopsById.get(ends.origin.id);
        const destination = ends === null ? undefined : data.stopsById.get(ends.destination.id);
        if (
          origin !== undefined &&
          destination !== undefined &&
          origin.index !== destination.index
        ) {
          const route = routeFactsOf(data, origin, destination);
          facts = { route };
          const reference = routeReference(route, stations, locale);
          if (reference !== null) {
            setJsonLd(
              document,
              routeStructuredData({
                locale,
                origin: SITE_ORIGIN,
                url,
                homePath,
                originStationPath: pathForLocale(stationPath(origin.name.en), locale),
                reference,
              }),
            );
          }
        }
      } else {
        setJsonLd(document, homeStructuredData(locale, SITE_ORIGIN, url));
      }

      state.set(PAGE_FACTS_KEY, facts);
    }),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
