/**
 * The schematic, as a reader meets it.
 *
 * This is the only part of Phase 5 that is a picture, so the assertions are
 * about geometry as much as content: the order of the line, the size of the
 * touch targets, the gap between them, and the fact that the labels are text a
 * crawler and a screen reader can read rather than paths.
 *
 * Signal inputs settle synchronously, so `setInput` is followed by a read, not
 * by a change-detection cycle. `detectChanges` appears only where the
 * assertion is against rendered DOM.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { loadNetwork } from '../core/engine/testing/network';
import { DIAGRAM_WIDTH, ROW_PITCH, Schematic } from './schematic';

const network = loadNetwork();
const stations = network.stops.map((stop) => ({ id: stop.id, name: stop.name.en }));

let fixture: ComponentFixture<Schematic>;

async function render(inputs: Record<string, unknown> = {}): Promise<ComponentFixture<Schematic>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Schematic],
    providers: [provideRouter([])],
  }).compileComponents();

  fixture = TestBed.createComponent(Schematic);
  fixture.componentRef.setInput('stations', stations);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  return fixture;
}

function links(): SVGAElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<SVGAElement>('a.stop')];
}

afterEach(() => fixture?.destroy());

describe('the schematic draws the whole line', () => {
  it('renders all 25 stations in line order, Aluva first', async () => {
    await render();
    fixture.detectChanges();
    const names = links().map((link) => link.querySelector('text')?.textContent?.trim());
    expect(names).toHaveLength(25);
    expect(names[0]).toBe('Aluva');
    expect(names[24]).toBe('Tripunithura');
    expect(names).toEqual(network.stops.map((stop) => stop.name.en));
  });

  it('gives every station a real href to its own page', async () => {
    await render();
    fixture.detectChanges();
    const hrefs = links().map((link) => link.getAttribute('href'));
    expect(hrefs[0]).toBe('/station/aluva');
    expect(hrefs[14]).toBe('/station/mg-road');
    expect(new Set(hrefs).size).toBe(25);
  });
});

describe('the schematic is usable with a thumb', () => {
  it('gives each station a 56px target with 8px between them', async () => {
    await render();
    const rows = fixture.componentInstance.rows();
    expect(ROW_PITCH).toBe(64);
    for (const [i, row] of rows.entries()) {
      if (i === 0) continue;
      // Hit areas are 56 tall at a 64 pitch, so the gap is exactly 8.
      expect(row.hitY - (rows[i - 1].hitY + 56)).toBe(8);
    }
  });

  it('spans the full 288px width, so the target is the row and not the dot', async () => {
    await render();
    fixture.detectChanges();
    const rect = (fixture.nativeElement as HTMLElement).querySelector('rect.hit');
    expect(rect?.getAttribute('width')).toBe(String(DIAGRAM_WIDTH));
    expect(rect?.getAttribute('height')).toBe('56');
  });

  it('sizes the viewBox to the content, so nothing needs panning or zooming', async () => {
    await render();
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${DIAGRAM_WIDTH} ${25 * ROW_PITCH}`);
  });
});

describe('the schematic says where you are', () => {
  it('marks the selected station and nothing else', async () => {
    await render({ selected: 'MGRD' });
    const marked = fixture.componentInstance.rows().filter((row) => row.selected);
    expect(marked.map((row) => row.name)).toEqual(['MG Road']);
    expect(marked[0].label).toBe('MG Road, this station');
  });

  it('marks a journey with From, To and every station between', async () => {
    await render({ from: 'MGRD', to: 'ALVA' });
    const rows = fixture.componentInstance.rows();
    expect(rows.find((row) => row.tag === 'From')?.name).toBe('MG Road');
    expect(rows.find((row) => row.tag === 'To')?.name).toBe('Aluva');
    // Aluva (0) through MG Road (14) inclusive.
    expect(rows.filter((row) => row.onJourney)).toHaveLength(15);
    expect(fixture.componentInstance.journeySpan()).not.toBeNull();
  });

  it('marks nothing when both ends are the same station', async () => {
    // The route page's refusal branch still passes what the URL named.
    await render({ from: 'ALVA', to: 'ALVA' });
    const rows = fixture.componentInstance.rows();
    expect(rows.some((row) => row.tag !== null || row.onJourney)).toBe(false);
    expect(fixture.componentInstance.journeySpan()).toBeNull();
  });

  it('marks nothing when there is no journey and no selection', async () => {
    await render();
    const rows = fixture.componentInstance.rows();
    expect(rows.some((row) => row.selected || row.tag !== null || row.onJourney)).toBe(false);
    expect(fixture.componentInstance.journeySpan()).toBeNull();
  });
});
