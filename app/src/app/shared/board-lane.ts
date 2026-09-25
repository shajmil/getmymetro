/**
 * One direction of the departure board, as a tile. DESIGN.md §5.4.
 *
 *   [←]  Aluva                       2 min
 *        6:18 PM            then 9, 16 min
 *
 * Read across, each line is one phrase: "Aluva … 2 min", then "6:18 PM …
 * then 9, 16 min". Read down, the left is the next train — where, and the
 * clock the platform display shows — and the right is how long, then the
 * trains after it, so "then" always comes after the train it follows. With
 * "then 6:32 AM" under the name it read as "Aluva then 6:32" before the eye
 * reached the next train's 6:17. Each tile stands on its own, so two tiles
 * never have to be kept level with each other.
 *
 * Across the night the clock leads instead: "6:00 AM", with "In 5 h 14 min"
 * or "Tomorrow" under it. `DISTANT_SECONDS` in `board-view.ts` says when.
 *
 * Nothing here is under 16px (DESIGN.md §3) and every colour is a token.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import type { DepartureRow } from './board-view';

/** Which end of the line this tile points at. Decides the badge's arrow. */
export type LaneSide = 'aluva' | 'tripunithura';

@Component({
  selector: 'app-board-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-3);
      min-inline-size: 0;
      padding: var(--gmm-space-3) 14px;
      border: 1px solid var(--gmm-rule);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-bg);
    }

    /* Your direction: the selected-row ground and a line-text edge, and the
       tag says so in words, because colour never carries meaning alone. */
    :host(.is-yours) {
      border-color: var(--gmm-line-text);
      background-color: var(--gmm-line-soft);
    }

    p {
      margin: 0;
    }

    /* The line's colour as the tile's mark. White on line-text is 5.82:1,
       which the arrow needs as a meaningful graphic. In rem, so it grows
       with the text. */
    .badge {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      inline-size: 2.25rem;
      block-size: 2.25rem;
      border-radius: var(--gmm-radius-button);
      background-color: var(--gmm-line-text);
      color: var(--gmm-bg);
    }

    .badge svg {
      inline-size: 1.25rem;
      block-size: 1.25rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-inline-size: 0;
    }

    /* Two lines, each a left and a right part. When they do not fit — in
       Malayalam, or at 200% text — the right part drops under the left and
       stays on the right, rather than squeezing. */
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      column-gap: var(--gmm-space-3);
    }

    .head {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: var(--tracking-tight);
      text-wrap: wrap;
      color: var(--gmm-ink);
    }

    :host-context([lang='ml']) .head {
      letter-spacing: normal;
      line-height: 1.45;
    }

    .countdown {
      display: flex;
      align-items: baseline;
      gap: 3px;
      margin-inline-start: auto;
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.04em;
      white-space: nowrap;
      color: var(--gmm-ink);
    }

    /* "Arriving", "Closed": words, not quantities. */
    .countdown.is-word {
      font-size: 1.25rem;
      letter-spacing: var(--tracking-tight);
    }

    :host(.is-yours) .countdown {
      color: var(--gmm-line-text);
    }

    .unit {
      font-size: var(--text-min);
      letter-spacing: normal;
    }

    .when,
    .then {
      font-size: var(--text-min);
      line-height: 1.45;
    }

    /* The next train's clock, under the name: part of the answer, so ink. */
    .when {
      font-weight: 500;
      white-space: nowrap;
      color: var(--gmm-ink);
    }

    /* The trains after it, under the countdown they continue. Stays on the
       right when it has to wrap under the clock. */
    .then {
      margin-inline-start: auto;
      text-align: end;
      color: var(--gmm-ink-2);
    }

    .tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.4;
      color: var(--gmm-line-text);
    }

    .tag svg {
      inline-size: 0.625em;
      block-size: 0.625em;
      fill: currentColor;
    }
  `,
  template: `
    <span class="badge" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        @if (side() === 'aluva') {
          <path d="M19 12H5" />
          <path d="M11 6l-6 6 6 6" />
        } @else {
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        }
      </svg>
    </span>

    <div class="body">
      @if (isYours()) {
        <p class="tag">
          <svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" /></svg>
          <span>{{ t('board.yourTrain') }}</span>
        </p>
      }

      <div class="line">
        <h3 class="head" [attr.aria-label]="t('board.towards', { name: towardsName() })">
          {{ towardsName() }}
        </h3>

        @if (next(); as row) {
          <!--
            The figure and its unit are hidden and the sentence beside them is
            what is read: "5" and "min" as two fragments mean nothing.
          -->
          <p class="countdown tabular" [class.is-word]="heroUnit() === null">
            <span class="sr-only">{{
              t('board.laneCountdownLabel', {
                name: towardsName(),
                countdown: row.distant ? row.clock : row.countdown,
              })
            }}</span>
            <span aria-hidden="true">{{ heroNumber() }}</span>
            @if (heroUnit(); as unit) {
              <span class="unit" aria-hidden="true">{{ unit }}</span>
            }
          </p>
          <!-- Not shown on the board (product decision); read out only. -->
          @if (row.shortTurn) {
            <p class="sr-only">{{
              t('board.shortTurn', { terminus: row.terminusName, misses: towardsName() })
            }}</p>
          }
        } @else {
          <!-- No service. Said in words, not by an empty tile. -->
          <p class="countdown is-word closed">{{ t('board.closed') }}</p>
        }
      </div>

      <div class="line">
        @if (next(); as row) {
          <p class="when tabular">{{ when() }}</p>
          @if (then(); as text) {
            <p class="then tabular">{{ text }}</p>
          }
        } @else if (opensAt(); as clock) {
          <p class="when closed-sub tabular">{{ t('board.opensAt', { clock }) }}</p>
        }
      </div>
    </div>
  `,
  host: {
    '[class]': 'laneClass()',
    '[class.is-yours]': 'isYours()',
  },
})
export class BoardLane {
  protected readonly t = inject(I18nService).t;

  /** Which end of the line. Decides the arrow and nothing else. */
  readonly side = input.required<LaneSide>();

  /** The terminus, read from the end of the line — never hardcoded. */
  readonly towardsName = input.required<string>();

  /** This direction's departures, soonest first. Empty when nothing more runs today. */
  readonly rows = input.required<readonly DepartureRow[]>();

  /** True when this direction serves the reader's destination. */
  readonly isYours = input<boolean>(false);

  /** When the first train runs tomorrow. Only read in the closed state. */
  readonly opensAt = input<string | null>(null);

  /** How many departures after the next one to list: 2 on home, 4 on the station board. */
  readonly followingCount = input<number>(2);

  protected readonly laneClass = computed(() => `lane-${this.side()}`);

  protected readonly next = computed(() => this.rows()[0] ?? null);

  /**
   * What the big figure says: the countdown, or the clock once the wait is an
   * hour or more — "6:00 AM" rather than "5 h 14 min".
   *
   * Either arrives already formatted ("Arriving", "6 min", "6:00 AM") and is
   * split on its first space, once, so the unit can be set small beside the
   * figure. "Arriving" has no space and renders whole, as a word. The
   * Malayalam forms split the same way.
   */
  readonly #hero = computed(() => {
    const row = this.next();
    if (row === null) return '';
    return row.distant ? row.clock : row.countdown;
  });

  protected readonly heroNumber = computed(() => {
    const text = this.#hero();
    const space = text.indexOf(' ');
    return space === -1 ? text : text.slice(0, space);
  });

  protected readonly heroUnit = computed(() => {
    const text = this.#hero();
    const space = text.indexOf(' ');
    return space === -1 ? null : text.slice(space + 1);
  });

  /** Under the name: the clock, or — when the clock is the figure — how far off it is. */
  protected readonly when = computed(() => {
    const row = this.next();
    if (row === null) return '';
    if (!row.distant) return row.clock;
    return row.nextDay ? this.t('board.tomorrow') : this.t('board.inWait', { wait: row.countdown });
  });

  /**
   * "then 9, 16 min": what missing the next train costs, in minutes.
   *
   * Across the night a wait in minutes is meaningless, so the first train
   * after a distant one is named by its clock instead — "then 6:15 AM".
   */
  protected readonly then = computed<string | null>(() => {
    const following = this.rows().slice(1, 1 + this.followingCount());
    if (following.length === 0) return null;
    if (following[0].distant) return this.t('board.then', { clock: following[0].clock });

    const minutes: string[] = [];
    for (const row of following) {
      const space = row.countdown.indexOf(' ');
      if (row.distant || space === -1) break;
      minutes.push(row.countdown.slice(0, space));
    }
    return this.t('board.thenMinutes', { list: minutes.join(', ') });
  });
}
