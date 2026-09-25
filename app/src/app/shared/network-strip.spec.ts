/**
 * The 25-station strip.
 *
 * Two things are asserted here that a screenshot would not catch.
 *
 * **The strip is not a replacement for the schematic.** The vertical schematic
 * carries 25 real anchors and CLAUDE.md's search strategy 2 rests on that
 * cross-linking — internal links are how 1,250 prerendered pages get
 * discovered. This strip is a diagram: one `role="img"` with a text
 * alternative, and deliberately no links, because 25 targets at 14px pitch
 * would fail the 44px floor. The test below fixes that distinction so a later
 * phase cannot quietly swap one for the other and delete the app's internal
 * linking along the way.
 *
 * **Orientation is fixed**, as everywhere else: Aluva at the left, Tripunithura
 * at the right, the same order as `LineTrack` and the board's lanes.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { loadNetwork } from '../core/engine/testing/network';
import { NetworkStrip } from './network-strip';

const network = loadNetwork();
const stations = network.stops.map((stop) => ({ id: stop.id, name: stop.name.en }));

let fixture: ComponentFixture<NetworkStrip>;

async function render(inputs: Record<string, unknown> = {}): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [NetworkStrip],
    providers: [provideRouter([])],
  }).compileComponents();

  fixture = TestBed.createComponent(NetworkStrip);
  fixture.componentRef.setInput('stations', stations);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/**
 * One of the two strips.
 *
 * The component renders the line twice — a 350-wide narrow geometry with the
 * two ends labelled, and a 1312-wide one with all 25 labelled at −50° — and
 * shows one by media query. A `viewBox` is an attribute, so no query can reach
 * it and the two geometries cannot be one element.
 *
 * Every count below is scoped to one of them, deliberately. A test that counted
 * across both would pass whichever strip the markup actually carried, which is
 * how a second copy of a diagram gets added without anyone noticing that the
 * line is now announced twice.
 */
function strip(which: 'narrow' | 'wide'): SVGSVGElement {
  const element = host().querySelector<SVGSVGElement>(`svg.strip-${which}`);
  if (element === null) throw new Error(`no ${which} strip`);
  return element;
}

afterEach(() => fixture?.destroy());

describe('the whole line, at a glance', () => {
  it('places all 25 stations, Aluva at the left and Tripunithura at the right', async () => {
    await render();
    const stops = fixture.componentInstance['stops']();

    expect(stops).toHaveLength(25);
    expect(stops[0].name).toBe('Aluva');
    expect(stops[24].name).toBe('Tripunithura');
    // Strictly increasing x: the order on screen is the order of the line.
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].x).toBeGreaterThan(stops[i - 1].x);
    }
  });

  it('spaces the stations evenly rather than to true chainage', async () => {
    // Chainage runs 470m to 2,050m between neighbours, so a to-scale strip
    // would put two dots 4px apart at one end. Equal pitch is legible and
    // never claims to be a map.
    await render();
    const stops = fixture.componentInstance['stops']();
    const gaps = stops.slice(1).map((stop, i) => stop.x - stops[i].x);
    const first = gaps[0];
    for (const gap of gaps) expect(gap).toBeCloseTo(first, 6);
  });
});

describe('the marks a reader looks for', () => {
  it('draws you as a ring and your destination as a disc, at both widths', async () => {
    await render({ you: network.stops[7].id, destination: network.stops[14].id });

    for (const which of ['narrow', 'wide'] as const) {
      expect(strip(which).querySelectorAll('circle.you')).toHaveLength(1);
      expect(strip(which).querySelectorAll('circle.destination')).toHaveLength(1);
      // The other 23 are plain stops.
      expect(strip(which).querySelectorAll('circle.stop')).toHaveLength(23);
    }
  });

  it('draws no ring and no disc when neither is set', async () => {
    await render();
    for (const which of ['narrow', 'wide'] as const) {
      expect(strip(which).querySelectorAll('circle.you')).toHaveLength(0);
      expect(strip(which).querySelectorAll('circle.destination')).toHaveLength(0);
      expect(strip(which).querySelectorAll('circle.stop')).toHaveLength(25);
    }
  });
});

