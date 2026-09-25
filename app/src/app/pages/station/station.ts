/**
 * `/station/:slug` — everything about one station.
 *
 * The home screen answers "am I going to be OK?" for wherever you are standing.
 * This page answers the questions that have a fixed answer: when is the first
 * train, when is the last one, what does it cost to get anywhere, and which
 * platform do I want. Those are also the queries neither incumbent can serve —
 * keralam.co loses every pre-06:00 trip and so answers "6-something" where the
 * feed says 5:25 AM, and KMRL's own 25 station pages carry one identical title
 * between them (CLAUDE.md findings 7 and 8).
 *
 * Two things carry over from the home screen deliberately rather than being
 * rewritten.
 *
 * **The board and its warnings are the same code.** `shared/board-view.ts`
 * renders the short-turn label, the run nudge and the last-train panel here
 * exactly as it does there. The last-train wording is the most dangerous copy
 * in the product; two versions of it is how one goes stale.
 *
 * **The holiday caveat is the same component.** Same reason.
 *
 * What is new is the reference block, and it has the same trap in a worse
 * place. A station page is what somebody reads at 10pm to decide whether to
 * leave now, and at 20 of the 25 stations the final towards-Aluva departure
 * terminates at Muttom 51-53 minutes after the last train that actually
 * reaches Aluva. At MG Road that is 11:44 PM against 10:52 PM — and the 10:52
 * is earlier than the 10:58 that a naive reading calls second-to-last. So the
 * last-through train leads every line of this page that mentions a last train,
 * and the short-turn is reported as the later, shorter option it is.
 *
 * **Phase 6 put that block in the prerendered HTML**, where it was always
 * supposed to be. The facts are computed on the server from `network.json` and
 * carried in `TransferState`; {@link StationPage.platforms} reads them from
 * there until the engine arrives and then from the engine, and both produce
 * the identical view model — which is what keeps hydration clean and what
 * makes the fares and the first and last train visible to a crawler that runs
 * nothing.
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

import type { Stop } from '../../core/data/network.types';
import {
  StationDirectoryService,
  stationName,
} from '../../core/data/station-directory';
import { destinationPath, stationForSlug } from '../../core/data/slugs';
import { I18nService } from '../../core/i18n/i18n';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { PageTitleService } from '../../core/seo/page-title';
import { asSeconds } from '../../core/data/seconds';
import { istSecondsOfDay } from '../../core/engine/civil-time';
import { formatClock } from '../../core/engine/clock';
import { boardView, CLIFF_SECONDS, type BoardView } from '../../shared/board-view';
import { BoardPanel } from '../../shared/board-panel';
import { Booking, BOOKING_URL } from '../../shared/booking';
import { Alert } from '../../shared/controls';
import { LastTrainPanel } from '../../shared/last-train';
import type { TrackEnd } from '../../shared/line-track';
import { LineBand } from '../../shared/line-band';
import { scrollToElement } from '../../shared/motion';
import { JourneySkeleton } from '../../shared/skeleton';
import {
  PAGE_FACTS_KEY,
  stationFactsOf,
  type StationFacts,
} from '../../shared/page-facts';
import { Provenance } from '../../shared/provenance';
import { LineMap } from '../../shared/map/line-map';
import { caveatOf, ServiceCaveat, type CaveatView } from '../../shared/service-caveat';
import { startTicking } from '../../shared/ticker';
import { platformViews, type PlatformView } from '../../shared/platform-view';
import { journeyView, type RouteJourneyView } from '../route/route-view';
import { stationPath } from '../../core/data/slugs';

/**
 * Following departures shown per lane. DESIGN.md §6, screen 03.
 *
 * Four, against the home screen's one — five rows in all per direction. This
 * is the page somebody opens when the first answer was not enough, and the
 * rows past the next train are what turn "I missed it" into "the one after
 * that is at 6:18".
 */
export const FOLLOWING_PER_LANE = 4;

/**
 * Departures fetched per platform.
 *
 * One more than the board renders, because the last-train report needs the
 * departures behind the ones on screen to say anything about the gap before
 * the final one.
 */
export const ROWS_PER_PLATFORM = FOLLOWING_PER_LANE + 2;

type DataState = 'idle' | 'loading' | 'ready' | 'failed';

