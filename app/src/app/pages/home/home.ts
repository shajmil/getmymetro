/**
 * The home screen. Zero taps from open to answer.
 *
 * The product question is not "when is the next train?" — both competitors
 * answer that — it is "am I going to be OK?". So the order of this screen is
 * the order of that question: where you are, which train, and both directions
 * at once.
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
 * ## Phase C: the composition changed, the answers did not
 *
 * The screen is now `JourneySummary` → book → `BoardPanel`, in that order and
 * with nothing between them, because golden rule 2 requires **both lanes' next
 * train inside the first viewport at 390x844** and the outgoing layout put
 * three cards and a metrics grid in the way.
 *
 * What the component gained is the five states of DESIGN.md §6, and every one
 * of them is *derived*, never a flag somebody remembers to set:
 *
 *   * **Loading** is the engine absent and the directory not yet in hand.
 *   * **No destination** is `destinationId() === null`, and it renders the
 *     dotted line because `JourneySummary` takes `variant="dotted"` — a shape
 *     difference, not a colour one.
 *   * **No service tonight** is the next departure being a *next-day* one,
 *     which `boardView` already computes and which is the only honest
 *     definition: the board looks days ahead, so "closed" means the soonest
 *     train it found is tomorrow's.
 *   * **Timetable unavailable** is `data() === 'failed'`.
 *   * **Terminal station** is a station with one platform, which
 *     `stationFactsOf` has already reduced for us.
 *
 * None of the five is a template flag or a component input the caller sets by
 * hand. That is the point: a state that has to be remembered is a state that
 * eventually is not.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Stop, StopId } from '../../core/data/network.types';
import { destinationPath, stationPath } from '../../core/data/slugs';
import {
  StationDirectoryService,
  stationName,
} from '../../core/data/station-directory';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { asSeconds } from '../../core/data/seconds';
import { istSecondsOfDay } from '../../core/engine/civil-time';
import { formatClock } from '../../core/engine/clock';
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
import { BoardPanel } from '../../shared/board-panel';
import { BOOKING_URL } from '../../shared/booking';
import { Alert } from '../../shared/controls';
import { JourneySummary } from '../../shared/journey-summary';
import { LastTrainPanel } from '../../shared/last-train';
import type { TrackEnd } from '../../shared/line-track';
import { LineMap } from '../../shared/map/line-map';
import { LineBand } from '../../shared/line-band';
import { scrollToElement } from '../../shared/motion';
import { stationFactsOf } from '../../shared/page-facts';
import { platformViews, type PlatformView } from '../../shared/platform-view';
import { Provenance } from '../../shared/provenance';
import { caveatOf, ServiceCaveat, type CaveatView } from '../../shared/service-caveat';
import { JourneySkeleton } from '../../shared/skeleton';
import { startTicking } from '../../shared/ticker';
import { journeyView, type RouteJourneyView } from '../route/route-view';

/**
 * Departures fetched per platform.
 *
 * The board shows one following train per lane on this screen (DESIGN.md
 * §5.4), so two rows are what it renders — but three are asked for, because
 * the last-train report needs the trains behind the next one to say anything
 * about the gap before the final departure.
 */
