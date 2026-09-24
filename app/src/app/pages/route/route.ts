/**
 * `/route/:pair` — one journey, end to end.
 *
 * 600 ordered pairs, and neither incumbent has a page for any of them
 * (CLAUDE.md search strategy). The question this answers is the one a
 * passenger actually asks — "how do I get from here to there, when, and what
 * does it cost" — and on a single line with no branches it has exactly one
 * answer, which is why there is no routing algorithm behind it.
 *
 * Three refusals are the substance of this page.
 *
 * **Aluva to Aluva is refused.** The feed prices every self-pair at ₹10,
 * KMRL's minimum, and the licence forbids modifying the data — so the number
 * stays readable in the table and the UI blocks the journey instead
 * (finding 5). Selling somebody a ticket from a station to itself is not a
 * rounding error.
 *
 * **The fare is a lookup, never a calculation.** It happens to be an exact
 * function of how many stations apart the two stops are, so no test against
 * today's feed can catch someone replacing the table with arithmetic — which
 * is precisely why it must not be. KMRL revises fares without revising the
 * feed's version, and a formula would go on being confidently wrong where a
 * stale table just goes stale, which the feed-watch job catches.
 *
 * **A train that does not reach the destination is not an option.** The engine
 * filters on "calls at the destination *after* the origin", so a train
 * terminating at Muttom never appears on an Aluva-bound list. That filter is
 * also what makes the last *useful* train earlier than the last train off the
 * platform — by 52 minutes from MG Road towards Aluva — and that gap is the
 * single most expensive fact on this network to get wrong.
 *
 * **Phase 6 split the page along the clock.** The fare, the stations between,
 * and the first and last train per service pattern are properties of the
 * timetable, so they are computed on the server and are in the prerendered
 * HTML. The departures are properties of *now*, so they stay in the browser.
 * {@link RoutePage.reference} and {@link RoutePage.journey} are that line.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TransferState,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  StationDirectoryService,
  stationName,
} from '../../core/data/station-directory';
import { pairForSlug, routePath, stationPath } from '../../core/data/slugs';
import { I18nService } from '../../core/i18n/i18n';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { PageTitleService } from '../../core/seo/page-title';
import { Booking } from '../../shared/booking';
import {
  PAGE_FACTS_KEY,
  routeFactsOf,
  type RouteFacts,
} from '../../shared/page-facts';
import { Provenance } from '../../shared/provenance';
import { LineMap } from '../../shared/map/line-map';
import { caveatOf, ServiceCaveat, type CaveatView } from '../../shared/service-caveat';
import { startTicking } from '../../shared/ticker';
import {
  journeyView,
  routeReference,
  type RouteJourneyView,
  type RouteReference,
} from './route-view';

/** Departures offered. Three is "the next one, the one after, and one in hand". */
export const OPTIONS_SHOWN = 3;

type DataState = 'idle' | 'loading' | 'ready' | 'failed';

/** Why a pair produced no journey, when it did not. */
export type RouteProblem = 'unknown' | 'same-station';

