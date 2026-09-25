/**
 * After `ng build`: finish the two things the Angular builder cannot.
 *
 *   1. Give `sw.js` its precache list. The filenames are content-hashed, so
 *      the list only exists once the build has run.
 *   2. Put `build/sitemap.xml` where a crawler looks for it. It is generated
 *      by `build_pages.py` from the same manifest the prerender reads, so
 *      copying it is what keeps the sitemap and the prerendered set in step —
 *      `check-bundle-size.mjs` then asserts they agree.
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
      'python3 build_pages.py KMRLOpenData --base-url https://getmymetro.com',
  );
}
copyFileSync(sitemapSource, join(browserDir, 'sitemap.xml'));
console.log(`  ok  sitemap.xml copied from build/ (${readFileSync(sitemapSource, 'utf8').match(/<loc>/g)?.length ?? 0} URLs)`);

// ----------------------------------------------------------------- 2. sw

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
