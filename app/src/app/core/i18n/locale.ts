/**
 * Two languages, one URL space.
 *
 * English lives at `/station/aluva` and Malayalam at `/ml/station/aluva`. The
 * slug is the same in both, because it is derived from the feed's English
 * station name (`core/data/slugs.ts`) and a transliterated Malayalam slug
 * would be a second spelling to maintain, a second set of aliases, and a
 * second way for the prerender manifest and the router to disagree.
 *
 * `build_pages.py` already emits exactly this shape — `/ml` + the English path
 * — so the 1,250 prerendered routes, the sitemap's `hreflang` pairs and the
 * router are all reading the same rule rather than three copies of it.
 *
 * Nothing here is a setting. CLAUDE.md decision 7 makes bilingual part of the
 * MVP rather than a preference, so the language is a property of the URL: it
 * is linkable, indexable, and survives a share into WhatsApp.
 */

/** The two languages the UI is written in. The feed also carries Hindi; the UI does not. */
export type AppLocale = 'en' | 'ml';

export const APP_LOCALES: readonly AppLocale[] = ['en', 'ml'];

/** The prefix that marks a Malayalam URL. */
const ML_PREFIX = '/ml';

/** What goes in `<html lang>` and `hreflang`. */
export const HTML_LANG: Readonly<Record<AppLocale, string>> = { en: 'en', ml: 'ml' };

/** Strip the query and hash a router URL may carry, and normalise a trailing slash. */
function bare(url: string): string {
  const cut = url.split(/[?#]/, 1)[0];
  if (cut.length > 1 && cut.endsWith('/')) return cut.slice(0, -1);
  return cut === '' ? '/' : cut;
}

/** `/ml/station/aluva` → `'ml'`. Anything else is English. */
export function localeOfPath(url: string): AppLocale {
  const path = bare(url);
  return path === ML_PREFIX || path.startsWith(`${ML_PREFIX}/`) ? 'ml' : 'en';
}

/** `/ml/station/aluva` → `/station/aluva`. The canonical, language-free path. */
export function pathWithoutLocale(url: string): string {
  const path = bare(url);
  if (path === ML_PREFIX) return '/';
  if (path.startsWith(`${ML_PREFIX}/`)) return path.slice(ML_PREFIX.length);
  return path;
}

/** The same page in the given language. `/station/aluva` + `ml` → `/ml/station/aluva`. */
export function pathForLocale(url: string, locale: AppLocale): string {
  const path = pathWithoutLocale(url);
  if (locale === 'en') return path;
  return path === '/' ? ML_PREFIX : `${ML_PREFIX}${path}`;
}

/** The other language's URL for the page at `url`. What the header toggle links to. */
export function alternatePath(url: string): string {
  return pathForLocale(url, localeOfPath(url) === 'en' ? 'ml' : 'en');
}

/**
 * Prefix a canonical English path for the current language.
 *
 * Every internal link in the app is built from `stationPath` / `routePath`,
 * which are language-free by design. This is what keeps a reader inside their
 * own language when they tap one, without a second set of path helpers.
 */
export function localised(path: string, locale: AppLocale): string {
  return locale === 'en' ? path : `${ML_PREFIX}${path}`;
}
