/**
 * The language of the page, and the function that speaks it.
 *
 * The locale is read from the **URL**, not from a preference, a header or
 * `localStorage`. That is what makes `/ml/route/mg-road-to-aluva` a page a
 * crawler can index, a reader can bookmark and a commuter can paste into a
 * WhatsApp group — CLAUDE.md's search strategy 4 says Malayalam transit
 * queries are uncontested, and a language that only exists behind a toggle
 * cannot be indexed at all.
 *
 * It is resolved **synchronously**, from `PlatformLocation`, before the first
 * render on either side. Angular's server render and the browser's first pass
 * therefore agree by construction. Resolving it from an async source — or from
 * a router event that lands after bootstrap — would mean the server emitting
 * Malayalam and the client's first render emitting English, which is an
 * NG0500 hydration mismatch, the same class of bug the `noscript` rule guards
 * against and equally invisible to the build and the unit tests.
 *
 * `t` is an arrow property rather than a method so a template can call it
 * directly (`{{ t('home.picked') }}`) without binding. It reads the locale
 * signal on every call, so a client-side navigation from `/station/aluva` to
 * `/ml/station/aluva` re-renders the page in Malayalam without a reload.
 */

import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';

import {
  alternatePath,
  localeOfPath,
  localised,
  pathWithoutLocale,
  type AppLocale,
} from './locale';
import type { StringKey, StringParams } from './strings';
import { translate } from './translate';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly #platform = inject(PlatformLocation);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  readonly #locale = signal<AppLocale>(localeOfPath(this.#platform.pathname));
  readonly #url = signal<string>(this.#platform.pathname);

  /** `'en'` or `'ml'`. Settled before the first render on server and client alike. */
  readonly locale = this.#locale.asReadonly();

  /** The other language's URL for the page on screen. What the header links to. */
  readonly alternate = computed(() => alternatePath(this.#url()));

  /** This page's canonical, language-free path. */
  readonly canonical = computed(() => pathWithoutLocale(this.#url()));

  constructor() {
    const subscription = this.#router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.#url.set(event.urlAfterRedirects);
        this.#locale.set(localeOfPath(event.urlAfterRedirects));
      }
    });
    this.#destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /** Translate. Bound, so a template can call it as `t('key')`. */
  readonly t = (key: StringKey, params?: StringParams): string =>
    translate(this.#locale(), key, params);

  /** A canonical path, prefixed for the language on screen. */
  readonly localPath = (path: string): string => localised(path, this.#locale());
}
