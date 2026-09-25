/**
 * The departure board, as a reader meets it: one tile per direction.
 *
 * The numbers themselves are `board-view.spec.ts`'s job and are tested
 * without a DOM; what is checked here is what each tile says and in what
 * order, and the stylesheet rules the DOM cannot show.
 *
 * Signal inputs settle synchronously, so `setInput` is followed by a read.
 * `detectChanges` is called because every assertion here is against rendered
 * DOM; the stylesheet tests render nothing.
 */

import { PlatformLocation } from '@angular/common';
import { MOCK_PLATFORM_LOCATION_CONFIG, MockPlatformLocation } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Direction } from '../core/data/network.types';
import { translate } from '../core/i18n/translate';
import { BoardPanel } from './board-panel';
import { BoardLane } from './board-lane';
import type { BoardView, DepartureRow } from './board-view';

function row(overrides: Partial<DepartureRow> = {}): DepartureRow {
  return {
    key: overrides.key ?? 'k1',
    countdown: '5 min',
    clock: '6:21 PM',
    terminusName: 'Tripunithura',
    shortTurn: false,
    missesName: null,
    nextDay: false,
    distant: false,
    isLast: false,
    ...overrides,
  };
}

function board(direction: Direction, rows: DepartureRow[], towardsName: string): BoardView {
  return {
    direction,
    towardsName,
    servesPreview: '',
    servesAll: ['A', 'B', 'C'],
    servesMore: 0,
    rows,
    nudge: null,
    lastTrain: null,
  };
}

/** Towards Aluva is `direction_id = 1`, derived from the feed (finding 10). */
const ALUVA: Direction = 1;
const TRIPUNITHURA: Direction = 0;

let fixture: ComponentFixture<BoardPanel>;

async function render(inputs: Record<string, unknown>): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [BoardPanel],
    providers: [
      provideRouter([]),
      { provide: PlatformLocation, useClass: MockPlatformLocation },
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: 'http://localhost/' } },
    ],
  }).compileComponents();

  fixture = TestBed.createComponent(BoardPanel);
  fixture.componentRef.setInput('provenance', 'Timetable · 6:16 PM');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

