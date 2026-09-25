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

    /* The board panel's own skeleton: the header, the track and two lanes. */
    .board {
      margin-block-start: var(--gmm-space-5);
      padding-block: var(--gmm-space-4);
      background-color: var(--gmm-soft);
    }

    .board-inner {
      padding-inline: var(--gmm-gutter-mobile);
    }

    .board-heading {
      block-size: 20px;
      inline-size: 40%;
    }

    .board-track {
      block-size: 10px;
      inline-size: 100%;
      margin-block-start: var(--gmm-space-4);
      border-radius: var(--radius-full);
    }

    .lanes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--gmm-space-6);
      margin-block-start: var(--gmm-space-4);
    }

    .lane-head {
      block-size: 20px;
      inline-size: 70%;
    }

    /* 52px at line-height 0.8 = 42px, the board countdown's real box. */
    .lane-countdown {
      block-size: 42px;
      inline-size: 60%;
      margin-block-start: var(--gmm-space-3);
    }

    .lane-clock {
      block-size: 22px;
      inline-size: 90%;
      margin-block-start: var(--gmm-space-3);
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
          <div class="board-inner">
            <span class="block board-heading"></span>
            <span class="block board-track"></span>
            <div class="lanes">
              <div>
                <span class="block lane-head"></span>
                <span class="block lane-countdown"></span>
                <span class="block lane-clock"></span>
              </div>
              <div>
                <span class="block lane-head"></span>
                <span class="block lane-countdown"></span>
                <span class="block lane-clock"></span>
              </div>
            </div>
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
}
