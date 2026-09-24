/**
 * One platform, rendered. The most dangerous markup in the app.
 *
 * It lived in `home.html` through Phase 4 and moved here in Phase 5 when the
 * station page needed the same thing. It was moved rather than copied on
 * purpose: the wording below is what stands between a passenger and a 45
 * minute wait at an empty platform, and the failure mode of a copy is that one
 * of them gets fixed.
 *
 * Three rules, all from CLAUDE.md, all enforced by this template and the view
 * model behind it rather than by the caller:
 *
 * **Every short-turn row is labelled.** 20 of 450 trips terminate before the
 * end of the line (finding 10). The label is body-sized and in the alert
 * colour, never small print — it is what keeps an Aluva passenger off a train
 * that stops at Muttom depot.
 *
 * **The cliff is rendered from the measured gap, never from a direction.**
 * Finding 9's 45m56s gap exists towards Aluva at 20 of the 48 station/direction
 * pairs and nowhere at all towards Tripunithura, where every final gap is 15-16
 * minutes. Overstating uncertainty breaks the honesty rules exactly as badly as
 * understating it.
 *
 * **The last train and the last train home are different trains.** Wherever
 * they differ, the one that actually arrives leads and the later short-turn is
 * reported as what it is. At MG Road the advertised last train towards Aluva is
 * 11:44 PM; the last one that reaches Aluva is 10:52 PM, 52 minutes earlier and
 * *before* the 10:58 PM that finding 9's table calls second-to-last.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import type { BoardView } from './board-view';

@Component({
  selector: 'app-departure-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    /* The countdown is the largest text on the screen and it changes every
       minute: "10 min" to "9 min" loses a character. The departure-time
       utility already supplies tabular figures so digits cannot change width;
       this reserves enough inline space that losing one cannot pull anything
       leftwards either. 6ch covers "45 min" at this size, and the block never
       shares its line. */
    .countdown {
      display: block;
      min-inline-size: 6ch;
    }

    /* A following departure. Two fixed columns, so the countdown shrinking
       from "10 min" to "9 min" cannot move the clock time next to it. */
    .following {
      display: grid;
      grid-template-columns: 6rem 1fr;
      align-items: baseline;
      column-gap: 0.75rem;
    }
  `,
  template: `
    <section class="rounded-xl border-2 border-border p-4">
      <h2 class="text-station font-bold">{{ t('board.towards', { name: board().towardsName }) }}</h2>

      <!-- "Towards Tripunithura" means nothing to someone who wants Kaloor. -->
      <p class="mt-1">
        {{ t('board.servesFor', { names: board().servesPreview })
        }}@if (board().servesMore > 0) {
          <span>{{ t('board.servesMore', { count: board().servesMore }) }}</span>
        }
      </p>

      @if (board().servesMore > 0) {
        <details class="mt-1">
          <summary class="disclosure font-semibold text-accent">
            {{ t('board.servesAll', { count: board().servesAll.length }) }}
          </summary>
          <ol class="mt-1 ps-6 list-decimal">
            @for (name of board().servesAll; track name) {
              <li>{{ name }}</li>
            }
          </ol>
        </details>
      }

      @if (board().rows.length === 0) {
        <p class="warning mt-4">{{ t('board.noDepartures') }}</p>
      }

      @for (row of board().rows; track row.key; let first = $first) {
        @if (first) {
          <div class="mt-4">
            <p class="departure-time countdown">{{ row.countdown }}</p>
            <p class="text-lead tabular">
              {{ row.clock }}@if (row.nextDay) {
                <span>{{ t('common.tomorrow') }}</span>
              }
            </p>
          </div>
        } @else {
          <div class="following mt-3">
            <p class="text-station-lg font-bold tabular">{{ row.countdown }}</p>
            <p class="tabular">
              {{ t('board.then', { clock: row.clock }) }}@if (row.nextDay) {
                <span>{{ t('common.tomorrow') }}</span>
              }
            </p>
          </div>
        }

        <!--
          Finding 10: 20 of 450 trips terminate early. This is the label that
          keeps an Aluva passenger off a train that stops at Muttom depot, so
          it is body-sized and in the alert colour, never small print.
        -->
        @if (row.shortTurn) {
          <p class="warning mt-2 font-semibold text-alert">
            {{ t('board.shortTurn', { terminus: row.terminusName, misses: row.missesName ?? '' }) }}
          </p>
        }

        @if (first) {
          @if (board().nudge; as nudge) {
            <p class="warning mt-2 font-semibold text-alert">
              {{ t('board.nudge', { next: nudge.nextMinutes, gap: nudge.gapMinutes }) }}
            </p>
          }
        }
      }

      <!--
        Last-train mode. Two separate facts, and the order matters.

        Finding 9's cliff — the 45m56s gap before the final departure — is
        rendered from the gap the engine measured, so it appears at the 20
        station/direction pairs that have one and nowhere else. Towards
        Tripunithura every final gap is 15-16 minutes and this stays silent.

        Findings 9 and 10 together are worse than either. At every one of those
        20 stations the final departure towards Aluva terminates at Muttom, so
        the advertised last train does not go where the passenger is going:
        from MG Road the 11:44 PM stops at Muttom and the last train that
        reaches Aluva is the 10:52 PM. That is the deadline, so it leads, and
        the later short-turn is reported as what it is.
      -->
      @if (board().lastTrain; as last) {
        <div class="warning mt-4">
          <h3 class="text-lead font-bold text-alert">
            {{ t('board.lastHeading', { name: board().towardsName }) }}
          </h3>

          @if (last.through; as through) {
            @if (through.gone) {
              <p class="text-station-lg font-bold tabular">
                {{ t('board.throughGone', { clock: through.clock }) }}
              </p>
              <p class="mt-1">
                {{ t('board.throughGoneBody', { terminus: through.terminusName }) }}
              </p>
            } @else {
              <p class="text-station-lg font-bold tabular">
                {{ t('board.inTime', { clock: through.clock, remaining: through.remaining }) }}
              </p>
              <p class="mt-1">{{ t('board.throughBody', { terminus: through.terminusName }) }}</p>
            }
            <p class="mt-2 font-semibold">
              {{ t('board.laterShort', { clock: last.clock, terminus: last.terminusName }) }}
            </p>
          } @else {
            <p class="text-station-lg font-bold tabular">
              {{ t('board.inTime', { clock: last.clock, remaining: last.remaining }) }}
            </p>
            @if (last.isNext) {
              <p class="mt-1 font-semibold">{{ t('board.lastIsNext') }}</p>
            }
            @if (last.shortTurn) {
              <p class="mt-2 font-semibold">
                {{ t('board.lastShortTurn', { terminus: last.terminusName }) }}
              </p>
            }
          }

          @if (last.cliff; as cliff) {
            <p class="mt-2 font-semibold">
              {{
                t('board.cliff', {
                  previous: cliff.previousClock,
                  clock: last.clock,
                  minutes: cliff.minutes,
                })
              }}
            </p>
          }
        </div>
      }
    </section>
  `,
})
export class DepartureBoardCard {
  protected readonly t = inject(I18nService).t;
  readonly board = input.required<BoardView>();
}
