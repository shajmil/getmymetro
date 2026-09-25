/**
 * The departure board, as a reader meets it.
 *
 * The assertions that matter here are about **alignment**, not about numbers.
 * The numbers are `board-view.spec.ts`'s job and are tested without a DOM;
 * what can only be checked here is that two lanes side by side stay level when
 * one of them is taller than the other — which on this network is the normal
 * case, not an edge case:
 *
 *   * the "Your train" tag is on one lane and never both, and
 *   * per CLAUDE.md finding 9, the "Ends at Muttom" line appears on the
 *     towards-Aluva lane at 20 of 24 weekday platforms and essentially never
 *     on the towards-Tripunithura one.
 *
 * A regression here is silent. The board still renders, every number is still
 * right, and the two countdowns are simply 22px out of line — which is exactly
 * the kind of thing that ships.
 *
 * Signal inputs settle synchronously, so `setInput` is followed by a read.
 * `detectChanges` appears only where the assertion is against rendered DOM,
 * which for a layout component is most of them.
 */

import { PlatformLocation } from '@angular/common';
import { MOCK_PLATFORM_LOCATION_CONFIG, MockPlatformLocation } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Direction } from '../core/data/network.types';
import { translate } from '../core/i18n/translate';
import { BoardPanel } from './board-panel';
import { SHORT_WORKING_HEIGHT, TAG_HEIGHT } from './board-lane';
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

/**
 * Render the board in one language.
 *
 * `I18nService` reads the locale synchronously from `PlatformLocation`, so a
 * Malayalam render is a matter of starting on a `/ml` path. Worth doing here
 * rather than only in English: this board is the one screen where a
 * mistranslation strands somebody (CLAUDE.md search strategy 4 names
 * `board.laterShort` and the short-working strings as the sentences to read
 * first), and an English-only assertion cannot see a missing Malayalam key.
 */
async function renderIn(
  locale: 'en' | 'ml',
  inputs: Record<string, unknown>,
): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [BoardPanel],
    providers: [
      provideRouter([]),
      { provide: PlatformLocation, useClass: MockPlatformLocation },
      {
        provide: MOCK_PLATFORM_LOCATION_CONFIG,
        useValue: { startUrl: locale === 'ml' ? 'http://localhost/ml' : 'http://localhost/' },
      },
    ],
  }).compileComponents();

  fixture = TestBed.createComponent(BoardPanel);
  fixture.componentRef.setInput('stationName', 'Pathadipalam');
  fixture.componentRef.setInput('provenance', 'Timetable · 6:16 PM');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
}

/** The English render, which is what most of these assertions want. */
async function render(inputs: Record<string, unknown>): Promise<void> {
  await renderIn('en', inputs);
}

function lanes(): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('app-board-lane')];
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/**
 * The text a sighted reader sees, with the `sr-only` spans removed.
 *
 * The short-working line carries two strings: the visible "Ends at Muttom"
 * (DESIGN.md §5.4) and, for assistive tech, the full sentence that says the
 * train will not reach where you are going (CLAUDE.md finding 9). `sr-only` is
 * `position: absolute`, so the second one is out of flow and contributes no
 * height — the one-line layout contract the spacer matches is unaffected. But
 * `textContent` sees both, so the visible-text assertions read through here.
 */
