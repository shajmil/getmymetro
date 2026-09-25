import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

/** Required verbatim by KMRL's open-data licence — see CLAUDE.md finding 1. */
const KMRL_ATTRIBUTION = 'Contains data provided by Kochi Metro Rail Limited';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  // These two assertions guard a licence condition, not a design choice.
  // Breaching attribution or implying endorsement terminates the data licence
  // automatically, so the strings are asserted exactly rather than loosely.
  it('renders the KMRL attribution verbatim', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(KMRL_ATTRIBUTION);
  });

  it('disclaims KMRL endorsement', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('not endorsed by');
    expect(text).toContain('Kochi Metro Rail Limited');
  });

  /**
   * Phase 6 turned the Phase 1 placeholder into the bilingual entry point.
   *
   * It is an anchor with a real href, not a button, and that is the assertion
   * that matters: /ml/... is 625 indexable pages, and CLAUDE.md's search
   * strategy 4 rests on them being reachable by a crawler. A button would hide
   * every one of them behind a click no crawler makes.
   */
  it('offers the other language as a crawlable link, not a button', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLAnchorElement>('a[hreflang]');

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('href')).toBe('/ml');
    expect(toggle?.getAttribute('hreflang')).toBe('ml');
    // The label is in the language it offers, so it is readable to the reader
    // who needs it and announced in the right voice by a screen reader.
    expect(toggle?.getAttribute('lang')).toBe('ml');
    // The switch is segmented per DESIGN.md 5.6, so the label is the short
    // segment. The crawlable-link assertions above are the point of the test.
    expect(toggle?.textContent?.trim()).toBe('മല');
    // jsdom performs no layout, so the touch floor cannot be measured here.
    // It used to come from the global `tap-target` utility; the segmented
    // switch of DESIGN.md §5.6 carries it in its own scoped styles instead, so
    // this reads the rule rather than a class name — that survives a rename
    // and still fails if the floor is dropped. 44px is the §5.6 floor for a
    // secondary control; 56px applies to the primary button only.
    const segmentCss = [...fixture.nativeElement.ownerDocument.styleSheets]
      .flatMap((sheet: CSSStyleSheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .filter((css: string) => css.includes('.segment'))
      .join('\n');
    expect(segmentCss).toContain('min-block-size: var(--gmm-touch)');
    expect(segmentCss).toContain('min-inline-size: var(--gmm-touch)');
  });

  it('keeps the licence attribution in English on a Malayalam page too', () => {
    // "Verbatim" is the word the licence uses, and a translation is by
    // definition not verbatim (CLAUDE.md finding 1).
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const line = (fixture.nativeElement as HTMLElement).querySelector('footer p[lang="en"]');
    expect(line?.textContent?.trim()).toBe(KMRL_ATTRIBUTION);
  });
});

/**
 * The desktop nav. DESIGN.md screen 07: Journey / Stations / Line map, with
 * the active item underlined.
 *
 * Two things are asserted and neither is the underline, because CSS is not
 * what a test should be checking.
 *
 * **Every target is real.** The nav could very easily have shipped three
 * `href="#"` links, exactly as the reference HTML has them — the reference is
 * a picture and its links go nowhere. "Stations" and "Line map" are fragments
 * of the home page, which is a prerendered document, so they work with
 * JavaScript off and a crawler can follow them.
 *
 * **The current item is marked in the accessibility tree**, not only in ink
 * and a teal underline. DESIGN.md golden rule 3: colour never carries meaning
 * alone.
 */
describe('the desktop nav', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  function nav(): HTMLElement | null {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('nav');
  }

  it('names its three destinations and gives every one a real href', () => {
    const element = nav();
    expect(element).not.toBeNull();

    const links = [...(element?.querySelectorAll('a') ?? [])];
    expect(links).toHaveLength(3);
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Journey',
      'Stations',
      'Line map',
    ]);

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      // Not "#", not empty, and not a route that does not exist.
      expect(href).not.toBe('');
      expect(href).not.toBe('#');
      expect(href.startsWith('/')).toBe(true);
    }
  });

  it('points the two section links at anchors the home page actually has', () => {
    // `#stations` is the station picker and `#line-map` is the map section.
    // Both are always in the prerendered HTML, so these links land somewhere
    // with JavaScript off.
    const links = [...(nav()?.querySelectorAll('a') ?? [])];
    expect(links[1].getAttribute('href')).toBe('/#stations');
    expect(links[2].getAttribute('href')).toBe('/#line-map');
  });

  it('marks the current page in the accessibility tree, not only in colour', () => {
    const element = nav();
    const current = [...(element?.querySelectorAll('[aria-current="page"]') ?? [])];

    // Exactly one, and it is Journey — the router starts at '/'.
    expect(current).toHaveLength(1);
    expect(current[0].textContent?.trim()).toBe('Journey');
  });

  it('gives the nav a name, so it is not just "navigation"', () => {
    expect(nav()?.getAttribute('aria-label')).toBe('Main');
  });
});
