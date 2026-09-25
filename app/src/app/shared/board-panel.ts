/**
 * The departure board. DESIGN.md §5.4.
 *
 * A soft-grey panel carrying a header, both directions, and a "Full board"
 * footer. Both directions are in the one panel, never in separate cards — that
 * is golden rule 2, and it holds at every width.
 *
 * ## Stacked on a phone, side by side from 1024px
 *
 * Below 1024px the two lanes are full-width rows, Aluva above Tripunithura —
 * the same fixed order the track and the network strip use left to right, so
 * a daily reader finds their direction in the same place every time. Two
 * columns on a 360px phone left each lane about 150px, and "6:30 AM", "5 h 43
 * min" and "Ends at Kadavanthra" all broke across lines; see `BoardLane`.
 *
 * At 1024px and above the lanes sit side by side under the horizontal
 * `LineTrack`, whose left and right halves are those two columns. The track is
 * not drawn below that width: stacked lanes do not map onto its halves, each
 * lane's head already carries its arrow and its terminus in words, and a
 * ringed node on a bar reads as a slider handle on a touch screen — a control
 * that does nothing when it is pressed.
 *
 * ## This component's one real job: keeping side-by-side lanes aligned
 *
 * Everything else here is layout. What has to be got right is that two lanes
 * side by side stay level even though the things that make a lane taller only
 * ever happen to one of them:
 *
 *   * the **"Your train" tag** is on the lane serving the reader's destination
 *     and on no other lane, ever; and
 *   * the **"Ends at Muttom" line** appears on the towards-Aluva lane at 20 of
 *     24 weekday platforms and essentially never on the towards-Tripunithura
 *     one (CLAUDE.md finding 9) — on the next train or on a following one. So
 *     the lanes being asymmetric is the normal case on this network.
 *
 * A lane cannot see the other lane, so the reservations are computed here and
 * passed down, and the lanes only draw them side by side. `board-panel.spec.ts`
 * asserts the asymmetric case directly, because it is the one that regresses
 * silently: the board still renders, the numbers are still right, and the two
 * countdowns are simply 22px out of line.
 *
 * ## Provenance
 *
 * The header's right-hand side says "Timetable · 6:16 PM" and never "Live".
 * CLAUDE.md's honesty rules are explicit that the positions and times here are
 * scheduled, and this is the most prominent place the product says so. The
 * word "Timetable" is the claim; the clock beside it is when it was read.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../core/i18n/i18n';

import { BoardLane } from './board-lane';
import type { BoardView } from './board-view';
import { LineTrack, type TrackEnd, type TrackSide } from './line-track';

@Component({
  selector: 'app-board-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardLane, LineTrack, RouterLink],
  styles: `
    :host {
      display: block;
      background-color: var(--gmm-soft);
    }

    /* "DEPARTURES" and "Timetable · 6:16 PM". Wraps rather than truncating:
       it is the provenance line, and a provenance line that can be cut off is
       worse than none. */
    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--gmm-space-1) var(--gmm-space-3);
      padding: var(--gmm-space-4) var(--gmm-space-4) var(--gmm-space-1);
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

    /* ink-2 is 6.59:1 on the soft panel. Balanced, so at large text sizes it
       breaks after the dot rather than between "6:16" and "PM". */
    .provenance {
      margin: 0;
      font-size: var(--text-min);
      line-height: 1.4;
      text-wrap: balance;
      color: var(--gmm-ink-2);
    }

    /* Side by side only; see the header comment. */
    .track {
      display: none;
    }

    /* One column on a phone: the lanes are rows, a hairline between them. */
    .lanes {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .lanes > app-board-lane + app-board-lane {
      border-block-start: 1px solid var(--gmm-rule);
    }

    /* "Full board ›" — the whole width of the panel, 48px (DESIGN.md §5.4). */
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

    /* Inset, so the focus outline is not cut off by a panel with rounded,
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

    .footer:hover .footer-chevron {
      translate: 3px 0;
    }

    .footer-chevron {
      flex-shrink: 0;
      inline-size: 1.25em;
      block-size: 1.25em;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: translate var(--gmm-hover) var(--gmm-ease);
    }

    @media (min-width: 1024px) {
      .track {
        display: block;
        padding-inline: var(--gmm-space-3);
        margin-block-start: var(--gmm-space-2);
      }

      .lanes:not(.is-single-lane) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      /* Stretched, so the rule between the columns and your lane's ground
         both run the full height of the taller lane. */
      .lanes > app-board-lane + app-board-lane {
        border-block-start: 0;
        border-inline-start: 1px solid var(--gmm-rule);
      }
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

      <div class="track">
        <app-line-track
          [stationName]="stationName()"
          [side]="trackSide()"
          [end]="trackEnd()"
        />
      </div>

      <div class="lanes" [class.is-single-lane]="isSingleLane()">
        @if (aluva(); as lane) {
          <app-board-lane
            side="aluva"
            [towardsName]="lane.towardsName"
            [rows]="lane.rows"
            [servesCount]="lane.servesAll.length"
            [isYours]="yourDirection() === lane.direction"
            [reserveTag]="reserveTag()"
            [reserveNextShortWorking]="reserveNextShortWorking()"
            [reserveShortWorking]="reserveShortWorking()"
            [opensAt]="opensAt()"
            [followingCount]="followingCount()"
            [followingCountWide]="followingCountWide()"
            [isSingleLane]="isSingleLane()"
          />
        }
        @if (tripunithura(); as lane) {
          <app-board-lane
            side="tripunithura"
            [towardsName]="lane.towardsName"
            [rows]="lane.rows"
            [servesCount]="lane.servesAll.length"
            [isYours]="yourDirection() === lane.direction"
            [reserveTag]="reserveTag()"
            [reserveNextShortWorking]="reserveNextShortWorking()"
            [reserveShortWorking]="reserveShortWorking()"
            [opensAt]="opensAt()"
            [followingCount]="followingCount()"
            [followingCountWide]="followingCountWide()"
            [isSingleLane]="isSingleLane()"
          />
        }
      </div>

      @if (fullBoardPath(); as path) {
        <a class="footer" [routerLink]="path">
          <span>{{ t('board.fullBoard') }}</span>
          <svg viewBox="0 0 24 24" width="20" height="20" class="footer-chevron" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
      }
    </section>
  `,
})
export class BoardPanel {
  protected readonly t = inject(I18nService).t;

  /** The station on screen. Named in the track's text alternative. */
  readonly stationName = input.required<string>();

  /**
   * Both platforms, in whatever order the engine produced them.
   *
   * They are sorted into lanes here by `direction`, not by position in the
   * array: DESIGN.md §5.3 fixes Aluva first (left, or on top) and Tripunithura
   * second at every station, and a caller passing them the other way round
   * would otherwise silently mirror the board.
   *
   * `direction_id = 1` is towards Aluva and `0` towards Tripunithura, derived
   * from the feed rather than assumed — CLAUDE.md finding 10.
   */
  readonly boards = input.required<readonly BoardView[]>();

  /** The direction the reader is travelling, or null if no destination is set. */
  readonly yourDirection = input<number | null>(null);

  /** "Timetable · 6:16 PM", or "Saved 5:40 PM" when the data is a fallback. */
  readonly provenance = input.required<string>();

  /** Set at a terminus so the track draws one half only. */
  readonly trackEnd = input<TrackEnd>(null);

  /** Where "Full board ›" goes. Omitted on the station page, which *is* the full board. */
  readonly fullBoardPath = input<string | null>(null);

  /** When the first train runs tomorrow. Shown in the closed state. */
  readonly opensAt = input<string | null>(null);

  /** Following departures per lane: 1 on home, 4 on the station board. */
  readonly followingCount = input<number>(1);

  /**
   * Following departures per lane at 1024px and above. Home passes 3 (§5.4);
   * the station board passes nothing, because 4 is 4 at every width.
   *
   * The surplus rows are rendered and hidden in CSS rather than swapped in on
   * a media query — see `BoardLane.followingCountWide` for why.
   */
  readonly followingCountWide = input<number | null>(null);

  /** The towards-Aluva platform. Absent at Aluva itself. */
  protected readonly aluva = computed(
    () => this.boards().find((board) => board.direction === 1) ?? null,
  );

  /** The towards-Tripunithura platform. Absent at Tripunithura itself. */
  protected readonly tripunithura = computed(
    () => this.boards().find((board) => board.direction === 0) ?? null,
  );

  protected readonly isSingleLane = computed<boolean>(() => {
    return (this.aluva() === null) !== (this.tripunithura() === null);
  });

  protected readonly trackSide = computed<TrackSide>(() => {
    const direction = this.yourDirection();
    if (direction === null) return 'none';
    return direction === 1 ? 'aluva' : 'tripunithura';
  });

  /**
   * Reserve the tag's height in the lane that does not carry it.
   *
   * True as soon as *either* lane is the reader's, which is exactly when the
   * asymmetry exists. With no destination chosen neither lane has a tag and
   * nothing is reserved, so the board is 22px shorter rather than carrying a
   * blank band. At a terminus there is no other lane to line up with.
   */
  protected readonly reserveTag = computed(() => {
    if (this.isSingleLane()) return false;
    const direction = this.yourDirection();
    if (direction === null) return false;
    return this.boards().some((board) => board.direction === direction);
  });

  /**
   * Reserve the next train's short-working line in the lane whose next train
   * runs through, when the other lane's does not.
   *
   * Finding 9 makes this routine rather than rare: from 10:58 PM at MG Road
   * the next train towards Aluva is the 11:44 PM to Muttom, while the other
   * lane's next train runs the whole line.
   */
  protected readonly reserveNextShortWorking = computed(() => {
    if (this.isSingleLane()) return false;
    return this.boards().some((board) => board.rows[0]?.shortTurn === true);
  });

  /**
   * Reserve the short-working line's height on the following rows when either
   * lane has one among them.
   *
   * Scoped to the rows the widest breakpoint renders, because the spacers are
   * only drawn side by side, which is only at that width. A short working
   * further down the timetable does not affect the height of anything drawn,
   * and reserving on its account would put a permanent blank band under every
   * board at the 20 weekday platforms of finding 9.
   */
  protected readonly reserveShortWorking = computed(() => {
    if (this.isSingleLane()) return false;
    const shown = Math.max(this.followingCount(), this.followingCountWide() ?? 0);
    return this.boards().some((board) =>
      board.rows.slice(1, 1 + shown).some((row) => row.shortTurn),
    );
  });
}
