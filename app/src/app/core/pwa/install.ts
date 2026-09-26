/**
 * "Add to home screen", as far as the browser lets a page take part in it.
 *
 * Chrome and Edge on Android and desktop fire `beforeinstallprompt` once the
 * app is installable (manifest + a service worker with a fetch handler). The
 * event is kept here so the page can offer its own "Install" button and open
 * the browser's dialog from it. It can fire before Angular has booted, which
 * is why `captureInstallPrompt` runs from `main.ts` ahead of the bootstrap
 * rather than from a component.
 *
 * Safari on iPhone and iPad fires nothing: installing there is only ever
 * Share → "Add to Home Screen", so `InstallPrompt` says that in words instead.
 */

import { signal } from '@angular/core';

/** Chrome's install event. Not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/** The deferred event while the app can be installed, otherwise null. */
export const installEvent = signal<BeforeInstallPromptEvent | null>(null);

/** True once the app has been installed during this visit. */
export const installed = signal(false);

export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's own mini-infobar from appearing; the page offers the
    // install itself, where the reader can see what it is for.
    event.preventDefault();
    installEvent.set(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    installEvent.set(null);
    installed.set(true);
  });
}
