/**
 * The map section, as a reader meets it — and as a reader with no network
 * meets it.
 *
 * What is asserted here is everything about this component that is *not* the
 * map: the honesty line, the fallback, the station index that replaced the
 * schematic's crawlable links, and the attribution the licence requires. The
 * map itself needs a browser with a GPU, a network and a real layout engine,
 * and none of those exist here — `core/engine/positions.spec.ts` covers the
 * arithmetic that decides where the arrows go.
 *
 * `IntersectionObserver` is stubbed rather than left undefined. jsdom has no
 * implementation, and without the stub the component would take its
 * "no observer, so load immediately" branch and pull Leaflet into every test
 * in this file for no benefit.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NetworkDataService } from '../../core/data/network-data';
import type { NetworkData } from '../../core/data/network.types';
import { loadNetwork } from '../../core/engine/testing/network';
import { LineMap } from './line-map';

const network: NetworkData = loadNetwork();

const stations = network.stops.map((stop) => ({
  id: stop.id,
  index: stop.index,
  name: stop.name.en,
  ml: stop.name.ml,
}));

let fixture: ComponentFixture<LineMap> | undefined;
let realObserver: unknown;

class IdleObserver {
  observe(): void {
    /* never intersects, so the map never initialises in a test */
  }
  disconnect(): void {
    /* nothing to disconnect */
  }
}

beforeEach(() => {
  realObserver = (globalThis as Record<string, unknown>)['IntersectionObserver'];
  (globalThis as Record<string, unknown>)['IntersectionObserver'] = IdleObserver;
});

afterEach(() => {
  (globalThis as Record<string, unknown>)['IntersectionObserver'] = realObserver;
  fixture = undefined;
});

async function render(inputs: Record<string, unknown> = {}): Promise<ComponentFixture<LineMap>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [LineMap],
    providers: [
      provideRouter([]),
      { provide: NetworkDataService, useValue: { load: () => Promise.resolve(network) } },
    ],
  }).compileComponents();

  fixture = TestBed.createComponent(LineMap);
  fixture.componentRef.setInput('stations', stations);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  // This component is asserted through its rendered output, because the bug it
  // could introduce is the template rendering the wrong branch while the state
  // is right.
  fixture.detectChanges();
  return fixture;
}

function text(): string {
  return (fixture?.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
}

function host(): HTMLElement {
  return fixture?.nativeElement as HTMLElement;
}

describe('LineMap — saying what it is', () => {
  it('says the positions are scheduled, above the map and not under it', async () => {
    await render();
    const paragraphs = [...host().querySelectorAll('p')];
    const scheduled = paragraphs.find((p) => p.textContent?.includes('Scheduled positions'));
    expect(scheduled).toBeDefined();

    // The competitor's "not live" note is small grey text under the map while
    // its title says "Live Map". This one is the section's own claim, so it
    // has to be the first thing after the heading and it has to be set as ink.
    //
    // Asserted by *position* and by the class the component's own stylesheet
    // styles, not by a utility class name. The class-name assertion this
    // replaced named `font-semibold` and `text-min` from the palette the
    // redesign deleted, so it went on passing while saying nothing — until
    // Phase D rewrote the component and it failed for the right reason at
    // last.
    expect(scheduled?.className).toContain('scheduled');
    expect(paragraphs.indexOf(scheduled!)).toBe(0);

    // And it is above the map frame in document order, not below it.
    const frame = host().querySelector('.frame, app-schematic');
    if (frame !== null) {
      expect(
        scheduled!.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    expect(text()).toContain('No live tracking is published for this metro');
  });

  it('never uses the word live as a claim about the data', async () => {
    await render();
    const rendered = text().toLowerCase();
    expect(rendered).not.toContain('live positions');
    expect(rendered).not.toContain('live tracking of');
    expect(rendered).toContain('scheduled positions');
  });

  it('credits OpenStreetMap, which the tile licence requires', async () => {
    await render();
    const hrefs = [...host().querySelectorAll<HTMLAnchorElement>('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('https://www.openstreetmap.org/copyright');
    expect(hrefs).toContain('https://carto.com/attributions');
  });

  it('hides the map itself from assistive technology, having said it all in text', async () => {
    await render();
    const frame = host().querySelector('.frame');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('LineMap — when the tiles cannot be reached', () => {
  it('draws the diagram instead, and says why', async () => {
    const view = await render({ selected: 'MGRD' });
    expect(host().querySelector('.frame')).not.toBeNull();

    view.componentInstance.mode.set('diagram');
    view.detectChanges();

    expect(host().querySelector('.frame')).toBeNull();
    expect(text()).toContain('The map needs a connection and there is not one');
    // The diagram carries the whole line, so the page is still usable.
    expect(host().querySelectorAll('a.stop')).toHaveLength(25);
  });

  it('keeps the times honest: the fallback blames the map, not the timetable', async () => {
    const view = await render();
    view.componentInstance.mode.set('diagram');
    view.detectChanges();
    expect(text()).toContain('The times above are worked out on your phone and are unaffected');
  });

  it('passes the journey through to the diagram', async () => {
    const view = await render({ from: 'ALVA', to: 'EDAP' });
    view.componentInstance.mode.set('diagram');
    view.detectChanges();
    const tags = [...host().querySelectorAll<SVGTextElement>('text.tag')].map((t) =>
      t.textContent?.trim(),
    );
    expect(tags).toEqual(['From', 'To']);
  });
});

describe('LineMap — the station index', () => {
  it('links all 25 stations as plain HTML, with no map and no JavaScript', async () => {
    await render();
    const links = [...host().querySelectorAll<HTMLAnchorElement>('a[href^="/station/"]')];
    expect(links).toHaveLength(25);
    expect(links[0].getAttribute('href')).toBe('/station/aluva');
    expect(links[0].textContent?.trim()).toBe('Aluva');
    expect(links[24].getAttribute('href')).toBe('/station/tripunithura');
  });

  it('is collapsed, so it cannot push the page around when it appears', async () => {
    await render();
    const details = [...host().querySelectorAll('details')].find((d) =>
      d.textContent?.includes('All 25 stations'),
    );
    expect(details).toBeDefined();
    expect(details?.hasAttribute('open')).toBe(false);
  });

  it('survives the fallback, so a reader offline still has 25 ways out', async () => {
    const view = await render();
    view.componentInstance.mode.set('diagram');
    view.detectChanges();
    expect(host().querySelectorAll('a[href^="/station/"]').length).toBeGreaterThanOrEqual(25);
  });
});

describe('LineMap — before anything has loaded', () => {
  it('says the map is loading rather than claiming no trains are running', async () => {
    // The difference matters at 06:00: "no trains are running" is a statement
    // about the timetable and would be false, while the map genuinely has not
    // loaded yet.
    await render();
    expect(text()).toContain('Loading the map.');
    expect(text()).not.toContain('No trains are running now.');
  });
});
