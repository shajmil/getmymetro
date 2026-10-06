/**
 * The JSON-LD that goes in every prerendered document.
 *
 * keralam.co ships a bare `WebSite` object and KMRL's own station pages ship
 * nothing that identifies a station at all (CLAUDE.md finding 8). Structured
 * data is the one on-page signal neither incumbent is using, and it is the
 * difference between a page that *contains* the first-train time and a page
 * that is *eligible to be shown* the first-train time in a result.
 *
 * Everything here is generated from the view models the page itself renders,
 * not from a parallel source. That matters more than it sounds: the most
 * dangerous thing this file could do is advertise the wrong last train. At 20
 * stations the final towards-Aluva departure terminates at Muttom 51-53
 * minutes after the last train that reaches Aluva, so a rich result naming the
 * 11:44 PM from MG Road would strand the reader inside a Google panel where
 * nothing on our side can correct it. The FAQ answers lead with
 * `lastThroughClock` for exactly the reason the page does.
 *
 * It is emitted from `app.config.server.ts` only, so none of it reaches the
 * browser bundle.
 */

import type { PlatformView } from '../../shared/platform-view';
import type { RouteReference } from '../../pages/route/route-view';
import { translate } from '../i18n/translate';
import { routeFaq, stationFaq } from './faq';
import type { AppLocale } from '../i18n/locale';

/** JSON-LD is untyped by nature; this is as much shape as is worth asserting. */
type Node = Record<string, unknown>;

/**
 * The product's name, as search results and link previews show it.
 *
 * A description, not a claim: "Kochi Metro" is KMRL's brand and the licence
 * forbids implying their endorsement (CLAUDE.md finding 1), so the name says
 * what the app holds — the timings — and every surface that carries it also
 * carries `shell.disclaimer`.
 */
export const SITE_NAME = 'Kochi Metro Timings';

/** KMRL's line, named once. */
const LINE_NAME = 'Kochi Metro';

function breadcrumbs(origin: string, trail: readonly { name: string; path: string }[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: `${origin}${step.path}`,
    })),
  };
}

function faq(entries: readonly { q: string; a: string }[]): Node {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

/**
 * `'12:01 AM'` → `'00:01:00'`.
 *
 * schema.org's `Time` is ISO 8601, and a `Schedule` carrying a 12-hour clock
 * face is a block Google quietly ignores. The page keeps the 12-hour face
 * because that is what KMRL prints on the platform; only the machine-readable
 * copy is converted. Past midnight is the case that matters: the last train
 * at 12:01 AM is 00:01, not 12:01.
 */
function isoTime(clock: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim());
  if (match === null) return clock;
  const meridiem = match[3].toUpperCase();
  let hour = Number(match[1]) % 12;
  if (meridiem === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}:00`;
}

/** Wrap a graph for embedding. One script tag per document. */
function graph(nodes: readonly Node[]): Node {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export interface StationSeo {
  readonly locale: AppLocale;
  readonly origin: string;
  /** The canonical URL of this page, language prefix included. */
  readonly url: string;
  readonly homePath: string;
  /** In the reader's language. */
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly platforms: readonly PlatformView[];
}

export function stationStructuredData(input: StationSeo): Node {
  const { locale, origin, url, name } = input;
  // The same entries the page renders visibly in <app-faq-list>. See faq.ts.
  const questions = stationFaq(locale, name, input.platforms);

  const station: Node = {
    '@type': 'TrainStation',
    '@id': `${url}#station`,
    name,
    url,
    publicAccess: true,
    geo: { '@type': 'GeoCoordinates', latitude: input.lat, longitude: input.lon },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kochi',
      addressRegion: 'Kerala',
      addressCountry: 'IN',
    },
    // `wheelchair_boarding` is 1 for all 25 stations, so it carries zero
    // signal and no accessibility claim is made from it (CLAUDE.md finding 9).
    containedInPlace: { '@type': 'Place', name: LINE_NAME },
  };

  /**
   * One `Schedule` per platform per service pattern.
   *
   * `byDay` comes from the feed's own calendar through the pattern's day
   * label's source, so a `WK` that stops including Saturday changes this on
   * its own. `endTime` is the last train that runs the whole line — the same
   * refusal to advertise a short-turn that the page makes.
   */
  const schedules: Node[] = input.platforms.flatMap((platform) =>
    platform.patterns.map((pattern) => ({
      '@type': 'Schedule',
      name: `${name} → ${platform.towardsName} (${pattern.dayLabel})`,
      startTime: isoTime(pattern.firstClock),
      endTime: isoTime(pattern.lastThroughClock ?? pattern.lastClock),
      repeatFrequency: 'P1D',
      scheduleTimezone: 'Asia/Kolkata',
    })),
  );

  return graph([
    station,
    ...schedules,
    faq(questions),
    breadcrumbs(origin, [
      { name: SITE_NAME, path: input.homePath },
      { name, path: url.slice(origin.length) },
    ]),
  ]);
}

