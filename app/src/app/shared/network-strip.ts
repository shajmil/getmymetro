/**
 * All 25 stations on one horizontal line. DESIGN.md §5.5.
 *
 * Aluva at the left, Tripunithura at the right — the same order as
 * `LineTrack` and the same order as the board's lanes. A reader who learns the
 * orientation once should never have to relearn it.
 *
 * Small white dots are stations; an ink ring is the reader; an ink disc is
 * their destination. On mobile only the two ends are labelled, because 25
 * labels across 350px is 14px each and unreadable; on desktop every station is
 * labelled at −50°, which is what the spec asks for and what the width allows.
 *
 * ## This does not replace `schematic.ts`, and must not
 *
 * The vertical schematic carries **25 real anchors, one per station**, and
 * CLAUDE.md's search strategy 2 rests on that cross-linking: internal links
 * are how 1,250 prerendered pages get discovered and valued. This strip is a
 * diagram — a single `role="img"` with a text alternative — and deliberately
 * carries no links: 25 tap targets at 14px pitch would fail the 44px floor and
 * be unusable on a phone anyway.
 *
 * So the two coexist by design. The strip answers "where am I on the line" at
 * a glance; the schematic answers "take me to another station" and feeds the
 * crawler. Replacing the schematic with this would silently delete the app's
 * SEO cross-linking, which is exactly the trap CLAUDE.md records the Leaflet
 * map falling into.
 *
 * ## Contrast
 *
 * The line is `--gmm-line` on white here, 3.04:1 — which passes 1.4.11,
 * unlike the same teal on the soft board panel (2.78:1). The strip is
 * therefore drawn without `LineTrack`'s edge stroke. If it is ever placed on
 * `--gmm-soft`, it needs the edge treatment too; `soft` makes it draw one.
 *
 * The marks that carry meaning — you, and your destination — are ink on the
 * teal line at over 15:1, so the two things a reader looks for are the highest
 * contrast elements in the diagram whatever the ground.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { StopId } from '../core/data/network.types';
import { stationName } from '../core/data/station-directory';
import type { SluggableStation } from '../core/data/slugs';
import { I18nService } from '../core/i18n/i18n';

/** The narrow viewBox. 350 = a 390px viewport less two 20px gutters. */
const WIDTH = 350;

/** Narrow height: the line, its dots, and the two end labels under them. */
const HEIGHT = 44;

const LINE_Y = 14;
const INSET = 10;

/**
 * The wide viewBox, from DESIGN.md screen 07: 1312 = the 1280px content column
 * plus the 16px of bleed either side that the rotated end labels need.
 *
 * ## Why this is a second `<svg>` and not the first one scaled
 *
 * The narrow strip puts its two end labels *below* a line at y=14 and is 44
 * tall. The wide one puts 25 labels *above* a line near the bottom and is 176
 * tall. That is a different `viewBox`, a different line position and a
 * different text anchor — and a `viewBox` is an attribute, which no media
 * query can reach. Scaling the narrow geometry up instead would stretch the
 * 16px labels to ~60px at 1312 wide, because an SVG scales its text with
 * everything else.
 *
 * So both are rendered and CSS shows one. The cost is 25 extra `<text>`
 * elements in the prerendered HTML; the alternative is a `matchMedia` signal,
 * which would leave every one of the 1,252 prerendered documents with the
 * narrow strip and swap it on hydration.
 *
 * The **accessible name is on the narrow one only** and the wide one is
 * `aria-hidden`. They are the same diagram at two widths, and announcing the
 * line twice would be a bug a screenshot could never show.
 */
const WIDE_WIDTH = 1312;

/**
 * Tall enough for the longest label, which is Malayalam's and not English's.
 *
 * A label rotated −50° climbs `width x sin(50) = 0.77 x width` above its own
 * anchor. Phase D sized this box for English — "Cochin University" tops out at
 * y=13 with the line at y=150, which fits — and the same station in Malayalam
 * is "കൊച്ചിൻ യൂണിവേഴ്സിറ്റി", half again as long, which tops out at y=-47
 * and is cut off by the viewBox. Phase D recorded rotated-label collision as
 * unverified; this is what was behind that note.
 *
 * So the line sits at y=220 rather than y=150, which clears the longest
 * Malayalam name with ~13px to spare and English with ~73px. `WIDE_HEIGHT` is
 * that plus 26, the room the dots and the reader's ring need below the line.
 */
