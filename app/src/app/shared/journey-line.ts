/**
 * The vertical line. DESIGN.md §5.1.
 *
 * A 30px rail column and a content column, repeated per row. The line is drawn
 * by the rail column of each row, not by one element spanning the section, and
 * that is the whole design: a row's rail segment is `top: 0; bottom: 0` of that
 * row, so the line is exactly as tall as its content and rows join seamlessly
 * because the segments are square-ended and flush.
 *
 * **Why not one absolutely-positioned line down the section.** That is the
 * obvious implementation and it is the one that breaks. It needs to know where
 * the first and last nodes are, which means knowing the rows' heights, which
 * means fixing them — and DESIGN.md §5.1 and §8 both forbid that, because
 * Malayalam station names set taller than Latin ones and the app must work at
 * 200% text. Per-row segments never need a height at all: the grid sizes the
 * row from its content and the segment stretches to whatever that turns out to
 * be. Everything here is `min-block-size` at most, never `block-size`.
 *
 * **The node offset is a distance from the row's top, not a centring.** Nodes
 * sit 22px below the row top (`--gmm-node-offset`) so they line up with the
 * optical centre of the station name's *first* line. Centring them vertically
 * would drift them down as soon as a name wrapped to two lines — which is
 * exactly what Malayalam does at 25px in a 390px viewport.
 *
 * Rendered by the Home journey, the Route stop list and the Choose-destination
 * list. Those three screens are Phase C's; this is the piece they share.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Which node a row carries.
 *
 * `none` draws no node at all — used by the Home hero's middle row, which is
 * pure line behind the countdown block.
 */
export type JourneyNode = 'origin' | 'destination' | 'through' | 'pending' | 'none';

/**
 * How much of the rail this row draws.
 *
 * `first` runs from the node downwards, `last` from the top down to the node,
 * `through` the full height, and `only` draws nothing (a single row with no
 * line, e.g. a terminus with no journey).
 */
export type JourneyRowKind = 'first' | 'through' | 'last' | 'only';

/**
 * The line's state.
 *
 * `solid` is the normal journey. `dotted` is DESIGN.md §6's "No destination"
 * state — the line waits. `muted` is "No service tonight", where the line greys
 * out entirely. Colour never carries this alone: the dotted variant is a
 * different *shape*, and the muted one is always accompanied by the board
 * saying "Closed", per golden rule 3.
 */
export type JourneyVariant = 'solid' | 'dotted' | 'muted';