export const ROWS_PER_PLATFORM = 3;

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
  imports: [
    RouterLink,
    Alert,
    BoardPanel,
    JourneySkeleton,
    JourneySummary,
    LastTrainPanel,
    LineBand,
    LineMap,
    Provenance,
    ServiceCaveat,
  ],
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

  // -------------------------------------------------- the five states (§6)

  /**
   * The skeleton, in the exact final layout.
   *
   * Only before there is anything at all to show. Once a station is on screen
   * the rest fills in around it; replacing a rendered answer with grey blocks
   * because one more thing is loading would be a worse experience than the
   * wait it is covering.
   */
  readonly showSkeleton = computed(
    () => this.stop() === null && this.data() !== 'failed' && this.stations().length === 0,
  );

  /**
   * "No service tonight". DESIGN.md §6.
   *
   * Derived, and derived from the only definition that is honest: the board
   * searches forward across service days, so if the soonest departure it found
   * is a *next-day* one then nothing more runs tonight. `boardView` computes
   * `nextDay` against both the wait and the civil date, so the 12:01 AM train
   * — tonight's train on tomorrow's date — is correctly not counted as
   * tomorrow's (CLAUDE.md's `NEXT_DAY_SECONDS` reasoning).
   *
   * Requires *every* lane to be closed. One platform still running is not a
   * closed station, and at a terminus there is only one lane anyway.
   */
  readonly closed = computed(() => {
    const boards = this.boards();
    if (boards.length === 0) return false;
    return boards.every((board) => board.rows.length > 0 && board.rows[0].nextDay);
  });

  /** The first train tomorrow, once the night has closed in. */
  readonly opensAt = computed<string | null>(() => {
    if (!this.closed()) return null;
    const clocks = this.boards()
      .map((board) => board.rows[0]?.clock)
      .filter((clock): clock is string => clock !== undefined);
    return clocks.length === 0 ? null : clocks[0];
  });

  /**
   * Which direction has gone for the night, said in words.
   *
   * Names the terminus when only one lane is relevant, and says "the last
   * trains" when both are. Never a bare "closed": a reader standing at
   * Pathadipalam at 11:50 PM needs to know whether it is *their* train that
   * has gone.
   */
  readonly closedBody = computed<string>(() => {
    const boards = this.boards();
    const direction = this.journeyDirection();
    if (direction !== null) {
      const lane = boards.find((board) => board.direction === direction);
      if (lane !== undefined) return this.t('screen.lastGone', { name: lane.towardsName });
    }
    return this.t('screen.lastGoneBoth');
  });

  /**
   * Set at a terminus, so `LineTrack` draws one half of the track only.
   *
   * A terminus has one platform because `stationFactsOf` drops the direction
   * that cannot be boarded, so the end is read off which lane survived rather
   * than off the station's index — a feed that extended the line would move
   * the terminus and this would follow it.
   */
  readonly trackEnd = computed<TrackEnd>(() => {
    const boards = this.boards();
    if (boards.length !== 1) return null;
    // The only platform runs towards Tripunithura, so this *is* Aluva.
    return boards[0].direction === 0 ? 'aluva' : 'tripunithura';
  });

  /** "Timetable · 6:16 PM", or "Saved …" when the data is a fallback. */
  readonly provenanceLine = computed<string>(() => {
    const now = this.#engineService.now();
    const clock = this.#clockOf(now);
    return this.data() === 'failed'
      ? this.t('board.savedAt', { clock })
      : this.t('board.timetableAt', { clock });
  });

  // -------------------------------------------------------------- the hero

  /** "You're here", and how confident we are of it. */
  readonly hereLabel = computed<string>(() => {
    switch (this.source()) {
      case 'located': {
        const fix = this.fix();
        const distance = this.distanceLabel() ?? '';
        if (fix === null) return this.t('journey.youreHere');
        switch (fix.kind) {
          case 'at':
            return this.t('home.fixAt', { distance });
          // A reader 23.8 km from Aluva was being told "Nearest station — 23.8
          // km away", which reads as a fact about a station they can use. It
          // is not one. `far` gets its own line saying the distance is the
          // problem, and {@link fixNote} follows it with what to do instead.
          case 'far':
            return this.t('home.fixOffNetwork', { distance });
          default:
            return this.t('home.fixNear', { distance });
        }
      }
      case 'remembered':
        return this.t('home.remembered');
      case 'picked':
        return this.t('home.picked');
      default:
        return this.t('journey.youreHere');
    }
  });

  /**
   * A fix that is too coarse or too far to state as fact.
   *
   * Kept out of {@link hereLabel} deliberately: those two cases need a whole
   * sentence saying *why* the station on screen may be the wrong one, and a
   * sentence does not belong in the 16px line under a 30px heading.
   */
  readonly fixNote = computed<string | null>(() => {
    const fix = this.fix();
    if (fix === null) return null;
    if (fix.kind === 'far') {
      return this.t('home.fixFar', {
        distance: this.distanceLabel() ?? '',
        station: this.stationLabel(),
      });
    }
    if (fix.kind === 'vague') return this.t('home.fixVague', { accuracy: fix.accuracyM });
    return null;
  });

  /** Dotted before a destination, muted once service has ended, solid otherwise. */
  readonly heroVariant = computed<'solid' | 'dotted' | 'muted'>(() => {
    if (this.closed()) return 'muted';
    return this.destinationStop() === null ? 'dotted' : 'solid';
  });

  readonly #heroRow = computed(() => {
    if (this.closed()) return null;
    const journey = this.activeJourney();
    return journey === null || journey.rows.length === 0 ? null : journey.rows[0];
  });

  readonly heroCountdown = computed<string | null>(() => this.#heroRow()?.countdown ?? null);

  /** The departure clock without its meridiem, which is set smaller beside it. */
  readonly heroClock = computed<string>(() => {
    const clock = this.#heroRow()?.clock;
    return clock === undefined ? '' : clock.replace(/\s+(AM|PM)$/i, '');
  });

  readonly heroMeridiem = computed<string | null>(() => {
    const match = /\s+(AM|PM)$/i.exec(this.#heroRow()?.clock ?? '');
    return match === null ? null : match[1];
  });

  readonly heroArrivalClock = computed<string | null>(() => {
    const clock = this.#heroRow()?.arrivalClock;
    return clock === undefined ? null : clock.replace(/\s+(AM|PM)$/i, '');
  });

  /** "3 min ride · 1 stop · ₹40" — every part of it from the feed. */
  readonly heroMeta = computed<string | null>(() => {
    const journey = this.activeJourney();
    const row = this.#heroRow();
    if (journey === null || row === null) return null;
    return [
      this.t('journey.rideTime', { minutes: row.durationMinutes }),
      `${journey.hops} ${this.stopWord(journey.hops)}`,
      `₹${journey.fare}`,
    ].join(' · ');
  });

  readonly journeyTowardsName = computed<string>(() => this.activeJourney()?.towardsName ?? '');

  /**
   * Every destination from here, with its fare and how many stops away it is.
   *
   * Grouped by platform on purpose: that is also the plain-language answer to
   * "which side do I stand on" (MVP scope item 2). Each row links a
   * prerendered `/route/:pair` page, which is what CLAUDE.md's search strategy
   * 2 — cross-linking — actually consists of.
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

  // ----------------------------------------------------------- destination
  readonly destinationId = signal<StopId | null>(null);

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

  /** The choose-destination screen for the station on screen. */
  readonly destinationPath = computed<string | null>(() => {
    const station = this.stop();
    return station === null ? null : this.localPath(destinationPath(station.name.en));
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

  readonly bookingUrl = BOOKING_URL;

  /**
   * The picker's `<details>`, so "Change" can actually reach it.
   *
   * Phase D shipped the button and the picker and nothing joining them: the
   * click set `pickerOpen` on a `<details>` several screens further down and
   * neither the viewport nor focus moved, so to a reader the control was dead.
   * A signal-based `viewChild` rather than an id lookup — the element is the
   * component's own and `document.getElementById` would find whichever copy a
   * test rendered last.
   */
  // `private readonly`, not `#private`: NG1053 forbids an ES private field here.
  private readonly pickerEl = viewChild<ElementRef<HTMLDetailsElement>>('pickerEl');

  /**
   * Open the picker, scroll to it and put the caret in its search box.
   *
   * All three, and none of them is optional. WCAG 3.2.1 asks that a control
   * which changes context move focus with it, and a reader on a phone who
   * never sees the thing that opened has been shown nothing at all. The scroll
   * honours `prefers-reduced-motion` because DESIGN.md §7 is "all instant",
   * not "slower" — and a smooth scroll across a long page is exactly the
   * motion that setting exists to stop.
   *
   * The focus target is the filter input rather than the summary: the reader
   * asked to change station, and typing two letters is the fastest way
   * through 25 of them. The summary is the fallback for the render where the
   * input does not exist.
   */
  openOriginPicker(): void {
    this.filterQuery.set('');
    this.pickerOpen.set(true);
    this.#revealPicker();
  }

  /**
   * Scroll and focus, after the `<details>` has actually opened.
   *
   * `pickerOpen` is a signal the template reads, so the input inside is not in
   * the DOM until Angular has rendered the change. A microtask is enough —
   * this is a click handler, so change detection has already been scheduled.
   */
  #revealPicker(): void {
    if (typeof document === 'undefined') return;
    const details = this.pickerEl()?.nativeElement;
    if (details === undefined) return;

    // Open the element directly. `open` is deliberately NOT bound in the
    // template: a <details> owns its own state and fires `toggle` after the
    // browser has changed it, so a two-way arrangement has the binding and the
    // element writing the same value at each other.
    details.open = true;

    // No scrolling. The picker is now a dropdown anchored under the button
    // that opens it, so it is already on screen — scrolling to it would move
    // the page for no reason. Focus alone tells a keyboard or screen-reader
    // user where they have arrived.
    requestAnimationFrame(() => {
      const input = details.querySelector<HTMLInputElement>('input.picker-input');
      (input ?? details.querySelector<HTMLElement>('summary'))?.focus();
    });
  }


  chooseDestination(id: StopId | null): void {
    if (id === null || id === this.stationId()) {
      this.destinationId.set(null);
    } else {
      this.destinationId.set(id);
    }
  }

  clearDestination(): void {
    this.destinationId.set(null);
  }

  /**
   * A fare row is a link to a route page *and* a way to set the destination.
   *
   * Plain click sets the destination in place, which is what a reader on the
   * home screen almost always wants; a modified click falls through to the
   * link, so the route page still opens in a new tab like any other anchor.
   * The `href` is real either way, which is the half that matters to a
   * crawler.
   */
  onDestinationClick(event: MouseEvent, id: StopId): void {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      this.chooseDestination(id);
      if (typeof document !== 'undefined') {
        scrollToElement(document.getElementById('main-content'), 'start');
      }
    }
  }

  onStationSelect(id: StopId): void {
    this.choose(id);
    if (this.destinationId() === id) this.destinationId.set(null);
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
    // Close the element itself. `open` is not bound (see the template), so
    // setting the signal alone would leave the picker standing open over the
    // answer the reader just asked for. `toggle` mirrors it back to the signal.
    const details = this.pickerEl()?.nativeElement;
    if (details !== undefined) details.open = false;
    else this.pickerOpen.set(false);
  }

  readonly filterQuery = signal('');

  onFilterInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterQuery.set((target.value ?? '').trim().toLowerCase());
  }

  clearFilter(): void {
    this.filterQuery.set('');
  }

  closePicker(): void {
    const details = this.pickerEl()?.nativeElement;
    if (details !== undefined) details.open = false;
    this.pickerOpen.set(false);
    this.filterQuery.set('');
  }

  onPickerClick(event: MouseEvent): void {
    const details = this.pickerEl()?.nativeElement;
    if (details && event.target === details) {
      this.closePicker();
    }
  }

  stationMatches(station: { readonly name: string; readonly ml?: string }): boolean {
    const query = this.filterQuery();
    if (!query) return true;
    const en = (station.name ?? '').toLowerCase();
    const ml = (station.ml ?? '').toLowerCase();
    return en.includes(query) || ml.includes(query);
  }

  /**
   * The element is the source of truth; this only mirrors it into a signal so
   * the Change button's `aria-expanded` stays honest. Never write `open` from
   * here — see the note on the <details> in the template.
   */
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

  /**
   * The wall clock, for the provenance line.
   *
   * `istSecondsOfDay` rather than `Date#getHours`, and `formatClock` rather
   * than any locale formatter: this is the same clock face the departure times
   * beside it are rendered with, and the two disagreeing by a minute on the
   * same panel is exactly the defect CLAUDE.md finding 8 catches KMRL's own
   * site in. It is a wall clock and not a service-day offset, so it can never
   * exceed 24:00 — but it goes through the same formatter anyway so that "12:05
   * AM" means the same thing in both places.
   */
  #clockOf(now: number): string {
    return formatClock(asSeconds(istSecondsOfDay(now)));
  }

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