const WIDE_HEIGHT = 246;
const WIDE_LINE_Y = 220;
const WIDE_INSET = 16;

/**
 * How much of the right edge is label headroom rather than line.
 *
 * The same rotation runs `0.64 x width` to the *right* of its anchor, so the
 * last station's label is the one that leaves the box: at the Phase D geometry
 * "Tripunithura" ended near x=1368 and "തൃപ്പൂണിത്തുറ" near x=1380, against a
 * viewBox 1312 wide. The reported symptom was the right-most label cut off at
 * the edge, and that is the arithmetic behind it.
 *
 * Widening the viewBox is not the fix. The wide strip renders at exactly its
 * own 1312 CSS pixels so that a 16px label is 16 real pixels (see the note on
 * `.strip-wide` below); a wider box at the same rendered width would scale
 * every label *down*, straight through the floor DESIGN.md §3 makes structural.
 * So the box stays 1312 and the **line** gets shorter, which costs nothing —
 * the strip is an equal-pitch diagram, not a map, and 120px is comfortably
 * more than the longest label needs.
 *
 * The left edge needs none of this: a label anchored at its start and rotated
 * −50° runs up and to the *right*, so Aluva's begins at x=20 and moves away
 * from the edge. The narrow strip's end labels are the opposite case and are
 * anchored `start` and `end` against the two edges for that reason.
 */
const WIDE_LABEL_PAD = 120;

/** Where a rotated label starts: 4px right of its dot, 22px above the line. */
const WIDE_LABEL_DX = 4;
const WIDE_LABEL_DY = 22;

export interface StripStation {
  readonly id: StopId;
  readonly name: string;
  readonly x: number;
  readonly isYou: boolean;
  readonly isDestination: boolean;
}

