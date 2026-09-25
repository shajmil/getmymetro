/**
 * `/from/:slug` — choose where you are going. DESIGN.md §6, screen 05.
 *
 * The one screen in the redesign that did not exist before. Until Phase C the
 * destination was chosen from a `<details>` picker buried at the bottom of the
 * home screen, which is three scrolls past the answer and invisible to anyone
 * who does not already know it is there.
 *
 * ## Why this is a route and not a modal
 *
 * Two reasons, and the second is the one that matters.
 *
 * A modal on the home screen cannot be linked to, cannot be backed out of with
 * the browser's own back button, and takes the reader's answer off the screen
 * while they decide. A route does all three correctly for free.
 *
 * More importantly, **the rows are links**. Every one of them points at a real
 * `/route/:pair` page — one of the 600 prerendered origin-destination pages
 * CLAUDE.md's search strategy rests on. So this screen is also 24 internal
 * links into the part of the site that ranks, from a page that names the
 * origin. A modal full of `(click)` handlers would have been 24 links thrown
 * away, which is exactly the mistake the map section had to be rescued from.
 *
 * The rows are therefore plain `<a routerLink>`. They work with JavaScript
 * off, they work when the engine has not loaded, and a middle-click opens the
 * route page in a new tab like any other link.
 *
 * ## Two sections, in travel order
 *
 * "Towards Tripunithura →" then "← Towards Aluva", each listing the stations
 * that platform serves in the order the train reaches them — not
 * alphabetically, and not in line order from Aluva. Somebody standing at
 * Pathadipalam thinking "Edapally, then Changampuzha Park, then…" is thinking
 * in travel order, and the list should agree with them.
 *
 * At a terminus one of the two sections has no stations and is not rendered.
 * `platformViews` has already dropped it.
 *
 * ## Nothing here moves with the clock
 *
 * Fares, hops and ride minutes are properties of the timetable, so this whole
 * screen renders from the facts slice in the document and needs no engine, no
 * ticker and no countdown. That is why it can be prerendered and why it is
 * instant on a phone: the reader taps "Where to?", the list is already there.
 */

