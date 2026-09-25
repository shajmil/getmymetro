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
  ElementRef,
  TransferState,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import {
  StationDirectoryService,
  stationName,
  type StationEntry,
} from '../../core/data/station-directory';
import {
  destinationPath as chooseDestinationPath,
  pairForSlug,
  routePath,
  stationPath,
} from '../../core/data/slugs';
import { I18nService } from '../../core/i18n/i18n';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { PageTitleService } from '../../core/seo/page-title';
import { BOOKING_URL } from '../../shared/booking';
import { Alert } from '../../shared/controls';
import { JourneyRow } from '../../shared/journey-line';
import { JourneySummary } from '../../shared/journey-summary';
import { BoardPanel } from '../../shared/board-panel';
import { LineBand } from '../../shared/line-band';
import { boardView, type BoardView } from '../../shared/board-view';
import { asSeconds } from '../../core/data/seconds';
import { istSecondsOfDay } from '../../core/engine/civil-time';
import { formatClock } from '../../core/engine/clock';
import type { Stop, StopId } from '../../core/data/network.types';

/** Number of departures to show per platform for the origin board. */
const ROWS_PER_PLATFORM = 3;
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
  journeyStops,
  journeyView,
  routeReference,
  type JourneyStopRow,
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
  imports: [
    RouterLink,
    Alert,
    JourneyRow,
    JourneySummary,
    BoardPanel,
    LineBand,
    LineMap,
    Provenance,
    ServiceCaveat,
  ],
  templateUrl: './route.html',
  styleUrl: './route.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'closePicker()',
  },
})
export class RoutePage {
  readonly #engineService = inject(MetroEngineService);
  readonly #directory = inject(StationDirectoryService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #state = inject(TransferState);
  readonly #i18n = inject(I18nService);
  readonly #pageTitle = inject(PageTitleService);
  readonly #router = inject(Router);

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

