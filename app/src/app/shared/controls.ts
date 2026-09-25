/**
 * The small controls. DESIGN.md §5.6.
 *
 * Buttons are Phase A's `btn-primary` / `btn-secondary` utilities and need no
 * component — a class on a real `<button>` or `<a>` is the whole thing, and
 * wrapping them would only hide the element type from the caller, which is the
 * one thing a caller must not lose (§8: real `<button>`, `<a>`, `<input>`).
 *
 * What is here is the three that carry behaviour or structure a class cannot:
 * the language switch, the labelled search field, and the alert.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_LOCALES, type AppLocale } from '../core/i18n/locale';
import { I18nService } from '../core/i18n/i18n';

/**
 * EN / മല, segmented. DESIGN.md §5.6.
 *
 * ## Why these are links and not buttons
 *
 * The language is a property of the **URL** — `/station/aluva` and
 * `/ml/station/aluva` are two prerendered, indexable pages, per
 * `core/i18n/locale.ts` and CLAUDE.md's search strategy 4. A `<button>` that
 * swapped a signal would make Malayalam a client-side setting that no crawler
 * can reach and no reader can bookmark, which would throw away the one search
 * position CLAUDE.md calls uncontested.
 *
 * So the unselected segment is an `<a href>` to the same page in the other
 * language. The **selected** segment is a `<button aria-pressed="true">`
 * rather than a link to the page you are already on: `aria-pressed` is what
 * DESIGN.md §5.6 asks for, and a self-link would be a navigation that does
 * nothing.
 *
 * Both segments are 44px targets. The reference HTML sets the text at 15px;
 * it is 16px here, because the floor has no exceptions and this is the one
 * control a Malayalam reader has to find before anything else on the page is
 * readable to them.
 */
@Component({
  selector: 'app-language-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styles: `
    :host {
      display: inline-flex;
    }

    /* Each segment renders as one of two elements depending on selection, so
       the geometry lives on a shared class rather than on 'a' or 'button'. */
    .segment {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: var(--gmm-touch);
      min-inline-size: var(--gmm-touch);
      padding-inline: var(--gmm-space-3);
      border: 0;
      border-radius: var(--gmm-radius-toggle);
      background-color: transparent;
      color: var(--gmm-ink);
      font-family: inherit;
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.3;
      text-decoration: none;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        background-color var(--gmm-hover) var(--gmm-ease),
        color var(--gmm-hover) var(--gmm-ease);
    }

    /* Ink ground, white text: 18.88:1. The selector is the ARIA state itself,
       so a segment cannot look selected without also being announced as such. */
    .segment[aria-pressed='true'] {
      background-color: var(--gmm-ink);
      color: var(--gmm-bg);
    }

    .segment:not([aria-pressed='true']):hover {
      background-color: var(--gmm-bg);
    }

    /* Malayalam renders in its own face — Geist has no Malayalam coverage, so
       without this the segment falls back to whatever the system supplies. */
    .segment[lang='ml'] {
      font-family: var(--gmm-font-ml);
    }
  `,
  template: `
    <div class="lang-switch" role="group" [attr.aria-label]="t('shell.languageGroup')">
      @for (option of options(); track option.locale) {
        @if (option.selected) {
          <button
            type="button"
            class="segment"
            aria-pressed="true"
            [attr.lang]="option.locale"
          >
            {{ option.label }}
          </button>
        } @else {
          <a
            class="segment"
            aria-pressed="false"
            [attr.lang]="option.locale"
            [attr.hreflang]="option.locale"
            [routerLink]="option.path"
            [attr.title]="option.title"
          >
            {{ option.label }}
          </a>
        }
      }
    </div>
  `,
})
export class LanguageSwitch {
  readonly #i18n = inject(I18nService);
  protected readonly t = this.#i18n.t;

  /** The label for each segment. Each reads in the language it offers. */
  static readonly LABELS: Readonly<Record<AppLocale, string>> = { en: 'EN', ml: 'മല' };

  protected readonly options = computed(() => {
    const current = this.#i18n.locale();
    const alternate = this.#i18n.alternate();
    return APP_LOCALES.map((locale) => ({
      locale,
      label: LanguageSwitch.LABELS[locale],
      selected: locale === current,
      path: alternate,
      title: this.t('shell.switchTitle'),
    }));
  });
}

/**
 * The search field. DESIGN.md §5.6.
 *
 * 56px, 2px ink border, radius 12, and a **visible** label — "WHERE TO?" —
 * rather than a placeholder standing in for one. The placeholder carries the
 * example ("Station, in English or മലയാളം") and disappears on focus, which is
 * exactly why it cannot be the label.
 *
 * The `id` is required rather than generated: the label's `for` has to point
 * at it, and a component that invents an id makes the caller's own
 * `aria-describedby` and `aria-activedescendant` wiring impossible. The
 * choose-destination screen needs both.
 */
@Component({
  selector: 'app-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    .label {
      display: block;
      margin-block-end: var(--gmm-space-2);
      color: var(--gmm-ink-2);
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
    }

    :host-context([lang='ml']) .label {
      text-transform: none;
      letter-spacing: normal;
    }

    .input {
      display: block;
      inline-size: 100%;
      min-block-size: var(--gmm-touch-primary);
      padding: var(--gmm-space-3) var(--gmm-space-4);
      border: 2px solid var(--gmm-ink);
      border-radius: var(--gmm-radius-input);
      background-color: var(--gmm-bg);
      color: var(--gmm-ink);
      font-family: inherit;
      font-size: var(--text-body);
      line-height: 1.5;
    }

    /* ink-3 is 5.18:1 — a readable instruction, not a grey hint. */
    .input::placeholder {
      color: var(--gmm-ink-3);
      opacity: 1;
    }
  `,
  template: `
    <label class="label" [attr.for]="inputId()">{{ label() }}</label>
    <input
      class="input"
      type="search"
      [attr.id]="inputId()"
      [attr.name]="inputId()"
      [attr.placeholder]="placeholder()"
      [attr.value]="value()"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
  `,
})
export class SearchField {
  /** Required: the label's `for` points at it and the caller may need it too. */
  readonly inputId = input.required<string>();

