/**
 * One lane of the departure board. DESIGN.md §5.4.
 *
 * A lane is one direction: a head naming the terminus, an optional "Your
 * train" tag, the next train, and then the following departures.
 *
 * ## Two layouts, one DOM
 *
 * **Below 1024px the lanes stack.** Each is a full-width row of the board: the
 * head and the tag share a line, and the next train is the countdown on the
 * left with its clock and the platform's reach on the right. Side by side, a
 * 360px phone gives each lane about 150px, which is too narrow for "6:30 AM"
 * at the 16px floor, for "Ends at Kadavanthra" on one line, or for any of it in
 * Malayalam — the phrases broke mid-way and the reservations below stopped
 * lining anything up. Stacked, every line has the whole width and nothing
 * needs reserving, because nothing sits beside anything.
 *
 * **At 1024px and above the lanes sit side by side** (DESIGN.md §5.4), under
 * the horizontal `LineTrack` whose halves they correspond to, and the
 * alignment rule below applies.
 *
 * The switch is CSS only. A `matchMedia` signal would build every one of the
 * 1,252 prerendered documents at one layout and swap to the other on
 * hydration; see `followingCountWide` for the same argument about rows.
 *
 * ## The alignment rule, side by side only
 *
 * Two lanes side by side are compared across, which only works if the
 * countdowns share a baseline and the following rows line up. Three things
 * break that, and each is conditional on one lane only:
 *
 *   * **the "Your train" tag**, over the lane serving the reader's destination;
 *   * **the "Ends at Muttom" line on the next train**; and
 *   * **the same line on a following row**. CLAUDE.md finding 10 requires it on
 *     the 20 trips that terminate early, and per finding 9 it lands on the
 *     *towards-Aluva* lane at 20 of 24 weekday platforms and almost never on
 *     the other one, so the asymmetric case is the common one here.
 *
 * All three are solved the same way: the lane without the thing renders an
 * `aria-hidden` spacer of the same height. The board decides when, because a
 * lane cannot see the other lane. The spacers are `display: none` below
 * 1024px — a stacked lane has nothing beside it to line up with, and a blank
 * band there would be unexplained.
 *
 * ## What is not negotiable in here
 *
 * The short-working line is body-sized, in `--gmm-amber` (5.72:1 on the soft
 * panel, 5.52:1 on the line-soft ground of your lane), and carries an icon as
 * well as a colour. It is the label that keeps an Aluva passenger off a train
 * that stops at Muttom depot, and it has never been allowed to be small print.
 * It is on the **next** train as well as the following ones: at MG Road after
 * 10:58 PM the next train towards Aluva is the 11:44 PM, which terminates at
 * Muttom, and a board that labels every train except the one being boarded
 * has missed the one that matters.
 *
 * Nothing in here is under 16px (DESIGN.md §3), and every colour is a token.
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

/** Which end of the line this lane points at. Decides the head's arrow. */
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
      padding: var(--gmm-space-3) var(--gmm-space-4) var(--gmm-space-4);
    }

    /* Your lane. DESIGN.md §2's selected-row ground, so the reader's train is
       the first thing found; the tag says so in words as well, because colour
       never carries meaning alone. Every foreground here clears 4.5:1 on it:
       ink 16.64, line-text 5.13, ink-2 6.36, amber 5.52. */
    :host(.is-yours) {
      background-color: var(--gmm-line-soft);
    }

    p {
      margin: 0;
    }

    /* --- head: "← ALUVA", and "■ Your train" beside it on a phone -------- */

    .head-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--gmm-space-1) var(--gmm-space-3);
    }

    /* 16px, 600, uppercase, +0.04em (DESIGN.md §3). An h3 under the board's
       h2, so a screen reader can move lane to lane; it overrides the global
       heading tracking and balance, which are for station names. */
    .head {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-2);
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: var(--tracking-lane);
      text-transform: uppercase;
      text-wrap: wrap;
      color: var(--gmm-ink);
    }

    /* Malayalam is never uppercased, takes no added tracking and needs the
       taller line — DESIGN.md §3. */
    :host-context([lang='ml']) .head {
      text-transform: none;
      letter-spacing: normal;
      line-height: 1.45;
    }

    /* Arrow first on a phone for both lanes, so the two names start at the
       same x and scan as a list. Side by side the Tripunithura arrow goes
       back after the name, pointing out of the board as DESIGN.md §5.4 has
       it; the direction it points is the same either way. */
    .head-arrow {
      flex-shrink: 0;
      order: -1;
      inline-size: 1.125em;
      block-size: 1.125em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .tag {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-2);
      min-block-size: 22px;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.375;
      color: var(--gmm-line-text);
    }

    /* The square beside "Your train": the shape that carries the state when
       the colour does not. */
    .tag-mark {
      flex-shrink: 0;
      inline-size: 0.625em;
      block-size: 0.625em;
      fill: currentColor;
    }

    /* --- the next train ------------------------------------------------ */

    /* Phone: countdown on the left, clock and reach on the right, bottoms
       level. Wraps rather than squeezing, so at 200% text or in Malayalam
       the right-hand part drops under the countdown instead of overflowing. */
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--gmm-space-1) var(--gmm-space-3);
    }

    /* 52px, 600, -0.05em (DESIGN.md §3). line-height 0.9 is safe because the
       glyphs at this size are digits, a colon, or "Arriving", none of which
       descend; the reservation keeps "Arriving" from making the row jump. */
    .countdown {
      display: flex;
      align-items: baseline;
      gap: var(--gmm-space-1);
      min-block-size: calc(var(--text-countdown-board) * 0.9);
      font-size: var(--text-countdown-board);
      font-weight: 600;
      line-height: 0.9;
      letter-spacing: var(--tracking-board);
      color: var(--gmm-ink);
    }

    .countdown.is-word {
      align-items: flex-end;
      font-size: 1.5rem;
      line-height: 1.2;
      letter-spacing: var(--tracking-tight);
    }

    :host(.is-yours) .countdown {
      color: var(--gmm-line-text);
    }

    /* "min" beside the figure, "AM" beside a clock. 18px, not the hero's
       0.23em: 23% of 52px is 12px, under the floor. */
    .countdown-unit {
      font-size: 1.125rem;
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
    }

    /* The auto margin keeps it in the right-hand column when it wraps under
       the countdown, rather than dropping to the left edge. */
    .when {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-inline-size: 0;
      margin-inline-start: auto;
      line-height: 1.45;
      text-align: end;
      color: var(--gmm-ink-2);
    }

    /* The departure clock: 22px, 600 (DESIGN.md §3's quieter time), with the
       meridiem at 16px in ink-2. */
    .when-clock {
      font-size: var(--text-arrival);
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: var(--tracking-time);
      color: var(--gmm-ink);
      white-space: nowrap;
    }

    .when-meridiem {
      font-size: var(--text-min);
      font-weight: 500;
      letter-spacing: normal;
      color: var(--gmm-ink-2);
    }

    /* "in 5 h 14 min" / "Tomorrow", where the clock went once the clock
       became the big figure. Both take 1.45 from .when, in both languages:
       it is Malayalam's minimum (DESIGN.md §3), and a second rule for it
       would be doubled by encapsulation into a 4 kB component budget. */
    .when-wait {
      font-size: var(--text-min);
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .when-count {
      font-size: var(--text-min);
    }

    .when-sep {
      display: none;
    }

    /* --- the short-working line, and the spacers ------------------------- */

    /* CLAUDE.md findings 9 and 10: the label that keeps a passenger off a
       train that stops at Muttom depot. Body-sized, amber, with an icon —
       never small print, never colour alone. Wraps at spaces when it must. */
    .short-working {
      display: flex;
      align-items: flex-start;
      gap: var(--gmm-space-2);
      font-size: var(--text-min);
      font-weight: 500;
      line-height: 1.375;
      color: var(--gmm-amber);
    }

    /* Sized in em so it grows with the text at 200%, and centred on the
       first line: (1.375 - 1) / 2 of the line box. */
    .short-working-icon {
      flex-shrink: 0;
      inline-size: 1em;
      block-size: 1em;
      margin-block-start: 0.1875em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Stand-ins for the tag and the short-working line, side by side only. */
    .tag-spacer,
    .short-working-spacer {
      display: none;
      min-block-size: 22px;
    }

    /* --- following departures ------------------------------------------ */

    /* Hairline above, time (600) left, wait right. */
    .following-row {
      display: flex;
      flex-direction: column;
      gap: var(--gmm-space-1);
      padding-block-start: var(--gmm-space-3);
      border-block-start: 1px solid var(--gmm-rule);
    }

    /* The rule is 1.27:1 on the soft panel and all but vanishes on your
       lane's line-soft ground; the grey keeps the rows visibly separate. */
    :host(.is-yours) .following-row {
      border-block-start-color: var(--gmm-grey);
    }

    .following {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--gmm-space-3);
      font-size: var(--text-min);
      line-height: 1.4;
    }

    .following-clock {
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .following-countdown {
      color: var(--gmm-ink-2);
      text-align: end;
    }

    /* Rendered in every document, shown only at 1024px and above. DESIGN.md
       §5.4: home shows 1 following train on a phone and 3 on desktop.
       Removed from the box tree rather than visually hidden, because a row a
       sighted reader cannot see must not be read out either — it is a
       duplicate of what the station board shows in full. */
    .following-row.is-wide-only {
      display: none;
    }

    /* --- no service ---------------------------------------------------- */

    .closed {
      font-size: var(--text-arrival);
      font-weight: 600;
      line-height: 1.2;
      color: var(--gmm-ink);
    }

    .closed-sub {
      font-size: var(--text-min);
      line-height: 1.4;
      color: var(--gmm-ink-2);
    }

    /* --- side by side -------------------------------------------------- */

    @media (min-width: 1024px) {
      .head-arrow {
        order: 0;
      }

      /* The tag takes its own line, and the other lane reserves it. */
      .head-row {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--gmm-space-2);
      }

      /* The countdown on its own line, the clock and reach under it on one:
         a 230px lane has room for one or the other beside the countdown, not
         both, and wrapping in one lane only would break the alignment. */
      .hero {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--gmm-space-2);
      }

      .countdown {
        min-block-size: calc(var(--text-countdown-board-lg) * 0.9);
        font-size: var(--text-countdown-board-lg);
      }

      .countdown.is-word {
        font-size: 2.125rem;
        line-height: 1.1;
      }

      /* Exactly the 22px clock's line box, so a lane reading "Tomorrow" stays
         level with one reading "11:44 PM". The 16px parts are set solid so
         that, baseline-aligned beside the clock, they never reach past its
         box — mixed sizes on one baseline otherwise grow the line. */
      .when {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: var(--gmm-space-2);
        min-block-size: calc(var(--text-arrival) * 1.2);
        margin-inline-start: 0;
        line-height: 1;
        text-align: start;
      }

      .when-sep {
        display: inline;
      }

      .tag-spacer,
      .short-working-spacer {
        display: block;
      }

      .following-row.is-wide-only {
        display: flex;
      }
    }
  `,
  template: `
    <div class="head-row">
      <h3 class="head" [attr.aria-label]="t('board.towards', { name: towardsName() })">
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
      </h3>

      <!--
        The tag, or — side by side only — the space it would have taken, so
        both lanes' countdowns sit on the same baseline.
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
    </div>

    @if (next(); as row) {
      <div class="hero">
        <!--
          The figure and its unit are two elements with a gap between them,
          which a screen reader reads as two fragments, so they are hidden and
          the sentence beside them is what is read. Text rather than an
          aria-label, which a paragraph is not allowed to carry.
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
            <span class="countdown-unit" aria-hidden="true">{{ unit }}</span>
          }
        </p>

        <p class="when tabular">
          @if (row.distant) {
            <span class="when-wait">{{
              row.nextDay ? t('board.tomorrow') : t('board.inWait', { wait: row.countdown })
            }}</span>
          } @else {
            <span class="when-clock"
              >{{ clockTime() }}<span class="when-meridiem"> {{ clockMeridiem() }}</span></span
            >
          }
          <span class="when-sep" aria-hidden="true">·</span>
          <span class="when-count">{{ stationsLabel() }}</span>
        </p>
      </div>

      <!-- Finding 9: the next train is the one being boarded. -->
      @if (row.shortTurn) {
        <p class="short-working">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            class="short-working-icon"
            aria-hidden="true"
          >
            <path d="M5 12h11" />
            <path d="M19 6v12" />
          </svg>
          <span aria-hidden="true">{{ t('board.endsAt', { terminus: row.terminusName }) }}</span>
          <span class="sr-only">{{
            t('board.shortTurn', { terminus: row.terminusName, misses: towardsName() })
          }}</span>
        </p>
      } @else if (reserveNextShortWorking()) {
        <div class="short-working-spacer" aria-hidden="true"></div>
      }

      @for (row of following(); track row.key; let i = $index) {
        <div
          class="following-row"
          [class.is-wide-only]="narrowCount() !== null && i >= narrowCount()!"
        >
          <!--
            Across the night the date is the useful half: at 11:30 PM "8 h 4
            min" on every row says less than "Tomorrow" does.
          -->
          <p class="following tabular">
            <span class="following-clock">{{ row.clock }}</span>
            <span class="following-countdown">{{
              row.distant && row.nextDay ? t('board.tomorrow') : row.countdown
            }}</span>
          </p>

          <!--
            Finding 10. The 20 trips that terminate early are labelled here,
            and side by side the other lane reserves the same height so the
            rows below stay level across the board.
          -->
          @if (row.shortTurn) {
            <p class="short-working">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
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
          } @else if (reserveShortWorking()) {
            <div class="short-working-spacer" aria-hidden="true"></div>
          }
        </div>
      }
    } @else {
      <!-- No service. Said in words, not by a grey line alone. -->
      <div class="hero">
        <p class="closed">{{ t('board.closed') }}</p>
        @if (opensAt(); as clock) {
          <p class="closed-sub tabular">{{ t('board.opensAt', { clock }) }}</p>
        }
      </div>
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

  /** True at a terminus, where this is the only lane. */
  readonly isSingleLane = input<boolean>(false);

  /** Which end of the line. Decides the arrow and nothing else. */
  readonly side = input.required<LaneSide>();

  /** The terminus, read from the end of the line — never hardcoded. */
  readonly towardsName = input.required<string>();

  /** This lane's departures, soonest first. Empty when nothing more runs today. */
  readonly rows = input.required<readonly DepartureRow[]>();

  /** How many stations this platform serves. Shown beside the next train's clock. */
  readonly servesCount = input<number>(0);

  /** True when this lane serves the reader's destination. */
  readonly isYours = input<boolean>(false);

  /**
   * Reserve the tag's height although this lane has no tag.
   *
   * Set by the board when the *other* lane is the reader's, so the countdowns
   * share a baseline side by side. A lane cannot work this out for itself.
   */
  readonly reserveTag = input<boolean>(false);

  /** Reserve the next train's short-working line. Same reason. */
  readonly reserveNextShortWorking = input<boolean>(false);

  /** Reserve the short-working line's height on every following row. Same reason. */
  readonly reserveShortWorking = input<boolean>(false);

  /** When the first train runs tomorrow. Only read in the closed state. */
  readonly opensAt = input<string | null>(null);

  /** How many following departures to show under the next train. */
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
   * What the big figure says: the countdown, or the clock once the wait is an
   * hour or more (`DISTANT_SECONDS`) — "6:00 AM" rather than "5 h 14 min".
   *
   * Either arrives already formatted ("Arriving", "6 min", "6:00 AM") and is
   * **not** re-parsed into components here — it is split on the first space,
   * once, so the unit can be set at 18px beside a 52px figure. "Arriving" has
   * no space, so it renders whole at the word size, which is correct: it is a
   * word, not a quantity. The Malayalam forms split the same way.
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

  /** "6:21" of "6:21 PM", so the meridiem can be set smaller (DESIGN.md §3). */
  protected readonly clockTime = computed(() => {
    const clock = this.next()?.clock ?? '';
    const space = clock.indexOf(' ');
    return space === -1 ? clock : clock.slice(0, space);
  });

  protected readonly clockMeridiem = computed(() => {
    const clock = this.next()?.clock ?? '';
    const space = clock.indexOf(' ');
    return space === -1 ? '' : clock.slice(space + 1);
  });

  /** "17 stations", and "1 station" at the two platforms that serve one. */
  protected readonly stationsLabel = computed(() => {
    const count = this.servesCount();
    return this.t(count === 1 ? 'board.stationsOne' : 'board.stations', { count });
  });
}
