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
  template: `
    <p class="mt-6 text-min">
      {{ t('prov.scheduled') }}
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