  /** The visible label. "WHERE TO?" on the choose-destination screen. */
  readonly label = input.required<string>();

  readonly placeholder = input<string>('');

  readonly value = input<string>('');
}

/**
 * The alert. DESIGN.md §5.6 and §6's "Timetable unavailable" state.
 *
 * Amber-soft ground, an amber icon, a bold title and a plain explanation, with
 * `role="alert"` so it is announced when it appears.
 *
 * The icon is amber (5.36:1 on the amber ground) and the prose is ink
 * (16.17:1). Splitting them is deliberate: the alternative is a whole
 * paragraph set in the alert colour at 5.36:1 when 16.17:1 was available on the
 * same background for the part that matters most.
 *
 * The action is projected rather than an input, because "Try again" on the
 * home screen and "Try again" on the route page do different things and the
 * caller owns the handler. `role="alert"` is on the host so the whole thing is
 * announced as one region, including whatever the caller projects.
 */
@Component({
  selector: 'app-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      gap: var(--gmm-space-3);
      padding: var(--gmm-space-4);
      border-radius: var(--gmm-radius-alert);
      background-color: var(--gmm-amber-soft);
      color: var(--gmm-ink);
      font-size: var(--text-body);
      line-height: 1.5;
    }

    .icon {
      flex-shrink: 0;
      margin-block-start: 2px;
      color: var(--gmm-amber);
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .body {
      min-inline-size: 0;
    }

    .title {
      margin: 0;
      font-size: var(--text-body);
      font-weight: 600;
      line-height: 1.4;
    }

    .message {
      margin-block: var(--gmm-space-1) 0;
    }
  `,
  template: `
    <svg viewBox="0 0 24 24" width="22" height="22" class="icon" aria-hidden="true">
      <path d="M12 4 L21 19 H3 Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
    <div class="body">
      <p class="title">{{ title() }}</p>
      @if (message(); as text) {
        <p class="message">{{ text }}</p>
      }
      <ng-content />
    </div>
  `,
  host: {
    role: 'alert',
  },
})
export class Alert {
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
}
