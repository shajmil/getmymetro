/**
 * The site's own origin, in one place.
 *
 * Used for `rel=canonical`, the `hreflang` pairs and the absolute URLs inside
 * the JSON-LD. `build_pages.py` takes the same value as `--base-url` when it
 * writes `build/sitemap.xml`, and `scripts/check-bundle-size.mjs` fails the
 * build if the two disagree — a canonical pointing at one origin while the
 * sitemap declares another is the kind of mismatch that quietly halves what
 * gets indexed.
 *
 * CLAUDE.md is explicit that a real domain is registered before launch rather
 * than shipping on `*.pages.dev`. Change it here, re-run `build_pages.py` with
 * the matching `--base-url`, and the gate will confirm they agree.
 */
export const SITE_ORIGIN = 'https://getmymetro.com';