function visibleText(el: Element | null | undefined): string {
  if (el === null || el === undefined) return '';
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

afterEach(() => fixture?.destroy());

describe('both directions, side by side', () => {
  it('always puts Aluva on the left and Tripunithura on the right', async () => {
    // Passed the other way round on purpose: the order on screen is fixed by
    // the design and must not follow the order of the array.
    await render({
      boards: [
        board(TRIPUNITHURA, [row()], 'Tripunithura'),
        board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva'),
      ],
    });

    const [left, right] = lanes();
    expect(left.className).toContain('lane-aluva');
    expect(right.className).toContain('lane-tripunithura');
    expect(text(left.querySelector('.head'))).toContain('Aluva');
    expect(text(right.querySelector('.head'))).toContain('Tripunithura');
  });

  it('draws one lane at a terminus rather than an empty second one', async () => {
    await render({
      boards: [board(TRIPUNITHURA, [row()], 'Tripunithura')],
      trackEnd: 'aluva',
    });

    expect(lanes()).toHaveLength(1);
    expect(lanes()[0].className).toContain('lane-tripunithura');
  });
});

describe('the lanes stay aligned when only one of them is taller', () => {
  it('reserves the tag height in the lane that has no tag', async () => {
    await render({
      boards: [
        board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva'),
        board(TRIPUNITHURA, [row()], 'Tripunithura'),
      ],
      yourDirection: TRIPUNITHURA,
    });

    const [aluva, tripunithura] = lanes();

    // Only the reader's lane carries the tag...
    expect(text(tripunithura.querySelector('.tag'))).toContain('Your train');
    expect(aluva.querySelector('.tag')).toBeNull();

    // ...and the other lane reserves exactly its height, so the two
    // countdowns sit on the same baseline.
    const spacer = aluva.querySelector('.tag-spacer');
    expect(spacer).not.toBeNull();
    expect(spacer?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reserves nothing when no destination is chosen and neither lane is yours', async () => {
    await render({
      boards: [
        board(ALUVA, [row({ terminusName: 'Aluva' })], 'Aluva'),
        board(TRIPUNITHURA, [row()], 'Tripunithura'),
      ],
      yourDirection: null,
    });

    for (const lane of lanes()) {
      expect(lane.querySelector('.tag')).toBeNull();
      // No tag anywhere means no asymmetry, so the board is shorter rather
      // than carrying a blank band across both lanes.
      expect(lane.querySelector('.tag-spacer')).toBeNull();
    }
  });

  /**
   * The case the caller asked for, and the one finding 9 makes routine: the
   * towards-Aluva lane has a short working and the towards-Tripunithura lane
   * does not.
   */
  it('reserves the short-working height in the lane without one', async () => {
    await render({
      boards: [
        board(
          ALUVA,
          [
            row({ key: 'a1', terminusName: 'Aluva' }),
            row({
              key: 'a2',
              clock: '6:26 PM',
              countdown: '10 min',
              shortTurn: true,
              terminusName: 'Muttom',
              missesName: 'Aluva',
            }),
          ],
          'Aluva',
        ),
        board(
          TRIPUNITHURA,
          [row({ key: 't1' }), row({ key: 't2', clock: '6:29 PM', countdown: '13 min' })],
          'Tripunithura',
        ),
      ],
    });

    const [aluva, tripunithura] = lanes();

    // The label is rendered, in words, on the lane that needs it — and it is
    // one visible line, which is what SHORT_WORKING_HEIGHT reserves.
    const line = aluva.querySelector('.short-working');
    expect(visibleText(line)).toBe(translate('en', 'board.endsAt', { terminus: 'Muttom' }));

    // Beside it, out of flow, the sentence that says what the short label
    // cannot: that this train will not get you where you are going. CLAUDE.md
    // finding 9 is the most dangerous fact in the dataset and "Ends at Muttom"
    // alone does not state it. This existed in the catalogue but was rendered
    // by no component until Phase C; deleting it is a regression, not a
    // cleanup. Asserted through the catalogue so a copy edit cannot silently
    // drop the guard.
    const spoken = line?.querySelector('.sr-only');
    expect(text(spoken)).toBe(
      translate('en', 'board.shortTurn', { terminus: 'Muttom', misses: 'Aluva' }),
    );
    // It is out of flow, so it adds no height and the lanes stay level.
    expect(spoken?.classList.contains('sr-only')).toBe(true);

    // And the other lane reserves the same height, so the rows below stay
    // level across the board.
    expect(tripunithura.querySelector('.short-working')).toBeNull();
    const spacer = tripunithura.querySelector('.short-working-spacer');
    expect(spacer).not.toBeNull();
    expect(spacer?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * The same guard in Malayalam.
   *
   * CLAUDE.md search strategy 4 names the last-train sentences as the ones a
   * native speaker must read first, "because a mistranslation there strands
   * somebody". The least this suite can do is prove both strings actually
   * resolve in Malayalam — a missing key would otherwise fall back silently
   * and an English-only assertion would never see it.
   */
  it('says the same two things in Malayalam', async () => {
    await renderIn('ml', {
      boards: [
        board(
          ALUVA,
          [
            row({ key: 'a1', terminusName: 'Aluva' }),
            row({
              key: 'a2',
              clock: '6:26 PM',
              countdown: '10 min',
              shortTurn: true,
              terminusName: 'മുട്ടം',
              missesName: 'ആലുവ',
            }),
          ],
          'ആലുവ',
        ),
        board(TRIPUNITHURA, [row({ key: 't1' })], 'തൃപ്പൂണിത്തുറ'),
      ],
    });

    const line = lanes()[0].querySelector('.short-working');
    const ends = translate('ml', 'board.endsAt', { terminus: 'മുട്ടം' });
    const misses = translate('ml', 'board.shortTurn', {
      terminus: 'മുട്ടം',
      misses: 'ആലുവ',
    });

    // Not the English string, and not the raw key: both actually translated.
    expect(ends).not.toBe(translate('en', 'board.endsAt', { terminus: 'മുട്ടം' }));
    expect(visibleText(line)).toBe(ends);
    expect(text(line?.querySelector('.sr-only'))).toBe(misses);
  });

  it('reserves the same number of pixels it would have used', () => {
    // The two constants are equal by arithmetic today — both are a 16px line
    // at 1.375 — but they are separate values on purpose, and this is the
    // assertion that fails if one moves without the other.
    expect(TAG_HEIGHT).toBe(22);
    expect(SHORT_WORKING_HEIGHT).toBe(22);
  });

  it('does not reserve for a short working further down the timetable', async () => {
    // The third departure short-turns, but only one following row is on
    // screen. Reserving on its account would put a permanent blank band under
    // every board at the 20 weekday platforms of finding 9.
    await render({
      boards: [
        board(
          ALUVA,
          [
            row({ key: 'a1', terminusName: 'Aluva' }),
            row({ key: 'a2' }),
            row({ key: 'a3', shortTurn: true, terminusName: 'Muttom' }),
          ],
          'Aluva',
        ),
        board(TRIPUNITHURA, [row({ key: 't1' }), row({ key: 't2' })], 'Tripunithura'),
      ],
      followingCount: 1,
    });

    for (const lane of lanes()) {
      expect(lane.querySelector('.short-working')).toBeNull();
      expect(lane.querySelector('.short-working-spacer')).toBeNull();
    }
  });
});

describe('the board never claims to be live', () => {
  it('prints the provenance it was given, and the word Timetable', async () => {
    await render({
      boards: [board(TRIPUNITHURA, [row()], 'Tripunithura')],
    });

    const provenance = text(
      (fixture.nativeElement as HTMLElement).querySelector('.provenance'),
    );
    expect(provenance).toBe('Timetable · 6:16 PM');
    expect(provenance.toLowerCase()).not.toContain('live');
  });
});

describe('no service', () => {
  it('says Closed in words rather than greying the lane out silently', async () => {
    await render({
      boards: [
        board(ALUVA, [], 'Aluva'),
        board(TRIPUNITHURA, [], 'Tripunithura'),
      ],
      opensAt: '6:00 AM',
    });

    for (const lane of lanes()) {
      expect(text(lane.querySelector('.closed'))).toBe('Closed');
      expect(text(lane.querySelector('.closed-sub'))).toBe('Opens 6:00 AM');
    }
  });
});

/**
 * The desktop row count. DESIGN.md §5.4: 1 following train on home, 4 on the
 * station board, 3 on desktop.
 *
 * The count genuinely changes with the viewport, and this is where the design
 * had two ways to go. The rejected one was a `matchMedia` signal, and these
 * assertions are what stops a later phase reaching for it: every one of the
 * 1,252 prerendered documents is built with no viewport at all, so a
 * media-query signal would bake the narrow count into all of them and swap a
 * row in on hydration — a visible jump, and reference content that only exists
 * once JavaScript has run (CLAUDE.md search strategy 1).
 *
 * So the wide rows are **rendered always and hidden in CSS**, and the tests
 * below assert exactly that: the rows are in the DOM, and the surplus ones
 * carry the class the stylesheet keys its media query off.
 */
describe('how many following trains, and at which width', () => {
  const four = [
    row({ key: 'a', countdown: '2 min' }),
    row({ key: 'b', countdown: '10 min' }),
    row({ key: 'c', countdown: '18 min' }),
    row({ key: 'd', countdown: '26 min' }),
  ];

  it('renders the desktop rows in the HTML, not on hydration', async () => {
    await render({
      boards: [board(ALUVA, four, 'Aluva'), board(TRIPUNITHURA, four, 'Tripunithura')],
      followingCount: 1,
      followingCountWide: 3,
    });

    // Three a lane, both lanes: the widest count either breakpoint asks for.
    for (const lane of lanes()) {
      expect(lane.querySelectorAll('.following-row')).toHaveLength(3);
      // The two past the narrow count are the ones CSS hides below 1024px.
      expect(lane.querySelectorAll('.following-row.is-wide-only')).toHaveLength(2);
    }
  });

  it('marks nothing wide-only when both breakpoints show the same number', async () => {
    // The station board shows 4 at every width, so no row is conditional and
    // no row should carry the class.
    await render({
      boards: [board(ALUVA, four, 'Aluva'), board(TRIPUNITHURA, four, 'Tripunithura')],
      followingCount: 3,
    });

    for (const lane of lanes()) {
      expect(lane.querySelectorAll('.following-row')).toHaveLength(3);
      expect(lane.querySelectorAll('.following-row.is-wide-only')).toHaveLength(0);
    }
  });

  it('keeps the wide-only rows in the order the timetable gives them', async () => {
    await render({
      boards: [board(TRIPUNITHURA, four, 'Tripunithura')],
      followingCount: 1,
      followingCountWide: 3,
    });

    const rows = [...lanes()[0].querySelectorAll('.following-row')];
    expect(rows.map((r) => r.classList.contains('is-wide-only'))).toEqual([false, true, true]);
  });
});

/**
 * The short-working reservation, split by breakpoint.
 *
 * The spacer exists so both lanes' rows stay level when only one of them
 * carries "Ends at Muttom" — which per finding 9 is the normal case on this
 * network, not an edge case. Phase D had to split it in two, because a short
 * working can now fall on a row only desktop renders: reserving for it at
 * every width would put a blank 22px band under a row a phone cannot see, and
 * not reserving for it at all would leave the lanes crooked at exactly the
 * width where they sit side by side.
 */
describe('reserving for a short working that only desktop can see', () => {
  it('reserves at desktop only, when the short working is on a desktop-only row', async () => {
    const withShortWorkingThird = [
      row({ key: 'a' }),
      row({ key: 'b' }),
      // Row index 2 of `following`, so it is one of the two wide-only rows.
      row({ key: 'c', shortTurn: true, terminusName: 'Muttom', missesName: 'Aluva' }),
      row({ key: 'd' }),
    ];
    const plain = [row({ key: 'w' }), row({ key: 'x' }), row({ key: 'y' }), row({ key: 'z' })];

    await render({
      boards: [
        board(ALUVA, withShortWorkingThird, 'Aluva'),
        board(TRIPUNITHURA, plain, 'Tripunithura'),
      ],
      followingCount: 1,
      followingCountWide: 3,
    });

    const spacers = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.short-working-spacer'),
    ];
    expect(spacers.length).toBeGreaterThan(0);
    // Every spacer is itself wide-only: a phone shows one following row, that
    // row is not a short working, and nothing about it should reserve height.
    for (const spacer of spacers) {
      expect(spacer.classList.contains('is-wide-only')).toBe(true);
    }
    // And the reservation is the same height as the line it stands in for.
    expect(SHORT_WORKING_HEIGHT).toBe(TAG_HEIGHT);
  });

  it('reserves at every width when the short working is on a row a phone shows', async () => {
    const shortFirst = [
      row({ key: 'a' }),
      row({ key: 'b', shortTurn: true, terminusName: 'Muttom', missesName: 'Aluva' }),
      row({ key: 'c' }),
      row({ key: 'd' }),
    ];
    const plain = [row({ key: 'w' }), row({ key: 'x' }), row({ key: 'y' }), row({ key: 'z' })];

    await render({
      boards: [board(ALUVA, shortFirst, 'Aluva'), board(TRIPUNITHURA, plain, 'Tripunithura')],
      followingCount: 1,
      followingCountWide: 3,
    });

    const spacers = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.short-working-spacer'),
    ];
    expect(spacers.length).toBeGreaterThan(0);
    for (const spacer of spacers) {
      expect(spacer.classList.contains('is-wide-only')).toBe(false);
    }
  });

  it('still renders the full sentence for assistive tech on the desktop-only row', async () => {
    // Finding 9, and the reason this component exists. The visible label says
    // where the train stops; the sr-only sentence says it will not get you
    // where you are going. A row being desktop-only must not cost it either.
    const rows = [
      row({ key: 'a' }),
      row({ key: 'b' }),
      row({ key: 'c', shortTurn: true, terminusName: 'Muttom', missesName: 'Aluva' }),
    ];

    await render({
      boards: [board(ALUVA, rows, 'Aluva')],
      followingCount: 1,
      followingCountWide: 3,
    });

    const host = fixture.nativeElement as HTMLElement;
    const wideOnly = host.querySelector('.following-row.is-wide-only .short-working');
    expect(wideOnly).not.toBeNull();
    expect(wideOnly?.textContent).toContain('Ends at Muttom');
    expect(wideOnly?.querySelector('.sr-only')?.textContent).toContain('does not reach Aluva');
  });
});
