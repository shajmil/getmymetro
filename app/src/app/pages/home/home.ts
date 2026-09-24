/**
 * The home screen. Zero taps from open to answer.
 *
 * The product question is not "when is the next train?" — both competitors
 * answer that — it is "am I going to be OK?". So the order of this screen is
 * the order of that question: where you are, what leaves next, whether you
 * should run, and whether the train you can see is the last one that goes
 * where you are going.
 *
 * Four things here are load-bearing.
 *
 * **Location is never required.** The picker is in the document at all times,
 * one tap away, and every geolocation outcome — denied, dismissed, timed out,
 * no GPS, no API, a fix too coarse to be useful, a user in another city —
 * lands on a screen with a station on it and a way to change it. There is no
 * branch that ends in a spinner.
 *
 * **The last station is remembered.** A returning commuter gets an answer from
 * `localStorage` before the permission prompt has finished animating.
 * Geolocation still runs, and still wins if it disagrees.
 *
 * **One timer, not one per row.** The countdown is a single 1 Hz interval in
 * `shared/ticker.ts` that advances `MetroEngineService.now`; everything else is
 * a `computed` off that signal. It stops when the tab is hidden and when the
 * component is destroyed. The engine's index makes each recomputation a binary
 * search and a short walk, so this costs nothing measurable — the competitor
 * re-parses ~27,000 time strings a second to do the same job (CLAUDE.md
 * finding 7).
 *
 * **The holiday caveat cannot be forgotten.** `ServiceOutlook` carries the
 * payload as `provisional` when the date is unverified, so there is no way to
 * bind departure times to this template without having narrowed the union and
 * therefore written the branch that renders the caveat.
 *
 * Phase 5 moved three things out of this folder without changing them, because
 * the station page needs the same ones and the last-train wording is the copy
 * this product can least afford two versions of: the board's view model
 * (`shared/board-view.ts`), the board's markup (`shared/departure-board.ts`)
 * and the caveat itself (`shared/service-caveat.ts`).
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Stop, StopId } from '../../core/data/network.types';
import { stationPath } from '../../core/data/slugs';
import {
  StationDirectoryService,
  stationName,
} from '../../core/data/station-directory';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { localDistance } from '../../core/i18n/format';
import { I18nService } from '../../core/i18n/i18n';
import { PageTitleService } from '../../core/seo/page-title';
import {
  GeolocationService,
  type LocationFailure,
} from '../../core/location/geolocation';
import { classifyFix, type StationFix } from '../../core/location/nearest';
import { StationMemoryService } from '../../core/location/station-memory';
import { boardView, type BoardView } from '../../shared/board-view';
import { DepartureBoardCard } from '../../shared/departure-board';
import { LineMap } from '../../shared/map/line-map';
import { stationFactsOf } from '../../shared/page-facts';
import { platformViews, type PlatformView } from '../../shared/platform-view';
import { Provenance } from '../../shared/provenance';
import { caveatOf, ServiceCaveat, type CaveatView } from '../../shared/service-caveat';
import { startTicking } from '../../shared/ticker';

/** Departures shown per platform. The MVP asks for "the next two". */
export const ROWS_PER_PLATFORM = 2;

type DataState = 'idle' | 'loading' | 'ready' | 'failed';

export type LocationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'locating' }
  | { readonly kind: 'fix'; readonly fix: StationFix }
  | { readonly kind: 'failed'; readonly reason: LocationFailure };

