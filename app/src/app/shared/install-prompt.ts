/**
 * The "Add to home screen" banner.
 *
 *   [icon]  Install GetMyMetro                 [Install]  [×]
 *           Open it from your home screen. Works offline.
 *
 * Android / desktop Chrome: the Install button opens the browser's own install
 * dialog (see `core/pwa/install.ts`). iPhone / iPad: Safari offers no such
 * dialog, so the banner says how — Share, then "Add to Home Screen".
 *
 * Never shown when the app is already running from the home screen, once it
 * has been installed, or for 30 days after "Not now". Nothing renders on the
 * server, so the 1,252 prerendered documents and their hydration are
 * untouched; the decision is made in the browser after the first render.
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import { installed, installEvent } from '../core/pwa/install';

const DISMISSED_KEY = 'gm.installDismissed';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

type Mode = 'prompt' | 'ios';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPod, and iPad — which reports itself as a Mac with a touch screen. */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-install-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Floats over the page bottom, clear of the phone's home indicator.
       Below the station picker (z-index 1000), which must cover it. */
    .card {
      position: fixed;
      inset-inline: 12px;
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 900;
      display: flex;
      align-items: center;
      gap: var(--gmm-space-3);
      max-inline-size: 30rem;
      margin-inline: auto;
      padding: var(--gmm-space-3) var(--gmm-space-1) var(--gmm-space-3) var(--gmm-space-3);
      border: 1px solid var(--gmm-grey);
      border-radius: var(--gmm-radius-panel);
      background-color: var(--gmm-bg);
    }

    .icon {
      flex-shrink: 0;
      border-radius: var(--gmm-radius-button);
    }

    .text {
      flex: 1;
      min-inline-size: 0;
    }

    p {
      margin: 0;
      font-size: var(--text-min);
      line-height: 1.4;
    }

    .title {
      font-weight: 600;
      color: var(--gmm-ink);
    }

    .body {
      color: var(--gmm-ink-2);
    }

    /* White on line-text is 5.82:1. 44px, per the touch-target floor. */
    .install {
      flex-shrink: 0;
      min-block-size: var(--gmm-touch);
      padding-inline: var(--gmm-space-4);
      border: 0;
      border-radius: var(--gmm-radius-button);
      background-color: var(--gmm-line-text);
      color: var(--gmm-bg);
      font-size: var(--text-min);
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }

    .install:hover,
    .install:active {
      background-color: var(--gmm-line-dark);
    }

    .close {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      inline-size: var(--gmm-touch);
      block-size: var(--gmm-touch);
      border: 0;
      border-radius: var(--gmm-radius-button);
      background: none;
      color: var(--gmm-ink-2);
      cursor: pointer;
      touch-action: manipulation;
    }

    .close:hover {
      color: var(--gmm-ink);
    }

    .close svg {
      inline-size: 1.25rem;
      block-size: 1.25rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
  `,
  template: `
    @if (mode(); as current) {
      <aside class="card" [attr.aria-label]="t('install.title')">
        <img class="icon" src="/icons/icon-192.png" alt="" width="44" height="44" />
        <div class="text">
          <p class="title">{{ t('install.title') }}</p>
          <p class="body">
            {{ current === 'ios' ? t('install.iosBody') : t('install.body') }}
          </p>
        </div>
        @if (current === 'prompt') {
          <button type="button" class="install" (click)="install()">
            {{ t('install.button') }}
          </button>
        }
        <button
          type="button"
          class="close"
          [attr.aria-label]="t('install.dismiss')"
          (click)="dismiss()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </aside>
    }
  `,
})
export class InstallPrompt {
  protected readonly t = inject(I18nService).t;

  /** Set in the browser only: not standalone and not recently dismissed. */
  readonly #eligible = signal(false);
  readonly #ios = signal(false);
  readonly #dismissed = signal(false);

  protected readonly mode = computed<Mode | null>(() => {
    if (!this.#eligible() || this.#dismissed() || installed()) return null;
    if (installEvent() !== null) return 'prompt';
    return this.#ios() ? 'ios' : null;
  });

  constructor() {
    afterNextRender(() => {
      if (isStandalone() || recentlyDismissed()) return;
      this.#ios.set(isIos());
      this.#eligible.set(true);
    });
  }

  protected async install(): Promise<void> {
    const event = installEvent();
    if (event === null) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // The event can only be used once, whatever the reader chose.
    installEvent.set(null);
    if (outcome === 'dismissed') this.dismiss();
  }

  protected dismiss(): void {
    this.#dismissed.set(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private mode or blocked storage: it is hidden for this visit anyway.
    }
  }
}