describe('the wide strip, for desktop', () => {
  it('labels every one of the 25 stations, which the narrow one does not', async () => {
    // DESIGN.md §5.5: end labels only on mobile, every station at −50° on
    // desktop. 25 labels across 350px would be 14px each and unreadable, so
    // the narrow strip names the two ends and nothing else.
    await render({ you: network.stops[7].id });

    expect(strip('wide').querySelectorAll('text.station-label')).toHaveLength(25);
    expect(strip('narrow').querySelectorAll('text.station-label')).toHaveLength(0);
    expect(strip('narrow').querySelectorAll('text.end-label')).toHaveLength(2);
  });

  it('keeps the two strips in the same order, and rescales rather than recomputes', async () => {
    await render({ you: network.stops[7].id });
    const narrow = fixture.componentInstance['stops']();
    const wide = fixture.componentInstance['wideStops']();

    expect(wide.map((stop) => stop.id)).toEqual(narrow.map((stop) => stop.id));
    for (let i = 1; i < wide.length; i += 1) {
      expect(wide[i].x).toBeGreaterThan(wide[i - 1].x);
    }
    // Every wide label must clear the 16px floor, which it only does while the
    // strip is never scaled up past its own 1312 viewBox width.
    expect(wide[wide.length - 1].x).toBeLessThanOrEqual(1312);
    expect(wide[0].x).toBeGreaterThanOrEqual(0);
  });

  it('keeps every rotated label inside the box, at both ends and in Malayalam', async () => {
    /*
     * The fourth real-browser finding: the right-most label — "Tripunithura" —
     * was cut off at the viewBox edge. Phase D noted rotated-label collision as
     * unverified; this is the arithmetic that was behind the note.
     *
     * A label anchored at its start and rotated −50° runs `0.64 x width` to the
     * right of its anchor and `0.77 x width` above it. At the Phase D geometry
     * the last station sat at x=1296 in a box 1312 wide, so anything longer
     * than 25 user units left the box — and the longest Malayalam name also
     * left it through the *top*, at y=-47 against a box 176 tall.
     *
     * Asserted as an envelope rather than against a screenshot, and measured
     * with a deliberately generous character width: jsdom has no font metrics,
     * so the test overestimates every label and the real ones have more room
     * than this allows them. It is checked in both languages because Malayalam
     * is the longer one and English alone would pass a box that clips it.
     */
    const RADIANS = (-50 * Math.PI) / 180;
    const COS = Math.abs(Math.cos(RADIANS));
    const SIN = Math.abs(Math.sin(RADIANS));
    // 16px type, ~0.62em a character. Wider than Geist actually sets, on purpose.
    const PER_CHAR = 16 * 0.62;

    for (const names of [
      network.stops.map((stop) => stop.name.en),
      network.stops.map((stop) => stop.name.ml),
    ]) {
      await render({ stations: network.stops.map((stop, i) => ({ id: stop.id, name: names[i] })) });
      const wide = fixture.componentInstance['wideStops']();
      const box = fixture.componentInstance['WIDE_WIDTH'];
      const height = fixture.componentInstance['WIDE_HEIGHT'];
      const lineY = fixture.componentInstance['WIDE_LINE_Y'];
      const dx = fixture.componentInstance['WIDE_LABEL_DX'];
      const dy = fixture.componentInstance['WIDE_LABEL_DY'];

      for (const station of wide) {
        const width = station.name.length * PER_CHAR;
        // The right edge — the one that clipped Tripunithura.
        expect(station.x + dx + width * COS).toBeLessThanOrEqual(box);
        // The top edge — the one that clipped Malayalam's longest name.
        expect(lineY - dy - width * SIN).toBeGreaterThanOrEqual(0);
        // And the left edge, which the labels rotate away from but the dots
        // do not: a 10px rail with a round cap needs 5 units of its own.
        expect(station.x).toBeGreaterThanOrEqual(5);
        expect(station.x).toBeLessThanOrEqual(box);
        // Below the line, the dots and the reader's 11-unit ring.
        expect(lineY + 11).toBeLessThanOrEqual(height);
      }
    }
  });

  it('shortens the line rather than widening the box, so 16px stays 16px', async () => {
    /*
     * The fix had two candidates and only one of them is safe. Widening the
     * viewBox while the strip still renders at 1312 CSS pixels would scale
     * every label *down*, straight through the 16px floor DESIGN.md §3 makes
     * structural — a floor breach no build check can see, because the CSS
     * still says 16px and the browser multiplies it. So the box stays 1312 and
     * the rail stops short of the right edge instead.
     */
    await render();
    expect(fixture.componentInstance['WIDE_WIDTH']).toBe(1312);

    const wide = fixture.componentInstance['wideStops']();
    const pad = fixture.componentInstance['WIDE_LABEL_PAD'];
    // The last station is inset by the label headroom, not flush to the edge.
    expect(wide[wide.length - 1].x).toBeCloseTo(1312 - pad, 6);
    expect(pad).toBeGreaterThan(0);

    // The rail ends with the last station, never past it into the headroom.
    const rail = fixture.componentInstance['wideRailPath']();
    expect(rail).toBe(`M 16 ${fixture.componentInstance['WIDE_LINE_Y']} H ${1312 - pad}`);
  });

  it('announces the line once, not twice', async () => {
    // Both strips are in every document at all times. Two role="img" elements
    // describing one line would read it out twice, and only the narrow one
    // carries the name.
    await render({ you: network.stops[7].id });

    expect(strip('narrow').getAttribute('role')).toBe('img');
    expect(strip('wide').getAttribute('aria-hidden')).toBe('true');
    expect(strip('wide').getAttribute('role')).toBeNull();
    expect(host().querySelectorAll('svg[role="img"]')).toHaveLength(1);
  });
});

