/**
 * The line, as a map, with every train on it.
 *
 * ---------------------------------------------------------------------------
 * This reverses a decision, on purpose
 * ---------------------------------------------------------------------------
 *
 * CLAUDE.md weighed a map library against an SVG schematic and chose the
 * schematic. The brief overrides that: the map is what people asked for and
 * the map is what ships. `shared/schematic.ts` is not deleted — it becomes the
 * fallback, and it is a better fallback than a blank rectangle because it
 * needs no network at all. Offline, this component shows the whole line, every
 * station and the journey on it, which neither competitor manages.
 *
 * ---------------------------------------------------------------------------
 * Nothing here is live, and the UI says so above the fold of the map
 * ---------------------------------------------------------------------------
 *
 * There is no GTFS-RT feed for Kochi (CLAUDE.md finding 2). Every arrow on
 * this map is `core/engine/positions.ts` interpolating a published timetable
 * along the published alignment. The sentence saying so sits directly under
 * the heading, in body type — not in a footnote under the map, which is where
 * keralam.co puts its disclaimer while its title says "Live Map".
 *
 * ---------------------------------------------------------------------------
 * What it costs, and when
 * ---------------------------------------------------------------------------
 *
 * Leaflet is ~42 kB gzipped — larger than this app's entire initial bundle
 * budget would comfortably absorb — so it is never in the initial chunk:
 *
 *   * the library arrives through `await import('leaflet')`, which the builder
 *     emits as its own lazy chunk;
 *   * its stylesheet is a static file, `public/vendor/leaflet-1.9.4.css`,
 *     linked at the same moment (see that file's header for why it is not a
 *     component style);
 *   * neither is requested until the map frame is within 200 px of the
 *     viewport, so a reader who opens a route page for the fare and leaves
 *     never pays for either.
 *
 * Per tick the work is one `setLatLng` per running train — about 17 of them.
 * There is no timer here: the page already runs one (`shared/ticker.ts`) for
 * the countdowns and this rides it, so the whole screen advances together.
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
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { NetworkData, Stop, StopId } from '../../core/data/network.types';
import { stationPath, type SluggableStation } from '../../core/data/slugs';
import { MetroEngineService } from '../../core/engine/metro-engine.service';
import type { TrainPosition } from '../../core/engine/positions';
import { I18nService } from '../../core/i18n/i18n';
import { localised } from '../../core/i18n/locale';
import { Schematic } from '../schematic';

/** The Leaflet namespace, for types only. The runtime copy is imported lazily. */
type Leaflet = typeof import('leaflet');

/** Where the vendored stylesheet lives. Root-absolute: routes are nested. */
const LEAFLET_STYLESHEET = '/vendor/leaflet-1.9.4.css';

/**
 * CARTO's Positron and Dark Matter basemaps.
 *
 * OpenStreetMap's standard tiles, which need no key and no account.
 *
 * CARTO's Positron was the original choice and is quieter under a drawn line,
 * but `basemaps.cartocdn.com` now answers anonymous requests with an "API KEY
 * REQUIRED" watermark. Worse, it answers with HTTP 200 — so Leaflet fires
 * `tileload`, the map looks like it is working, and the reader gets a
 * watermarked grey rectangle. A basemap that needs an account is not a basemap
 * this app can ship; see `#watchTiles` for the guard that now catches it.
 *
 * Attribution to OpenStreetMap is required and is rendered below the map as
 * ordinary 16 px text rather than in Leaflet's 12 px control.
 */
const TILES_LIGHT = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_DARK = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SUBDOMAINS = '';
const TILE_MAX_ZOOM = 19;

/** Close enough to read station names. Below this the map hides them. */
const NAME_ZOOM = 14;

/** The view a station gets when the map opens on it. */
const FOCUS_ZOOM = 14;

/** How long to wait for a first tile before giving up and drawing the diagram. */
const TILE_TIMEOUT_MS = 6000;

