/**
 * The vertical line, and the promise that it grows.
 *
 * DESIGN.md §5.1 and §8 both turn on one property: **no fixed heights**. The
 * rows have to grow with a Malayalam station name, which sets taller per em
 * than Latin and wraps its conjuncts, and with a reader who has set 200% text.
 * A `height` anywhere in this component's styles would clip one or both, and
 * it would do it only for the readers least able to work around it.
 *
 * That is an assertion about the *stylesheet*, not about a rendered box: jsdom
 * does not lay out, so measuring an element here would measure nothing. So the
 * check reads the component's own styles and fails on a fixed block size. It
 * is a crude test and it is the right one — the failure mode it guards is
 * someone adding `height: 88px` to make a row line up, which is invisible in
 * English at 100% and broken in Malayalam at 200%.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyRow } from './journey-line';

let fixture: ComponentFixture<JourneyRow>;

async function render(inputs: Record<string, unknown> = {}): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [JourneyRow] }).compileComponents();
  fixture = TestBed.createComponent(JourneyRow);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/**
 * Every rule this component ships, as text.
 *
 * Read from the compiled component definition, not by scraping `<style>`
 * elements out of the document. `TestBed.resetTestingModule()` removes the
 * styles it injected, so a document scrape returns whatever the *previous*
 * test left behind — and a `toMatch` against a partial string passes or fails
 * on test ordering rather than on the stylesheet. The definition is what the
 * browser is actually served.
 */
function styleText(): string {
  const definition = JourneyRow as unknown as { ɵcmp: { styles: readonly string[] } };
  return definition.ɵcmp.styles.join('\n');
}

afterEach(() => fixture?.destroy());

describe('the line is built from rows, so it grows', () => {
  it('declares no fixed block size anywhere in its own styles', async () => {
    await render();
    const css = styleText();

    // `block-size`/`height` on the *nodes* is legitimate — they are circles of
    // a specified diameter and do not contain text. What must not exist is a
    // fixed size on the row, the content column or the host.
    // Angular's emulated encapsulation rewrites `.content {` to
    // `.content[_ngcontent-x] {`, so the selector is matched loosely up to the
    // opening brace rather than anchored to it.
    const offenders = [...css.matchAll(/\.(content|rail)[^{}]*\{[^}]*\}/g)]
      .map((match) => match[0])
      .filter((rule) => /(?<!min-|max-)(block-size|height)\s*:\s*\d/.test(rule));

    expect(offenders).toEqual([]);
  });

  it('gives the content column a zero min-inline-size so long names wrap', async () => {
    // Without this the grid track sizes to the longest unbreakable word and a
    // Malayalam conjunct cluster pushes the row wider than the viewport.
    await render();
    expect(styleText()).toMatch(/\.content[^{}]*\{[^}]*min-inline-size:\s*0/);
  });
});

describe('the node vocabulary', () => {
  it('draws an origin ring, a destination disc and a through ring', async () => {
    for (const node of ['origin', 'destination', 'through'] as const) {
      await render({ node });
      expect(host().querySelector(`.node-${node}`)).not.toBeNull();
    }
  });

  it('draws no node at all when the row is pure line', async () => {
    await render({ node: 'none' });
    expect(host().querySelector('.node')).toBeNull();
    // The rail is still there: the middle row of the hero is line behind the
    // countdown, and losing it would break the line into two pieces.
    expect(host().querySelector('.segment')).not.toBeNull();
  });

  it('marks an unchosen destination with a dashed ring, not just a colour', async () => {
    await render({ node: 'pending', variant: 'dotted' });
    expect(host().querySelector('.node-pending')).not.toBeNull();
    // Golden rule 3: the state has a shape. `dashed` is that shape, and it
    // survives being read in greyscale.
    expect(styleText()).toMatch(/\.node-pending[^{}]*\{[^}]*border:[^;]*dashed/);
  });
});

describe('the rail segment matches the row type', () => {
  it('runs down from the node on the first row and up to it on the last', async () => {
    await render({ kind: 'first' });
    expect(host().querySelector('.segment-first')).not.toBeNull();

    await render({ kind: 'last' });
    expect(host().querySelector('.segment-last')).not.toBeNull();
  });

  it('draws no rail on a lone row', async () => {
    await render({ kind: 'only' });
    expect(host().querySelector('.segment')).toBeNull();
  });

  it('hides the whole rail column from assistive technology', async () => {
    // It is a decoration: the journey is already in the text beside it, and a
    // screen reader announcing "graphic" three times adds nothing.
    await render();
    expect(host().querySelector('.rail')?.getAttribute('aria-hidden')).toBe('true');
  });
});
