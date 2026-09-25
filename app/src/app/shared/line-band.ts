/**
 * The line, as a band across the page. DESIGN.md screen 07 and §5.5.
 *
 * A heading, an "Open line map" link, and the 25-station `NetworkStrip` under
 * them. It exists because the home screen and the station board both carry it
 * and they have to read as one component rather than as two arrangements that
 * happen to look alike — the label treatment, the link and the strip's
 * position relative to the line are all the same thing in both places.
 *
 * ## Why the link is here and not in the strip
 *
 * `NetworkStrip` is a single `role="img"` with a text alternative and carries
 * no anchors at all: 25 targets at a 14px pitch would fail the 44px floor, and
 * the 25 crawlable station anchors that CLAUDE.md's search strategy 2 depends
 * on live in `schematic.ts` and the map section's index. So the strip cannot
 * be a way into anything, and this band is what gives the reader a way out of
 * the diagram — one 44px link to the map.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { StopId } from '../core/data/network.types';
import type { SluggableStation } from '../core/data/slugs';
import { I18nService } from '../core/i18n/i18n';

import { NetworkStrip } from './network-strip';

@Component({
  selector: 'app-line-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NetworkStrip, RouterLink],
  styles: `
    :host {
      display: block;
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      flex-wrap: wrap;
    }

    /* The same label treatment as the board's "DEPARTURES" and the fare list's
       platform heads, so all three read as one kind of thing. */
    .title {
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
      color: var(--gmm-ink);
    }

    /* Malayalam takes no uppercase and no added tracking (DESIGN.md §3). */
    :host-context([lang='ml']) .title {
      text-transform: none;
      letter-spacing: normal;
    }

    /* A 44px target, because it is one. */
    .link {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--gmm-touch);
      color: var(--gmm-line-text);
      font-size: var(--text-min);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .link:hover {
      color: var(--gmm-line-dark);
    }

    /* The strip bleeds the page gutter so the line runs to the window edge —
       the same treatment the board gets and for the same reason: it is a
       picture of the line, and a line inset 20px reads as a picture of one.
       Exactly the gutter, never more, or 360px gains a horizontal scrollbar. */
    .figure {
      display: block;
      margin-inline: 0;
      inline-size: 100%;
    }

    /* At the 80px desktop margin the rotated labels have room to run past the
       content edge, and they need it: the leftmost label is rotated away from
       its dot and would otherwise clip against the margin.

       The wide strip is a fixed 1312px and is never scaled — an SVG scales its
       text, and scaling this one down would put its 16px labels under the
       floor (see network-strip.ts). So at 1440px it fits exactly, and at
       1024-1439px this band scrolls. The scroller is the band and not the
       page: a horizontal scrollbar on one diagram is a normal way to read
       a wide diagram, and a horizontal scrollbar on the document is a layout
       bug. */
    @media (min-width: 1024px) {
      .figure {
        margin-inline: calc(-1 * var(--gmm-space-4));
        overflow-x: auto;
        /* The band is the scroller, so it must not also be a flex/grid item
           that refuses to shrink. */
        max-inline-size: calc(100% + 2 * var(--gmm-space-4));
      }
    }
  `,
  template: `
    <div class="head">
      <h2 class="title">{{ t('strip.line') }}</h2>
      <a class="link" [routerLink]="localPath('/')" fragment="line-map">{{
        t('strip.openMap')
      }}</a>
    </div>
    <app-network-strip
      class="figure"
      [stations]="stations()"
      [you]="you()"
      [destination]="destination()"
    />
  `,
  host: { role: 'group', '[attr.aria-label]': "t('strip.section')" },
})
export class LineBand {
  readonly #i18n = inject(I18nService);
  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  /** Every station, in line order. Index 0 is Aluva. */
  readonly stations = input.required<readonly SluggableStation[]>();

  /** The station the reader is at. */
  readonly you = input<StopId | null>(null);

  /** Where they are going, if anywhere. */
  readonly destination = input<StopId | null>(null);
}