@Component({
  selector: 'app-route',
  imports: [RouterLink, Booking, LineMap, Provenance, ServiceCaveat],
  templateUrl: './route.html',
  styleUrl: './route.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutePage {
  readonly #engineService = inject(MetroEngineService);
  readonly #directory = inject(StationDirectoryService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #state = inject(TransferState);
  readonly #i18n = inject(I18nService);
  readonly #pageTitle = inject(PageTitleService);

  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  /** The `:pair` route parameter — `aluva-to-edapally`. */
  readonly pair = input<string>('');

  readonly #data = signal<DataState>('idle');
  readonly data = this.#data.asReadonly();

  readonly stations = this.#directory.stations;

  constructor() {
    effect(() => {
      const reference = this.reference();
      if (reference === null) return;
      this.#pageTitle.set(
        this.#i18n.t('meta.routeTitle', {
          origin: reference.originName,
          destination: reference.destinationName,
          fare: reference.fare,
        }),
      );
    });

    afterNextRender(() => {
      this.#loadData();
      startTicking(this.#engineService, this.#destroyRef);
    });
  }

  /**
   * Both ends of the journey, from the directory rather than the engine.
   *
   * The directory travels in `TransferState`, so the heading and both refusal
   * branches are settled during bootstrap — before `network.json` is fetched,
   * and therefore in the document a crawler sees.
   */
  readonly ends = computed(() => pairForSlug(this.stations(), this.pair()));

  readonly origin = computed(() => this.ends()?.origin ?? null);
  readonly destination = computed(() => this.ends()?.destination ?? null);

  /** The two ends in the reader's language. The slug stays English. */
  readonly originName = computed(() => {
    const origin = this.origin();
    return origin === null ? '' : stationName(origin, this.#i18n.locale());
  });

  readonly destinationName = computed(() => {
    const destination = this.destination();
    return destination === null ? '' : stationName(destination, this.#i18n.locale());
  });

  /**
   * `null` when the pair is a journey, otherwise why it is not.
   *
   * Every ordered pair of *distinct* stations on this line is travelable —
   * direction is the sign of a subtraction, and every one of the 600 pairs is
   * served on both service patterns, verified against the feed. So the only
   * impossible pairs are a station to itself and a slug that names nothing.
   */
  readonly problem = computed<RouteProblem | null>(() => {
    if (this.stations().length === 0) return null;
    const ends = this.ends();
    if (ends === null) return 'unknown';
    if (ends.origin.id === ends.destination.id) return 'same-station';
    return null;
  });

  /**
   * The half of the page that is true at any hour.
   *
   * From the engine once it has loaded, and from the slice the server put in
   * the document before that. Both run `routeFactsOf` over the same feed, so
   * the prerendered HTML, the client's first render and the hydrated page are
   * identical and nothing moves when the bundle lands.
   */
  readonly #facts = computed<RouteFacts | null>(() => {
    const ends = this.ends();
    if (ends === null || ends.origin.id === ends.destination.id) return null;
    const engine = this.#engineService.engine();
    if (engine !== null) {
      try {
        return routeFactsOf(
          engine.network,
          engine.stop(ends.origin.id),
          engine.stop(ends.destination.id),
        );
      } catch {
        // A station id from a feed vintage this bundle no longer carries.
        return null;
      }
    }
    const transferred = this.#state.get(PAGE_FACTS_KEY, null)?.route;
    if (transferred === undefined) return null;
    // A client-side navigation leaves the served page's slice behind.
    return transferred.originIndex === ends.origin.index &&
      transferred.destinationIndex === ends.destination.index
      ? transferred
      : null;
  });

  readonly reference = computed<RouteReference | null>(() => {
    const facts = this.#facts();
    if (facts === null) return null;
    return routeReference(facts, this.stations(), this.#i18n.locale());
  });

  readonly #plan = computed(() => {
    const engine = this.#engineService.engine();
    const ends = this.ends();
    if (engine === null || ends === null) return null;
    if (ends.origin.id === ends.destination.id) return null;
    try {
      return engine.journey(
        ends.origin.id,
        ends.destination.id,
        this.#engineService.now(),
        OPTIONS_SHOWN,
      );
    } catch {
      // A station id from a feed vintage this bundle no longer carries. The
      // page still renders — with no invented times on it.
      return null;
    }
  });

  readonly journey = computed<RouteJourneyView | null>(() => {
    const outlook = this.#plan();
    if (outlook === null) return null;
    const plan = outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    return journeyView(plan, this.#engineService.now(), OPTIONS_SHOWN, this.#i18n.locale());
  });

  readonly caveat = computed<CaveatView | null>(() => caveatOf(this.#plan()));

  /** The reverse journey, which is what somebody wants next about half the time. */
  readonly reversePath = computed<string | null>(() => {
    const ends = this.ends();
    if (ends === null || ends.origin.id === ends.destination.id) return null;
    return this.localPath(routePath(ends.destination.name, ends.origin.name));
  });

  readonly originPath = computed<string | null>(() => {
    const origin = this.origin();
    return origin === null ? null : this.localPath(stationPath(origin.name));
  });

  readonly destinationPath = computed<string | null>(() => {
    const destination = this.destination();
    return destination === null ? null : this.localPath(stationPath(destination.name));
  });

  retryData(): void {
    this.#loadData();
  }

  #loadData(): void {
    if (this.#data() === 'loading') return;
    this.#data.set('loading');
    this.#engineService
      .load()
      .then(() => this.#data.set('ready'))
      .catch(() => this.#data.set('failed'));
  }
}
