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
    expect(toggle?.textContent?.trim()).toBe('മലയാളം');
    // jsdom performs no layout, so the 56x56px floor cannot be measured here.
    // Asserting the utility is applied is the available regression guard; the
    // pixel size is verified against the built CSS instead.
    expect(toggle?.classList.contains('tap-target')).toBe(true);
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
