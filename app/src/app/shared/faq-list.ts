/**
 * The page's questions and answers, as visible text.
 *
 * The entries come from `core/seo/faq.ts`, the same call that builds the
 * `FAQPage` JSON-LD at prerender, so what the markup claims is always what the
 * reader can see. That match is Google's condition for FAQ markup, and the
 * visible sentences are what a question-shaped search actually matches.
 *
 * Built on `<details>`: closed by default so it costs the page no height, open
 * without JavaScript, and the answers are in the prerendered HTML whether a
 * reader expands them or not. Nothing here hydrates into anything — toggling
 * is the browser's own behaviour, so there is no state for Angular to hold.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import type { FaqEntry } from '../core/seo/faq';

@Component({
  selector: 'app-faq-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <section class="faq" aria-labelledby="faq-heading">
        <h2 id="faq-heading" class="faq-title">{{ t('faq.heading') }}</h2>
        @for (entry of entries(); track entry.q) {
          <details class="faq-item">
            <summary class="faq-q"><h3 class="faq-q-text">{{ entry.q }}</h3></summary>
            <p class="faq-a">{{ entry.a }}</p>
          </details>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .faq-title {
      margin: 0 0 var(--gmm-space-2);
      font-size: var(--text-arrival);
      font-weight: 600;
      line-height: 1.25;
      color: var(--gmm-ink);
    }

    .faq-item {
      border-block-end: 1px solid var(--gmm-rule);
    }

    /* The whole row is the target: 48px tall at minimum, per the touch rule. */
    .faq-q {
      display: flex;
      align-items: center;
      gap: var(--gmm-space-2);
      min-block-size: 48px;
      padding-block: var(--gmm-space-3);
      cursor: pointer;
      list-style: none;
    }

    .faq-q::-webkit-details-marker {
      display: none;
    }

    /* A plus that turns into a minus. Text, not an icon font, and no motion. */
    .faq-q::after {
      content: '+';
      margin-inline-start: auto;
      font-size: var(--text-body);
      font-weight: 600;
      color: var(--gmm-line-text);
    }

    .faq-item[open] > .faq-q::after {
      content: '\\2212';
    }

    .faq-q-text {
      margin: 0;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.4;
      color: var(--gmm-ink);
    }

    .faq-a {
      margin: 0;
      padding-block-end: var(--gmm-space-4);
      font-size: var(--text-min);
      line-height: 1.5;
      color: var(--gmm-ink-2);
    }
  `,
})
export class FaqList {
  readonly entries = input.required<readonly FaqEntry[]>();
  protected readonly t = inject(I18nService).t;
}
