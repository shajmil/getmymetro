/**
 * "Scheduled times from KMRL's published timetable — not live."
 *
 * The honesty rules require provenance and its date on every screen that shows
 * a time, and require it to stop there. Stating the confirmation month is the
 * whole claim; adding "may be out of date" would overstate it, because KMRL
 * confirmed the timings are current (CLAUDE.md finding 6), and dropping the
 * month would understate it, because that assurance has a shelf life.
 *
 * The month is read from the feed through `StationDirectoryService`, never
 * typed into the copy, and it travels in `TransferState` so the sentence is
 * complete in the prerendered HTML rather than only after hydration.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { StationDirectoryService } from '../core/data/station-directory';
import { localMonth } from '../core/i18n/format';
import { I18nService } from '../core/i18n/i18n';

@Component({
  selector: 'app-provenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    /* The provenance line, and it is set as ink rather than as a muted
       footnote.

       CLAUDE.md's honesty rules make this the product's whole position: these
       are timetable times, confirmed with KMRL on a stated date, and both
       competitors either claim "live" or bury the disclaimer in small grey
       text under the map. A provenance line a reader has to look for is the
       same failure in a different colour. ink-2 is 7.21:1 and the leading
       sentence is ink at 18.88:1.

       It also does not overstate: no warning colour, no icon, no alarm. The
       feed's declared window lapsed while the timings stayed accurate
       (finding 6), so a caution here would itself be dishonest. */
    .provenance {
      margin: var(--gmm-space-6) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    .claim {
      color: var(--gmm-ink);
      font-weight: 600;
    }

    @media (min-width: 1024px) {
      .provenance {
        max-inline-size: 46rem;
      }
    }
  `,
  template: `
    <p class="provenance">
      <span class="claim">{{ t('prov.scheduled') }}</span>
      @if (confirmed(); as confirmedOn) {
        <span>{{ t('prov.confirmed', { month: confirmedOn }) }}</span>
      }
    </p>
  `,
})
export class Provenance {
  readonly #directory = inject(StationDirectoryService);
  readonly #i18n = inject(I18nService);

  protected readonly t = this.#i18n.t;

  readonly confirmed = computed<string | null>(() => {
    const raw = this.#directory.confirmed();
    return raw === '' ? null : localMonth(raw, this.#i18n.locale());
  });
}
