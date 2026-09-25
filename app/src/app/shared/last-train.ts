/**
 * The last train home, and the run nudge. The most dangerous markup in the app.
 *
 * ## Why this exists as its own component
 *
 * It was `departure-board.ts` before the redesign, which also drew the board
 * itself. Phase B replaced the board with `BoardPanel` + `BoardLane` and the
 * old card was deleted as orphaned — but the board it was replaced by renders
 * departures only. The run nudge and the whole last-train panel went with it,
 * and `BoardView` kept producing `nudge` and `lastTrain` that nothing read.
 *
 * That is not a cosmetic loss. CLAUDE.md's product statement is *"know when to
 * leave, not just where the train is"*, and both incumbents already answer
 * "when is the next train?". This panel is the part nobody else answers.
 *
 * It is separate from `BoardPanel` rather than inside it because the two have
 * different shapes: the board is two lanes side by side comparing countdowns,
 * and this is prose about one platform at a time. Folding it into a lane would
 * put a three-sentence paragraph inside a column whose entire job is keeping
 * two numbers on the same baseline (`board-panel.ts`).
 *
 * ## The three rules, all from CLAUDE.md, all enforced here and not by callers
 *
 * **The cliff is rendered from the measured gap, never from a direction.**
 * Finding 9's 45m56s gap exists at 20 of 24 *weekday towards-Aluva* platforms
 * and nowhere at all towards Tripunithura, where every final gap is 15–16
 * minutes. `lastTrainView` emits `cliff` only when the measured gap clears
 * `CLIFF_SECONDS`, so this template renders what was measured. Overstating
 * uncertainty breaks the honesty rules exactly as badly as understating it.
 *
 * **The last train and the last train home are different trains.** Wherever
 * they differ the one that actually arrives leads, and the later short-turn is
 * demoted to a following line. At MG Road the advertised last departure
 * towards Aluva is 11:44 PM; the last one that reaches Aluva is 10:52 PM —
 * 52 minutes earlier, and *before* the 10:58 PM finding 9's own table calls
 * second-to-last. A panel that led with the 11:44 would strand the passenger
 * it exists to protect.
 *
 * **The gap is the nudge, not the time.** "Run — 1 min, then a 20 min wait"
 * changes behaviour; "1 min" does not (MVP item 4).
 *
 * ## Shape
 *
 * Amber-soft ground and an amber icon, the same vocabulary as `Alert`
 * (DESIGN.md §5.6) — but deliberately **not** `role="alert"`. This is not an
 * error and it does not appear in response to anything the reader did; it
 * fades in as the evening goes on. An assertive live region firing on a timer
 * would interrupt a screen-reader user mid-sentence every time the countdown
 * ticked. The heading carries it instead.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import type { BoardView } from './board-view';

@Component({
  selector: 'app-last-train',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    /* One platform's panel. Amber-soft ground, radius 12 — DESIGN.md §4 and
       §5.6's alert geometry, because this carries the same weight. */
    .panel {
      display: flex;
      gap: var(--gmm-space-3);
      padding: var(--gmm-space-4);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-amber-soft);
      color: var(--gmm-ink);
      font-size: var(--text-body);
      line-height: 1.5;
    }

    .panel + .panel {
      margin-block-start: var(--gmm-space-3);
    }

    /* Amber on amber-soft is 5.36:1 — fine for an icon, and the prose beside
       it stays ink at 16.17:1. Colour is never the only signal: the icon is
       the same short-working mark the board rows use, and every state below
       also says what it is in words. */
    .icon {
      flex-shrink: 0;
      margin-block-start: 2px;
      color: var(--gmm-amber);
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .body {
      min-inline-size: 0;
    }

    .heading {
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
    }

    /* Malayalam takes no uppercase and no added tracking (DESIGN.md §3). */
    :host-context([lang='ml']) .heading {
      text-transform: none;
      letter-spacing: normal;
    }

    /* The deadline itself: the largest thing in the panel, because it is the
       one number the reader is here for. 22px, per §3's arrival size. */
    .deadline {
      margin-block: var(--gmm-space-2) 0;
      font-size: var(--text-arrival);
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
      line-height: 1.2;
    }

    .line {
      margin-block: var(--gmm-space-1) 0;
    }

    /* The demoted facts — the later short-turn and the gap before it. Same
       size as the body; they are secondary in order, not in legibility. */
    .secondary {
      margin-block: var(--gmm-space-2) 0;
    }
  `,
  template: `
    @for (panel of panels(); track panel.direction) {
      <section class="panel" [attr.aria-label]="panel.heading">
        <svg viewBox="0 0 24 24" width="22" height="22" class="icon" aria-hidden="true">
          <path d="M5 12h11" />
          <path d="M19 6v12" />
        </svg>

        <div class="body">
          <h3 class="heading">{{ panel.heading }}</h3>

          @if (panel.last; as last) {
            @if (last.through; as through) {
              <!--
                The short-turn is the last departure, so the last train that
                *arrives* is an earlier one. It leads. Finding 9: at MG Road
                leading with the 11:44 PM strands the passenger.
              -->
              @if (through.gone) {
                <p class="deadline tabular">
                  {{ t('board.throughGone', { clock: through.clock }) }}
                </p>
                <p class="line">
                  {{ t('board.throughGoneBody', { terminus: through.terminusName }) }}
                </p>
              } @else {
                <p class="deadline tabular">
                  {{ t('board.inTime', { clock: through.clock, remaining: through.remaining }) }}
                </p>
                <p class="line">{{ t('board.throughBody', { terminus: through.terminusName }) }}</p>
              }

              <!-- The later train, reported as what it is and never as the answer. -->
              <p class="secondary">
                {{ t('board.laterShort', { clock: last.clock, terminus: last.terminusName }) }}
              </p>
            } @else {
              <p class="deadline tabular">
                {{ t('board.inTime', { clock: last.clock, remaining: last.remaining }) }}
              </p>
              @if (last.isNext) {
                <p class="line">{{ t('board.lastIsNext') }}</p>
              }
              @if (last.shortTurn) {
                <p class="secondary">
                  {{ t('board.lastShortTurn', { terminus: last.terminusName }) }}
                </p>
              }
            }

            <!--
              Finding 9's 45-minute gap. Rendered from the gap the engine
              measured, so it appears at the 20 weekday towards-Aluva platforms
              that have one and stays silent everywhere else.
            -->
            @if (last.cliff; as cliff) {
              <p class="secondary">
                {{
                  t('board.cliff', {
                    previous: cliff.previousClock,
                    clock: last.clock,
                    minutes: cliff.minutes,
                  })
                }}
              </p>
            }
          }

          <!--
            The run nudge (MVP item 4). It shows the gap, not just the time:
            the gap is what changes behaviour.
          -->
          @if (panel.nudge; as nudge) {
            <p class="secondary">
              {{ t('board.nudge', { next: nudge.nextMinutes, gap: nudge.gapMinutes }) }}
            </p>
          }
        </div>
      </section>
    }
  `,
})
export class LastTrainPanel {
  protected readonly t = inject(I18nService).t;

  /** Both platforms, as the board has them. Panels are emitted only where there is one. */
  readonly boards = input.required<readonly BoardView[]>();

  /**
   * One panel per platform that has something to say, in board order.
   *
   * A platform with neither a last-train report nor a nudge emits nothing at
   * all — this is a screen that changes character in the evening, not a
   * permanent band. `lastTrainView` already returns `null` outside the
   * last-train window and once the last train has gone, so the timing rule
   * lives in the view model and is tested without a DOM.
   */
  protected readonly panels = computed(() =>
    this.boards()
      .filter((board) => board.lastTrain !== null || board.nudge !== null)
      .map((board) => ({
        direction: board.direction,
        heading: this.t('board.lastHeading', { name: board.towardsName }),
        last: board.lastTrain,
        nudge: board.nudge,
      })),
  );
}
