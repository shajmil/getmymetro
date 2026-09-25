/**
 * The holiday caveat, written once.
 *
 * Three screens render it and the tone is the whole point, so the copy lives
 * in one component rather than in three templates. CLAUDE.md finding 6: the
 * timings themselves are confirmed accurate, and the only open question is
 * whether today happens to be a public holiday — KMRL ships no
 * `calendar_dates.txt` and nobody has checked a holiday list. A red banner
 * would overstate that; suppressing it would understate it. Both are forbidden
 * by the same honesty rule.
 *
 * {@link caveatOf} is the only sanctioned way to read a `ServiceOutlook`'s
 * certainty for display. It takes the whole outlook, so a caller cannot reach
 * the caveat without having had the outlook in hand.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import type { ServiceOutlook } from '../core/engine/service-day';

export interface CaveatView {
  readonly kind: 'unverified' | 'holiday';
  /** Declared holiday names, when the calendar actually named one. */
  readonly holidays: readonly string[];
}

/** `null` when the date is one the calendar vouches for, which today means a Sunday. */
export function caveatOf(outlook: ServiceOutlook<unknown> | null): CaveatView | null {
  if (outlook === null) return null;
  if (outlook.certainty === 'unverified') return { kind: 'unverified', holidays: [] };
  if (outlook.certainty === 'holiday-sunday') {
    return { kind: 'holiday', holidays: outlook.holidays };
  }
  return null;
}

@Component({
  selector: 'app-service-caveat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    /* Soft ground, not amber. CLAUDE.md finding 6 and the honesty rules cut
       both ways here: the timings are confirmed accurate and only the holiday
       question is open, so a warning colour would overstate the uncertainty as
       badly as saying nothing would understate it. This is a note, and it is
       shaped like one. */
    .caveat {
      margin-block-start: var(--gmm-space-6);
      padding: var(--gmm-space-4);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-soft);
    }

    .heading {
      margin: 0;
      font-size: var(--text-body);
      font-weight: 600;
      line-height: 1.4;
      color: var(--gmm-ink);
    }

    .body {
      margin: var(--gmm-space-2) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    @media (min-width: 1024px) {
      /* Prose, so it stops at a readable measure rather than running the width
         of a 1280px page. */
      .caveat {
        max-inline-size: 46rem;
      }
    }
  `,
  template: `
    @if (caveat(); as dayNote) {
      <section class="caveat">
        @if (dayNote.kind === 'holiday') {
          <h2 class="heading">{{ t('caveat.holidayHeading') }}</h2>
          <p class="body">{{ t('caveat.holidayBody', { names: dayNote.holidays.join(', ') }) }}</p>
        } @else {
          <h2 class="heading">{{ t('caveat.unknownHeading') }}</h2>
          <p class="body">{{ t('caveat.unknownBody') }}</p>
        }
      </section>
    }
  `,
})
export class ServiceCaveat {
  protected readonly t = inject(I18nService).t;
  readonly caveat = input.required<CaveatView | null>();
}
