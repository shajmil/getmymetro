/**
 * The questions each page answers, in the reader's language.
 *
 * One builder, two consumers: `structured-data.ts` wraps the result in a
 * `FAQPage` node at prerender, and `shared/faq-list.ts` renders the same
 * entries as visible text on the page. Google's rule for FAQ markup is that
 * it matches what the reader can see; building both from one call is what
 * keeps that true without a test to remember.
 *
 * Google stopped showing FAQ rich results for ordinary sites in 2023, so the
 * markup earns nothing on its own. The visible text is the point: it is the
 * sentence a search for "last metro from Edapally" matches.
 *
 * Every answer is derived from the view models the page already renders —
 * never from hand-written copy — and the last-train answers lead with
 * `lastThroughClock`, for the reason `structured-data.ts` gives at length: at
 * 20 stations the final departure stops at Muttom and strands the reader.
 *
 * Deliberately absent: nearby landmarks, exits and connections. Those need
 * the fieldwork in `fieldwork/station_survey.csv`; an unverified "near Lulu
 * Mall" in an answer is exactly the confident wrong fact this app exists not
 * to publish.
 */

import type { PlatformView } from '../../shared/platform-view';
import type { RouteReference } from '../../pages/route/route-view';
import { translate } from '../i18n/translate';
import type { AppLocale } from '../i18n/locale';

export interface FaqEntry {
  readonly q: string;
  readonly a: string;
}

type Params = Record<string, string | number>;

export function stationFaq(
  locale: AppLocale,
  name: string,
  platforms: readonly PlatformView[],
): FaqEntry[] {
  const t = (key: Parameters<typeof translate>[1], params?: Params) =>
    translate(locale, key, params);

  const questions: FaqEntry[] = [];
  for (const platform of platforms) {
    const list = platform.patterns
      .map((pattern) => t('faq.item', { days: pattern.dayLabel, clock: pattern.firstClock }))
      .join(' ');
    questions.push({
      q: t('faq.stationFirstQ', { name, towards: platform.towardsName }),
      a: t('faq.stationFirstA', { name, towards: platform.towardsName, list }),
    });

    // Lead with the train that arrives.
    const answers = platform.patterns.map((pattern) =>
      pattern.lastShortTurn && pattern.lastThroughClock !== null
        ? t('faq.stationLastAThrough', {
            days: pattern.dayLabel,
            towards: platform.towardsName,
            name,
            through: pattern.lastThroughClock,
            last: pattern.lastClock,
            terminus: pattern.lastTerminusName,
          })
        : t('faq.stationLastAPlain', {
            days: pattern.dayLabel,
            towards: platform.towardsName,
            name,
            last: pattern.lastClock,
          }),
    );
    questions.push({
      q: t('faq.stationLastQ', { name, towards: platform.towardsName }),
      a: answers.join(' '),
    });
  }

  // Trains a day, per service pattern, summed over both platforms. Keyed by
  // service id rather than label so the feed's own calendar decides which days
  // a pattern covers — "Mon–Sat" is not "weekdays", and the label says so.
  const perPattern = new Map<string, { days: string; trains: number }>();
  for (const platform of platforms) {
    for (const pattern of platform.patterns) {
      const seen = perPattern.get(pattern.serviceId);
      perPattern.set(pattern.serviceId, {
        days: pattern.dayLabel,
        trains: (seen?.trains ?? 0) + pattern.trains,
      });
    }
  }
  if (perPattern.size > 0) {
    questions.push({
      q: t('faq.stationTrainsQ', { name }),
      a: [...perPattern.values()]
        .map((entry) => t('faq.stationTrainsA', { days: entry.days, count: entry.trains }))
        .join(' '),
    });
  }

  // The fare range is read off the same rows the fare list renders, so it is
  // KMRL's published table, never a formula (CLAUDE.md finding 5).
  const fares = platforms.flatMap((platform) => platform.destinations.map((row) => row.fare));
  if (fares.length > 0) {
    questions.push({
      q: t('faq.stationFareQ', { name }),
      a: t('faq.stationFareA', { name, min: Math.min(...fares), max: Math.max(...fares) }),
    });
  }

  return questions;
}

export function routeFaq(locale: AppLocale, reference: RouteReference): FaqEntry[] {
  const t = (key: Parameters<typeof translate>[1], params?: Params) =>
    translate(locale, key, params);
  const names = { origin: reference.originName, destination: reference.destinationName };

  const firstList = reference.patterns
    .map((pattern) => t('faq.item', { days: pattern.dayLabel, clock: pattern.firstClock }))
    .join(' ');

  const lastAnswers = reference.patterns.map((pattern) => {
    const base = t('faq.routeLastA', { ...names, days: pattern.dayLabel, clock: pattern.lastClock });
    if (pattern.strandMinutes <= 0) return base;
    return (
      base +
      t('faq.routeLastStrand', {
        ...names,
        minutes: pattern.strandMinutes,
        platformClock: pattern.lastFromPlatformClock,
      })
    );
  });

  const typical = reference.patterns.length === 0 ? 0 : reference.patterns[0].fastestMinutes;

  return [
    { q: t('faq.routeFirstQ', names), a: t('faq.routeFirstA', { ...names, list: firstList }) },
    { q: t('faq.routeLastQ', names), a: lastAnswers.join(' ') },
    {
      q: t('faq.fareQ', names),
      a: t('faq.fareA', { ...names, fare: reference.fare, hops: reference.hops, minutes: typical }),
    },
  ];
}
