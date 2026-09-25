/**
 * One lane of the departure board. DESIGN.md §5.4.
 *
 * A lane is one direction's column: a head naming the terminus, an optional
 * "Your train" tag, the big countdown, the clock-and-stations line, and then
 * the following departures.
 *
 * ## The alignment rule, which is the whole reason this is a component
 *
 * Two lanes sit side by side in a 2-column grid and the reader compares them
 * across. That only works if the countdowns are on the same baseline and the
 * following rows line up — otherwise "2 min" and "5 min" are at different
 * heights and the eye has to work out which is which before it can compare
 * them at all.
 *
 * Two things break that alignment, and both are conditional on one lane only:
 *
 *   * **the "Your train" tag**, which appears over the countdown of the lane
 *     serving the reader's destination and nowhere else; and
 *   * **the "Ends at Muttom" short-working line**, which CLAUDE.md finding 10
 *     requires on the 20 trips that terminate early — and which, per finding 9,
 *     appears on the *towards-Aluva* lane at 20 of 24 weekday platforms and
 *     almost never on the other one. So the asymmetric case is the common one
 *     here, not an edge case.
 *
 * Both are solved the same way: the lane that does not have the thing renders
 * an `aria-hidden` spacer of exactly the same height. That is why
 * `reserveTag` and `reserveShortWorking` are inputs rather than being derived
 * from this lane's own data — a lane cannot know what the other lane is doing,
 * so the board tells it.
 *
 * The heights are shared constants rather than magic numbers in two places,
 * and `board-lane.spec.ts` asserts that a lane with the line and a lane with
 * only the reservation come out the same height.
 *
 * ## What is not negotiable in here
 *
 * The short-working line is body-sized, in `--gmm-amber` (5.72:1 on the soft
 * panel), and carries an icon as well as a colour. It is the label that keeps
 * an Aluva passenger off a train that stops at Muttom depot, and it has never
 * been allowed to be small print.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import type { DepartureRow } from './board-view';

/**
 * The height reserved for the "Your train" tag, in px.
 *
 * It is the tag's own line box: 16px text at line-height 1.375. A lane without
 * the tag reserves exactly this, so both lanes' countdowns share a baseline.
 */
export const TAG_HEIGHT = 22;

/**
 * The height reserved for the "Ends at Muttom" line, in px.
 *
 * Same box as the tag — 16px text at 1.375 — because it is the same size text
 * on one line. Kept as its own constant anyway: the two are equal today by
 * arithmetic, not by intent, and a future change to one must not silently
 * move the other.
 */
export const SHORT_WORKING_HEIGHT = 22;

/** Which end of the line this lane points at. Decides the head's arrow and alignment. */
export type LaneSide = 'aluva' | 'tripunithura';