/** Consecutive failures, with nothing yet loaded, that mean the tiles are gone. */
const TILE_FAILURES = 3;

type MapMode = 'map' | 'diagram';

/** `&` and `<` in a station name would be KMRL's, not ours. Escape regardless. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A navigation arrow, drawn rather than typed.
 *
 * `short` adds a bar across the nose: this is one of the 20 trips that stop
 * before the end of the line (CLAUDE.md finding 10), and the bar is what makes
 * that readable without relying on the colour, for a reader who cannot
 * distinguish it.
 */
function trainSvg(short: boolean): string {
  const bar = short ? '<rect x="4.5" y="0" width="15" height="3.5" rx="1.75"/>' : '';
  return (
    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
    '<path d="M12 3 L20.5 21 L12 16.8 L3.5 21 Z"/>' +
    bar +
    '</svg>'
  );
}

@Component({
  selector: 'app-line-map',
  imports: [RouterLink, Schematic],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    /* Fixed height, declared before anything loads, so the arrival of the map
       moves nothing on the page. CLS is a budget item, not a nicety. */
    .frame {
      block-size: 22rem;
      inline-size: 100%;
      margin-block-start: var(--gmm-space-3);
      overflow: hidden;
      border-radius: var(--gmm-radius-input);
      border: 1px solid var(--gmm-rule);
      background-color: var(--gmm-soft);
    }

    /* Both controls are full width and the box is tall enough for both,
       whether or not the second one is there yet.

       On the home screen the station arrives after the bundle does, and
       "Back to Cochin University" is too wide to sit beside "Whole line" at
       320px — so a row that wrapped when it appeared would push everything
       below it down by 64px, a second after the page settled. Reserving the
       height is the whole reason this is a grid and not a wrapping row. */
    .controls {
      display: grid;
      gap: var(--gmm-touch-gap);
      align-content: start;
      margin-block-start: var(--gmm-space-3);
      min-block-size: calc(2 * var(--gmm-touch) + var(--gmm-touch-gap));
    }

    .controls button {
      inline-size: 100%;
    }

    /* ---------------------------------------------------------------------
       The section's chrome. Rewritten in Phase D.
       ---------------------------------------------------------------------
       This and booking.ts were the two components Phases B and C never
       reached, so until now the map section carried the outgoing palette's
       Tailwind utilities, a 20px card radius, dark-mode variants and a
       hardcoded English "25 Stations" that rendered untranslated on all 626
       Malayalam pages. Everything below is the same vocabulary the rest of the
       app uses: a soft ground, a hairline, the label treatment, one measure.
       --------------------------------------------------------------------- */

    .section {
      margin-block-start: var(--gmm-space-6);
      padding: var(--gmm-space-5);
      border-radius: var(--gmm-radius-panel);
      background-color: var(--gmm-soft);
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      flex-wrap: wrap;
      padding-block-end: var(--gmm-space-3);
      border-block-end: 1px solid var(--gmm-rule);
    }

    .heading {
      margin: 0;
      font-size: var(--text-arrival);
      font-weight: 600;
      line-height: 1.25;
      color: var(--gmm-ink);
    }

    .count {
      font-size: var(--text-min);
      font-weight: 600;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
      color: var(--gmm-ink-2);
    }

    :host-context([lang='ml']) .count {
      text-transform: none;
      letter-spacing: normal;
    }

    /* The honesty line. Ink and semi-bold, directly under the heading and
       above the map — not a footnote under it. The whole product position is
       that these positions are scheduled and the app says so where the reader
       is looking, which is the claim itself. */
    .scheduled {
      margin: var(--gmm-space-3) 0 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.5;
      color: var(--gmm-ink);
    }

    .unavailable {
      margin: var(--gmm-space-3) 0 0;
      padding: var(--gmm-space-3);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-amber-soft);
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink);
    }

    .diagram-slot {
      margin-block-start: var(--gmm-space-3);
    }

    .meta {
      margin: var(--gmm-space-3) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    /* A licence condition, not a credit line: CARTO and OpenStreetMap both
       require it and it is rendered as real 16px text, never as fine print. */
    .credit {
      margin: var(--gmm-space-2) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    .credit a {
      color: var(--gmm-line-text);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .credit a:hover {
      color: var(--gmm-line-dark);
    }

    /* The always-prerendered index of all 25 stations. Search strategy 2 rests
       on these anchors, so they are in the HTML at every width and behind a
       details that opens with JavaScript off. */
    .index {
      margin-block-start: var(--gmm-space-4);
      border-block-start: 1px solid var(--gmm-rule);
    }

    .index-summary {
      display: flex;
      align-items: center;
      min-block-size: var(--gmm-touch-primary);
      font-size: var(--text-min);
      font-weight: 600;
      color: var(--gmm-ink);
      cursor: pointer;
      list-style: none;
    }

    .index-summary::-webkit-details-marker {
      display: none;
    }

    .index-body {
      margin: 0 0 var(--gmm-space-2);
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    .index-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .index-link {
      display: flex;
      align-items: center;
      min-block-size: var(--gmm-touch);
      border-block-start: 1px solid var(--gmm-rule);
      color: var(--gmm-ink);
      font-size: var(--text-min);
      text-decoration: none;
    }

    .index-link:hover {
      color: var(--gmm-line-text);
    }

    @media (min-width: 1024px) {
      /* Two columns of station links: 25 rows down a 1280px page is a long
         scroll of mostly empty line. */
      .index-list {
        columns: 2;
        column-gap: var(--gmm-space-6);
      }

      .index-link {
        break-inside: avoid;
      }
    }
  `,
  template: `
    <section class="section" [attr.aria-label]="t('map.heading')">
      <div class="head">
        <h2 class="heading">{{ t('map.heading') }}</h2>
        <span class="count tabular">{{
          t('screen.stationsCount', { count: stations().length })
        }}</span>
      </div>

      <!--
        The honesty line, and it is deliberately the second thing in the
        section rather than a note under the map. CLAUDE.md's honesty rules
        forbid labelling an interpolated position as live, and the place that
        claim has to be made is where the reader is looking.
      -->
      <p class="scheduled">{{ t('map.scheduled') }}</p>

      @if (mode() === 'diagram') {
        <p class="unavailable">{{ t('map.unavailable') }}</p>
        <div class="diagram-slot">
          <app-schematic
            [stations]="stations()"
            [selected]="selected()"
            [from]="from()"
            [to]="to()"
          />
        </div>
      } @else {
        <!--
          aria-hidden, and Leaflet's own keyboard handling is off. Everything
          the map shows is also in the text above and the index below, so a
          keyboard or screen-reader user loses nothing by not entering it.
        -->
        <div #frame class="frame" aria-hidden="true"></div>

        <div class="controls">
          <button type="button" class="btn-secondary" (click)="showWholeLine()">
            {{ t('map.wholeLine') }}
          </button>
          @if (focusName(); as name) {
            <button type="button" class="btn-secondary" (click)="showFocus()">
              {{ t('map.backTo', { station: name }) }}
            </button>
          }
        </div>

        <p class="meta">{{ runningLabel() }}</p>
        <p class="meta">{{ t('map.legend') }}</p>

        <!--
          A licence condition, not a credit line. The tiles are OpenStreetMap's
          own, so OSM is the only party to credit - CARTO was dropped when its
          anonymous tiles started returning an "API KEY REQUIRED" watermark.
          Rendered as real 16px text, never in Leaflet's 12px control.
        -->
        <p class="credit">
          {{ t('map.creditLead') }}
          <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>
        </p>
      }

      <!--
        Every station, as plain links, in the prerendered HTML at every width.
        CLAUDE.md search strategy 2 rests on this cross-linking, and a
        details opens with JavaScript off.
      -->
      <details class="index">
        <summary class="index-summary">
          <span>{{ t('map.allStations', { count: stations().length }) }}</span>
        </summary>
        <p class="index-body">{{ t('map.allStationsBody') }}</p>
        <ul class="index-list">
          @for (station of index(); track station.id) {
            <li>
              <a class="index-link" [routerLink]="station.href">{{ station.name }}</a>
            </li>
          }
        </ul>
      </details>
    </section>
  `,
})
export class LineMap {
  readonly #engineService = inject(MetroEngineService);
  readonly #i18n = inject(I18nService);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  protected readonly t = this.#i18n.t;

  /** Every station in line order. Used for the fallback diagram and the pins. */
  readonly stations = input.required<readonly SluggableStation[]>();
  /** The station this screen is about. Drawn larger, and what "Back to" returns to. */
  readonly selected = input<StopId | null>(null);
  readonly from = input<StopId | null>(null);
  readonly to = input<StopId | null>(null);

  readonly mode = signal<MapMode>('map');

  protected readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  /** Everything below is browser-only state. `null` until the map is built. */
  #leaflet: Leaflet | null = null;
  #map: import('leaflet').Map | null = null;
  #tiles: import('leaflet').TileLayer | null = null;
  #lines: import('leaflet').Polyline[] = [];
  #pins = new Map<StopId, import('leaflet').Marker>();
  #trains = new Map<string, import('leaflet').Marker>();
  #bounds: import('leaflet').LatLngBounds | null = null;
  #dragged = false;
  #giveUp: ReturnType<typeof setTimeout> | undefined;

  /** True once there is a map to draw on. Gates every computation below. */
  readonly #live = signal(false);

  constructor() {
    afterNextRender(() => this.#observe());

    // Trains. Recomputed on the page's existing 1 Hz tick and applied
    // imperatively, because Leaflet owns this DOM and Angular must not try to.
    effect(() => {
      const positions = this.positions();
      if (this.#map === null) return;
      this.#drawTrains(positions);
    });

    // Re-centre when the screen's subject changes — a geolocation fix landing,
    // or the reader picking a different station. Not while they are exploring:
    // once they have dragged the map it is theirs.
    effect(() => {
      const id = this.selected();
      if (this.#map === null || this.#dragged || id === null) return;
      this.#focus(id);
    });

    this.#destroyRef.onDestroy(() => this.#teardown());
  }

  /**
   * Every train on the network, right now.
   *
   * Gated on `#live` so that server rendering — and a reader who never scrolls
   * to the map — never builds the position index for 450 trips.
   */
  readonly positions = computed<readonly TrainPosition[]>(() => {
    if (!this.#live()) return [];
    const engine = this.#engineService.engine();
    if (engine === null) return [];
    const outlook = engine.trains(this.#engineService.now());
    // Narrowed rather than read through `payloadIgnoringCertainty`: on a date
    // the calendar cannot vouch for these are the positions the day-of-week
    // timetable implies, and the page renders `<app-service-caveat>` saying so.
    return outlook.certainty === 'unverified' ? outlook.provisional : outlook.result;
  });

  /** Every station, named in the reader's language, linked by its English slug. */
  readonly index = computed<readonly { id: StopId; name: string; href: string }[]>(() => {
    const locale = this.#i18n.locale();
    return this.stations().map((station) => ({
      id: station.id,
      name: this.#label(station),
      href: localised(stationPath(station.name), locale),
    }));
  });

  readonly focusName = computed<string | null>(() => {
    const id = this.selected();
    if (id === null) return null;
    const station = this.stations().find((s) => s.id === id);
    return station === undefined ? null : this.#label(station);
  });

  readonly runningLabel = computed<string>(() => {
    const count = this.positions().length;
    if (!this.#live()) return this.#i18n.t('map.loading');
    if (count === 0) return this.#i18n.t('map.noneRunning');
    if (count === 1) return this.#i18n.t('map.runningOne');
    return this.#i18n.t('map.running', { count });
  });

  // ---------------------------------------------------------------- actions

  showWholeLine(): void {
    if (this.#map === null || this.#bounds === null) return;
    this.#dragged = true;
    this.#map.fitBounds(this.#bounds, { padding: [24, 24] });
  }

  showFocus(): void {
    const id = this.selected();
    if (id === null) return;
    this.#dragged = false;
    this.#focus(id);
  }

  // --------------------------------------------------------------- plumbing

  #label(station: SluggableStation): string {
    return this.#i18n.locale() === 'ml' ? (station.ml ?? station.name) : station.name;
  }

  /**
   * Load nothing until the frame is nearly on screen.
   *
   * On the home screen the map sits just under the answer and this fires at
   * once. On a route page it does not fire at all unless the reader scrolls,
   * which is the difference between 42 kB on every one of 1,250 pages and 42 kB
   * on the ones where a map is actually looked at.
   */
  #observe(): void {
    const frame = this.frame()?.nativeElement;
    if (frame === undefined) return;
    if (typeof IntersectionObserver === 'undefined') {
      void this.#build();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void this.#build();
      },
      { rootMargin: '200px' },
    );
    observer.observe(frame);
    this.#destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Add the stylesheet once per document, and wait for it before drawing. */
  async #styles(): Promise<void> {
    const existing = document.querySelector<HTMLLinkElement>('link[data-gm-leaflet]');
    if (existing !== null) {
      if (existing.dataset['gmLeafletReady'] === 'yes') return;
      await new Promise<void>((resolve) => existing.addEventListener('load', () => resolve()));
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_STYLESHEET;
    link.dataset['gmLeaflet'] = 'yes';
    const ready = new Promise<void>((resolve, reject) => {
      link.addEventListener('load', () => {
        link.dataset['gmLeafletReady'] = 'yes';
        resolve();
      });
      link.addEventListener('error', () => reject(new Error(LEAFLET_STYLESHEET)));
    });
    document.head.appendChild(link);
    await ready;
  }

  async #build(): Promise<void> {
    const frame = this.frame()?.nativeElement;
    if (frame === undefined || this.#map !== null) return;
    // A chunk or a stylesheet that neither loads nor errors — a captive portal
    // is the usual cause — would otherwise leave an empty grey box forever.
    this.#giveUp = setTimeout(() => {
      if (!this.#live()) this.#fallback();
    }, TILE_TIMEOUT_MS + TILE_TIMEOUT_MS);
    try {
      const [, module, engine] = await Promise.all([
        this.#styles(),
        import('leaflet'),
        this.#engineService.load(),
      ]);
      // Leaflet 1.9 ships no `module` entry, so the builder resolves its
      // CommonJS bundle and the namespace arrives under `default`. Either
      // shape is handled rather than guessed at.
      const bundle = module as unknown as { default?: Leaflet };
      this.#leaflet = bundle.default ?? (module as unknown as Leaflet);
      this.#draw(this.#leaflet, frame, engine.network);
    } catch {
      // A chunk that will not load, a stylesheet that 404s, a data bundle that
      // never arrived: all of them mean the same thing to the reader, and the
      // diagram works without any of them.
      this.#fallback();
    }
  }

  #draw(L: Leaflet, frame: HTMLElement, network: NetworkData): void {
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    const map = L.map(frame, {
      // Every one of Leaflet's animations is longer than this app's 150 ms
      // ceiling, so none of them run. On a mid-range Android a zoom that snaps
      // is also simply faster than one that tweens.
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: !reduced,
      // Off because the frame is aria-hidden; see the template.
      keyboard: false,
      zoomControl: false,
      attributionControl: false,
    });
    this.#map = map;

    this.#tiles = L.tileLayer(this.#dark() ? TILES_DARK : TILES_LIGHT, {
      subdomains: TILE_SUBDOMAINS,
      maxZoom: TILE_MAX_ZOOM,
      // Rendered as real text below the map instead — see the template.
      attribution: '',
    }).addTo(map);
    this.#watchTiles(this.#tiles);

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--gmm-line').trim() || '#00A3B4';
    const casing = styles.getPropertyValue('--gmm-bg').trim() || '#FFFFFF';

    // The alignment. A casing under the line is what keeps it legible over a
    // basemap that changes colour under it.
    const paths = network.shapes.map((shape) =>
      shape.points.map((point) => [point.lat, point.lon] as [number, number]),
    );
    for (const path of paths) {
      this.#lines.push(
        L.polyline(path, { color: casing, weight: 11, opacity: 1, interactive: false }).addTo(map),
      );
    }
    for (const path of paths) {
      this.#lines.push(
        L.polyline(path, { color: accent, weight: 5, opacity: 1, interactive: false }).addTo(map),
      );
    }

    this.#drawPins(L, map, network.stops);

    this.#bounds = L.latLngBounds(paths.flat().map(([lat, lon]) => L.latLng(lat, lon)));

    map.on('dragstart', () => {
      this.#dragged = true;
    });
    map.on('zoomstart', () => frame.classList.add('gm-map-zooming'));
    map.on('zoomend', () => {
      frame.classList.remove('gm-map-zooming');
      this.#applyZoomClass(map, frame);
    });

    const selected = this.selected();
    if (selected !== null && this.#pins.has(selected)) this.#focus(selected);
    else map.fitBounds(this.#bounds, { padding: [24, 24] });
    this.#applyZoomClass(map, frame);

    // An orientation change resizes the frame without Leaflet noticing.
    if (typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(frame);
      this.#destroyRef.onDestroy(() => resize.disconnect());
    }

    this.#watchTheme();
    this.#live.set(true);
    this.#drawTrains(this.positions());
  }

  #drawPins(L: Leaflet, map: import('leaflet').Map, stops: readonly Stop[]): void {
    const locale = this.#i18n.locale();
    const selected = this.selected();
    for (const stop of stops) {
      const name = locale === 'ml' ? stop.name.ml : stop.name.en;
      const current = stop.id === selected;
      const icon = L.divIcon({
        className: current ? 'gm-pin gm-pin-current' : 'gm-pin',
        html: `<span class="gm-pin-dot"></span><span class="gm-pin-name">${escapeHtml(name)}</span>`,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });
      const marker = L.marker([stop.lat, stop.lon], { icon, keyboard: false, title: name });
      // The slug is always built from the feed's English name; only the `/ml`
      // prefix changes between languages (`core/i18n/locale.ts`).
      const href = localised(stationPath(stop.name.en), locale);
      marker.on('click', () => void this.#router.navigateByUrl(href));
      marker.addTo(map);
      this.#pins.set(stop.id, marker);
    }
  }

  /**
   * Add, move and remove train markers.
   *
   * Markers are reused across ticks and only their position changes, so a
   * second costs about 17 `setLatLng` calls and 17 style writes — not 450
   * icons rebuilt, and not the ~27,000 string parses the competitor spends on
   * the same job (CLAUDE.md finding 7).
   */
  #drawTrains(positions: readonly TrainPosition[]): void {
    const L = this.#leaflet;
    const map = this.#map;
    if (L === null || map === null) return;

    const seen = new Set<string>();
    for (const train of positions) {
      seen.add(train.tripId);
      let marker = this.#trains.get(train.tripId);
      if (marker === undefined) {
        marker = L.marker([train.lat, train.lon], {
          icon: L.divIcon({
            className: train.shortTurn ? 'gm-train gm-train-short' : 'gm-train',
            html: trainSvg(train.shortTurn),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          // Not a link and not a target: the arrow carries no action, so it
          // must not swallow a tap meant for the station underneath it.
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        });
        marker.addTo(map);
        this.#trains.set(train.tripId, marker);
      } else {
        marker.setLatLng([train.lat, train.lon]);
      }
      const element = marker.getElement();
      const arrow = element?.firstElementChild;
      if (arrow instanceof SVGElement || arrow instanceof HTMLElement) {
        arrow.style.transform = `rotate(${train.bearing.toFixed(1)}deg)`;
      }
    }

    for (const [tripId, marker] of this.#trains) {
      if (seen.has(tripId)) continue;
      marker.remove();
      this.#trains.delete(tripId);
    }
  }

  #focus(id: StopId): void {
    const map = this.#map;
    const pin = this.#pins.get(id);
    if (map === null || pin === undefined) return;
    map.setView(pin.getLatLng(), FOCUS_ZOOM, { animate: false });
    const frame = this.frame()?.nativeElement;
    if (frame !== undefined) this.#applyZoomClass(map, frame);
  }

  #applyZoomClass(map: import('leaflet').Map, frame: HTMLElement): void {
    frame.classList.toggle('gm-map-wide', map.getZoom() < NAME_ZOOM);
  }

  /**
   * Decide when the basemap has failed.
   *
   * One tile timing out on a patchy connection is ordinary and must not throw
   * the map away. Three failures with nothing yet drawn, or six seconds of
   * silence, is the network being gone — which offline is the normal case, and
   * the diagram is the right answer to it.
   */
  #watchTiles(layer: import('leaflet').TileLayer): void {
    let loaded = 0;
    let failures = 0;
    layer.on('tileload', () => {
      loaded++;
    });
    layer.on('tileerror', () => {
      failures++;
      if (loaded === 0 && failures >= TILE_FAILURES) this.#fallback();
    });
    // A host that answers HTTP 200 with a "your key is missing" watermark fires
    // `tileload`, not `tileerror` - so counting failures alone cannot see it and
    // the reader gets a grey rectangle that the app believes is a map. Any tile
    // that loads but carries no image data is that case.
    layer.on('tileload', (event: { tile?: HTMLImageElement }) => {
      const tile = event.tile;
      if (tile !== undefined && tile.naturalWidth === 0) {
        failures++;
        if (failures >= TILE_FAILURES) this.#fallback();
      }
    });
    const timer = setTimeout(() => {
      if (loaded === 0) this.#fallback();
    }, TILE_TIMEOUT_MS);
    this.#destroyRef.onDestroy(() => clearTimeout(timer));
  }

  /** `[data-theme]` beats the OS, in both directions — the same rule as `styles.css`. */
  #dark(): boolean {
    const forced = document.documentElement.dataset['theme'];
    if (forced === 'dark') return true;
    if (forced === 'light') return false;
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  #watchTheme(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      this.#tiles?.setUrl(this.#dark() ? TILES_DARK : TILES_LIGHT);
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue('--gmm-line').trim() || '#00A3B4';
      const casing = styles.getPropertyValue('--gmm-bg').trim() || '#FFFFFF';
      this.#lines.forEach((line, i) =>
        line.setStyle({ color: i < this.#lines.length / 2 ? casing : accent }),
      );
    };
    query.addEventListener('change', onChange);
    this.#destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  /** Give up on tiles and hand over to the diagram, which needs no network. */
  #fallback(): void {
    if (this.mode() === 'diagram') return;
    this.#teardown();
    this.mode.set('diagram');
  }

  #teardown(): void {
    this.#map?.remove();
    this.#map = null;
    this.#tiles = null;
    this.#lines = [];
    this.#pins.clear();
    this.#trains.clear();
    this.#bounds = null;
    if (this.#giveUp !== undefined) clearTimeout(this.#giveUp);
    this.#giveUp = undefined;
    this.#live.set(false);
  }
}
