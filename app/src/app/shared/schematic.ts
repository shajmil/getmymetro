/**
 * The line, as a diagram. This is what replaces a map library.
 *
 * CLAUDE.md weighed MapLibre GL — ~200 KB gzipped, larger than Angular itself
 * — against drawing two polylines, 25 dots and a handful of markers, and
 * rejected it. What is drawn here is about 2 KB of component and no
 * dependency, and it is also the thing every metro in the world puts on a wall,
 * because a schematic answers "which direction, which train" and a geographic
 * map does not.
 *
 * **Vertical, one station per row, and deliberately not to scale.**
 *
 * Horizontal is the obvious layout and it cannot work at 320px: 25 labels
 * across 288 usable pixels is 11 px each. Rotating them costs ~60 px of height
 * and produces text the primary user of this app cannot read. So the line runs
 * down the page, each station gets a full row, and the label sits beside its
 * dot at ordinary body size. The page already scrolls vertically, so nothing
 * pans and nothing zooms — which is the actual requirement.
 *
 * The geometry in `network.json` — 264 simplified shape points and per-station
 * chainage, good to 4.99 m — is **not used here, on purpose.** Measured along
 * that chainage, station spacing runs from 470 m (Kaloor to Town Hall) to
 * 2,050 m (Muttom to Kalamassery), median 1,150 m. Drawing rows
 * to true chainage would put two labels 13 px apart at one end of the line and
 * leave a hand's width of blank track at the other, which is unreadable and
 * buys nothing: nobody navigates a single line by its curvature. Equal pitch
 * is both legible and honest, because it never claims to be a map. The shapes
 * stay in the bundle for the scheduled-position view, where they are the whole
 * point.
 *
 * Every dot is a 288 x 56 transparent hit area with 8 px between rows, so the
 * touch target is far over the 56 px floor even though the dot is 14 px. No
 * animation, no transition on anything but colour — the build has zero
 * `@keyframes` and keeps zero.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import type { StopId } from '../core/data/network.types';
import { stationPath, type SluggableStation } from '../core/data/slugs';
import { stationName } from '../core/data/station-directory';
import { I18nService } from '../core/i18n/i18n';
import { localised } from '../core/i18n/locale';

/** Row pitch. 56 px of target plus the required 8 px between targets. */
export const ROW_PITCH = 64;

/** Half the pitch, so the first and last rows have the same breathing room. */
const ROW_OFFSET = 32;

/** The viewBox is 288 wide: a 320 px viewport less two 16 px gutters. */
export const DIAGRAM_WIDTH = 288;

const LINE_X = 28;
const LABEL_X = 52;
const HIT_HEIGHT = 56;

export interface SchematicRow {
  readonly id: StopId;
  readonly name: string;
  readonly href: string;
  readonly y: number;
  /** Top of the transparent 56 px hit area. */
  readonly hitY: number;
  readonly selected: boolean;
  /** "From" / "To" when a journey is on screen, otherwise null. */
  readonly tag: string | null;
  /** True for the origin, the destination, and everything between them. */
  readonly onJourney: boolean;
  /** What a screen reader hears instead of a bare station name. */
  readonly label: string;
}