  /**
   * Every stop on the way, with the time the **next** train calls there.
   *
   * DESIGN.md §6, screen 04. Walks the trip the engine already chose rather
   * than interpolating between the two ends: the times on this list have to be
   * one real train's times, and a plausible list belonging to no train is
   * exactly what the honesty rules exist to prevent.
   *
   * Empty until the engine lands, which is correct — these are clock-dependent
   * and therefore the half of the page that must not be prerendered. The
   * stations themselves are still in the document without it, through
   * {@link reference}'s `stopsBetween`, so a crawler reads the route's stop
   * list even though it reads no times.
   */
  readonly stops = computed<readonly JourneyStopRow[]>(() => {
    const outlook = this.#plan();
    const engine = this.#engineService.engine();
    if (outlook === null || engine === null) return [];
    const plan = outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    const option = plan.options[0];
    if (option === undefined) return [];
    return journeyStops(engine.network, plan, option, this.#i18n.locale());
  });

  /** The countdown split for the hero, exactly as `JourneySummary` splits it. */
  readonly #nextRow = computed(() => this.journey()?.rows[0] ?? null);

  readonly #originStop = computed<Stop | null>(() => {
    const engine = this.#engineService.engine();
    const origin = this.origin();
    if (engine === null || origin === null) return null;
    try {
      return engine.stop(origin.id);
    } catch {
      return null;
    }
  });

  readonly #outlook = computed(() => {
    const engine = this.#engineService.engine();
    const stop = this.#originStop();
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

  readonly journeyDirection = computed<number | null>(() => {
    const outlook = this.#plan();
    if (outlook === null) return null;
    const plan = outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
    return plan.direction;
  });

  readonly provenanceLine = computed<string>(() => {
    const clock = formatClock(asSeconds(istSecondsOfDay(this.#engineService.now())));
    return this.data() === 'failed'
      ? this.t('board.savedAt', { clock })
      : this.t('board.timetableAt', { clock });
  });

  readonly originHref = computed<string | null>(() => {
    const origin = this.origin();
    return origin === null ? null : this.localPath(stationPath(origin.name));
  });

  readonly opensAt = computed<string | null>(() => {
    const boards = this.boards();
    if (boards.length === 0) return null;
    const closed = boards.every((board) => board.rows.length > 0 && board.rows[0].nextDay);
    if (!closed) return null;
    const clocks = boards
      .map((board) => board.rows[0]?.clock)
      .filter((clock): clock is string => clock !== undefined);
    return clocks.length === 0 ? null : clocks[0];
  });

  readonly changePath = computed<string | null>(() => {
    const origin = this.origin();
    return origin === null ? null : this.localPath(chooseDestinationPath(origin.name));
  });

  readonly changeDestinationPath = computed<string | null>(() => {
    const origin = this.origin();
    return origin === null ? null : this.localPath(chooseDestinationPath(origin.name));
  });

  readonly countdownKicker = computed<string>(() => {
    const cd = this.countdownNumber();
    return cd === 'Arriving' || cd === 'ഇപ്പോൾ'
      ? this.t('route.nextMetroArriving')
      : this.t('route.nextMetroArrivesIn');
  });

  readonly activePicker = signal<'origin' | 'destination' | null>(null);
  readonly filterQuery = signal('');

  openPicker(mode: 'origin' | 'destination'): void {
    this.filterQuery.set('');
    this.activePicker.set(mode);
    requestAnimationFrame(() => {
      if (typeof document !== 'undefined') {
        const input = document.querySelector<HTMLInputElement>('.picker-dialog-input');
        input?.focus();
      }
    });
  }

  closePicker(): void {
    this.activePicker.set(null);
    this.filterQuery.set('');
  }

  clearFilter(): void {
    this.filterQuery.set('');
    if (typeof document !== 'undefined') {
      const input = document.querySelector<HTMLInputElement>('.picker-dialog-input');
      input?.focus();
    }
  }

  onFilterInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.filterQuery.set(input.value.trim().toLowerCase());
  }

  readonly filteredStations = computed(() => {
    const query = this.filterQuery();
    const list = this.stations();
    if (query === '') return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.ml?.toLowerCase().includes(query) ?? false),
    );
  });

  isCurrentStation(stationId: StopId, mode: 'origin' | 'destination'): boolean {
    if (mode === 'origin') {
      return this.origin()?.id === stationId;
    }
    return this.destination()?.id === stationId;
  }

  selectStation(station: StationEntry, mode: 'origin' | 'destination'): void {
    const curOrigin = this.origin();
    const curDest = this.destination();
    this.closePicker();

    if (mode === 'origin') {
      if (curDest === null) {
        this.#router.navigateByUrl(this.localPath(stationPath(station.name)));
        return;
      }
      if (station.id === curDest.id) {
        this.#router.navigateByUrl(this.localPath(stationPath(station.name)));
        return;
      }
      this.#router.navigateByUrl(this.localPath(routePath(station.name, curDest.name)));
    } else {
      if (curOrigin === null) {
        this.#router.navigateByUrl(this.localPath(stationPath(station.name)));
        return;
      }
      if (station.id === curOrigin.id) {
        this.#router.navigateByUrl(this.localPath(stationPath(station.name)));
        return;
      }
      this.#router.navigateByUrl(this.localPath(routePath(curOrigin.name, station.name)));
    }
  }

  swapRoute(): void {
    const curOrigin = this.origin();
    const curDest = this.destination();
    if (curOrigin !== null && curDest !== null) {
      this.#router.navigateByUrl(this.localPath(routePath(curDest.name, curOrigin.name)));
    }
  }

  label(station: StationEntry): string {
    return stationName(station, this.#i18n.locale());
  }

  readonly heroCountdown = computed<string | null>(() => this.#nextRow()?.countdown ?? null);

  readonly heroClock = computed<string>(() => {
    const clock = this.#nextRow()?.clock;
    return clock === undefined ? '' : clock.replace(/\s+(AM|PM)$/i, '');
  });

  readonly heroMeridiem = computed<string | null>(() => {
    const match = /\s+(AM|PM)$/i.exec(this.#nextRow()?.clock ?? '');
    return match === null ? null : match[1];
  });

  readonly heroArrivalClock = computed<string | null>(() => {
    const clock = this.#nextRow()?.arrivalClock;
    return clock === undefined ? null : clock.replace(/\s+(AM|PM)$/i, '');
  });

  readonly heroMeta = computed<string | null>(() => {
    const journey = this.journey();
    const row = this.#nextRow();
    if (journey === null || row === null) return null;
    return [
      this.t('journey.rideTime', { minutes: row.durationMinutes }),
      `${journey.hops} ${this.stopWord(journey.hops)}`,
      `₹${journey.fare}`,
    ].join(' · ');
  });

  readonly countdownNumber = computed<string>(() => {
    const text = this.#nextRow()?.countdown ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? text : text.slice(0, space);
  });

  readonly countdownUnit = computed<string | null>(() => {
    const text = this.#nextRow()?.countdown ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? null : text.slice(space + 1);
  });

  /** Which rail segment a stop row draws. */
  rowKind(index: number, total: number): 'first' | 'through' | 'last' | 'only' {
    if (total === 1) return 'only';
    if (index === 0) return 'first';
    return index === total - 1 ? 'last' : 'through';
  }

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

  readonly bookingUrl = BOOKING_URL;

  stopWord(hops: number): string {
    return this.#i18n.t(hops === 1 ? 'common.stop' : 'common.stops');
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