@Component({
  selector: 'app-network-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    .strip {
      display: block;
      inline-size: 100%;
      block-size: auto;
    }

    .strip-narrow {
      overflow: visible;
    }

    .rail {
      fill: none;
      stroke: var(--gmm-line);
      stroke-width: 10;
      stroke-linecap: round;
    }

    /* On the soft board panel the brand teal is 2.78:1, so the shape gets a
       text-safe edge underneath. On white it is 3.04:1 and needs none. */
    .rail-edge {
      fill: none;
      stroke: var(--gmm-line-edge);
      stroke-width: 13;
      stroke-linecap: round;
    }

    .stop {
      fill: var(--gmm-bg);
    }

    /* You: an ink ring on white. 18.88:1 against the teal line behind it. */
    .you {
      fill: var(--gmm-bg);
      stroke: var(--gmm-ink);
      stroke-width: 3.5;
    }

    /* Your destination: a filled ink disc. Same two shapes as JourneyLine's
       nodes, so the vocabulary is one vocabulary across the whole app. */
    .destination {
      fill: var(--gmm-ink);
      stroke: var(--gmm-bg);
      stroke-width: 2.5;
    }

    /* The end labels. 16px in user units at a 350-wide viewBox rendered into
       ~350 CSS px, so it renders at 16px and does not breach the floor. It
       scales up with the container, never down. */
    .end-label {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.04em;
      fill: var(--gmm-ink);
      text-transform: uppercase;
    }

    :host-context([lang='ml']) .end-label {
      text-transform: none;
      letter-spacing: normal;
    }

    .end-label-start {
      text-anchor: start;
    }

    .end-label-end {
      text-anchor: end;
    }

    /* Every station labelled, on the wide strip only. Rotated −50° per
       DESIGN.md §5.5, anchored at its start so the text runs up and to the
       right of its own dot rather than back across the line.

       16px in user units on a 1312-wide viewBox rendered into a ~1312px
       column, so it renders at 16px and clears the floor. The strip is capped
       at its natural width for exactly this reason: scaled up past 1312 the
       labels would grow, and scaled down they would breach the floor. */
    .station-label {
      font-size: 16px;
      font-weight: 400;
      fill: var(--gmm-ink-2);
      text-anchor: start;
    }

    /* You, and your destination. Ink and semi-bold — the two marks a reader is
       looking for are the two highest-contrast labels, and weight carries it
       as well as colour. */
    .station-label-you {
      font-weight: 600;
      fill: var(--gmm-ink);
    }

    /* The two terminals are named in ink whatever else is marked: they are what
       the line's two directions are called everywhere else in the app. */
    .station-label-end {
      font-weight: 600;
      fill: var(--gmm-ink);
    }

    /* One of the two strips is shown, never both. See the note on WIDE_WIDTH:
       a viewBox is an attribute and no media query can reach it, so the two
       geometries have to be two elements. */
    .strip-wide {
      display: none;
      inline-size: 100%;
      max-inline-size: 100%;
      block-size: auto;
      overflow: visible;
    }

    @media (min-width: 1024px) {
      .strip-narrow {
        display: none;
      }

      .strip-wide {
        display: block;
        inline-size: 100%;
        max-inline-size: 100%;
        block-size: auto;
      }
    }
  `,
  template: `
    <!--
      Narrow. The line, its 25 dots, and the two ends named under it. Below
      1024px this is the only one on screen; 25 labels across 350px would be
      14px each and unreadable.
    -->
    <svg
      class="strip strip-narrow"
      [attr.viewBox]="'0 0 ' + WIDTH + ' ' + HEIGHT"
      [attr.width]="WIDTH"
      [attr.height]="HEIGHT"
      role="img"
      [attr.aria-label]="label()"
    >
      @if (soft()) {
        <path class="rail-edge" [attr.d]="railPath()" />
      }
      <path class="rail" [attr.d]="railPath()" />

      @for (station of stops(); track station.id) {
        @if (station.isDestination) {
          <circle class="destination" [attr.cx]="station.x" [attr.cy]="LINE_Y" r="6" />
        } @else if (station.isYou) {
          <circle class="you" [attr.cx]="station.x" [attr.cy]="LINE_Y" r="6.5" />
        } @else {
          <circle class="stop" [attr.cx]="station.x" [attr.cy]="LINE_Y" r="2.5" />
        }
      }

      <text class="end-label end-label-start" x="0" [attr.y]="LINE_Y + 26">
        {{ startName() }}
      </text>
      <text class="end-label end-label-end" [attr.x]="WIDTH" [attr.y]="LINE_Y + 26">
        {{ endName() }}
      </text>
    </svg>

    <!--
      Wide. DESIGN.md screen 07: every station labelled at −50°, the line near
      the bottom and the names above it.

      Marked aria-hidden, because the narrow strip above already carries the
      accessible name and both are in the document at all times. Two role=img
      elements describing one line would announce it twice.
    -->
    <svg
      class="strip strip-wide"
      [attr.viewBox]="'0 0 ' + WIDE_WIDTH + ' ' + WIDE_HEIGHT"
      aria-hidden="true"
      focusable="false"
    >
      @if (soft()) {
        <path class="rail-edge" [attr.d]="wideRailPath()" />
      }
      <path class="rail" [attr.d]="wideRailPath()" />

      @for (station of wideStops(); track station.id; let i = $index) {
        @if (station.isDestination) {
          <circle class="destination" [attr.cx]="station.x" [attr.cy]="WIDE_LINE_Y" r="11" />
        } @else if (station.isYou) {
          <circle class="you" [attr.cx]="station.x" [attr.cy]="WIDE_LINE_Y" r="11" />
        } @else {
          <circle class="stop" [attr.cx]="station.x" [attr.cy]="WIDE_LINE_Y" r="2.6" />
        }

        <text
          class="station-label"
          [class.station-label-you]="station.isYou || station.isDestination"
          [class.station-label-end]="i === 0 || i === wideStops().length - 1"
          [attr.transform]="
            'translate(' +
            (station.x + WIDE_LABEL_DX) +
            ' ' +
            (WIDE_LINE_Y - WIDE_LABEL_DY) +
            ') rotate(-50)'
          "
        >
          {{ station.name }}
        </text>
      }
    </svg>
  `,
})
export class NetworkStrip {
  readonly #i18n = inject(I18nService);
  protected readonly t = this.#i18n.t;

  /** Every station, in line order. Index 0 is Aluva and is drawn at the left. */
  readonly stations = input.required<readonly SluggableStation[]>();

  /** The station the reader is at. Drawn as an ink ring. */
  readonly you = input<StopId | null>(null);

  /** Where they are going. Drawn as an ink disc. */
  readonly destination = input<StopId | null>(null);

  /**
   * True when the strip sits on `--gmm-soft` rather than white.
   *
   * The brand teal is 2.78:1 on soft and 3.04:1 on white, so on soft the line
   * is given a text-safe edge stroke to clear WCAG 1.4.11.
   */
  readonly soft = input<boolean>(false);

  protected readonly WIDTH = WIDTH;
  protected readonly HEIGHT = HEIGHT;
  protected readonly LINE_Y = LINE_Y;
  protected readonly WIDE_WIDTH = WIDE_WIDTH;
  protected readonly WIDE_HEIGHT = WIDE_HEIGHT;
  protected readonly WIDE_LINE_Y = WIDE_LINE_Y;
  protected readonly WIDE_LABEL_PAD = WIDE_LABEL_PAD;
  protected readonly WIDE_LABEL_DX = WIDE_LABEL_DX;
  protected readonly WIDE_LABEL_DY = WIDE_LABEL_DY;

  protected readonly railPath = computed(() => `M ${INSET} ${LINE_Y} H ${WIDTH - INSET}`);

  protected readonly wideRailPath = computed(
    () => `M ${WIDE_INSET} ${WIDE_LINE_Y} H ${WIDE_WIDTH - WIDE_LABEL_PAD}`,
  );

  /**
   * Station positions, at equal pitch.
   *
   * **Equal pitch, not chainage, and that is deliberate.** Measured along the
   * feed's own `shape_dist_traveled`, spacing runs from 470 m to 2,050 m, so a
   * to-scale strip would put two dots 4px apart at one end and leave a gap at
   * the other. Nobody navigates a single line by its curvature, and the strip
   * never claims to be a map — it is the diagram on the carriage wall.
   */
  protected readonly stops = computed<readonly StripStation[]>(() => {
    const locale = this.#i18n.locale();
    const stations = this.stations();
    const you = this.you();
    const destination = this.destination();
    const span = WIDTH - 2 * INSET;
    const last = Math.max(1, stations.length - 1);

    return stations.map((station, i) => ({
      id: station.id,
      name: stationName(station, locale),
      x: INSET + (span * i) / last,
      isYou: you !== null && station.id === you,
      isDestination: destination !== null && station.id === destination,
    }));
  });

  /**
   * The same stations at the wide geometry.
   *
   * Derived from `stops()` rather than recomputed, so the two strips can never
   * disagree about who is where — only the x coordinate is rescaled.
   */
  protected readonly wideStops = computed<readonly StripStation[]>(() => {
    const narrowSpan = WIDTH - 2 * INSET;
    // Asymmetric on purpose: `WIDE_LABEL_PAD` on the right is the room the
    // rotated labels need, and the left needs none because they rotate away
    // from that edge. See the note on the constant.
    const wideSpan = WIDE_WIDTH - WIDE_INSET - WIDE_LABEL_PAD;
    return this.stops().map((station) => ({
      ...station,
      x: WIDE_INSET + ((station.x - INSET) / narrowSpan) * wideSpan,
    }));
  });

  protected readonly startName = computed(() => this.stops()[0]?.name ?? '');

  protected readonly endName = computed(() => {
    const list = this.stops();
    return list[list.length - 1]?.name ?? '';
  });

  /**
   * The text alternative. DESIGN.md §8 requires one on every line diagram, and
   * it must convey what the picture does: the line, its extent, where the
   * reader is, and where they are going if that is drawn.
   */
  protected readonly label = computed(() => {
    const count = this.stops().length;
    const you = this.stops().find((s) => s.isYou);
    const destination = this.stops().find((s) => s.isDestination);
    const station = you?.name ?? this.startName();
    if (destination !== undefined) {
      return this.t('strip.labelWithDestination', {
        count,
        station,
        destination: destination.name,
      });
    }
    return this.t('strip.label', { count, station });
  });
}