@Component({
  selector: 'app-schematic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* 1 user unit = 1 px at a 320 px viewport, and at most 1.11 px at the
       widest the single column ever gets. So an 18 px label is 18-20 px on
       screen and can never fall under the 16 px floor. Sizes come from the
       same tokens the rest of the app uses, in rem, so a reader who has
       raised their browser's base font size gets a larger diagram too. */
    .diagram {
      display: block;
      inline-size: 100%;
      max-inline-size: 20rem;
      block-size: auto;
      margin-inline: auto;
    }

    /* Migrated off the --gm-* aliases in Phase D, which deleted them.

       The mapping is not one-for-one, because the old palette had one "accent"
       and DESIGN.md §2 splits it in two: --gmm-line is the line as a *graphic*
       and is explicitly never text, --gmm-line-text is the text and the primary
       fill. The old stylesheet used the same value for the track, the dots and
       the "you are here" tag, which put a 3.04:1 colour on 16px type. */
    .track {
      fill: none;
      stroke: var(--gmm-grey);
      stroke-width: 6;
      stroke-linecap: round;
    }

    .journey {
      fill: none;
      stroke: var(--gmm-line);
      stroke-width: 10;
      stroke-linecap: round;
    }

    .dot {
      fill: var(--gmm-bg);
      stroke: var(--gmm-ink-3);
      stroke-width: 3;
    }

    .dot-journey {
      fill: var(--gmm-line);
      stroke: var(--gmm-line);
    }

    /* The station you are on: an ink disc with a white ring, the same shape
       JourneyLine and NetworkStrip use for a destination node. It was the
       accent teal filled against a white ring, which is the same shape in a
       colour that carries no more meaning here than ink does. */
    .dot-selected {
      fill: var(--gmm-ink);
      stroke: var(--gmm-bg);
      stroke-width: 4;
    }

    .name {
      font-size: var(--text-body);
      fill: var(--gmm-ink);
    }

    /* 600, not 700. DESIGN.md §3 sets semi-bold everywhere; 700 was the only
       bold weight left in the app. */
    .name-strong {
      font-weight: 600;
    }

    /* Text, so --gmm-line-text at 5.84:1 — not --gmm-line at 3.04:1, which §2
       marks as graphic-only. */
    .tag {
      font-size: var(--text-min);
      font-weight: 600;
      fill: var(--gmm-line-text);
      text-anchor: end;
    }

    .hit {
      fill: transparent;
    }

    .stop:hover .hit {
      fill: var(--gmm-soft);
    }

    .stop .hit {
      transition: fill var(--gmm-hover) var(--gmm-ease);
    }
  `,
  template: `
    <svg
      class="diagram"
      [attr.width]="width"
      [attr.height]="height()"
      [attr.viewBox]="'0 0 ' + width + ' ' + height()"
      role="list"
      [attr.aria-label]="t('line.diagramLabel', { count: rows().length })"
    >
      <line
        class="track"
        [attr.x1]="lineX"
        [attr.x2]="lineX"
        [attr.y1]="firstY()"
        [attr.y2]="lastY()"
      />

      @if (journeySpan(); as span) {
        <line
          class="journey"
          [attr.x1]="lineX"
          [attr.x2]="lineX"
          [attr.y1]="span.from"
          [attr.y2]="span.to"
        />
      }

      @for (row of rows(); track row.id) {
        <a
          class="stop"
          role="listitem"
          [attr.href]="row.href"
          [attr.aria-label]="row.label"
          [attr.aria-current]="row.selected ? 'page' : null"
          (click)="go($event, row)"
        >
          <rect class="hit" x="0" [attr.y]="row.hitY" [attr.width]="width" [attr.height]="hitHeight" />
          <circle
            [attr.class]="row.selected ? 'dot dot-selected' : row.onJourney ? 'dot dot-journey' : 'dot'"
            [attr.cx]="lineX"
            [attr.cy]="row.y"
            [attr.r]="row.selected ? 10 : 7"
          />
          <text
            [attr.class]="row.selected || row.tag !== null ? 'name name-strong' : 'name'"
            [attr.x]="labelX"
            [attr.y]="row.y"
            dominant-baseline="central"
          >
            {{ row.name }}
          </text>
          @if (row.tag; as tag) {
            <text class="tag" [attr.x]="width - 4" [attr.y]="row.y" dominant-baseline="central">
              {{ tag }}
            </text>
          }
        </a>
      }
    </svg>
  `,
})
export class Schematic {
  readonly #router = inject(Router);
  readonly #i18n = inject(I18nService);

  protected readonly t = this.#i18n.t;

  /** Every station, in line order. Index 0 is drawn at the top. */
  readonly stations = input.required<readonly SluggableStation[]>();
  /** The station this page is about. Drawn larger and filled. */
  readonly selected = input<StopId | null>(null);
  readonly from = input<StopId | null>(null);
  readonly to = input<StopId | null>(null);

  readonly width = DIAGRAM_WIDTH;
  readonly lineX = LINE_X;
  readonly labelX = LABEL_X;
  readonly hitHeight = HIT_HEIGHT;

  readonly rows = computed<readonly SchematicRow[]>(() => {
    const locale = this.#i18n.locale();
    const t = this.#i18n.t;
    const stations = this.stations();
    const selected = this.selected();
    const from = this.from();
    const to = this.to();
    const fromIndex = stations.findIndex((s) => s.id === from);
    const toIndex = stations.findIndex((s) => s.id === to);
    // Both ends the same is not a journey — it is the route page's refusal
    // branch, which still passes what the URL named. Marking it would put a
    // lone "From" on a page whose whole message is that there is no journey.
    const journey = fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex;
    const low = journey ? Math.min(fromIndex, toIndex) : -1;
    const high = journey ? Math.max(fromIndex, toIndex) : -1;

    return stations.map((station, i) => {
      const y = ROW_OFFSET + i * ROW_PITCH;
      const isFrom = i === fromIndex && low >= 0;
      const isTo = i === toIndex && low >= 0;
      const tag = isFrom ? t('line.from') : isTo ? t('line.to') : null;
      const isSelected = selected !== null && station.id === selected;
      const onJourney = low >= 0 && i >= low && i <= high;
      const suffix = isFrom
        ? t('line.startsHere')
        : isTo
          ? t('line.endsHere')
          : isSelected
            ? t('line.thisStation')
            : '';
      // The label is the reader's language; the href is always built from the
      // feed's English name, because the slug is the same in both languages
      // and only the `/ml` prefix changes.
      const display = stationName(station, locale);
      return {
        id: station.id,
        name: display,
        href: localised(stationPath(station.name), locale),
        y,
        hitY: y - HIT_HEIGHT / 2,
        selected: isSelected,
        tag,
        onJourney,
        label: `${display}${suffix}`,
      };
    });
  });

  readonly height = computed(() => Math.max(ROW_PITCH, this.rows().length * ROW_PITCH));
  readonly firstY = computed(() => this.rows()[0]?.y ?? ROW_OFFSET);
  readonly lastY = computed(() => this.rows()[this.rows().length - 1]?.y ?? ROW_OFFSET);

  /** The ends of the accent stroke, or `null` when no journey is on screen. */
  readonly journeySpan = computed<{ from: number; to: number } | null>(() => {
    const marked = this.rows().filter((row) => row.tag !== null);
    if (marked.length !== 2) return null;
    return { from: marked[0].y, to: marked[1].y };
  });

  /**
   * Real `href`s, client-side navigation.
   *
   * The links have to be real so a crawler and a reader without JavaScript
   * both get the whole network — internal linking is how 1,250 pages get
   * discovered (CLAUDE.md search strategy 2). `routerLink` is not used because
   * it is an HTML-anchor directive and these are SVG anchors, so the router is
   * called by hand and only for a plain left click: modified clicks keep their
   * browser meaning of opening a tab.
   */
  go(event: MouseEvent, row: SchematicRow): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.#router.navigateByUrl(row.href);
  }
}
