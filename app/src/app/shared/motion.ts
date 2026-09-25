/**
 * Whether the reader has asked for less movement, and how to scroll if so.
 *
 * DESIGN.md §7 is unambiguous: under `prefers-reduced-motion: reduce`
 * everything is **instant**, not slower. `styles.css` enforces that for the two
 * named animations the build gate allows, but `scrollIntoView({behavior:
 * 'smooth'})` is not CSS — it is an argument passed at the call site, and no
 * stylesheet can reach it. Three call sites were passing `'smooth'`
 * unconditionally before Phase E, which is a long animated scroll served to
 * exactly the readers who asked for none.
 *
 * Read at the moment of the scroll rather than cached in a signal: the setting
 * can change mid-session, and this is called once per tap, not per frame.
 */

/** True when the reader has asked for reduced motion. False wherever the query cannot be run. */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * `scrollIntoView`, honouring that request.
 *
 * Guarded on the method existing, not only on the element. Scrolling is a
 * courtesy — the caller's real work is the focus move that follows it — so an
 * environment that does not implement it (jsdom does not) must skip the
 * scroll rather than throw and take the focus move down with it.
 */
export function scrollToElement(
  element: Element | null | undefined,
  block: ScrollLogicalPosition = 'start',
): void {
  if (element == null || typeof element.scrollIntoView !== 'function') return;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block });
}
