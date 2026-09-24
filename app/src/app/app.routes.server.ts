/**
 * The 1,250 prerendered pages, and where their titles come from.
 *
 * `build_pages.py` writes `build/pages.json`: 25 stations and 600 ordered
 * pairs, in English and Malayalam, each with the path, a distinct title and a
 * distinct description built from the feed. This file turns that into
 * `getPrerenderParams` for the four parameterised routes and a
 * `path → {title, description}` index for the server initialiser.
 *
 * ---------------------------------------------------------------------------
 * `readFileSync`, never `import`
 * ---------------------------------------------------------------------------
 *
 * The manifest is ~4 MB and build-time only. A static `import` of it would
 * inline all 4 MB into the module graph — including the SSR bundle, and from
 * there into anything that bundles the SSR entry. `readFileSync` keeps it a
 * file read that happens once, at prerender time, in Node.
 *
 * CLAUDE.md's own "Prerendering, concretely" snippet shows the import form.
 * It is wrong, `docs/build-checklist.md` forbids it outright, and
 * `scripts/check-bundle-size.mjs` fails the build if either the import or the
 * file itself reaches the client. So the hazard is not hypothetical — it is
 * written down as an example to copy.
 *
 * ---------------------------------------------------------------------------
 * A missing manifest fails the build, loudly
 * ---------------------------------------------------------------------------
 *
 * `build/` is gitignored, so a fresh clone has no manifest until
 * `python3 build_pages.py KMRLOpenData --base-url https://<domain>` has run.
 * The tempting fallback — prerender the home page and carry on — would ship a
 * site with two pages instead of 1,252 and nothing in the output would say so.
 * The whole search strategy is those pages. Better to stop.
 */

import { RenderMode, ServerRoute } from '@angular/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One entry from the manifest. Only the fields the render needs are typed. */
interface ManifestPage {
  readonly type: 'station' | 'route';
  readonly lang: 'en' | 'ml';
  /** `/station/aluva`, `/ml/route/aluva-to-edapally`. */
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

interface Manifest {
  readonly page_count: number;
  readonly pages: readonly ManifestPage[];
}

/** What one document's `<head>` needs. */
export interface PageMeta {
  readonly title: string;
  readonly description: string;
}

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where the manifest might be, relative to wherever this module ends up.
 *
 * The prerender runs the built SSR bundle from `dist/`, and the dev-server
 * runs it from memory with a different `import.meta.url`, so neither a path
 * relative to the source file nor one relative to `process.cwd()` is reliable
 * on its own. All of them are tried and the first that exists wins.
 */
const CANDIDATES = [
  join(process.cwd(), '..', 'build', 'pages.json'),
  join(process.cwd(), 'build', 'pages.json'),
  resolve(here, '..', '..', '..', 'build', 'pages.json'),
  resolve(here, '..', '..', '..', '..', 'build', 'pages.json'),
];

function loadManifest(): Manifest {
  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue;
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  }
  throw new Error(
    'build/pages.json not found. It is build-time only and gitignored; ' +
      'regenerate it with: python3 build_pages.py KMRLOpenData --base-url https://getmymetro.com',
  );
}

/** Read once per process, not once per prerendered document. */
let manifest: Manifest | undefined;
let metaIndex: ReadonlyMap<string, PageMeta> | undefined;

function pages(): readonly ManifestPage[] {
  manifest ??= loadManifest();
  return manifest.pages;
}

/** `/ml/station/aluva` → its title and description, or `undefined`. */
export function pageMetaFor(path: string): PageMeta | undefined {
  if (metaIndex === undefined) {
    const index = new Map<string, PageMeta>();
    for (const page of pages()) {
      index.set(page.path, { title: page.title, description: page.description });
    }
    metaIndex = index;
  }
  return metaIndex.get(path);
}

/** How many pages the manifest declares. Reported by the build gate. */
export function manifestPageCount(): number {
  return pages().length;
}

/**
 * The last path segment of every page of one type and language.
 *
 * `/ml/route/aluva-to-edapally` → `aluva-to-edapally`, which is exactly the
 * `:pair` the router binds.
 */
function paramsFor(
  type: ManifestPage['type'],
  lang: ManifestPage['lang'],
  key: 'slug' | 'pair',
): Record<string, string>[] {
  return pages()
    .filter((page) => page.type === type && page.lang === lang)
    .map((page) => ({ [key]: page.path.slice(page.path.lastIndexOf('/') + 1) }));
}

/**
 * Every route prerendered.
 *
 * There is no backend and nothing to render on request (CLAUDE.md decision 2
 * and 3: Cloudflare Pages, static). The `**` fallback is `Server` only so a
 * URL nobody prerendered still resolves when the SSR bundle is running; on
 * Cloudflare it never executes, and `public/_redirects` rewrites the unmatched
 * path to the client shell instead.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'ml', renderMode: RenderMode.Prerender },
  {
    path: 'station/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => paramsFor('station', 'en', 'slug'),
  },
  {
    path: 'ml/station/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => paramsFor('station', 'ml', 'slug'),
  },
  {
    path: 'route/:pair',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => paramsFor('route', 'en', 'pair'),
  },
  {
    path: 'ml/route/:pair',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => paramsFor('route', 'ml', 'pair'),
  },
  { path: '**', renderMode: RenderMode.Server },
];