/** Where the station on screen came from. Shown, because guessing silently is rude. */
export type StationSource = 'picked' | 'located' | 'remembered';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DepartureBoardCard, LineMap, ServiceCaveat, Provenance],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly #engineService = inject(MetroEngineService);
  readonly #directory = inject(StationDirectoryService);
  readonly #geolocation = inject(GeolocationService);
  readonly #memory = inject(StationMemoryService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #i18n = inject(I18nService);
  readonly #pageTitle = inject(PageTitleService);

  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  readonly #data = signal<DataState>('idle');
  readonly #location = signal<LocationState>({ kind: 'idle' });
  readonly #picked = signal<StopId | null>(null);
  readonly #remembered = signal<StopId | null>(null);

  /** Whether the station list is expanded. A `<details>`, so it works without JS. */
  readonly pickerOpen = signal(false);

  readonly data = this.#data.asReadonly();
  readonly location = this.#location.asReadonly();

  /** Every station, in line order. Present in the prerendered HTML. */
  readonly stations = this.#directory.stations;

  constructor() {
    // The tab title on a client-side navigation. The prerendered one is left
    // alone — see `core/seo/page-title.ts`.
    effect(() => this.#pageTitle.set(this.#i18n.t('meta.homeTitle')));

    // afterNextRender, not a constructor call or ngOnInit: all three of these
    // touch the browser, and running them during server rendering would either
    // throw or — worse — produce a first client render that does not match the
    // prerendered HTML and makes Angular throw the hydrated DOM away.
    afterNextRender(() => {
      this.#remembered.set(this.#memory.read());
      this.#loadData();
      this.#locate();
      this.#startTicking();
    });
  }

  // ------------------------------------------------------------- the answer

  /** The station being shown, once both a station id and the engine exist. */
  readonly stop = computed<Stop | null>(() => {
    const engine = this.#engineService.engine();
    if (engine === null) return null;
    const id = this.stationId();
    if (id === null) return null;
    try {
      return engine.stop(id);
    } catch {
      // A remembered id from a feed that has since retired the code. Forget it
      // rather than showing an error about a station nobody asked for.
      return null;
    }
  });

  /** Explicit choice beats a fix; a fix beats last time's station. */
  readonly stationId = computed<StopId | null>(() => {
    const picked = this.#picked();
    if (picked !== null) return picked;
    const location = this.#location();
    if (location.kind === 'fix') return location.fix.stop.id;
    return this.#remembered();
  });

  readonly source = computed<StationSource | null>(() => {
    if (this.#picked() !== null) return 'picked';
    if (this.#location().kind === 'fix') return 'located';
    return this.#remembered() === null ? null : 'remembered';
  });

  /** The fix behind the current station, when that is where it came from. */
  readonly fix = computed<StationFix | null>(() => {
    const location = this.#location();
    return location.kind === 'fix' && this.#picked() === null ? location.fix : null;
  });

  readonly #outlook = computed(() => {
    const engine = this.#engineService.engine();
    const stop = this.stop();
    if (engine === null || stop === null) return null;
    return engine.station(stop, this.#engineService.now(), ROWS_PER_PLATFORM);
  });

  /**
   * One view per platform, largest thing on the screen.
   *
   * The `unverified` branch is where `ServiceOutlook` earns its keep: reading
   * the departures at all requires naming that case, and {@link caveat} is
   * what that obliges the template to render.
   */
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

  /** `null` when the date is one the calendar vouches for, which today means a Sunday. */
  readonly caveat = computed<CaveatView | null>(() => caveatOf(this.#outlook()));

  /**
   * Every destination from here, with its fare and how many stops away it is.
   *
   * This is Phase 7's answer to "we have so many features but you cannot find
   * them". A→B journeys, fares and the 600 prerendered route pages were all
   * three taps away — home, station page, fare list — and a daily commuter was
   * never going to find them. They are now one tap, and the rows are the same
   * `platformViews` rows the station page renders, not a second implementation
   * of the fare list.
   *
   * Grouped by platform on purpose: that is also the plain-language answer to
   * "which side do I stand on" (MVP scope item 2).
   */
  readonly platforms = computed<readonly PlatformView[]>(() => {
    const engine = this.#engineService.engine();
    const stop = this.stop();
    if (engine === null || stop === null) return [];
    return platformViews(
      stationFactsOf(engine.network, stop),
      this.stations(),
      this.#i18n.locale(),
    );
  });

  /** "stop" or "stops". The feed counts hops; English counts differently at one. */
  stopWord(hops: number): string {
    return this.#i18n.t(hops === 1 ? 'common.stop' : 'common.stops');
  }

  // ---------------------------------------------------------------- chrome

  /** The station on screen, named in the reader's language. */
  readonly stationLabel = computed<string>(() => {
    const station = this.stop();
    return station === null ? '' : station.name[this.#i18n.locale()];
  });

  /** The full timetable page for the station on screen. Null until there is one. */
  readonly stationHref = computed<string | null>(() => {
    const station = this.stop();
    // Always slugged from the feed's English name, whatever language the page
    // is in: the URL is the same in both and only the `/ml` prefix changes.
    return station === null ? null : this.localPath(stationPath(station.name.en));
  });

  readonly distanceLabel = computed<string | null>(() => {
    const fix = this.fix();
    return fix === null ? null : localDistance(fix.distanceM, this.#i18n.locale());
  });

  /** A station's name for the picker, in the reader's language. */
  label(station: { readonly name: string; readonly ml?: string }): string {
    return stationName(station, this.#i18n.locale());
  }

  // --------------------------------------------------------------- actions

  choose(id: StopId): void {
    this.#picked.set(id);
    this.#memory.write(id);
    this.pickerOpen.set(false);
  }

  togglePicker(open: boolean): void {
    this.pickerOpen.set(open);
  }

  /** Offered after a recoverable failure. Asking again after a denial does nothing. */
  retryLocation(): void {
    this.#locate();
  }

  retryData(): void {
    this.#loadData();
  }

  // --------------------------------------------------------------- plumbing

  #loadData(): void {
    if (this.#data() === 'loading') return;
    this.#data.set('loading');
    this.#engineService
      .load()
      .then(() => this.#data.set('ready'))
      .catch(() => this.#data.set('failed'));
  }

  #locate(): void {
    if (!this.#geolocation.supported) {
      this.#location.set({ kind: 'failed', reason: 'unsupported' });
      return;
    }
    this.#location.set({ kind: 'locating' });
    void this.#geolocation.locate().then((outcome) => {
      if (outcome.kind === 'failed') {
        this.#location.set({ kind: 'failed', reason: outcome.reason });
        return;
      }
      // The engine may still be in flight. Wait for it rather than dropping
      // the fix: a slow bundle must not cost the user their zero-tap answer.
      void this.#engineService.load().then(
        (engine) => {
          const fix = classifyFix(engine, outcome.point, outcome.accuracyM);
          this.#location.set({ kind: 'fix', fix });
          if (this.#picked() === null) this.#memory.write(fix.stop.id);
        },
        () => {
          /* The data failure is already reported by #loadData. */
        },
      );
    });
  }

  #startTicking(): void {
    startTicking(this.#engineService, this.#destroyRef);
  }
}
