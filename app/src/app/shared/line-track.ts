/**
 * The horizontal line, above the departure board. DESIGN.md §5.3.
 *
 * Left is Aluva, right is Tripunithura — **always**, at every station, in both
 * languages, whichever way the reader is going. The same order as the network
 * strip and the same order as the lane heads under it. A track that reordered
 * itself to put "your" direction on the left would be a different diagram on
 * every screen and would stop meaning anything.
 *
 * You are a 24px ink-ringed node. The half in the direction you are taking is
 * teal; the other is grey; with no destination chosen, both are grey.
 *
 * ## The contrast problem, and why the chevrons are not decoration
 *
 * `--gmm-line` (#00A3B4) on `--gmm-soft` (#F3F5F4) is **2.78:1** — Phase A
 * measured it — and WCAG 1.4.11 wants 3:1 for a graphic that carries meaning.
 * This component is exactly that case: the board panel is `--gmm-soft` and the
 * line sits on it.
 *
 * Two things follow, and both are implemented here rather than left to the
 * caller:
 *
 * 1. The teal half is stroked with `--gmm-line-edge` (#00707C, 5.82:1 on soft)
 *    *under* the `--gmm-line` fill, so the shape has a compliant edge at every
 *    point along its length while still reading as the brand teal. The edge is
 *    1.5px on each side of a 10px line, which is visible to a low-vision reader
 *    and invisible as a colour shift to everyone else.
 *
 * 2. **Direction is never carried by the teal alone.** The chevrons at the ends
 *    point outwards along the direction of travel, the lane heads under the
 *    track name the terminus in words, and the node is ink-ringed rather than
 *    teal. A reader who cannot separate the two halves by hue still has an
 *    arrow, a word and a position. That is DESIGN.md's golden rule 3, and here
 *    it is also the 1.4.11 mitigation.
 *
 * The chevrons are white on the line, which is the mockup's design. White on
 * `--gmm-line` is 2.66:1 and on `--gmm-grey` 1.76:1 — neither passes as a
 * meaningful graphic on its own, which is the third reason direction has to be
 * in the words too. They are drawn at 2.5px on a 10px line, so they read as a
 * notch in the line's end rather than as a free-standing icon.
 *
 * ## Terminal stations
 *
 * At Aluva and Tripunithura the node sits at its end of the track and only one
 * half is drawn — there is no platform in the other direction, so drawing a
 * grey stub would invent one. `end` says which.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

/** Which half is live, i.e. the direction the reader is travelling. */
export type TrackSide = 'aluva' | 'tripunithura' | 'none';

/** A terminus draws one half only. `null` is an intermediate station. */
export type TrackEnd = 'aluva' | 'tripunithura' | null;

/** The viewBox. 374 = a 390px viewport less two 8px gutters, per the mockup. */
const WIDTH = 374;
const HEIGHT = 40;
const MID_Y = 20;

/** Where the drawn track starts and stops, leaving room for the chevrons. */
const LEFT_X = 12;
const RIGHT_X = 362;

/** The node's radius, per DESIGN.md §5.3: a 24px node. */
const NODE_R = 12;

@Component({
  selector: 'app-line-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    .track {
      display: block;
      inline-size: 100%;
      block-size: auto;
      max-inline-size: 100%;
    }

    .rail {
      fill: none;
      stroke-width: 10;
      stroke-linecap: round;
    }

    /* The half you are not taking, and both halves when nothing is chosen. */
    .rail-grey {
      stroke: var(--gmm-grey);
    }

    /* The half you are taking. Drawn twice: a 13px edge in the text-safe teal
       underneath, then the 10px brand teal on top. The result is a 10px line
       with a 1.5px compliant edge, which is what carries it over WCAG 1.4.11's
       3:1 on the --gmm-soft board panel where the raw teal is 2.78:1. */
    .rail-edge {
      stroke: var(--gmm-line-edge);
      stroke-width: 13;
    }

    .rail-live {
      stroke: var(--gmm-line);
    }

    .chevron {
      fill: none;
      stroke: var(--gmm-bg);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* You. An ink ring on a white fill — 18.88:1 against either half, so the
       one mark the reader looks for first is the highest-contrast thing in the
       diagram regardless of which side it sits on. */
    .node {
      fill: var(--gmm-bg);
      stroke: var(--gmm-ink);
      stroke-width: 4;
    }
  `,
  template: `
    <svg
      class="track"
      [attr.viewBox]="'0 0 ' + WIDTH + ' ' + HEIGHT"
      [attr.width]="WIDTH"
      [attr.height]="HEIGHT"
      role="img"
      [attr.aria-label]="label()"
    >
      <!-- The Aluva half, unless this is Aluva itself. -->
      @if (end() !== 'aluva') {
        @if (side() === 'aluva') {
          <path class="rail rail-edge" [attr.d]="leftPath()" />
        }
        <path
          class="rail"
          [class.rail-live]="side() === 'aluva'"
          [class.rail-grey]="side() !== 'aluva'"
          [attr.d]="leftPath()"
        />
        <path class="chevron" [attr.d]="leftChevron()" />
      }

      <!-- The Tripunithura half, unless this is Tripunithura itself. -->
      @if (end() !== 'tripunithura') {
        @if (side() === 'tripunithura') {
          <path class="rail rail-edge" [attr.d]="rightPath()" />
        }
        <path
          class="rail"
          [class.rail-live]="side() === 'tripunithura'"
          [class.rail-grey]="side() !== 'tripunithura'"
          [attr.d]="rightPath()"
        />
        <path class="chevron" [attr.d]="rightChevron()" />
      }

      <circle class="node" [attr.cx]="nodeX()" [attr.cy]="MID_Y" [attr.r]="NODE_R" />
    </svg>
  `,
})
export class LineTrack {
  protected readonly t = inject(I18nService).t;

  /** The station the reader is at. Used for the diagram's text alternative. */
  readonly stationName = input.required<string>();

  /** Which half is live. `none` when no destination has been chosen. */
  readonly side = input<TrackSide>('none');

  /** Set at a terminus, so only one half is drawn. */
  readonly end = input<TrackEnd>(null);

  protected readonly WIDTH = WIDTH;
  protected readonly HEIGHT = HEIGHT;
  protected readonly MID_Y = MID_Y;
  protected readonly NODE_R = NODE_R;

  /**
   * The node's x. Centred between the ends at an intermediate station, and at
   * the corresponding end at a terminus.
   */
  protected readonly nodeX = computed(() => {
    const end = this.end();
    if (end === 'aluva') return LEFT_X;
    if (end === 'tripunithura') return RIGHT_X;
    return (LEFT_X + RIGHT_X) / 2;
  });

  protected readonly leftPath = computed(() => `M ${LEFT_X} ${MID_Y} H ${this.nodeX()}`);
  protected readonly rightPath = computed(() => `M ${this.nodeX()} ${MID_Y} H ${RIGHT_X}`);

  /** Pointing left, towards Aluva. Drawn just inside the line's left end. */
  protected readonly leftChevron = computed(
    () => `M ${LEFT_X + 14} ${MID_Y - 7} l -8 7 8 7`,
  );

  /** Pointing right, towards Tripunithura. */
  protected readonly rightChevron = computed(
    () => `M ${RIGHT_X - 14} ${MID_Y - 7} l 8 7 -8 7`,
  );

  /**
   * The text alternative. DESIGN.md §8 requires one on every line diagram, and
   * it has to say the same things the picture does: which line, which way round
   * it is drawn, and where the reader is on it.
   */
  protected readonly label = computed(() =>
    this.t('track.label', { station: this.stationName() }),
  );
}
