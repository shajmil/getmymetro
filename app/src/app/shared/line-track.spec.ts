/**
 * The horizontal track, and the two things it must never get wrong.
 *
 * **Orientation is fixed.** Aluva is the left half and Tripunithura the right
 * half at every station, in both languages, whichever way the reader is going
 * (DESIGN.md §5.3). A track that mirrored itself to put "your" direction on
 * the left would be a different diagram on every screen.
 *
 * **Direction is never carried by the teal alone.** Phase A measured
 * `--gmm-line` on `--gmm-soft` at 2.78:1, under WCAG 1.4.11's 3:1 for a
 * meaningful graphic — and the board panel this sits on is exactly that
 * ground. So the teal half gets a text-safe edge stroke underneath, and the
 * direction is also stated by the chevrons, by the lane heads below, and by
 * the text alternative. The assertions below are the ones that fail if any of
 * that is quietly removed.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LineTrack } from './line-track';

let fixture: ComponentFixture<LineTrack>;

async function render(inputs: Record<string, unknown> = {}): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [LineTrack],
    providers: [provideRouter([])],
  }).compileComponents();

  fixture = TestBed.createComponent(LineTrack);
  fixture.componentRef.setInput('stationName', 'Pathadipalam');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** The two halves, in document order: left first. */
function rails(): SVGPathElement[] {
  return [...host().querySelectorAll<SVGPathElement>('path.rail:not(.rail-edge)')];
}

afterEach(() => fixture?.destroy());

describe('left is Aluva, right is Tripunithura, always', () => {
  it('draws the live half on the left when you are going to Aluva', async () => {
    await render({ side: 'aluva' });
    const [left, right] = rails();
    expect(left.classList.contains('rail-live')).toBe(true);
    expect(right.classList.contains('rail-grey')).toBe(true);
  });

  it('draws the live half on the right when you are going to Tripunithura', async () => {
    await render({ side: 'tripunithura' });
    const [left, right] = rails();
    expect(left.classList.contains('rail-grey')).toBe(true);
    expect(right.classList.contains('rail-live')).toBe(true);
  });

  it('greys both halves when no destination is chosen', async () => {
    await render({ side: 'none' });
    for (const rail of rails()) {
      expect(rail.classList.contains('rail-grey')).toBe(true);
      expect(rail.classList.contains('rail-live')).toBe(false);
    }
  });
});

describe('direction is not carried by the teal alone', () => {
  it('gives the live half a text-safe edge under the brand teal', async () => {
    // The 2.78:1 mitigation. Without the edge the line is the sole direction
    // signal and fails WCAG 1.4.11 on the soft board panel.
    await render({ side: 'tripunithura' });
    const edges = host().querySelectorAll('path.rail-edge');
    expect(edges).toHaveLength(1);
  });

  it('draws no edge stroke on a half that is grey', async () => {
    await render({ side: 'none' });
    expect(host().querySelectorAll('path.rail-edge')).toHaveLength(0);
  });

  it('draws a chevron at each end whichever way you are going', async () => {
    // The shape that carries direction when the hue does not.
    await render({ side: 'aluva' });
    expect(host().querySelectorAll('path.chevron')).toHaveLength(2);
  });

  it('names the orientation in the text alternative', async () => {
    // A reader who cannot see the diagram has no other way to learn that the
    // lanes under it are in the same order.
    await render({ side: 'tripunithura' });
    const label = host().querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Aluva to the left');
    expect(label).toContain('Tripunithura to the right');
    expect(label).toContain('Pathadipalam');
  });
});

describe('a terminus has one half, not two', () => {
  it('draws only the Tripunithura half at Aluva', async () => {
    await render({ end: 'aluva', side: 'tripunithura' });
    const drawn = rails();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].classList.contains('rail-live')).toBe(true);
    // One chevron, because there is one direction of travel.
    expect(host().querySelectorAll('path.chevron')).toHaveLength(1);
  });

  it('draws only the Aluva half at Tripunithura', async () => {
    await render({ end: 'tripunithura', side: 'aluva' });
    expect(rails()).toHaveLength(1);
    expect(host().querySelectorAll('path.chevron')).toHaveLength(1);
  });

  it('puts the node at the end it terminates, not in the middle', async () => {
    await render({ end: 'aluva' });
    const atAluva = Number(host().querySelector('circle.node')?.getAttribute('cx'));

    await render({ end: 'tripunithura' });
    const atTripunithura = Number(host().querySelector('circle.node')?.getAttribute('cx'));

    await render({ end: null });
    const inTheMiddle = Number(host().querySelector('circle.node')?.getAttribute('cx'));

    expect(atAluva).toBeLessThan(inTheMiddle);
    expect(atTripunithura).toBeGreaterThan(inTheMiddle);
  });
});
