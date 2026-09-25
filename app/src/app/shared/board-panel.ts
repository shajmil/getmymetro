/**
 * The departure board. DESIGN.md §5.4.
 *
 * A soft-grey panel carrying a header, the horizontal `LineTrack`, two lanes
 * side by side, and a "Full board" footer. Both directions are visible together
 * without scrolling past separate cards — that is golden rule 2 and the reason
 * the board is two columns rather than two stacked cards.
 *
 * ## This component's one real job: keeping the lanes aligned
 *
 * Everything else here is layout. The part that has to be got right is that
 * the two lanes stay level even though the things that make a lane taller only
 * ever happen to one of them:
 *
 *   * the **"Your train" tag** is on the lane serving the reader's destination
 *     and on no other lane, ever; and
 *   * the **"Ends at Muttom" line** appears on the towards-Aluva lane at 20 of
 *     24 weekday platforms and essentially never on the towards-Tripunithura
 *     one (CLAUDE.md finding 9). So the lanes being asymmetric is the normal
 *     case on this network, not a rarity.
 *
 * A lane cannot see the other lane, so the reservations are computed here and
 * passed down. `reserveTag` is true for a lane when *either* lane is the
 * reader's; `reserveShortWorking` is true for both when *either* lane has a
 * short-working row on screen. `board-panel.spec.ts` asserts the asymmetric
 * case directly, because it is the one that regresses silently: the board
 * still renders, the numbers are still right, and the two countdowns are
 * simply 22px out of line.
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

    .inner {
      padding-block: var(--gmm-space-4) var(--gmm-space-1);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--gmm-space-3);
      padding-inline: var(--gmm-space-4);
      padding-block-end: 8px;
    }

    .heading {
      margin: 0;
      font-size: var(--text-min);
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
      color: var(--gmm-ink);
    }

    /* Malayalam takes no uppercase and no added tracking (DESIGN.md §3). */
    :host-context([lang='ml']) .heading {
      text-transform: none;
      letter-spacing: normal;
    }

    /* "Timetable · 6:16 PM". ink-2 is 6.59:1 on the soft panel. */
    .provenance {
      font-size: var(--text-min);
      line-height: 1.375;
      color: var(--gmm-ink-2);
      text-align: end;
    }

    .track {
      padding-inline: var(--gmm-space-3);
      margin-block: var(--gmm-space-1) var(--gmm-space-2);
    }

    /* The lanes: two-column when both directions exist, single full-width when at terminus */
    .lanes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--gmm-space-4);
      align-items: start;
      padding-inline: var(--gmm-space-4);
      padding-block-start: var(--gmm-space-2);
    }

    .lanes.is-single-lane {
      grid-template-columns: minmax(0, 1fr);
    }

    .lanes:not(.is-single-lane) > app-board-lane:first-child {
      padding-inline-end: var(--gmm-space-3);
      border-inline-end: 1px solid var(--gmm-rule);
    }

    .lanes:not(.is-single-lane) > app-board-lane:last-child {
      padding-inline-start: var(--gmm-space-1);
    }

    /* "Full board ›" — 44px touch target, per spec. */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      min-block-size: 44px;
      margin-block-start: var(--gmm-space-2);
      margin-inline: var(--gmm-space-4);
      border-block-start: 1px solid var(--gmm-rule);
      color: var(--gmm-ink);
      font-size: var(--text-min);
      font-weight: 600;
      text-decoration: none;
      transition: color var(--gmm-hover) var(--gmm-ease);
    }

    .footer:hover {
      color: var(--gmm-line-text);
    }

    .footer:hover .footer-chevron {
      transform: translateX(3px);
    }

    .footer-chevron {
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform var(--gmm-hover) var(--gmm-ease);
    }
  `,
  template: `
    <section class="inner" [attr.aria-label]="t('board.heading')">
      <div class="header">
        <h2 class="heading">{{ t('board.heading') }}</h2>
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
            [reserveShortWorking]="reserveShortWorking()"
            [reserveShortWorkingWide]="reserveShortWorkingWide()"
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
            [reserveShortWorking]="reserveShortWorking()"
            [reserveShortWorkingWide]="reserveShortWorkingWide()"
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
   * array: DESIGN.md §5.3 fixes Aluva on the left and Tripunithura on the
   * right at every station, and a caller passing them the other way round
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
   * blank band.
   */
  protected readonly reserveTag = computed(() => {
    const direction = this.yourDirection();
    if (direction === null) return false;
    return this.boards().some((board) => board.direction === direction);
  });

  /**
   * Reserve the short-working line's height in both lanes when either has one.
   *
   * Scoped to the rows actually on screen — `followingCount` of them per lane —
   * because a short-working trip further down the timetable does not affect the
   * height of what is rendered. Reserving on its account would put a permanent
   * blank band under every board at the 20 weekday platforms of finding 9.
   */
  protected readonly reserveShortWorking = computed(() =>
    this.#hasShortWorking(this.followingCount()),
  );

  /**
   * The same question asked of the desktop row count.
   *
   * It has to be a second flag rather than a wider first one. The spacer is a
   * height reserved in the lane *without* the short working so both lanes'
   * rows stay level; if a short working falls on a row only desktop renders,
   * a phone reserving for it would carry a blank 22px band under a row it
   * cannot explain. So the narrow flag reserves for rows a phone shows and
   * this one reserves, at 1024px and above only, for the rows desktop adds.
   */
  protected readonly reserveShortWorkingWide = computed(() => {
    const wide = this.followingCountWide();
    if (wide === null || wide <= this.followingCount()) return false;
    return this.#hasShortWorking(wide) && !this.reserveShortWorking();
  });

  #hasShortWorking(count: number): boolean {
    return this.boards().some((board) =>
      board.rows.slice(1, 1 + count).some((row) => row.shortTurn),
    );
  }
}
