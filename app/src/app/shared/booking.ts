/**
 * "Book on WhatsApp" — a deep link into KMRL's own booking chat.
 *
 * Three constraints, all from CLAUDE.md, and all of them are the kind that
 * only bite after the fact.
 *
 * **The number is KMRL's, lifted verbatim from their own "Book a Ticket"
 * button.** Third-party articles give a different number (90486 90486) and a
 * different message syntax ("BOOK <route> <date>"); both are wrong, and the
 * consequence of shipping the wrong one is a passenger messaging a stranger.
 *
 * **The journey is not prefilled.** `BOOKING_PREFILL_JOURNEY` is false in
 * `build_pages.py` for a reason: nobody has tested what grammar the bot
 * accepts, and a message it cannot parse is worse than a generic one. The UI
 * says so rather than letting the passenger assume the route travelled with
 * them.
 *
 * **It is labelled as KMRL's channel, not ours.** The open-data licence ends
 * automatically if the app implies KMRL endorses it (finding 1), and a button
 * that looks like our own checkout is where that risk is real. Nothing here
 * claims a discount either — the "10% on WhatsApp" figure that circulates is
 * unverified.
 */

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

/** KMRL's published WhatsApp booking number. Do not substitute another. */
export const BOOKING_NUMBER = '919188957488';

/** The message the chat opens with. Generic, deliberately — see above. */
export const BOOKING_TEXT = 'Book Ticket';

/**
 * The same string `build_pages.py` emits as `booking_url`.
 *
 * `wa.me` opens the chat with the text ready and the passenger presses send
 * themselves. Nothing is sent on anyone's behalf.
 */
export const BOOKING_URL = `https://wa.me/${BOOKING_NUMBER}?text=${encodeURIComponent(
  BOOKING_TEXT,
)}`;

@Component({
  selector: 'app-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-6">
      <h2 class="text-station font-bold">{{ t('booking.heading') }}</h2>
      <p class="mt-1">{{ t('booking.body') }}</p>
      <p class="tap-row mt-2">
        <a class="link-button hover:bg-surface" [href]="url" rel="noopener nofollow">{{
          t('booking.cta')
        }}</a>
      </p>
      <p class="mt-2 text-min">{{ t('booking.note') }}</p>
    </section>
  `,
})
export class Booking {
  protected readonly t = inject(I18nService).t;
  readonly url = BOOKING_URL;
}
