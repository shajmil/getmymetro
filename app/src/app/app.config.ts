import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Angular 21 is zoneless by default and the scaffold ships no zone.js.
    // Declared explicitly so the guarantee is visible in code and a future
    // dependency cannot quietly reintroduce zone-based change detection.
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      // `:slug` and `:pair` arrive as signal inputs on the station and route
      // pages, so neither has to inject ActivatedRoute or subscribe to
      // anything, and both are driven in a test by setting an input.
      // Measured cost: 0.35 kB gzipped.
      withComponentInputBinding(),
      // `anchorScrolling` is what makes the home screen's "First and last
      // train from X" link land on that section of the station page rather
      // than at the top of it. It only acts when a URL carries a fragment.
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideClientHydration(withEventReplay()),
  ],
};