function lanes(): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('app-board-lane')];
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** The text a sighted reader sees, with the `sr-only` parts removed. */
function visibleText(el: Element | null | undefined): string {
  if (el === null || el === undefined) return '';
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** The big figure as it is drawn: number and unit. */
function figure(lane: HTMLElement): string[] {
  return [...lane.querySelectorAll('.countdown [aria-hidden="true"]')].map(text);
}

afterEach(() => fixture?.destroy());

describe('both directions, one card', () => {
  it('always puts Aluva first, whatever order the engine gave them in', async () => {
    await render({
      boards: [
        board(TRIPUNITHURA, [row()], 'Tripunithura'),
        board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva'),
      ],
    });

    const [first, second] = lanes();
    expect(first.className).toContain('lane-aluva');
    expect(second.className).toContain('lane-tripunithura');
    expect(text(first.querySelector('.head'))).toBe('Aluva');
  });

  it('draws one tile at a terminus rather than an empty second one', async () => {
    await render({ boards: [board(TRIPUNITHURA, [row()], 'Tripunithura')] });
    expect(lanes()).toHaveLength(1);
  });

  it('marks your direction in words, not by colour alone', async () => {
    await render({
      boards: [
        board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva'),
        board(TRIPUNITHURA, [row()], 'Tripunithura'),
      ],
      yourDirection: TRIPUNITHURA,
    });

    const [aluva, tripunithura] = lanes();
    expect(text(tripunithura.querySelector('.tag'))).toBe('Your train');
    expect(tripunithura.classList.contains('is-yours')).toBe(true);
    expect(aluva.querySelector('.tag')).toBeNull();
  });

  it('prints the provenance it was given, and never claims to be live', async () => {
    await render({ boards: [board(TRIPUNITHURA, [row()], 'Tripunithura')] });
    const provenance = text((fixture.nativeElement as HTMLElement).querySelector('.provenance'));
    expect(provenance).toBe('Timetable · 6:16 PM');
    expect(provenance.toLowerCase()).not.toContain('live');
  });

  it('says Closed in words when a direction has nothing left', async () => {
    await render({
      boards: [board(ALUVA, [], 'Aluva'), board(TRIPUNITHURA, [], 'Tripunithura')],
      opensAt: '6:00 AM',
    });

    for (const lane of lanes()) {
      expect(text(lane.querySelector('.closed'))).toBe('Closed');
      expect(text(lane.querySelector('.closed-sub'))).toBe('Opens 6:00 AM');
    }
  });
});

describe('the next train', () => {
  it('counts down, with the departure clock under the figure', async () => {
    await render({ boards: [board(TRIPUNITHURA, [row()], 'Tripunithura')] });
    const lane = lanes()[0];
    expect(figure(lane)).toEqual(['5', 'min']);
    expect(text(lane.querySelector('.when'))).toBe('6:21 PM');
  });

  it('leads with the clock across the night, and says how far off it is', async () => {
    await render({
      boards: [
        board(
          TRIPUNITHURA,
          [row({ clock: '6:00 AM', countdown: '5 h 14 min', distant: true })],
          'Tripunithura',
        ),
      ],
    });
    const lane = lanes()[0];
    expect(figure(lane)).toEqual(['6:00', 'AM']);
    expect(text(lane.querySelector('.when'))).toBe(
      translate('en', 'board.inWait', { wait: '5 h 14 min' }),
    );
  });

  it('says Tomorrow once that train is on the next date', async () => {
    await render({
      boards: [
        board(
          TRIPUNITHURA,
          [row({ clock: '6:00 AM', countdown: '7 h 30 min', distant: true, nextDay: true })],
          'Tripunithura',
        ),
      ],
    });
    expect(text(lanes()[0].querySelector('.when'))).toBe('Tomorrow');
  });

  it('is read as one sentence, not as "5" and "min"', async () => {
    await render({ boards: [board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva')] });
    const countdown = lanes()[0].querySelector('.countdown');
    expect(text(countdown?.querySelector('.sr-only'))).toBe(
      translate('en', 'board.laneCountdownLabel', { name: 'Aluva', countdown: '5 min' }),
    );
  });

  it('does not print where a short-turn ends, but still reads it out', async () => {
    await render({
      boards: [
        board(
          ALUVA,
          [row({ shortTurn: true, terminusName: 'Muttom', missesName: 'Aluva' })],
          'Aluva',
        ),
      ],
    });
    const lane = lanes()[0];
    expect(visibleText(lane)).not.toContain('Muttom');
    expect(text(lane)).toContain(
      translate('en', 'board.shortTurn', { terminus: 'Muttom', misses: 'Aluva' }),
    );
  });
});

describe('the trains after it', () => {
  it('lists them in minutes, which is what missing the next one costs', async () => {
    await render({
      boards: [
        board(
          TRIPUNITHURA,
          [row(), row({ key: 'k2', countdown: '12 min' }), row({ key: 'k3', countdown: '19 min' })],
          'Tripunithura',
        ),
      ],
    });
    expect(text(lanes()[0].querySelector('.then'))).toBe(
      translate('en', 'board.thenMinutes', { list: '12, 19' }),
    );
  });

  it('names the first train after the night by its clock', async () => {
    await render({
      boards: [
        board(
          ALUVA,
          [
            row({ clock: '11:44 PM', countdown: '14 min' }),
            row({ key: 'k2', clock: '7:34 AM', countdown: '8 h 4 min', distant: true }),
          ],
          'Aluva',
        ),
      ],
    });
    expect(text(lanes()[0].querySelector('.then'))).toBe(
      translate('en', 'board.then', { clock: '7:34 AM' }),
    );
  });

  it('shows as many as the page asks for', async () => {
    const rows = ['7', '14', '21', '28', '35'].map((minutes, i) =>
      row({ key: `k${i + 2}`, countdown: `${minutes} min` }),
    );
    await render({
      boards: [board(TRIPUNITHURA, [row(), ...rows], 'Tripunithura')],
      followingCount: 4,
    });
    expect(text(lanes()[0].querySelector('.then'))).toBe(
      translate('en', 'board.thenMinutes', { list: '7, 14, 21, 28' }),
    );
  });

  it('names each direction as a heading, in words as well as by its arrow', async () => {
    await render({
      boards: [board(ALUVA, [row()], 'Aluva'), board(TRIPUNITHURA, [row()], 'Tripunithura')],
    });
    const heads = lanes().map((lane) => lane.querySelector('h3.head')?.getAttribute('aria-label'));
    expect(heads).toEqual(['Towards Aluva', 'Towards Tripunithura']);
  });
});

/**
 * The stylesheet, read as text. The 16px floor (DESIGN.md §3) is structural
 * for Tailwind utilities but does not reach component CSS, and neither does
 * the rule that every colour is a token.
 */
describe('the board stylesheet', () => {
  function css(component: unknown): string {
    return (component as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
  }

  it('never sets text under 16px', () => {
    for (const sheet of [css(BoardLane), css(BoardPanel)]) {
      const sizes = [...sheet.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) {
        if (size.startsWith('var(--text-')) continue; // the scale starts at 16px
        const rem = /^([\d.]+)rem$/.exec(size);
        expect(rem, `unexpected font-size ${size}`).not.toBeNull();
        expect(Number(rem?.[1])).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('takes every colour from a token', () => {
    for (const sheet of [css(BoardLane), css(BoardPanel)]) {
      expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(sheet).not.toMatch(/\brgba?\(|\bhsla?\(/i);
    }
  });
});
