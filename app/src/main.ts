import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Register the service worker, after the app has booted.
 *
 * After, not before: registration competes for bandwidth with the chunks and
 * the 7 kB data bundle, and the first visit is the one that has to be fast.
 * Once it is installed the app is complete on the device and works offline
 * permanently — there is no live data to go stale (CLAUDE.md decision 2).
 *
 * Failure is swallowed. A blocked or unsupported worker costs the reader
 * nothing: every page is prerendered and the data bundle is 7 kB, so the app
 * works exactly as well without it, only online. Logging a red error for a
 * feature that degrades to "normal website" would be noise.
 */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

bootstrapApplication(App, appConfig)
  .then(registerServiceWorker)
  .catch((err) => console.error(err));
