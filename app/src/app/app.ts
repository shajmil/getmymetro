/**
 * The shell: a skip link, a header with the language toggle, and the outlet.
 *
 * The toggle stopped being a placeholder in Phase 6. It is an ordinary anchor
 * to the same page in the other language, which is the whole bilingual design:
 * the language is a property of the URL, so it is linkable, indexable and
 * shareable, rather than a preference hidden in `localStorage` that no crawler
 * can reach (CLAUDE.md decision 7 and search strategy 4).
 *
 * `<html lang>` is kept in step here rather than in each page, because it is a
 * document-level fact and a screen reader picks its voice from it.
 */

import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { I18nService } from './core/i18n/i18n';
import { HTML_LANG } from './core/i18n/locale';
import { PageTitleService } from './core/seo/page-title';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly #i18n = inject(I18nService);
  readonly #page = inject(PageTitleService);

  protected readonly t = this.#i18n.t;

  /** The same page in the other language. What the header toggle points at. */
  readonly alternate = this.#i18n.alternate;

  /** `'ml'` on an English page and `'en'` on a Malayalam one. */
  readonly otherLang = computed(() =>
    this.#i18n.locale() === 'en' ? HTML_LANG.ml : HTML_LANG.en,
  );

  constructor() {
    effect(() => this.#page.setLanguage(this.#i18n.locale()));
  }
}
