/**
 * The document title, after the page has already been served.
 *
 * KMRL ships **one identical title across all 25 station pages** —
 * `<title>Kochi Metro Rail Limited</title>`, with `Most Advanced Metro in
 * India` as the description on every one of them (CLAUDE.md finding 8). They
 * hold the domain authority and have thrown away the only on-page signal that
 * would let those pages rank. Not repeating that is most of the SEO work in
 * this phase, and it happens at **prerender** time: `app.routes.server.ts`
 * reads `build/pages.json` and writes a distinct title and description into
 * each of the 1,250 documents before anything is served.
 *
 * This service is only for what happens *after* that — a client-side
 * navigation, where the document is already in the browser and no crawler is
 * watching. Two deliberate limits:
 *
 * **It does nothing on the first page.** The prerendered title came from
 * `pages.json` and is authoritative; overwriting it during hydration with a
 * locally derived one would be a downgrade for no gain.
 *
 * **It does not touch the meta description.** A description has no effect on a
 * reader who is already looking at the page, and the only consumer that cares
 * — a crawler — reads the prerendered document, never a client-side
 * navigation. Shipping 1,250 descriptions to every visitor to keep an invisible
 * tag in step would cost more than the whole data bundle.
 */

import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Title } from '@angular/platform-browser';

import { HTML_LANG, type AppLocale } from '../i18n/locale';

@Injectable({ providedIn: 'root' })
export class PageTitleService {
  readonly #title = inject(Title);
  readonly #document = inject(DOCUMENT);

  /** The first page was prerendered with its own title. Leave it alone. */
  #served = false;

  /**
   * Set the title, unless this is the document as it was served.
   *
   * Safe to call during server rendering: the first call is always the served
   * page, so the prerendered title survives.
   */
  set(title: string): void {
    if (!this.#served) {
      this.#served = true;
      return;
    }
    // Setting the same title again is free but not silent — it is a DOM write
    // per change-detection pass on a page whose title never changes.
    if (this.#title.getTitle() === title) return;
    this.#title.setTitle(title);
  }

  /**
   * Keep `<html lang>` honest.
   *
   * Applied on every navigation including the first, because unlike the title
   * it is not a nicety: a screen reader picks its voice from it, and a
   * Malayalam page announced with an English voice is unusable. Setting it to
   * the value it already has is a no-op in every browser.
   */
  setLanguage(locale: AppLocale): void {
    const element = this.#document.documentElement;
    if (element !== null) element.lang = HTML_LANG[locale];
  }
}