export interface RouteSeo {
  readonly locale: AppLocale;
  readonly origin: string;
  readonly url: string;
  readonly homePath: string;
  readonly originStationPath: string;
  readonly reference: RouteReference;
}

export function routeStructuredData(input: RouteSeo): Node {
  const { locale, origin, url, reference } = input;
  const questions = routeFaq(locale, reference);

  const trip: Node = {
    '@type': 'TrainTrip',
    '@id': `${url}#trip`,
    url,
    provider: { '@type': 'Organization', name: 'Kochi Metro Rail Limited' },
    departureStation: { '@type': 'TrainStation', name: reference.originName },
    arrivalStation: { '@type': 'TrainStation', name: reference.destinationName },
    offers: {
      '@type': 'Offer',
      price: reference.fare,
      priceCurrency: 'INR',
      // The fare is a lookup in KMRL's published 625-pair table, never a
      // calculation. Nothing is sold here; this states KMRL's price.
      category: 'one-way fare',
    },
  };

  return graph([
    trip,
    faq(questions),
    breadcrumbs(origin, [
      { name: SITE_NAME, path: input.homePath },
      { name: reference.originName, path: input.originStationPath },
      { name: `${reference.originName} → ${reference.destinationName}`, path: url.slice(origin.length) },
    ]),
  ]);
}

/**
 * The home page graph: what the site is called, and what it is.
 *
 * `WebSite.name` is where Google takes the site name it prints above every
 * result, which is why the 1,250 content titles do not repeat the brand. It
 * only works from the home page, so it lives here and nowhere else.
 *
 * `WebApplication` carries the independence statement in machine-readable
 * form. A result card that reads as KMRL's own app is the endorsement the
 * licence forbids, and it is cheaper to say so in the markup than to argue it
 * after the fact.
 */
export function homeStructuredData(locale: AppLocale, origin: string, url: string): Node {
  return graph([
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: SITE_NAME,
      // No `alternateName: "Kochi Metro Live"`. The competitor claims "live"
      // in its markup and disclaims it in small grey text under the map
      // (CLAUDE.md finding 7). These times are scheduled and say so. Nor a
      // bare "Kochi Metro", which is KMRL's name, not ours.
      alternateName: ['Kochi Metro Timings app', 'കൊച്ചി മെട്രോ സമയം'],
      url,
      inLanguage: locale,
      about: { '@type': 'Place', name: LINE_NAME },
    },
    {
      '@type': 'WebApplication',
      '@id': `${origin}/#app`,
      name: SITE_NAME,
      url,
      description: `${translate(locale, 'meta.homeDescription')} ${translate(locale, 'shell.disclaimer')}`,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      inLanguage: ['en', 'ml'],
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'INR' },
      image: `${origin}/og.png`,
      isPartOf: { '@id': `${origin}/#website` },
    },
  ]);
}
