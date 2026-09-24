/**
 * Ship gate. Seven checks, one exit code, run as part of `npm run build`.
 *
 *   1. Initial JS/CSS, gzipped, under 150 KiB.
 *   2. Everything the browser can download, under a data budget.
 *   3. The 4 MB prerender manifest is nowhere near the client.
 *   4. No element inside a `<noscript>`, in any prerendered document.
 *   5. No `@keyframes`, in any emitted CSS or JS.
 *   6. Every prerendered document has its own title and description.
 *   7. The prerendered set and the sitemap agree, on count and on origin.
 *
 * Checks 4-7 exist because `npm run build` passing and `npm run test:ci`
 * passing did not, on their own, mean the app worked. A `<p>` inside a
 * `<noscript>` built clean and tested clean through five phases and threw
 * NG0500 in a real browser on every page. Where a property can be checked
 * structurally against the emitted output, it is checked here rather than
 * trusted.
 *
 * Why check 1 lives here: `angular.json` budgets are the right place for it,
 * but Angular measures budgets in RAW bytes only. `InitialCalculator` in
 * @angular/build sums `asset.size`; the schema has no gzip or brotli option,
 * and the "Estimated transfer size" printed by the CLI is display-only and is
 * never compared against a budget.
 *
 * The budget in angular.json is therefore a raw-byte backstop, and this script
 * is the authoritative gate on the real constraint from docs/build-checklist.md:
 *
 *     main bundle < 150KB gzipped, excluding data files
 *
 * Data files are excluded from check 1 by construction: it measures only the
 * JS and CSS the browser loads for first paint, taken from the generated
 * index. Anything shipped through `public/` — the fonts, `data/network.json` —
 * is an asset, and checks 2 and 3 are what govern those.
 *
 * Checks 2 and 3 exist because `build/pages.json` is ~4 MB and build-time
 * only. CLAUDE.md's own "Prerendering, concretely" snippet shows it being
 * pulled in with `import manifest from '../build/pages.json'`, which
 * docs/build-checklist.md forbids outright — so the hazard is not
 * hypothetical, it is written down as an example to copy. Check 3 names it
 * directly; check 2 catches whatever arrives by a route nobody predicted.
 */

import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 150 KiB. The budget is a hard ceiling, not a target. */
const LIMIT_BYTES = 150 * 1024;

/**
 * 1 MiB of shared, every-visitor payload: JS, CSS, fonts, images and data,
 * raw. Today that is ~415 KiB, so this is not a tight collar — it is a
 * tripwire, and `pages.json` alone is four times the whole budget.
 *
 * Prerendered HTML is excluded on purpose. Phase 6 emits 1,250 documents and
 * nobody downloads more than one of them; each is capped individually below.
 */
const ASSET_BUDGET_BYTES = 1024 * 1024;

/**
 * Files that exist for crawlers and the host, not for visitors.
 *
 * The sitemap is 1,252 URLs with a full `hreflang` set on each and is around
 * 600 KB. No reader ever downloads it, Cloudflare serves it compressed, and
 * counting it against a budget meant to protect a phone on a patchy
 * connection would be measuring the wrong thing. It is reported separately
 * and sanity-checked against the sitemap protocol's own 50 MB limit.
 */
const CRAWLER_FILES = /^(sitemap\.xml|robots\.txt|_redirects)$/;
const SITEMAP_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * No single file in the browser output may exceed 512 KiB. The largest today
 * is a 130 KiB JS chunk, so nothing legitimate is close, and a manifest
 * inlined into a chunk or a prerendered page cannot hide under it.
 */
const FILE_CAP_BYTES = 512 * 1024;

/** Build-time only. It must never be reachable from a browser. */
const FORBIDDEN_IN_CLIENT = 'pages.json';

/**
 * The runtime bundle, which must be the other way round: always served.
 *
 * It is committed and byte-reproducible from the feed, so its absence means
 * someone deleted it or `public/` stopped being copied — and the app without
 * it is a blank screen, which is precisely the competitor's failure mode.
 */
const REQUIRED_IN_CLIENT = 'data/network.json';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(appRoot, 'dist');
const srcRoot = join(appRoot, 'src');