@Component({
  selector: 'app-station',
  imports: [
    RouterLink,
    Alert,
    BoardPanel,
    Booking,
    JourneySkeleton,
    LastTrainPanel,
    LineMap,
    LineBand,
    Provenance,
    ServiceCaveat,
  ],
  templateUrl: './station.html',
  styleUrl: './station.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationPage {
  readonly #engineService = inject(MetroEngineService);
  readonly #directory = inject(StationDirectoryService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #state = inject(TransferState);
  readonly #i18n = inject(I18nService);
  readonly #pageTitle = inject(PageTitleService);

  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  /** The `:slug` route parameter, bound by `withComponentInputBinding`. */
  readonly slug = input<string>('');

  readonly #data = signal<DataState>('idle');
  readonly data = this.#data.asReadonly();

  /** Every station, in line order. Present in the prerendered HTML. */
  readonly stations = this.#directory.stations;

  constructor() {
    // The tab title on a client-side navigation. The prerendered one comes
    // from build/pages.json and is left alone — see `core/seo/page-title.ts`.
    effect(() => {
      const entry = this.entry();
      if (entry === null) return;
      this.#pageTitle.set(
        this.#i18n.t('meta.stationTitle', {
          name: stationName(entry, this.#i18n.locale()),
        }),
      );
    });

    afterNextRender(() => {
      this.#loadData();
      startTicking(this.#engineService, this.#destroyRef);
    });
  }

  /**
   * The station the URL names, from the directory rather than the engine.
   *
   * The directory travels in `TransferState`, so the heading and the "not
   * found" branch are both settled during bootstrap — before `network.json`
   * has been fetched, and therefore in the document a crawler sees.
   */
  readonly entry = computed(() => stationForSlug(this.stations(), this.slug()));

  /** The heading, in the reader's language. The slug stays English. */
  readonly displayName = computed(() => {
    const entry = this.entry();
    return entry === null
      ? this.#i18n.t('station.fallbackName')
      : stationName(entry, this.#i18n.locale());
  });

  /** `null` until the bundle lands, or forever if the slug names nothing. */
  readonly stop = computed<Stop | null>(() => {
    const engine = this.#engineService.engine();
    const entry = this.entry();
    if (engine === null || entry === null) return null;
    try {
      return engine.stop(entry.id);
    } catch {
      return null;
    }
  });

  /** True once the directory has arrived and does not contain this slug. */
  readonly notFound = computed(() => this.stations().length > 0 && this.entry() === null);

  readonly #outlook = computed(() => {
    const engine = this.#engineService.engine();
    const stop = this.stop();
    if (engine === null || stop === null) return null;
    return engine.station(stop, this.#engineService.now(), ROWS_PER_PLATFORM);
  });

  readonly boards = computed<readonly BoardView[]>(() => {
    const outlook = this.#outlook();
    const engine = this.#engineService.engine();
    if (outlook === null || engine === null) return [];
    const departures =
      outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    return departures.boards.map((board) =>
      boardView(
        engine.network,
        board,
        this.#engineService.now(),
        ROWS_PER_PLATFORM,
        this.#i18n.locale(),
      ),
    );
  });

  readonly caveat = computed<CaveatView | null>(() => caveatOf(this.#outlook()));

  /**
   * Fares and reference timings. A pure function of the feed, so no clock.
   *
   * From the engine when it has loaded, and from the slice the server put in
   * the document before that. The two are the same computation over the same
   * data — `stationFactsOf` either way — so the prerendered HTML, the client's
   * first render and the hydrated page are identical, and nothing appears or
   * moves when the bundle lands.
   */
  readonly #facts = computed<StationFacts | null>(() => {
    const entry = this.entry();
    if (entry === null) return null;
    const engine = this.#engineService.engine();
    if (engine !== null) {
      try {
        return stationFactsOf(engine.network, engine.stop(entry.id));
      } catch {
        return null;
      }
    }
    const transferred = this.#state.get(PAGE_FACTS_KEY, null)?.station;
    // A client-side navigation leaves the served page's slice behind. The
    // index is what says whether it is still about this station.
    return transferred !== undefined && transferred.index === entry.index ? transferred : null;
  });

  readonly platforms = computed<readonly PlatformView[]>(() => {
    const facts = this.#facts();
    if (facts === null) return [];
    return platformViews(facts, this.stations(), this.#i18n.locale());
  });

  /** "Station 8 of 25" — orientation without a map. */
  readonly position = computed<string | null>(() => {
    const entry = this.entry();
    const count = this.stations().length;
    return entry === null
      ? null
      : this.#i18n.t('station.position', { index: entry.index + 1, count });
  });

  /** Read by the template, so the threshold is the board's and not a literal. */
  protected readonly CLIFF_MINUTES = CLIFF_SECONDS / 60;

  /** Read by the template. */
  protected readonly FOLLOWING_PER_LANE = FOLLOWING_PER_LANE;

  // ------------------------------------------------- the states of DESIGN.md §6

  /**
   * "No service tonight": every lane's next departure is tomorrow's.
   *
   * The same derivation as the home screen, and for the same reason — the
   * board searches forward across service days, so a next-day first row is
   * the only honest definition of the night having ended.
   */
  readonly closed = computed(() => {
    const boards = this.boards();
    if (boards.length === 0) return false;
    return boards.every((board) => board.rows.length > 0 && board.rows[0].nextDay);
  });

  readonly opensAt = computed<string | null>(() => {
    if (!this.closed()) return null;
    const clock = this.boards()[0]?.rows[0]?.clock;
    return clock ?? null;
  });

  /**
   * A terminus, so `LineTrack` draws one half of the track only.
   *
   * Read off which platform survived rather than off the station's index:
   * `stationFactsOf` drops the direction that cannot be boarded, so a feed
   * that extended the line would move the terminus and this would follow it
   * rather than pointing at whatever station happens to be index 0.
   */
  readonly trackEnd = computed<TrackEnd>(() => {
    const boards = this.boards();
    if (boards.length !== 1) return null;
    return boards[0].direction === 0 ? 'aluva' : 'tripunithura';
  });

  /** The terminal sentence, or null. Names the direction from the feed. */
  readonly terminal = computed<string | null>(() => {
    const platforms = this.platforms();
    if (platforms.length !== 1) return null;
    const entry = this.entry();
    if (entry === null) return null;
    return this.#i18n.t('screen.terminalBody', {
      name: stationName(entry, this.#i18n.locale()),
      end: this.#i18n.t(entry.index === 0 ? 'screen.first' : 'screen.last'),
      towards: platforms[0].towardsName,
    });
  });

  /** "Timetable · 6:16 PM", or "Saved …" when the data is a fallback. */
  readonly provenanceLine = computed<string>(() => {
    const clock = formatClock(asSeconds(istSecondsOfDay(this.#engineService.now())));
    return this.data() === 'failed'
      ? this.#i18n.t('board.savedAt', { clock })
      : this.#i18n.t('board.timetableAt', { clock });
  });

  /** The choose-destination screen for this station. */
  readonly destinationHref = computed<string | null>(() => {
    const entry = this.entry();
    return entry === null ? null : this.localPath(destinationPath(entry.name));
  });

  // ----------------------------------------------------------- destination
  readonly destinationId = signal<string | null>(null);

  readonly destinationStop = computed<Stop | null>(() => {
    const engine = this.#engineService.engine();
    const destId = this.destinationId();
    if (engine === null || destId === null) return null;
    try {
      return engine.stop(destId);
    } catch {
      return null;
    }
  });

  readonly destinationLabel = computed<string>(() => {
    const dest = this.destinationStop();
    return dest === null ? '' : dest.name[this.#i18n.locale()];
  });

  readonly #journeyOutlook = computed(() => {
    const engine = this.#engineService.engine();
    const origin = this.stop();
    const dest = this.destinationStop();
    if (engine === null || origin === null || dest === null) return null;
    if (origin.id === dest.id) return null;
    try {
      return engine.journey(origin.id, dest.id, this.#engineService.now(), 3);
    } catch {
      return null;
    }
  });

  readonly activeJourney = computed<RouteJourneyView | null>(() => {
    const outlook = this.#journeyOutlook();
    if (outlook === null) return null;
    const plan = outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    return journeyView(plan, this.#engineService.now(), 3, this.#i18n.locale());
  });

  readonly journeyDirection = computed<number | null>(() => {
    const outlook = this.#journeyOutlook();
    if (outlook === null) return null;
    const plan = outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    return plan.direction;
  });

  readonly userDepartureKey = computed<string | null>(() => {
    const journey = this.activeJourney();
    if (journey === null || journey.rows.length === 0) return null;
    return journey.rows[0].key;
  });

  readonly bookingUrl = BOOKING_URL;

  readonly pickerOpen = signal(false);
  readonly filterQuery = signal('');

  openDestinationPicker(): void {
    this.filterQuery.set('');
    this.pickerOpen.set(true);
  }

  togglePicker(open: boolean): void {
    this.pickerOpen.set(open);
  }

  onFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterQuery.set((target.value ?? '').trim().toLowerCase());
  }

  stationMatches(station: { readonly name: string; readonly ml?: string }): boolean {
    const query = this.filterQuery();
    if (!query) return true;
    const en = (station.name ?? '').toLowerCase();
    const ml = (station.ml ?? '').toLowerCase();
    return en.includes(query) || ml.includes(query);
  }

  label(station: { readonly name: string; readonly ml?: string }): string {
    return stationName(station, this.#i18n.locale());
  }

  chooseDestination(id: string | null): void {
    if (id === null || id === this.entry()?.id) {
      this.destinationId.set(null);
    } else {
      this.destinationId.set(id);
    }
    this.pickerOpen.set(false);
  }

  clearDestination(): void {
    this.destinationId.set(null);
  }

  onDestinationClick(event: MouseEvent, id: string): void {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      this.chooseDestination(id);
      if (typeof document !== 'undefined') {
        scrollToElement(document.getElementById('personal-journey-summary'), 'nearest');
      }
    }
  }

  stopWord(hops: number): string {
    return this.#i18n.t(hops === 1 ? 'common.stop' : 'common.stops');
  }

  stationUrl(stationName: string): string {
    return this.localPath(stationPath(stationName));
  }

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
