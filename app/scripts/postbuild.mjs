/**
 * After `ng build`: finish the three things the Angular builder cannot.
 *
 *   1. Put `build/sitemap.xml` where a crawler looks for it. It is generated
 *      by `build_pages.py` from the same manifest the prerender reads, so
 *      copying it is what keeps the sitemap and the prerendered set in step —
 *      `check-bundle-size.mjs` then asserts they agree.
 *   2. Mark the client shell `noindex`, so no non-prerendered URL is indexed.
 *   3. Give `sw.js` its precache list. The filenames are content-hashed, so
 *      the list only exists once the build has run.
 *
 * Runs before `check-bundle-size.mjs`, so the gate sees the finished output.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const distRoot = join(appRoot, 'dist');

function fail(message) {
  console.error(`\n  x  postbuild: ${message}\n`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function findBrowserDir() {
  if (!existsSync(distRoot)) fail(`no dist directory at ${distRoot} — run the build first`);
  for (const entry of readdirSync(distRoot)) {
    const candidate = join(distRoot, entry, 'browser');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  }
  for (const entry of readdirSync(distRoot)) {
    const candidate = join(distRoot, entry);
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return fail('could not locate the browser output directory');
}

const browserDir = findBrowserDir();
const files = walk(browserDir).map((path) => relative(browserDir, path).replace(/\\/g, '/'));

// ------------------------------------------------------------ 1. sitemap

const sitemapSource = join(repoRoot, 'build', 'sitemap.xml');
if (!existsSync(sitemapSource)) {
  fail(
    'build/sitemap.xml is missing. Regenerate it with: ' +
      'python3 build_pages.py KMRLOpenData --base-url https://kochimetro.shajmil.site',
  );
}
copyFileSync(sitemapSource, join(browserDir, 'sitemap.xml'));
console.log(`  ok  sitemap.xml copied from build/ (${readFileSync(sitemapSource, 'utf8').match(/<loc>/g)?.length ?? 0} URLs)`);

// ------------------------------------------------- 2. the client shell

/**
 * `index.csr.html` must never be indexed.
 *
 * The host serves it, with a 200, for every path that is not a prerendered
 * file: `/from/*` (deliberately unindexed, see app.routes.ts), route URLs typed
 * with a variant spelling (`/route/aluva-to-edappally`, a duplicate of a page
 * that has its own canonical), and paths that do not exist at all. Without
 * this, all three reach Google as thin 200s with the generic home title and no
 * canonical — soft 404s and duplicates. `follow` keeps its links counting.
 *
 * Only this file: a prerendered page is always served as itself, first.
 */
const shellPath = join(browserDir, 'index.csr.html');
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, 'utf8');
  if (!shell.includes('name="robots"')) {
    const tagged = shell.replace('<head>', '<head><meta name="robots" content="noindex, follow">');
    if (tagged === shell) fail('index.csr.html has no <head> to mark noindex');
    writeFileSync(shellPath, tagged);
  }
  console.log('  ok  index.csr.html marked noindex, follow');
}

/**
 * `404.html`, served by the host with a real 404 status.
 *
 * Both hosts (public/_redirects, vercel.json) hand the client shell only to
 * the paths that need it — `/from/*` and `/route/*` in both languages. Every
 * other path is either a prerendered file or does not exist, and a path that
 * does not exist gets this, with a 404 status, rather than the shell with a
 * 200. A 200 for a missing page is a soft 404 however it is tagged.
 *
 * Static and self-contained: no Angular, no hydration, nothing that can fail.
 * It lists all 25 stations from the same manifest the prerender reads, so a
 * reader who followed a bad link is one tap from a real page.
 */
const manifestPath = join(repoRoot, 'build', 'pages.json');
const stationLinks = JSON.parse(readFileSync(manifestPath, 'utf8'))
  .pages.filter((page) => page.type === 'station' && page.lang === 'en')
  .map((page) => {
    const name = page.title.split(' Metro Station')[0];
    return `<li><a href="${page.path}">${name}</a></li>`;
  });
if (stationLinks.length !== 25) fail(`404.html expected 25 stations, found ${stationLinks.length}`);

const notFound = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>Page not found · Kochi Metro Timings</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fff; color: #101114; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 8px; }
  p { color: #55575e; margin: 0 0 24px; }
  a { color: #00707c; }
  ul { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 24px; }
  li { padding: 6px 0; break-inside: avoid; }
  .home { display: inline-block; margin-bottom: 32px; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Page not found</h1>
  <p>That address is not a page on Kochi Metro Timings. Pick a station below, or start from the home page.</p>
  <a class="home" href="/">Kochi Metro Timings home</a> · <a class="home" href="/ml" lang="ml">മലയാളം</a>
  <ul>${stationLinks.join('')}</ul>
</main>
</body>
</html>
`;
writeFileSync(join(browserDir, '404.html'), notFound);
console.log('  ok  404.html written (25 station links, noindex)');

// ----------------------------------------------------------------- 3. sw

const swPath = join(browserDir, 'sw.js');
if (!existsSync(swPath)) fail('sw.js is missing from the browser output — is it still in public/?');

/**
 * The whole application, minus the things that must not be precached.
 *
 * Excluded, each for its own reason:
 *   - `*.html`   1,252 prerendered documents. Cached as they are visited.
 *   - the Malayalam font (89 kB), gated behind `unicode-range` so an English
 *     reader never fetches it. Cached the first time a Malayalam page needs it.
 *   - the Geist licence text, which the SIL OFL requires be distributed with
 *     the font but which no reader ever loads.
 *   - `sitemap.xml`, `robots.txt`, `_redirects` — for crawlers and the host.
 *   - `sw.js` itself, which the browser manages.
 */
const EXCLUDE = [
  /\.html$/,
  /^sitemap\.xml$/,
  /^robots\.txt$/,
  /^_redirects$/,
  /^sw\.js$/,
  /^og\.png$/, // link-preview image: fetched by crawlers, never needed offline
  /noto-sans-malayalam\.woff2$/,
  /geist-LICENSE\.txt$/,
];

const precache = files
  .filter((name) => !EXCLUDE.some((pattern) => pattern.test(name)))
  .map((name) => `/${name}`)
  .concat(['/index.csr.html'])
  .sort();

if (!files.includes('index.csr.html')) {
  fail('index.csr.html is missing — the service worker has no offline shell to fall back to');
}
if (!precache.includes('/data/network.json')) {
  fail('data/network.json is not in the precache list — the app would not work offline');
}

const bytes = precache.reduce((total, name) => {
  const path = join(browserDir, name.slice(1));
  return total + (existsSync(path) ? statSync(path).size : 0);
}, 0);

// The version is the content of the precache list, so a build that changes
// nothing produces the same worker and clients are not churned for free.
const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);

const source = readFileSync(swPath, 'utf8');
const patched = source
  .replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`)
  .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache, null, 2)};`);

if (patched === source) fail('sw.js placeholders were not found — did the file change shape?');
writeFileSync(swPath, patched);

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
console.log(
  `  ok  sw.js precaches ${precache.length} files (${kb(bytes)} raw), version ${version}`,
);