@Component({
  selector: 'app-journey-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      /* The rail is a fixed 30px column; the content column takes the rest.
         'minmax(0, 1fr)' rather than '1fr' so a long unbroken station name
         cannot push the row wider than the viewport. */
      grid-template-columns: var(--gmm-rail) minmax(0, 1fr);
      column-gap: var(--gmm-space-4);
      align-items: stretch;
    }

    /* The rail column. 'position: relative' is the anchor for the segment and
       the node; it has no height of its own and stretches to the row. */
    .rail {
      position: relative;
      inline-size: var(--gmm-rail);
    }

    /* The line segment. 10px wide, centred in the 30px rail (left: 10px), and
       square-ended — no border-radius — so consecutive rows join with no seam.
       DESIGN.md §5.1. */
    .segment {
      position: absolute;
      inset-inline-start: 10px;
      inline-size: var(--gmm-line-width);
      background-color: var(--gmm-line);
    }

    /* 'first' starts at the node's centre and runs to the bottom of the row.
       17px is the node centre: 4px top inset + half of the 26px origin node. */
    .segment-first {
      inset-block: 17px 0;
    }

    .segment-through {
      inset-block: 0;
    }

    /* 'last' runs from the top of the row down to the node's centre. */
    .segment-last {
      inset-block-start: 0;
      block-size: 17px;
    }

    /* The "no destination chosen" line: dotted, grey, same 10px width. Drawn
       with a repeating gradient rather than a dashed border so the dot size is
       ours and does not vary by browser. It is a *shape* difference, which is
       what lets it carry meaning without relying on the colour change. */
    :host(.variant-dotted) .segment {
      background-color: transparent;
      background-image: repeating-linear-gradient(
        to bottom,
        var(--gmm-grey) 0 6px,
        transparent 6px 14px
      );
    }

    /* "No service tonight": the line greys out. */
    :host(.variant-muted) .segment {
      background-color: var(--gmm-grey);
    }

    /* Nodes. All four are circles centred on the line's 10px column — the
       15px centre of the rail — and sit '--gmm-node-offset' (22px) below the
       row's top edge. 'inset-block-start' is computed per node from 22 less
       half its diameter, so every node's *centre* lands on the same line
       whatever its size. */
    .node {
      position: absolute;
      box-sizing: border-box;
      border-radius: var(--radius-full);
    }

    /* Origin / "you're here": 26px ring, white fill, 5px line border.
       22 - 13 = 9px from the top; 15 - 13 = 2px from the rail's start. */
    .node-origin {
      inset-block-start: 9px;
      inset-inline-start: 2px;
      inline-size: var(--gmm-node-origin);
      block-size: var(--gmm-node-origin);
      background-color: var(--gmm-bg);
      border: 5px solid var(--gmm-line);
    }

    /* Destination: 28px filled ink disc with a 4px white border, so it reads
       as solid against the line passing behind it. 22 - 14 = 8px. */
    .node-destination {
      inset-block-start: 8px;
      inset-inline-start: 1px;
      inline-size: var(--gmm-node-destination);
      block-size: var(--gmm-node-destination);
      background-color: var(--gmm-ink);
      border: 4px solid var(--gmm-bg);
    }

    /* A stop passing through: 16px ring, 3px border. 22 - 8 = 14px. */
    .node-through {
      inset-block-start: 14px;
      inset-inline-start: 7px;
      inline-size: var(--gmm-node-through);
      block-size: var(--gmm-node-through);
      background-color: var(--gmm-bg);
      border: 3px solid var(--gmm-line);
    }

    /* Not chosen yet: 26px ring, 4px dashed grey. Dashed, so the "nothing here
       yet" state has a shape and not only a colour. */
    .node-pending {
      inset-block-start: 9px;
      inset-inline-start: 2px;
      inline-size: var(--gmm-node-origin);
      block-size: var(--gmm-node-origin);
      background-color: var(--gmm-bg);
      border: 4px dashed var(--gmm-grey);
    }

    /* In the muted and dotted variants the rings follow the line. The
       destination disc stays ink in every variant: it is a position, not a
       status, and greying it out would lose the only mark that says where the
       reader is going. */
    :host(.variant-dotted) .node-origin,
    :host(.variant-muted) .node-origin,
    :host(.variant-dotted) .node-through,
    :host(.variant-muted) .node-through {
      border-color: var(--gmm-grey);
    }

    /* The content column. 'min-inline-size: 0' lets a long name wrap instead
       of overflowing the grid track. No height anywhere — this is what makes
       the row grow for Malayalam and for 200% text. */
    .content {
      min-inline-size: 0;
    }

    /* Compact: the From / To card on Home before a destination is chosen.
       A small teal ring for your station, a thin dotted line, and a small
       hollow ring beside "Where to?" — the trip-planner shape, light enough
       not to compete with the words. Declared last so it wins over the
       variant rules above at equal specificity.

       Geometry, in a 20px rail: nodes are 14px, centred on x = 10. The origin
       centres on the station name's first line (14px down); the destination
       on the 48px "Where to?" field (22px down). The line runs between them
       with a 2px gap at each end. */
    :host(.is-compact) {
      grid-template-columns: 20px minmax(0, 1fr);
      column-gap: var(--gmm-space-3);
    }

    :host(.is-compact) .rail {
      inline-size: 20px;
    }

    :host(.is-compact) .segment {
      inset-inline-start: 9px;
      inline-size: 2px;
      background-color: transparent;
      background-image: repeating-linear-gradient(
        to bottom,
        var(--gmm-grey) 0 3px,
        transparent 3px 7px
      );
    }

    :host(.is-compact) .segment-first {
      inset-block: 23px 0;
    }

    :host(.is-compact) .segment-last {
      inset-block-start: 0;
      block-size: 13px;
    }

    :host(.is-compact) .node {
      inset-inline-start: 3px;
      inline-size: 14px;
      block-size: 14px;
      background-color: var(--gmm-bg);
    }

    /* Your station: line-text, 5.82:1 on white, so it passes as a graphic. */
    :host(.is-compact) .node-origin {
      inset-block-start: 7px;
      border: 4px solid var(--gmm-line-text);
    }

    /* Not chosen yet: thin and grey, a different shape from the origin. */
    :host(.is-compact) .node-pending {
      inset-block-start: 15px;
      border: 2px solid var(--gmm-ink-3);
    }
  `,
  template: `
    <div class="rail" aria-hidden="true">
      @if (kind() !== 'only') {
        <div class="segment" [class]="segmentClass()"></div>
      }
      @if (node() !== 'none') {
        <div class="node" [class]="nodeClass()"></div>
      }
    </div>
    <div class="content">
      <ng-content />
    </div>
  `,
  host: {
    '[class]': 'variantClass()',
    '[class.is-compact]': 'compact()',
  },
})
export class JourneyRow {
  /** The small From / To card rail. See the compact styles above. */
  readonly compact = input<boolean>(false);

  /** Which node this row carries. `none` draws rail only. */
  readonly node = input<JourneyNode>('through');

  /** How much of the rail this row draws. */
  readonly kind = input<JourneyRowKind>('through');

  /** The line's state: normal, awaiting a destination, or out of service. */
  readonly variant = input<JourneyVariant>('solid');

  protected readonly segmentClass = computed(() => `segment-${this.kind()}`);
  protected readonly nodeClass = computed(() => `node-${this.node()}`);
  protected readonly variantClass = computed(() => `variant-${this.variant()}`);
}