import {
  ChangeDetectionStrategy,
  Component,
  TransferState,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { stationForSlug, stationPath } from '../../core/data/slugs';
import {
  StationDirectoryService,
  stationName,
} from '../../core/data/station-directory';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import { I18nService } from '../../core/i18n/i18n';
import { PageTitleService } from '../../core/seo/page-title';
import { JourneyRow } from '../../shared/journey-line';
import { SearchField } from '../../shared/controls';
import { PAGE_FACTS_KEY, stationFactsOf, type StationFacts } from '../../shared/page-facts';
import { platformViews, type PlatformView } from '../../shared/platform-view';
import { rideMinutesFrom } from '../../shared/schedule-view';

/** One destination, as the list renders it. */
export interface DestinationChoice {
  readonly id: string;
  readonly name: string;
  /** Where the row goes: one of the 600 prerendered route pages. */
  readonly path: string;
  readonly hops: number;
  /** Shortest observed ride. Null when the feed has no trip between the two. */
  readonly minutes: number | null;
}

/** One platform's worth of choices. */
export interface DestinationSection {
  readonly direction: number;
  readonly towardsName: string;
  readonly choices: readonly DestinationChoice[];
}

@Component({
  selector: 'app-destination',
  imports: [RouterLink, JourneyRow, SearchField],
  templateUrl: './destination.html',
  styleUrl: './destination.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationPage {
  readonly #directory = inject(StationDirectoryService);
  readonly #engineService = inject(MetroEngineService);
  readonly #state = inject(TransferState);
  readonly #i18n = inject(I18nService);
  readonly #pageTitle = inject(PageTitleService);

  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  /** The origin's slug, bound from the route by `withComponentInputBinding`. */
  readonly slug = input<string>('');

  /** Set when the reader arrived here from a chosen destination. Marks its row. */
  readonly selected = input<string | null>(null);

  readonly stations = this.#directory.stations;

  /** What the search box holds. Filters both sections, never reorders them. */
  readonly query = signal('');

  constructor() {
    effect(() => {
      const entry = this.entry();
      if (entry === null) return;
      this.#pageTitle.set(
        this.#i18n.t('meta.stationTitle', {
          name: stationName(entry, this.#i18n.locale()),
        }),
      );
    });
  }

  readonly entry = computed(() => stationForSlug(this.stations(), this.slug()));

  readonly originName = computed(() => {
    const entry = this.entry();
    return entry === null ? this.t('station.fallbackName') : stationName(entry, this.#i18n.locale());
  });

  readonly notFound = computed(() => this.stations().length > 0 && this.entry() === null);

  /** Back to the station this is a destination list for. */
  readonly backPath = computed(() => {
    const entry = this.entry();
    return entry === null ? this.localPath('/') : this.localPath(stationPath(entry.name));
  });

  /**
   * The reference facts, from the engine once it is here and from the
   * document's slice before that.
   *
   * Same pattern as the station page, and for the same reason: both produce
   * the identical view model, so the prerendered HTML, the browser's first
   * render and the hydrated page agree and nothing moves when the bundle
   * lands.
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
    return transferred !== undefined && transferred.index === entry.index ? transferred : null;
  });

  /**
   * Ride minutes to every station, indexed by `Stop.index`.
   *
   * Needs the engine, because the minutes are not in the facts slice — they
   * are a property of the trips, and the slice deliberately carries fares and
   * timings rather than the whole timetable. Before it arrives the rows show
   * the stop count alone, which is the half of the answer that is already in
   * the document.
   */
  readonly #rideMinutes = computed<readonly (number | null)[]>(() => {
    const engine = this.#engineService.engine();
    const entry = this.entry();
    if (engine === null || entry === null) return [];
    try {
      return rideMinutesFrom(engine.network, engine.stop(entry.id));
    } catch {
      return [];
    }
  });

  readonly #platforms = computed<readonly PlatformView[]>(() => {
    const facts = this.#facts();
    if (facts === null) return [];
    return platformViews(facts, this.stations(), this.#i18n.locale());
  });

  /**
   * The two sections, towards Tripunithura first.
   *
   * DESIGN.md §6 fixes that order and it is the same order as the departure
   * board's lanes read left to right, so a reader who has seen one recognises
   * the other. `direction_id = 0` is towards Tripunithura, derived from the
   * feed rather than assumed (CLAUDE.md finding 10).
   */
  readonly sections = computed<readonly DestinationSection[]>(() => {
    const minutes = this.#rideMinutes();
    const byIndex = new Map(this.stations().map((station) => [station.id, station.index]));

    return [...this.#platforms()]
      .sort((a, b) => a.direction - b.direction)
      .map((platform) => ({
        direction: platform.direction,
        towardsName: platform.towardsName,
        choices: platform.destinations.map((destination) => {
          const index = byIndex.get(destination.id);
          return {
            id: destination.id,
            name: destination.name,
            path: destination.path,
            hops: destination.hops,
            minutes: index === undefined ? null : (minutes[index] ?? null),
          };
        }),
      }));
  });

  /** The sections with the search applied. Empty sections drop out entirely. */
  readonly visibleSections = computed<readonly DestinationSection[]>(() => {
    const query = this.query();
    if (query === '') return this.sections();
    return this.sections()
      .map((section) => ({
        ...section,
        choices: section.choices.filter((choice) => this.#matches(choice.id, choice.name, query)),
      }))
      .filter((section) => section.choices.length > 0);
  });

  /** True when a search matched nothing at all. */
  readonly noMatches = computed(
    () => this.query() !== '' && this.visibleSections().length === 0,
  );

  onSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.query.set((target.value ?? '').trim().toLowerCase());
  }

  stopWord(hops: number): string {
    return this.t(hops === 1 ? 'common.stop' : 'common.stops');
  }

  /**
   * Which rail segment a row draws.
   *
   * The first row runs from its node down, the last from the top down to its
   * node, and everything between is full height — so the section reads as one
   * continuous line with a station threaded onto it at each stop.
   */
  rowKind(index: number, total: number): 'first' | 'through' | 'last' | 'only' {
    if (total === 1) return 'only';
    if (index === 0) return 'first';
    return index === total - 1 ? 'last' : 'through';
  }

  /** Matches the feed's English name and KMRL's Malayalam one, both. */
  #matches(id: string, displayName: string, query: string): boolean {
    const entry = this.stations().find((station) => station.id === id);
    const en = (entry?.name ?? '').toLowerCase();
    const ml = (entry?.ml ?? '').toLowerCase();
    return (
      en.includes(query) || ml.includes(query) || displayName.toLowerCase().includes(query)
    );
  }
}
