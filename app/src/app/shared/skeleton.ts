/**
 * The loading state. DESIGN.md §5.6 and §6's "Loading" screen.
 *
 * Grey blocks in the **exact final layout** — including the line and its nodes
 * — so that when the data lands nothing moves. No spinners: a spinner says
 * "something is happening" and this says "here is the shape of the answer",
 * which is the more useful of the two and the only one that prevents a layout
 * shift.
 *
 * The line and the nodes are drawn by the real `JourneyRow` in its `muted`
 * variant rather than by grey rectangles pretending to be one. That is what
 * makes "exact final layout" true rather than approximately true: the rail is
 * 10px because it is the same rail, and the nodes are on the same 22px offset
 * because they are the same nodes. A hand-drawn imitation would drift from the
 * real thing the first time either changed.
 *
 * ## Accessibility
 *
 * The host carries `aria-busy="true"` and the blocks are `aria-hidden`, so a
 * screen reader is told the region is loading rather than being read a set of
 * meaningless boxes. A polite status message accompanies it, per DESIGN.md §8
 * — it is a `role="status"`, so it is announced once when it appears and does
 * not interrupt.
 *
 * ## No animation
 *
 * There is no shimmer. The build gate rejects `@keyframes` outright and the
 * app ships zero, which is a deliberate constraint rather than an oversight:
 * the whole dataset is 7.2 KB gzipped and precached, so this state is visible
 * for a few hundred milliseconds on a first visit and never again.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import { JourneyRow } from './journey-line';

@Component({
  selector: 'app-journey-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JourneyRow],
  styles: `
    :host {
      display: block;
    }

    .block {
      display: block;
      border-radius: var(--gmm-radius-button);
      background-color: var(--gmm-skeleton);
    }

    /* Each block matches the box the real content will occupy, so the answer
       lands in place rather than pushing the page around. The station name is
       30px at line-height 1.15 = 35px; the countdown is 96px at 0.8 = 77px. */
    .name {
      block-size: 35px;
      inline-size: 70%;
    }

    .here {
      block-size: 22px;
      inline-size: 40%;
      margin-block-start: 10px;
    }

    .tag {
      block-size: 22px;
      inline-size: 60%;
    }

    .countdown {
      block-size: 77px;
      inline-size: 45%;
      margin-block-start: var(--gmm-space-3);
    }

    .meta {
      block-size: 22px;
      inline-size: 55%;
      margin-block-start: var(--gmm-space-3);
    }

    .train {
      padding-block: var(--gmm-space-5) 22px;
    }

    /* The board's own skeleton: the header and one tile per direction, in
       the board's layout (see BoardPanel and BoardLane). */
    .board {
      margin-block-start: var(--gmm-space-5);
      container-type: inline-size;
      background-color: var(--gmm-soft);
    }

    .board-header {
      padding: 14px var(--gmm-space-4) 10px;
    }

    .board-heading {
      block-size: 21px;
      inline-size: 40%;
    }

    .tiles {
      display: grid;
      gap: var(--gmm-space-2);
      padding: 0 var(--gmm-space-2) var(--gmm-space-2);
    }

    @container (min-width: 40rem) {
      .tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .tile {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-3);
      padding: var(--gmm-space-3) 14px;
      border: 1px solid var(--gmm-rule);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-bg);
    }

    .tile-badge {
      flex-shrink: 0;
      inline-size: 2.25rem;
      block-size: 2.25rem;
    }

    .tile-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }

    .tile-line {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    /* The name (18px at 1.3) and the countdown (32px at 1.1), then the
       16px line under them. */
    .tile-name {
      block-size: 23px;
      inline-size: 45%;
    }

    .tile-count {
      block-size: 35px;
      inline-size: 24%;
    }

    .tile-small {
      block-size: 20px;
      inline-size: 30%;
    }

    /* The status message is visible text, not a visually-hidden one: a reader
       on a slow connection should be told what is happening too. */
    .status {
      margin-block-start: var(--gmm-space-4);
      padding-inline: var(--gmm-gutter-mobile);
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }
  `,
  template: `
    <div aria-hidden="true">
      <!-- The real rail and the real nodes, greyed. Not an imitation of them. -->
      <app-journey-row node="origin" kind="first" variant="muted">
        <span class="block name"></span>
        <span class="block here"></span>
      </app-journey-row>

      <app-journey-row node="none" kind="through" variant="muted">
        <div class="train">
          <span class="block tag"></span>
          <span class="block countdown"></span>
          <span class="block meta"></span>
        </div>
      </app-journey-row>

      <app-journey-row node="destination" kind="last" variant="muted">
        <span class="block name"></span>
      </app-journey-row>

      @if (board()) {
        <div class="board">
          <div class="board-header">
            <span class="block board-heading"></span>
          </div>
          <div class="tiles">
            @for (lane of LANES; track lane) {
              <div class="tile">
                <span class="block tile-badge"></span>
                <div class="tile-body">
                  <div class="tile-line">
                    <span class="block tile-name"></span>
                    <span class="block tile-count"></span>
                  </div>
                  <div class="tile-line">
                    <span class="block tile-small"></span>
                    <span class="block tile-small"></span>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>

    <p class="status" role="status">{{ t('common.loading') }}</p>
  `,
  host: {
    'aria-busy': 'true',
  },
})
export class JourneySkeleton {
  protected readonly t = inject(I18nService).t;

  /** Draw the departure board's skeleton under the journey's. */
  readonly board = input<boolean>(true);

  /** Two lanes: the board draws both directions before it knows the station. */
  protected readonly LANES = ['aluva', 'tripunithura'] as const;
}