describe('the diagram has a text alternative', () => {
  it('names the line, its extent and where you are', async () => {
    await render({ you: network.stops[7].id });
    const label = strip('narrow').getAttribute('aria-label') ?? '';

    expect(label).toContain('25 stations');
    expect(label).toContain('Aluva to Tripunithura');
    expect(label).toContain(network.stops[7].name.en);
  });

  it('names the destination too, once one is chosen', async () => {
    await render({ you: network.stops[7].id, destination: network.stops[14].id });
    const label = strip('narrow').getAttribute('aria-label') ?? '';

    expect(label).toContain(network.stops[14].name.en);
  });
});

describe('the strip does not take the schematic’s job', () => {
  it('carries no links, so it cannot be mistaken for the crawlable index', async () => {
    // 25 targets across 350px is 14px each — under the 44px floor and
    // unusable. The vertical schematic is what carries the 25 anchors that
    // CLAUDE.md's search strategy 2 depends on, and it stays.
    await render({ you: network.stops[7].id });
    expect(host().querySelectorAll('a')).toHaveLength(0);
    expect(strip('narrow').getAttribute('role')).toBe('img');
  });
});

describe('contrast on the ground it is drawn on', () => {
  it('adds a text-safe edge only when it sits on the soft panel', async () => {
    // --gmm-line on white is 3.04:1 and passes; on --gmm-soft it is 2.78:1
    // and does not, so on soft the shape gets a compliant edge underneath.
    await render({ soft: false });
    expect(host().querySelectorAll('path.rail-edge')).toHaveLength(0);

    // One per strip: both geometries draw the line, so both need the edge.
    await render({ soft: true });
    expect(strip('narrow').querySelectorAll('path.rail-edge')).toHaveLength(1);
    expect(strip('wide').querySelectorAll('path.rail-edge')).toHaveLength(1);
  });
});
