import { Routes } from '@angular/router';

/**
 * Six routes, and four of them are the 1,250 prerendered pages.
 *
 * `:slug` and `:pair` are bound straight to the components' signal inputs by
 * `withComponentInputBinding()` in `app.config.ts`, so neither page injects
 * `ActivatedRoute` and both are testable by setting an input.
 *
 * **The `/ml` routes load the same components.** There is no second app and no
 * second build: the language is read from the URL by `core/i18n/i18n.ts` and
 * every string comes from the catalogue. Angular's `$localize` would have
 * meant two browser bundles, two prerender passes and two service-worker
 * precache sets for a 25-station app, and the runtime cost of the catalogue is
 * a few kB in one chunk.
 *
 * Nothing here hardcodes a station or a pair. The slugs come from the feed's
 * own station names (`core/data/slugs.ts`) and the prerendered set comes from
 * `build/pages.json`, so a KMRL rename moves the URLs rather than breaking
 * them silently.
 *
 * No `title` is declared. Angular's `TitleStrategy` would run *after* the
 * server initialiser and overwrite the per-page title that
 * `app.routes.server.ts` reads out of the manifest — which is the one thing
 * this phase exists to get right, since KMRL ships 25 identical ones. The
 * pages set their own title on a client-side navigation instead, through
 * `core/seo/page-title.ts`.
 */

const home = () => import('./pages/home/home').then((m) => m.Home);
const station = () => import('./pages/station/station').then((m) => m.StationPage);
const route = () => import('./pages/route/route').then((m) => m.RoutePage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: home },
  { path: 'station/:slug', loadComponent: station },
  { path: 'route/:pair', loadComponent: route },

  { path: 'ml', pathMatch: 'full', loadComponent: home },
  { path: 'ml/station/:slug', loadComponent: station },
  { path: 'ml/route/:pair', loadComponent: route },
];