@Component({
  selector: 'app-board-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--gmm-space-2);
      min-inline-size: 0;
    }

    /* The lane head: "← ALUVA" / "TRIPUNITHURA →". Pill badge for clear directional framing. */
    .head {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: var(--tracking-lane);
      text-transform: uppercase;
      color: var(--gmm-ink);
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.05);
      width: fit-content;
      margin-block-end: 2px;
    }

    :host(.is-yours) .head {
      background: var(--gmm-line-soft);
      color: var(--gmm-line-text);
    }

    /* Malayalam is never uppercased and takes no added tracking — DESIGN.md §3. */
    :host-context([lang='ml']) .head {
      text-transform: none;
      letter-spacing: normal;
    }

    .lane-aluva:not(.is-single) .head,
    .lane-aluva:not(.is-single) .tag,
    .lane-aluva:not(.is-single) .countdown,
    .lane-aluva:not(.is-single) .clock-line {
      justify-content: flex-start;
      text-align: start;
    }

    .lane-tripunithura:not(.is-single) .head,
    .lane-tripunithura:not(.is-single) .tag,
    .lane-tripunithura:not(.is-single) .countdown,
    .lane-tripunithura:not(.is-single) .clock-line {
      justify-content: flex-end;
      text-align: end;
    }

    :host(.is-single) .head,
    :host(.is-single) .tag,
    :host(.is-single) .countdown,
    :host(.is-single) .clock-line {
      justify-content: flex-start;
      text-align: start;
    }

    .head-arrow {
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* The "Your train" tag, and the spacer that stands in for it. Both are
       exactly TAG_HEIGHT so the countdowns below them share a baseline. */
    .tag,
    .tag-spacer {
      min-block-size: 22px;
    }

    .tag {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-2);
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.375;
      color: var(--gmm-line-text);
    }

    /* The square beside "Your train" */
    .tag-mark {
      flex-shrink: 0;
      fill: currentColor;
    }

    /* The countdown: consistent locked height so adjacent lanes share exact baselines */
    .countdown {
      display: flex;
      align-items: baseline;
      gap: var(--gmm-space-1);
      font-size: var(--text-countdown-board);
      font-weight: 700;
      line-height: 0.9;
      letter-spacing: var(--tracking-board);
      color: var(--gmm-ink);
      min-block-size: 44px;
    }

    .countdown.is-word {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
      min-block-size: 44px;
      display: flex;
      align-items: center;
    }

    @media (min-width: 1024px) {
      .countdown {
        font-size: var(--text-countdown-board-lg);
        line-height: 0.95;
        min-block-size: 52px;
      }

      .countdown.is-word {
        font-size: 2.125rem;
        line-height: 1;
        min-block-size: 52px;
      }
    }

    :host(.is-yours) .countdown {
      color: var(--gmm-line-text);
    }

    .countdown-unit {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
      margin-inline-start: 2px;
    }

    /* "6:21 PM · 17 stations" - clean single-line fit that never breaks or wraps */
    .clock-line {
      font-size: 0.8125rem;
      line-height: 1.35;
      color: var(--gmm-ink-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-inline-size: 100%;
      margin-block-end: 2px;
    }

    /* A following departure: hairline top border, time left, countdown right. */
    .following-row {
      inline-size: 100%;
      padding-block: 8px;
      border-block-start: 1px solid var(--gmm-rule);
      margin-block-start: 4px;
    }

    .following {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--gmm-space-2);
      line-height: 1.3;
    }

    .following-clock {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .following-countdown {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--gmm-ink-2);
    }

    /* Rendered in every document, shown only at 1024px and above. DESIGN.md
       §5.4: home shows 1 following train on a phone and 3 on desktop.
       Removed from the box tree rather than visually hidden, because a row a sighted
       reader cannot see must not be read out either — it is a duplicate of
       what the station board shows in full, not hidden information. */
    .following-row.is-wide-only {
      display: none;
    }

    @media (min-width: 1024px) {
      .following-row.is-wide-only {
        display: block;
      }
    }

    /* The short-working line, and the spacer the other lane uses to match it.
       CLAUDE.md finding 10: this is the label that keeps a passenger off a
       train that stops at Muttom depot. Body-sized, amber (5.72:1 on soft),
       with an icon — never small print, never colour alone. */
    .short-working,
    .short-working-spacer {
      min-block-size: 22px;
    }

    /* A spacer that only desktop needs, because the short working it matches
       is on a row only desktop renders. Zero height below the breakpoint, so a
       phone never carries a blank band it cannot account for. */
    .short-working-spacer.is-wide-only {
      display: none;
    }

    @media (min-width: 1024px) {
      .short-working-spacer.is-wide-only {
        display: block;
      }
    }

    .short-working {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-2);
      font-size: var(--text-min);
      line-height: 1.375;
      color: var(--gmm-amber);
    }

    .short-working-icon {
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* The closed state. Grey line, and the lane says so in words. */
    .closed {
      font-size: var(--text-arrival);
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .lane-aluva .closed,
    .lane-aluva .closed-sub {
      text-align: start;
    }

    .lane-tripunithura .closed,
    .lane-tripunithura .closed-sub {
      text-align: end;
    }

    .closed-sub {
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }
  `,
  template: `
    <div class="head">
      @if (side() === 'aluva') {
        <svg viewBox="0 0 24 24" width="18" height="18" class="head-arrow" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="M11 6l-6 6 6 6" />
        </svg>
        <span>{{ towardsName() }}</span>
      } @else {
        <span>{{ towardsName() }}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" class="head-arrow" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      }
    </div>

    <!--
      The tag, or the space it would have taken. One of the two always renders,
      so both lanes' countdowns sit on the same baseline.
    -->
    @if (isYours()) {
      <p class="tag">
        <svg viewBox="0 0 10 10" width="10" height="10" class="tag-mark" aria-hidden="true">
          <rect width="10" height="10" rx="2" />
        </svg>
        <span>{{ t('board.yourTrain') }}</span>
      </p>
    } @else if (reserveTag()) {
      <div class="tag-spacer" aria-hidden="true"></div>
    }

    @if (next(); as row) {
      <!--
        The countdown carries an aria-label because "5" and "min" are separate
        elements with a gap between them, and the raw text nodes read as two
        unrelated fragments. The label names the direction too, since a lane's
        heading is above it rather than beside it.
      -->
      <p
        class="countdown tabular"
        [class.is-word]="countdownUnit() === null"
        [attr.aria-label]="t('board.laneCountdownLabel', {
          name: towardsName(),
          countdown: row.countdown,
        })"
      >
        <span aria-hidden="true">{{ countdownNumber() }}</span>
        @if (countdownUnit(); as unit) {
          <span class="countdown-unit" aria-hidden="true">{{ unit }}</span>
        }
      </p>

      <p class="clock-line tabular">
        {{ t('board.clockAndStations', { clock: row.clock, count: servesCount() }) }}
      </p>

      @for (row of following(); track row.key; let i = $index) {
        <div
          class="following-row"
          [class.is-wide-only]="narrowCount() !== null && i >= narrowCount()!"
        >
          <p class="following tabular">
            <span class="following-clock">{{ row.clock }}</span>
            <span class="following-countdown">{{ row.countdown }}</span>
          </p>

          <!--
            Finding 10. The 20 trips that terminate early are labelled here,
            and the other lane reserves the same height so the rows below stay
            level across the board.
          -->
          @if (row.shortTurn) {
            <p class="short-working">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                class="short-working-icon"
                aria-hidden="true"
              >
                <path d="M5 12h11" />
                <path d="M19 6v12" />
              </svg>
              <span aria-hidden="true">{{ t('board.endsAt', { terminus: row.terminusName }) }}</span>
              <!--
                DESIGN.md 5.4 wants the short visible label "Ends at Muttom".
                But that says where the train stops, not that it will not get
                you where you are going - which is the whole point (CLAUDE.md
                finding 9: at 20 weekday platforms the last towards-Aluva
                departure terminates at the depot). The full sentence is kept
                for assistive tech and as the regression guard.
              -->
              <span class="sr-only">{{
                t('board.shortTurn', { terminus: row.terminusName, misses: towardsName() })
              }}</span>
            </p>
          } @else if (reserveShortWorking() || reserveShortWorkingWide()) {
            <div
              class="short-working-spacer"
              [class.is-wide-only]="!reserveShortWorking()"
              aria-hidden="true"
            ></div>
          }
        </div>
      }
    } @else {
      <!-- No service. Said in words, not by a grey line alone. -->
      <p class="closed">{{ t('board.closed') }}</p>
      @if (opensAt(); as clock) {
        <p class="closed-sub tabular">{{ t('board.opensAt', { clock }) }}</p>
      }
    }
  `,
  host: {
    '[class]': 'laneClass()',
    '[class.is-yours]': 'isYours()',
    '[class.is-single]': 'isSingleLane()',
  },
})
export class BoardLane {
  protected readonly t = inject(I18nService).t;

  readonly isSingleLane = input<boolean>(false);

  /** Which end of the line. Decides the arrow, the alignment and nothing else. */
  readonly side = input.required<LaneSide>();

  /** The terminus, read from the end of the line — never hardcoded. */
  readonly towardsName = input.required<string>();

  /** This lane's departures, soonest first. Empty when nothing more runs today. */
  readonly rows = input.required<readonly DepartureRow[]>();

  /** How many stations this platform serves. Shown beside the clock. */
  readonly servesCount = input<number>(0);

  /** True when this lane serves the reader's destination. */
  readonly isYours = input<boolean>(false);

  /**
   * Reserve the tag's height although this lane has no tag.
   *
   * Set by the board when the *other* lane is the reader's, so the countdowns
   * share a baseline. A lane cannot work this out for itself.
   */
  readonly reserveTag = input<boolean>(false);

  /** Reserve the short-working line's height on every following row. Same reason. */
  readonly reserveShortWorking = input<boolean>(false);

  /**
   * Reserve it at 1024px and above only, for a short working that falls on a
   * row only desktop renders. See `BoardPanel.reserveShortWorkingWide`.
   */
  readonly reserveShortWorkingWide = input<boolean>(false);

  /** When the first train runs tomorrow. Only read in the closed state. */
  readonly opensAt = input<string | null>(null);

  /** How many following departures to show under the countdown. */
  readonly followingCount = input<number>(1);

  /**
   * How many to show at 1024px and above. Defaults to `followingCount`.
   *
   * DESIGN.md §5.4 asks for 1 following train on home, 4 on the station board
   * and 3 on desktop, so home's count genuinely changes with the viewport.
   *
   * It is done by **rendering the wide count always and hiding the surplus
   * rows in CSS**, not by reading `matchMedia`. A media-query signal is wrong
   * here twice over: the prerendered HTML has no viewport, so every one of the
   * 1,252 documents would be built at the narrow count and then visibly grow a
   * row on hydration; and the extra departures would exist only once
   * JavaScript had run, which puts reference content behind a script (CLAUDE.md
   * search strategy 1). Two hidden rows cost about 60 bytes of HTML.
   */
  readonly followingCountWide = input<number | null>(null);

  protected readonly laneClass = computed(() => `lane-${this.side()}`);

  protected readonly next = computed(() => this.rows()[0] ?? null);

  /** The widest count either breakpoint asks for. Everything rendered. */
  protected readonly followingShown = computed(() =>
    Math.max(this.followingCount(), this.followingCountWide() ?? 0),
  );

  protected readonly following = computed(() => this.rows().slice(1, 1 + this.followingShown()));

  /**
   * The index at which rows become desktop-only, or null when both breakpoints
   * show the same number. Drives `.is-wide-only` on the rows past it.
   */
  protected readonly narrowCount = computed(() =>
    this.followingShown() > this.followingCount() ? this.followingCount() : null,
  );

  /**
   * The countdown split into its number and its unit, so the unit can be set at
   * 18px beside a 52px figure.
   *
   * `countdown` arrives already formatted ("Due", "6 min", "1 h 12 min") and is
   * **not** re-parsed into components here — it is split on the first space,
   * once. "Due" has no space, so it renders whole at the large size with no
   * unit, which is correct: it is a word, not a quantity.
   *
   * The 52px size has `line-height: 0.8`, which is safe for digits because
   * they have no descenders. "Due" is the one value that reaches it as
   * letters, and it has none either — no descender in D, u or e. A value that
   * did would clip, so a new formatter output has to be checked against this.
   */
  protected readonly countdownNumber = computed(() => {
    const text = this.next()?.countdown ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? text : text.slice(0, space);
  });

  protected readonly countdownUnit = computed(() => {
    const text = this.next()?.countdown ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? null : text.slice(space + 1);
  });
}
