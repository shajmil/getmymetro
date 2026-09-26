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

import { LanguageSwitch } from './shared/controls';
import { InstallPrompt } from './shared/install-prompt';
import { I18nService } from './core/i18n/i18n';
import { HTML_LANG } from './core/i18n/locale';
import { PageTitleService } from './core/seo/page-title';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, LanguageSwitch, InstallPrompt],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly #i18n = inject(I18nService);
  readonly #page = inject(PageTitleService);

  protected readonly t = this.#i18n.t;
  protected readonly localPath = this.#i18n.localPath;

  /** The same page in the other language. What the header toggle points at. */
  readonly alternate = this.#i18n.alternate;

  /**
   * True on the home page, in either language.
   *
   * The desktop nav's "Journey" item is the home page, so this is what marks
   * it current. It is derived from the canonical (language-free) path rather
   * than the raw URL, so `/ml` counts as home exactly as `/` does — otherwise
   * the Malayalam reader would never see a current item.
   */
  protected readonly onHome = computed(() => this.#i18n.canonical() === '/');

  /** `'ml'` on an English page and `'en'` on a Malayalam one. */
  readonly otherLang = computed(() =>
    this.#i18n.locale() === 'en' ? HTML_LANG.ml : HTML_LANG.en,
  );

  constructor() {
    effect(() => this.#page.setLanguage(this.#i18n.locale()));
  }
}
