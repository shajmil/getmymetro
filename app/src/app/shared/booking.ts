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
  styles: `
    :host {
      display: block;
    }

    /* A section on the soft ground, not a card with a border and a shadow.
       The outgoing markup was the only component Phases B and C did not reach:
       it carried emerald pills, dark-mode variants, a 20px radius and Tailwind
       utility classes from the palette DESIGN.md §2 replaced. */
    .booking {
      padding: var(--gmm-space-5);
      border-radius: var(--gmm-radius-panel);
      background-color: var(--gmm-soft);
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      flex-wrap: wrap;
      padding-block-end: var(--gmm-space-3);
      border-block-end: 1px solid var(--gmm-rule);
    }

    /* "KMRL's own channel". Not a coloured pill — the licence point it makes
       is that this is the operator's service and not ours, and a badge in a
       success colour says the opposite. Ink, 16px, with the icon beside it. */
    .channel {
      display: inline-flex;
      align-items: center;
      gap: var(--gmm-space-2);
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .channel-icon {
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .heading {
      margin: 0;
      font-size: var(--text-arrival);
      font-weight: 600;
      line-height: 1.25;
      color: var(--gmm-ink);
    }

    .body {
      margin: var(--gmm-space-4) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    .action {
      margin: var(--gmm-space-4) 0 0;
    }

    /* A secondary button, not the primary one. DESIGN.md §5.6 allows one
       primary action per screen, and on the route and station pages that is
       already the teal "Book on KMRL WhatsApp" above. This is the same
       destination explained at length, so it must not compete with it. */
    .cta {
      inline-size: 100%;
      justify-content: space-between;
    }

    .cta-icon {
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
      color: var(--gmm-ink-3);
    }

    .note {
      margin: var(--gmm-space-3) 0 0;
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }

    @media (min-width: 1024px) {
      .cta {
        inline-size: auto;
        min-inline-size: 20rem;
      }
    }
  `,
  template: `
    <section class="booking" [attr.aria-label]="t('booking.heading')">
      <div class="head">
        <h2 class="heading">{{ t('booking.heading') }}</h2>
        <!--
          Whose channel this is. It is a licence condition, not decoration:
          finding 1 ends the data licence automatically if the app implies KMRL
          endorses it, and a booking button that reads as our own checkout is
          where that risk is real.
        -->
        <p class="channel">
          <svg viewBox="0 0 24 24" width="18" height="18" class="channel-icon" aria-hidden="true">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            />
          </svg>
          <span>{{ t('booking.channel') }}</span>
        </p>
      </div>

      <p class="body">{{ t('booking.body') }}</p>

      <p class="action">
        <a class="btn-secondary cta" [href]="url" rel="noopener nofollow">
          <span>{{ t('booking.cta') }}</span>
          <svg viewBox="0 0 24 24" width="20" height="20" class="cta-icon" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
      </p>

      <p class="note">{{ t('booking.note') }}</p>
    </section>
  `,
})
export class Booking {
  protected readonly t = inject(I18nService).t;
  readonly url = BOOKING_URL;
}
