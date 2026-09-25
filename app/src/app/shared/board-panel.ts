/**
 * The departure board. DESIGN.md §5.4.
 *
 * A soft-grey card: a header, one white tile per direction (`BoardLane`), and
 * a "Full board" footer. Both directions are in the one card, Aluva first —
 * the same fixed order as the network strip and the map, so a daily reader
 * finds their direction in the same place every time.
 *
 * The tiles stack in one column, and sit side by side once the card itself is
 * 640px wide (a container query, so it follows the card rather than the
 * window: home's desktop board is a 519px column and stays stacked; the
 * station page's full-width board goes to two).
 *
 * ## Provenance
 *
 * The header's right-hand side says "Timetable · 6:16 PM" and never "Live".
 * CLAUDE.md's honesty rules are explicit that the times here are scheduled,
 * and this is the most prominent place the product says so. The word
 * "Timetable" is the claim; the clock beside it is when it was read.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../core/i18n/i18n';

import { BoardLane } from './board-lane';
import type { BoardView } from './board-view';

@Component({
  selector: 'app-board-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardLane, RouterLink],
  styles: `
    /* A size container, for the two-column query below. Containment means the
       card no longer takes its width from its contents, so it takes it from
       its column explicitly — centred with auto margins, as the station page
       does on desktop, it would otherwise shrink to nothing. */
    :host {
      display: block;
      inline-size: 100%;
      container-type: inline-size;
      background-color: var(--gmm-soft);
    }

    /* "DEPARTURES" and "Timetable · 6:16 PM". Wraps rather than truncating:
       a provenance line that can be cut off is worse than none. */
    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--gmm-space-1) var(--gmm-space-3);
      padding: 14px var(--gmm-space-4) 10px;
    }

    /* Section label: 16px, 600, uppercase, +0.05em (DESIGN.md §3). */
    .heading {
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
      text-wrap: wrap;
      color: var(--gmm-ink);
    }

    /* Malayalam takes no uppercase and no added tracking (DESIGN.md §3). */
    :host-context([lang='ml']) .heading {
      text-transform: none;
      letter-spacing: normal;
      line-height: 1.45;
    }

    /* ink-2 is 6.59:1 on the soft card. */
    .provenance {
      margin: 0;
      font-size: var(--text-min);
      line-height: 1.4;
      text-wrap: balance;
      color: var(--gmm-ink-2);
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

      /* A terminus has one direction; it takes the whole row. */
      .tiles > app-board-lane:only-child {
        grid-column: 1 / -1;
      }
    }

    /* "Full board ›" — the whole width of the card, 48px (DESIGN.md §5.4). */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      min-block-size: 48px;
      padding-inline: var(--gmm-space-4);
      border-block-start: 1px solid var(--gmm-rule);
      color: var(--gmm-ink);
      font-size: var(--text-min);
      font-weight: 600;
      text-decoration: none;
      touch-action: manipulation;
      transition:
        color var(--gmm-hover) var(--gmm-ease),
        background-color var(--gmm-press) var(--gmm-ease);
    }

    /* Inset, so the focus outline is not cut off by a card with rounded,
       clipped corners — which is how home and route present this one. */
    .footer:focus-visible {
      outline-offset: calc(-1 * var(--gmm-focus-width));
    }

    .footer:hover {
      color: var(--gmm-line-text);
    }

    .footer:active {
      color: var(--gmm-line-text);
      background-color: var(--gmm-line-soft);
    }

    .footer svg {
      flex-shrink: 0;
      inline-size: 1.25em;
      block-size: 1.25em;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  template: `
    <section [attr.aria-label]="t('board.heading')">
      <div class="header">
        <h2 class="heading">{{ t('board.heading') }}</h2>
        <!--
          Provenance. Never "Live" — these are timetable times, and saying
          otherwise is the one thing the honesty rules forbid outright.
        -->
        <p class="provenance tabular">{{ provenance() }}</p>
      </div>

      <div class="tiles">
        @if (aluva(); as lane) {
          <app-board-lane
            side="aluva"
            [towardsName]="lane.towardsName"
            [rows]="lane.rows"
            [isYours]="yourDirection() === lane.direction"
            [opensAt]="opensAt()"
            [followingCount]="followingCount()"
          />
        }
        @if (tripunithura(); as lane) {
          <app-board-lane
            side="tripunithura"
            [towardsName]="lane.towardsName"
            [rows]="lane.rows"
            [isYours]="yourDirection() === lane.direction"
            [opensAt]="opensAt()"
            [followingCount]="followingCount()"
          />
        }
      </div>

      @if (fullBoardPath(); as path) {
        <a class="footer" [routerLink]="path">
          <span>{{ t('board.fullBoard') }}</span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
      }
    </section>
  `,
})
export class BoardPanel {
  protected readonly t = inject(I18nService).t;

  /**
   * Both platforms, in whatever order the engine produced them.
   *
   * They are sorted here by `direction`, not by position in the array, so
   * Aluva is always first and a caller passing them the other way round
   * cannot silently reorder the board.
   *
   * `direction_id = 1` is towards Aluva and `0` towards Tripunithura, derived
   * from the feed rather than assumed — CLAUDE.md finding 10.
   */
  readonly boards = input.required<readonly BoardView[]>();

  /** The direction the reader is travelling, or null if no destination is set. */
  readonly yourDirection = input<number | null>(null);

  /** "Timetable · 6:16 PM", or "Saved 5:40 PM" when the data is a fallback. */
  readonly provenance = input.required<string>();

  /** Where "Full board ›" goes. Omitted on the station page, which *is* the full board. */
  readonly fullBoardPath = input<string | null>(null);

  /** When the first train runs tomorrow. Shown in the closed state. */
  readonly opensAt = input<string | null>(null);

  /** Departures listed after the next one: 2 on home, 4 on the station board. */
  readonly followingCount = input<number>(2);

  /** The towards-Aluva platform. Absent at Aluva itself. */
  protected readonly aluva = computed(
    () => this.boards().find((board) => board.direction === 1) ?? null,
  );

  /** The towards-Tripunithura platform. Absent at Tripunithura itself. */
  protected readonly tripunithura = computed(
    () => this.boards().find((board) => board.direction === 0) ?? null,
  );
}
