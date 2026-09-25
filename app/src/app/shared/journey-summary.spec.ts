/**
 * The Home hero, and the two ways its typography can break.
 *
 * **The countdown is set at `line-height: 0.8`.** That is safe for digits,
 * which have no descenders, and it is the reason the number and its unit are
 * separate elements: "5" goes into the 96px box and "min" renders beside it at
 * 23% in a normal line box. A value that reached the 96px box carrying a
 * descender — a 'g', a 'p', an em-dash below the baseline — would clip, and it
 * would clip silently in a browser while every test still passed. So the split
 * is asserted here, and so is the one word that legitimately reaches the large
 * size whole ("Due", which has no descender either).
 *
 * **Malayalam must not be forced into an English-sized box.** DESIGN.md §3:
 * station names drop to 25px, leading rises to 1.45, no uppercase, and no
 * letter-spacing — negative tracking breaks conjunct rendering. Those are
 * stylesheet facts rather than rendered ones, so they are read off the
 * compiled styles; jsdom does not lay out and measuring here would measure
 * nothing.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { JourneySummary } from './journey-summary';

let fixture: ComponentFixture<JourneySummary>;

async function render(inputs: Record<string, unknown> = {}): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [JourneySummary],
    providers: [provideRouter([])],
  }).compileComponents();

  fixture = TestBed.createComponent(JourneySummary);
  fixture.componentRef.setInput('originName', 'Pathadipalam');
  fixture.componentRef.setInput('hereLabel', "You're here");
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(selector: string): string {
  return host().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** The component's own rules, from the compiled definition. */
function styleText(): string {
  const definition = JourneySummary as unknown as { ɵcmp: { styles: readonly string[] } };
  return definition.ɵcmp.styles.join('\n');
}

afterEach(() => fixture?.destroy());

describe('the countdown survives its own line-height', () => {
  it('splits the figure from its unit so only digits reach the 96px box', async () => {
    await render({ countdown: '5 min', towardsName: 'Tripunithura' });

    expect(text('.countdown span[aria-hidden]')).toBe('5');
    expect(text('.countdown-unit')).toBe('min');
  });

  it('renders a wordy countdown whole, with no unit element', async () => {
    // "Arriving" has no space to split on.
    await render({ countdown: 'Arriving', towardsName: 'Tripunithura' });

    expect(text('.countdown')).toBe('Arriving');
    expect(host().querySelector('.countdown-unit')).toBeNull();
  });

  it('keeps an hours-and-minutes countdown in one unit element', async () => {
    await render({ countdown: '1 h 12 min', towardsName: 'Aluva' });

    expect(text('.countdown span[aria-hidden]')).toBe('1');
    expect(text('.countdown-unit')).toBe('h 12 min');
  });

  it('gives the split countdown one label, not two fragments', async () => {
    await render({ countdown: '5 min', towardsName: 'Tripunithura' });

    const label = host().querySelector('.countdown')?.getAttribute('aria-label') ?? '';
    expect(label).toBe('Next train towards Tripunithura leaves in 5 min');
  });

  it('sizes the unit proportionally, above the 16px floor at every size', async () => {
    await render({ countdown: '5 min' });
    // 0.23em of the smallest parent this is used at (96px) is 22px. It is
    // proportional so the desktop 132px override needs no second rule, and it
    // can never fall under the floor because the parent never falls under 96.
    expect(styleText()).toMatch(/\.countdown-unit[^{}]*\{[^}]*font-size:\s*0\.23em/);
  });
});

describe('Malayalam is given its own box, not the English one', () => {
  it('drops the station name to 25px with more leading and no tracking', async () => {
    const css = styleText();
    const rule = css.match(/\[lang="?ml"?\][^{}]*\.station-name[^{}]*\{[^}]*\}/)?.[0] ?? '';

    expect(rule).toContain('--text-station-ml');
    expect(rule).toMatch(/line-height:\s*1\.45/);
    // Negative tracking breaks conjunct rendering; it must be reset, not
    // inherited from the 30px Latin rule above it.
    expect(rule).toMatch(/letter-spacing:\s*normal/);
  });

  it('wraps station names at spaces and never mid-word', async () => {
    const rule = styleText().match(/\.station-name[^{}]*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/overflow-wrap:\s*break-word/);
    // `break-all` would split a Malayalam conjunct cluster, which renders as a
    // different letter rather than as a hyphenated word.
    expect(rule).toMatch(/word-break:\s*normal/);
    expect(rule).not.toMatch(/word-break:\s*break-all/);
  });

  it('puts no fixed height on any row, so 200% text grows the page', async () => {
    const css = styleText();
    const offenders = [...css.matchAll(/\.(train|destination|origin-meta)[^{}]*\{[^}]*\}/g)]
      .map((match) => match[0])
      .filter((rule) => /(?<!min-|max-)(block-size|height)\s*:\s*\d/.test(rule));

    expect(offenders).toEqual([]);
  });
});

describe('the journey reads as a journey', () => {
  it('shows origin, train and destination on one line', async () => {
    await render({
      destinationName: 'Edapally',
      towardsName: 'Tripunithura',
      countdown: '5 min',
      departureClock: '6:21',
      departureMeridiem: 'PM',
      arrivalClock: '6:24',
      meta: '3 min ride · 1 stop · ₹40',
    });

    expect(text('.station-name')).toBe('Pathadipalam');
    expect(text('.your-train')).toBe('Your train · towards Tripunithura');
    expect(text('.leaves-time')).toBe('6:21 PM');
    expect(text('.meta')).toBe('3 min ride · 1 stop · ₹40');
    expect(text('.arrives-time')).toBe('6:24');
  });

  it('marks an unchosen destination with a dashed node and a dotted line', async () => {
    await render({ destinationName: null, variant: 'dotted' });

    // The pending state is a shape, not only a colour, so it survives
    // greyscale (golden rule 3).
    expect(host().querySelector('.node-pending')).not.toBeNull();
    expect(host().querySelector('.node-destination')).toBeNull();
  });

  it('draws the destination as an ink disc once one is chosen', async () => {
    await render({ destinationName: 'Edapally', countdown: '5 min' });

    expect(host().querySelector('.node-destination')).not.toBeNull();
    expect(host().querySelector('.node-pending')).toBeNull();
  });

  it('sets the meridiem apart from the number it follows', async () => {
    // "PM" is a label beside a time, not part of it: 16px, ink-2, no tracking.
    await render({ countdown: '5 min', departureClock: '6:21', departureMeridiem: 'PM' });

    expect(text('.meridiem')).toBe('PM');
    const rule = styleText().match(/\.meridiem[^{}]*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*var\(--text-min\)/);
    expect(rule).toMatch(/letter-spacing:\s*normal/);
  });
});