/** Collected so a breaking build reports everything wrong, not just the first. */
const problems = [];

function fail(message) {
  console.error(`\n  x  bundle check: ${message}\n`);
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

/** Find `dist/<project>/browser` without hardcoding the project name. */
function findBrowserDir() {
  if (!existsSync(distRoot)) fail(`no dist directory at ${distRoot} — run the build first`);
  for (const entry of readdirSync(distRoot)) {
    const candidate = join(distRoot, entry, 'browser');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  }
  // A non-SSR build emits straight into dist/<project>.
  for (const entry of readdirSync(distRoot)) {
    const candidate = join(distRoot, entry);
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return fail('could not locate the browser output directory');
}

const browserDir = findBrowserDir();

/**
 * `index.csr.html` is the client shell and references exactly the initial
 * entry points. `index.html` is prerendered and additionally modulepreloads
 * the lazy chunk for whichever route was rendered, which would overstate the
 * initial cost, so it is only a fallback.
 */
const indexFile = ['index.csr.html', 'index.html']
  .map((name) => join(browserDir, name))
  .find((path) => existsSync(path));

if (!indexFile) fail(`no index.csr.html or index.html in ${browserDir}`);

const html = readFileSync(indexFile, 'utf8');

/** Initial JS/CSS: render-blocking styles, the entry module, and its preloads. */
const patterns = [
  /<link[^>]+rel=["']stylesheet["'][^>]*?href=["']([^"']+)["']/gi,
  /<link[^>]+rel=["']modulepreload["'][^>]*?href=["']([^"']+)["']/gi,
  /<script[^>]+src=["']([^"']+)["'][^>]*type=["']module["']/gi,
  /<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["']/gi,
];

const referenced = new Set();
for (const pattern of patterns) {
  for (const [, href] of html.matchAll(pattern)) {
    if (/^(https?:)?\/\//.test(href) || href.startsWith('data:')) continue;
    if (!/\.(js|css)$/i.test(href)) continue;
    referenced.add(href.replace(/^\.?\//, ''));
  }
}

if (referenced.size === 0) fail(`found no initial JS or CSS referenced by ${indexFile}`);

const rows = [...referenced].sort().map((name) => {
  const path = join(browserDir, name);
  if (!existsSync(path)) fail(`${name} is referenced by the index but missing from the output`);
  const raw = readFileSync(path);
  return {
    name,
    raw: raw.byteLength,
    gzip: gzipSync(raw, { level: 9 }).byteLength,
    brotli: brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
});

const total = rows.reduce(
  (acc, r) => ({
    raw: acc.raw + r.raw,
    gzip: acc.gzip + r.gzip,
    brotli: acc.brotli + r.brotli,
  }),
  { raw: 0, gzip: 0, brotli: 0 },
);

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log('\nInitial bundle (gzip budget check)');
console.log('  ' + pad('File', 34) + lpad('Raw', 12) + lpad('Gzip', 12) + lpad('Brotli', 12));
console.log('  ' + '-'.repeat(70));
for (const r of rows) {
  console.log('  ' + pad(r.name, 34) + lpad(kb(r.raw), 12) + lpad(kb(r.gzip), 12) + lpad(kb(r.brotli), 12));
}
console.log('  ' + '-'.repeat(70));
console.log(
  '  ' + pad('Initial total', 34) + lpad(kb(total.raw), 12) + lpad(kb(total.gzip), 12) + lpad(kb(total.brotli), 12),
);

const headroom = LIMIT_BYTES - total.gzip;
const pct = ((total.gzip / LIMIT_BYTES) * 100).toFixed(1);

if (total.gzip > LIMIT_BYTES) {
  problems.push(
    `initial bundle is ${kb(total.gzip)} gzipped, over the ${kb(LIMIT_BYTES)} budget ` +
      `by ${kb(-headroom)}. Reduce the bundle — do not raise the budget.`,
  );
} else {
  console.log(
    `\n  ok  ${kb(total.gzip)} gzipped against a ${kb(LIMIT_BYTES)} budget ` +
      `(${pct}%, ${kb(headroom)} headroom)`,
  );
}

// ---------------------------------------------------------------- 2. payload

const emitted = walk(browserDir).map((path) => ({
  name: relative(browserDir, path).replace(/\\/g, '/'),
  bytes: statSync(path).size,
  path,
}));

const documents = emitted.filter((f) => extname(f.name) === '.html');
const crawlerFiles = emitted.filter((f) => CRAWLER_FILES.test(f.name));
const assets = emitted.filter(
  (f) => extname(f.name) !== '.html' && !CRAWLER_FILES.test(f.name),
);
const assetBytes = assets.reduce((n, f) => n + f.bytes, 0);

for (const file of assets) {
  if (file.bytes > FILE_CAP_BYTES) {
    problems.push(
      `${file.name} is ${kb(file.bytes)}, over the ${kb(FILE_CAP_BYTES)} per-file cap. ` +
        `Something large is being shipped to the browser.`,
    );
  }
}

const dataBundle = emitted.find((f) => f.name === REQUIRED_IN_CLIENT);
if (!dataBundle) {
  problems.push(
    `${REQUIRED_IN_CLIENT} is missing from the browser output. ` +
      `Regenerate it: python3 build_network.py KMRLOpenData`,
  );
} else {
  console.log(
    `  ok  ${REQUIRED_IN_CLIENT} is served ` +
      `(${kb(dataBundle.bytes)} raw, ${kb(gzipSync(readFileSync(dataBundle.path), { level: 9 }).byteLength)} gzipped)`,
  );
}

if (assetBytes > ASSET_BUDGET_BYTES) {
  const biggest = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  problems.push(
    `shared browser assets total ${kb(assetBytes)}, over the ${kb(ASSET_BUDGET_BYTES)} ` +
      `budget. Largest: ${biggest.map((f) => `${f.name} (${kb(f.bytes)})`).join(', ')}`,
  );
} else {
  console.log(
    `  ok  ${kb(assetBytes)} of shared assets in ${assets.length} files ` +
      `against a ${kb(ASSET_BUDGET_BYTES)} budget ` +
      `(${documents.length} prerendered document${documents.length === 1 ? '' : 's'} excluded)`,
  );
}

// --------------------------------------------------------------- 3. manifest

/**
 * The manifest must not reach the browser as a file, and must not be `import`ed
 * from anywhere in `src/` — not even from server-only code, because a static
 * import inlines all 4 MB into the SSR bundle too. The only sanctioned way to
 * read it is `readFileSync` inside a `*.server.ts`, where it stays a
 * build-time file read.
 */
const shipped = emitted.filter((f) => basename(f.name) === FORBIDDEN_IN_CLIENT);
for (const file of shipped) {
  problems.push(
    `${file.name} was emitted into the browser output. ${FORBIDDEN_IN_CLIENT} is a ` +
      `build-time artifact and must never be served.`,
  );
}

/**
 * Comments are stripped before scanning, and the filename must then be quoted.
 *
 * Requiring quotes alone was not enough. JSDoc marks up code with backticks
 * and backticks are also template-literal delimiters, so every comment that
 * *documents* this rule — in `app.routes.server.ts`, in `app.routes.ts`, in
 * the string catalogue — read as a violation of it. A gate that punishes the
 * documentation of the hazard it enforces is a gate people route around.
 *
 * After stripping, anything that actually resolves the file — an import
 * specifier, a `fetch` URL, a path handed to `readFileSync` — is still a
 * quoted string, and nothing else is.
 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const IMPORT_SPECIFIER = new RegExp(
  String.raw`\b(?:import|require)\b[^;\n]*?['"\`][^'"\`]*${FORBIDDEN_IN_CLIENT}['"\`]`,
);
const QUOTED_PATH = new RegExp(String.raw`['"\`][^'"\`]*${FORBIDDEN_IN_CLIENT}['"\`]`);

const sources = existsSync(srcRoot)
  ? walk(srcRoot).filter((p) => /\.(ts|html)$/.test(p))
  : [];

let referencing = 0;
for (const path of sources) {
  const name = relative(appRoot, path).replace(/\\/g, '/');
  const source = stripComments(readFileSync(path, 'utf8'));
  if (!QUOTED_PATH.test(source)) continue;
  referencing++;

  if (IMPORT_SPECIFIER.test(source)) {
    problems.push(
      `${name} imports ${FORBIDDEN_IN_CLIENT}. Read it with readFileSync in ` +
        `server-only code instead — an import bundles all 4 MB of it.`,
    );
    continue;
  }
  const serverOnly = /\.server\.ts$/.test(name) || name === 'src/server.ts';
  if (!serverOnly) {
    problems.push(
      `${name} resolves ${FORBIDDEN_IN_CLIENT} but is reachable from the browser. ` +
        `Only *.server.ts may touch it.`,
    );
  } else if (!source.includes('readFileSync')) {
    problems.push(
      `${name} resolves ${FORBIDDEN_IN_CLIENT} without readFileSync. ` +
        `That is the only sanctioned way to load it.`,
    );
  }
}

if (!shipped.length && !problems.some((p) => p.includes(FORBIDDEN_IN_CLIENT))) {
  console.log(
    `  ok  ${FORBIDDEN_IN_CLIENT} is absent from the browser output and ` +
      `${referencing === 0 ? 'unreferenced in src/' : `read correctly in ${referencing} source file(s)`}`,
  );
}

// ------------------------------------------- 4-7. the prerendered documents

/**
 * Read every prerendered document once and check four things about it.
 *
 * Four rather than four passes: there are 1,252 of them and they are the bulk
 * of the output, so they are read once and inspected in memory.
 */
const NOSCRIPT = /<noscript[^>]*>([\s\S]*?)<\/noscript>/gi;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const DESCRIPTION = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i;
const CANONICAL = /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i;

const titles = new Map();
const descriptions = new Map();
const canonicalOrigins = new Set();
let withNoscript = 0;
let withoutTitle = 0;
let withoutDescription = 0;

/**
 * `index.csr.html` is the client shell, not a page.
 *
 * It carries index.html's static title and description, it is never indexed,
 * and it exists so an unmatched URL and an offline navigation have something
 * to boot from. Counting it as a page would report a duplicate title that is
 * not one, and would make the document count disagree with the sitemap by one
 * forever.
 */
const pages = documents.filter((f) => f.name !== 'index.csr.html');

for (const file of pages) {
  const source = readFileSync(file.path, 'utf8');
  /**
   * Only the body is checked.
   *
   * Angular's own critical-CSS step emits `<noscript><link rel=stylesheet>` in
   * the `<head>` — which is correct, because hydration only covers the app
   * root's DOM and nothing in `<head>` is ever reconciled. Inside the
   * hydration boundary the same markup is fatal: with JavaScript enabled the
   * browser parses a noscript's contents as one raw text node while the
   * server emitted real elements, and Angular throws NG0500. The distinction
   * is the whole point of the check, so the scan starts after `</head>`.
   */
  const head = source.indexOf('</head>');
  const body = head === -1 ? source : source.slice(head);

  // 4. A noscript may contain TEXT ONLY. With JavaScript enabled the browser
  //    parses its contents as one raw text node and never builds DOM from it,
  //    while the server renders real elements — so one child element is an
  //    automatic NG0500 hydration mismatch at runtime, invisible to the build
  //    and to the unit tests. It reached Phase 5 in all three templates.
  for (const [, inner] of body.matchAll(NOSCRIPT)) {
    withNoscript++;
    const stripped = inner.replace(/<!--[\s\S]*?-->/g, '');
    if (/</.test(stripped)) {
      problems.push(
        `${file.name} has markup inside a <noscript>: ${stripped.trim().slice(0, 80)}. ` +
          `A noscript may contain text only — see CLAUDE.md's toolchain gotchas.`,
      );
      break;
    }
  }

  // 6. A title and a description, and distinct ones. KMRL ships 25 identical
  //    titles across 25 station pages; being different is the whole exercise.
  const title = TITLE.exec(source)?.[1]?.trim();
  if (!title) withoutTitle++;
  else titles.set(title, (titles.get(title) ?? 0) + 1);

  const description = DESCRIPTION.exec(source)?.[1]?.trim();
  if (!description) withoutDescription++;
  else descriptions.set(description, (descriptions.get(description) ?? 0) + 1);

  const canonical = CANONICAL.exec(source)?.[1];
  if (canonical) canonicalOrigins.add(new URL(canonical).origin);
}

if (withoutTitle > 0) {
  problems.push(`${withoutTitle} prerendered document(s) have no <title>.`);
}
if (withoutDescription > 0) {
  problems.push(
    `${withoutDescription} prerendered document(s) have no meta description.`,
  );
}

const duplicateTitles = [...titles.entries()].filter(([, n]) => n > 1);
const duplicateDescriptions = [...descriptions.entries()].filter(([, n]) => n > 1);
if (duplicateTitles.length > 0) {
  const worst = duplicateTitles.sort((a, b) => b[1] - a[1])[0];
  problems.push(
    `${duplicateTitles.length} <title> value(s) are shared by more than one page. ` +
      `Worst: "${worst[0]}" on ${worst[1]} pages. KMRL ships 25 identical ones; ` +
      `not doing that is the point.`,
  );
}
if (duplicateDescriptions.length > 0) {
  const worst = duplicateDescriptions.sort((a, b) => b[1] - a[1])[0];
  problems.push(
    `${duplicateDescriptions.length} meta description(s) are shared by more than one page. ` +
      `Worst: "${worst[0].slice(0, 60)}…" on ${worst[1]} pages.`,
  );
}

console.log(
  `  ok  ${pages.length} prerendered pages, ${titles.size} distinct titles, ` +
    `${descriptions.size} distinct descriptions`,
);
console.log(
  `  ok  ${withNoscript} <noscript> blocks, none containing an element ` +
    `(the NG0500 trap — build-clean and test-clean, browser-fatal)`,
);

// 5. Zero @keyframes. The motion policy is CSS transitions only, <=150ms, on
//    colour / opacity / transform, and nothing animates on load. A keyframe
//    in a JS chunk would be a library injecting styles at runtime.
const animated = [];
for (const file of assets) {
  if (!/\.(css|js|mjs)$/.test(file.name)) continue;
  if (/@keyframes/.test(readFileSync(file.path, 'utf8'))) animated.push(file.name);
}
if (animated.length > 0) {
  problems.push(
    `@keyframes found in ${animated.join(', ')}. The motion policy is transitions ` +
      `only, <=150ms, and nothing animates on load.`,
  );
} else {
  console.log(`  ok  no @keyframes in any emitted CSS or JS`);
}

// 7. The sitemap and the prerendered set must be the same set of pages, on the
//    same origin. A canonical pointing at one origin while the sitemap
//    declares another is how half a site quietly stops being indexed.
const sitemap = crawlerFiles.find((f) => f.name === 'sitemap.xml');
if (!sitemap) {
  problems.push(
    'sitemap.xml is missing from the browser output. ' +
      'scripts/postbuild.mjs copies it from build/; regenerate with build_pages.py.',
  );
} else {
  if (sitemap.bytes > SITEMAP_LIMIT_BYTES) {
    problems.push(`sitemap.xml is ${kb(sitemap.bytes)}, over the 50 MB sitemap limit.`);
  }
  const xml = readFileSync(sitemap.path, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const sitemapOrigins = new Set(locs.map((loc) => new URL(loc).origin));

  if (locs.length !== pages.length) {
    problems.push(
      `the sitemap declares ${locs.length} URLs but ${pages.length} pages were ` +
        `prerendered. They must be the same set — regenerate build/pages.json and rebuild.`,
    );
  }
  for (const origin of canonicalOrigins) {
    if (!sitemapOrigins.has(origin)) {
      problems.push(
        `pages declare rel=canonical on ${origin} but the sitemap uses ` +
          `${[...sitemapOrigins].join(', ')}. Set SITE_ORIGIN and --base-url to the same value.`,
      );
    }
  }
  if (!problems.some((p) => p.includes('sitemap'))) {
    console.log(
      `  ok  sitemap.xml declares ${locs.length} URLs on ${[...sitemapOrigins].join(', ')}, ` +
        `matching the prerendered set and its canonicals`,
    );
  }
}

// ------------------------------------------------------------------ verdict

if (problems.length) {
  console.error(`\n  x  bundle check failed (${problems.length}):`);
  for (const problem of problems) console.error(`     - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('');
