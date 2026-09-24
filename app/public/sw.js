/**
 * getmymetro's service worker. Hand-written, and small on purpose.
 *
 * ---------------------------------------------------------------------------
 * Why not `@angular/service-worker`
 * ---------------------------------------------------------------------------
 *
 * ngsw is the obvious choice and it is the wrong shape here. Its asset groups
 * are glob-based over the build output, and this build emits **1,252
 * prerendered HTML documents**. Precaching those is tens of megabytes on a
 * phone for pages nobody will open; excluding them correctly, while still
 * precaching the shell, is more configuration than this file is code. Adding
 * the package also means an npm install on a toolchain CLAUDE.md records as
 * fragile, for a worker that has exactly three caching rules.
 *
 * ---------------------------------------------------------------------------
 * What is precached, and what is not
 * ---------------------------------------------------------------------------
 *
 * Precached at install: the client shell, every JS and CSS chunk (including
 * the three lazy route chunks, Leaflet and its stylesheet), the Latin font,
 * the icons, the manifest, and `data/network.json`. That is the entire
 * application. There is no API and no live data (CLAUDE.md decision 2), so
 * once this is on the device the app is complete and works offline
 * **permanently** — not "until the cache goes stale", because there is nothing
 * to go stale.
 *
 * Leaflet is precached even though its basemap tiles can never be: CARTO is a
 * third origin and this worker deliberately does not touch it. That is not
 * waste. Partial connectivity is the normal Kochi case, and with the library
 * already on the device the map appears the moment the first tile lands
 * instead of after a 42 kB download. When no tile lands at all,
 * `shared/map/line-map.ts` falls back to the SVG schematic, which needs no
 * network whatsoever.
 *
 * Not precached: the 1,252 prerendered documents, and the 89 kB Malayalam
 * font. The documents are cached as they are visited. The font is gated
 * behind `unicode-range` in CSS, so an English reader never downloads it, and
 * precaching it at install would hand that saving straight back. It is cached
 * the first time a Malayalam page pulls it.
 *
 * ---------------------------------------------------------------------------
 * No `skipWaiting`
 * ---------------------------------------------------------------------------
 *
 * Deliberate. Assets are content-hashed and served cache-first, and a new
 * version deletes the old cache on activate. If a new worker took over a page
 * that was already running the old bundle, that page could ask for a lazy
 * chunk that no longer exists. Letting the new version wait until every old
 * tab has gone removes the failure mode entirely, at the cost of an update
 * landing on the next visit rather than mid-session. For a timetable that
 * KMRL has not republished since August 2024, that is not a cost.
 */

/** Replaced at build time by `scripts/postbuild.mjs`. */
const VERSION = '__VERSION__';
const PRECACHE = [];

const CACHE = `getmymetro-${VERSION}`;
/** What an uncached navigation falls back to: the empty client shell. */
const SHELL = '/index.csr.html';
/** The whole network, ~7 kB over the wire. */
const DATA = '/data/network.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `addAll` is atomic: one 404 and nothing is cached, which is the right
      // behaviour — a half-precached app that claims to work offline is worse
      // than one that does not claim it.
      cache.addAll(PRECACHE),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('getmymetro-') && name !== CACHE) await caches.delete(name);
      }
      // Safe without `skipWaiting`: a new version only reaches activate once
      // every page running the old one has gone.
      await self.clients.claim();
    })(),
  );
});

/** Content-hashed, so what is in the cache is what the URL means, forever. */
function isImmutable(url) {
  return /\.(js|css|woff2|png|ico|svg)$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

/**
 * Serve the cached bundle at once, and refresh it in the background.
 *
 * The feed changes rarely and without warning, so the reader should never wait
 * on the network for it — but should pick up a republish on the visit after it
 * lands rather than being pinned to an old copy forever.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  throw new Error('network.json is not available offline and not in the cache');
}

/**
 * A page. Network first, so a fresh prerender wins when there is a connection.
 *
 * Offline it falls back to this exact URL if it has been visited, and to the
 * client shell if not — from which the app renders the route itself, because
 * the whole network is already in the cache. That is the part no competitor
 * manages: keralam.co has an empty manifest and no worker at all, and KMRL's
 * site is server-rendered per request.
 */
async function pageFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match(SHELL);
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageFirst(request));
    return;
  }
  if (url.pathname === DATA) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (isImmutable(url)) {
    event.respondWith(cacheFirst(request));
  }
});
