/**
 * The route page, as a reader meets it.
 *
 * Three of these are the refusals, and they are the point of the page:
 * a pair that names no stations, a station to itself, and a train that leaves
 * the right platform in the right direction and still does not get you there.
 *
 * The fare assertions are deliberately a small census rather than one example.
 * The published table happens to be an exact function of how many stations
 * apart the two stops are, so a test comparing the page against a hop-count
 * formula would pass just as happily if somebody replaced the lookup with
 * arithmetic — the very substitution CLAUDE.md finding 5 forbids. These
 * compare against values read out of `fare_rules.txt`, band boundaries
 * included.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { NetworkDataService } from '../../core/data/network-data';
import type { NetworkData } from '../../core/data/network.types';
import { NO_HOLIDAY_DATA, type HolidayCalendar } from '../../core/engine/holiday';
import { CLOCK, HOLIDAY_CALENDAR } from '../../core/engine/metro-engine.service';
import { at, loadNetwork } from '../../core/engine/testing/network';
import { translate } from '../../core/i18n/translate';
import { LineMap } from '../../shared/map/line-map';
import { RoutePage } from './route';

const network: NetworkData = loadNetwork();

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

interface Options {
  readonly pair?: string;
  readonly now?: number;
  readonly holidays?: HolidayCalendar;
  readonly dataFails?: boolean;
}

let fixture: ComponentFixture<RoutePage> | undefined;

async function render(options: Options = {}): Promise<ComponentFixture<RoutePage>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [RoutePage],
    providers: [
      provideRouter([]),
      { provide: CLOCK, useValue: () => options.now ?? at(TUESDAY, 12, 0) },
      { provide: HOLIDAY_CALENDAR, useValue: options.holidays ?? NO_HOLIDAY_DATA },
      {
        provide: NetworkDataService,
        useValue: {
          load: () =>
            options.dataFails === true
              ? Promise.reject(new Error('offline'))
              : Promise.resolve(network),
        },
      },
    ],
  }).compileComponents();

  fixture = TestBed.createComponent(RoutePage);
  fixture.componentRef.setInput('pair', options.pair ?? 'aluva-to-edapally');
  fixture.detectChanges();
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
  return fixture;
}

function text(): string {
  return (fixture?.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
}

afterEach(() => {
  fixture?.destroy();
  fixture = undefined;
});

describe('Route — the journey', () => {
  it('answers direction, duration, fare and stops for a real pair', async () => {
    await render({ pair: 'aluva-to-edapally' });
    const host = fixture?.nativeElement as HTMLElement;
    // The title is now a JourneyLine composition: origin and destination are
    // separate rows, so the accessible name is what matters, not one flat string.
    const heading = host.querySelector('h1')?.textContent?.replace(/\s+/g, '') ?? '';
    expect(heading).toContain('Aluva');
    expect(heading).toContain('Edapally');
    const rendered = text();
    // MVP item 2: the platform is named by the end of the line, because
    // "towards Tripunithura" is the only thing written on the platform and
    // "Kaloor" is what the reader actually wants. The wording is DESIGN.md
    // §9's short transit language ("Board · towards Tripunithura"), so this
    // asserts through the catalogue — the guard is that the end of the line
    // is named at the origin, not that one particular sentence survives.
    expect(rendered).toContain(
      translate('en', 'screen.boardTowards', { name: 'Tripunithura' }),
    );
    expect(rendered).toContain('8 stops');
    expect(rendered).toContain('₹40');

    // The seven stations between, in order. With the engine loaded the page
    // renders them as the real stop list with each train's calling time,
    // which is strictly more than the `route.between` sentence this used to
    // match — that sentence is the engine-free branch, and the data behind it
    // is asserted in `page-facts.spec.ts`. What has to hold either way is
    // that all seven are named and in travel order.
    const names = [...(fixture?.nativeElement as HTMLElement).querySelectorAll('.stop-name')].map(
      (el) => el.textContent?.trim(),
    );
    expect(names).toEqual([
      'Aluva',
      'Pulinchodu',
      'Companypady',
      'Ambattukavu',
      'Muttom',
      'Kalamassery',
      'Cochin University',
      'Pathadipalam',
      'Edapally',
    ]);

    // How long it takes, per service pattern, in the reference block.
    expect(rendered).toContain(translate('en', 'route.timeOnTrain'));
    expect(rendered).toContain(
      translate('en', 'route.minutesRange', { fastest: 17, slowest: 19 }),
    );
  });

  it('names the platform by the end of the line, in both directions', async () => {
    await render({ pair: 'edapally-to-aluva' });
    expect(text()).toContain(translate('en', 'screen.boardTowards', { name: 'Aluva' }));
    // And the string it renders through actually exists in Malayalam. A
    // missing key would fall back silently, and CLAUDE.md search strategy 4
    // makes the Malayalam pages half the site.
    const ml = translate('ml', 'screen.boardTowards', { name: 'ആലുവ' });
    expect(ml).not.toBe(translate('en', 'screen.boardTowards', { name: 'ആലുവ' }));
    expect(ml).toContain('ആലുവ');
  });

  it('says so plainly when the destination is the very next station', async () => {
    await render({ pair: 'aluva-to-pulinchodu' });
    // With the engine loaded the page renders the real stop list, which for
    // adjacent stations is origin and destination and nothing between — the
    // same fact, shown rather than stated. `route.nextStation` is the
    // prerendered, engine-free wording and is asserted on that branch below,
    // which is the one a crawler sees.
    const host = fixture?.nativeElement as HTMLElement;
    const stops = [...host.querySelectorAll('.stops li')];
    expect(stops).toHaveLength(2);
    expect(stops[0].textContent).toContain('Aluva');
    expect(stops[1].textContent).toContain('Pulinchodu');
    expect(text()).toContain(translate('en', 'screen.getOffHere'));
  });

});

describe('Route — pairs it refuses', () => {
  it('refuses a station to itself even though the feed prices it', async () => {
    await render({ pair: 'aluva-to-aluva' });
    const rendered = text();
    expect(rendered).toContain('That is the same station at both ends');
    expect(rendered).not.toContain('₹10');
    expect(rendered).not.toContain('Next trains');
  });

  it('refuses a pair that does not name two stations', async () => {
    await render({ pair: 'aluva-to-narnia' });
    const rendered = text();
    expect(rendered).toContain('No journey with that name');
    expect(rendered).not.toContain('Next trains');
    // Still not a dead end: every station on the line is linked from here.
    // Those links moved out of the SVG schematic and into the map section's
    // station index in Phase 7, which is plain HTML and needs no JavaScript.
    expect(
      (fixture?.nativeElement as HTMLElement).querySelectorAll('a[href^="/station/"]'),
    ).toHaveLength(25);
  });

  it('offers no departures when the timetable itself failed', async () => {
    await render({ dataFails: true });
    const rendered = text();
    expect(rendered).toContain('The timetable could not be loaded');
    expect(rendered).not.toContain('Next trains');
  });
});

describe('Route — origin must precede destination on the train you board', () => {
  it('excludes a departure that leaves in the right direction and stops short', async () => {
    // 22:36 from Aluva towards Tripunithura terminates at Muttom. It is on the
    // station board (labelled) and it must not be on an Edapally journey.
    await render({ pair: 'aluva-to-edapally', now: at(TUESDAY, 22, 25) });
    // Scoped to the departures the page offers — the hero's chosen train and
    // the "Next trains" list behind it — because the reference block below
    // names the 10:51 PM on purpose, as the later train that does not get you
    // there. The old `.journey-slot` wrapper went with the redesign; the hero
    // is `.hero-row` and the rest is `.later`. The assertion is unchanged in
    // substance: the engine must pick the 10:30 and must not offer either of
    // the two trains that leave this platform in the right direction and stop
    // short of Edapally.
    const host = fixture?.nativeElement as HTMLElement;
    const panel = [...host.querySelectorAll('.hero-row, .later')]
      .map((el) => el.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(panel).toContain('10:30 PM');
    expect(panel).not.toContain('10:36 PM');
    expect(panel).not.toContain('10:51 PM');
    // And the strand is stated where it belongs.
    expect(text()).toContain(
      'A train does leave this platform at 10:51 PM, 21 minutes later, but it stops before Edapally.',
    );
  });

  it('makes the last useful train earlier than the last train off the platform', async () => {
    await render({ pair: 'mg-road-to-aluva' });
    const rendered = text();
    expect(rendered).toContain('Last train that reaches Aluva');
    expect(rendered).toContain('10:52 PM');
    expect(rendered).toContain(
      'A train does leave this platform at 11:44 PM, 52 minutes later, but it stops before Aluva. The 10:52 PM is the last one that gets you there.',
    );
  });

  it('says nothing about a strand where there is not one', async () => {
    await render({ pair: 'mg-road-to-tripunithura' });
    expect(text()).not.toContain('but it stops before');
  });
});

describe('Route — fares come from the table, not from a formula', () => {
  it('quotes the published fare at every band boundary', async () => {
    // Read out of fare_rules.txt: the bands step at 2, 5, 8, 12 and 17 stops.
    const cases: readonly [string, string][] = [
      ['aluva-to-pulinchodu', '₹10'],
      ['aluva-to-companypady', '₹20'],
      ['aluva-to-kalamassery', '₹30'],
      ['aluva-to-edapally', '₹40'],
      ['aluva-to-kaloor', '₹50'],
      ['aluva-to-kadavanthra', '₹60'],
      ['tripunithura-to-aluva', '₹60'],
    ];
    for (const [pair, fare] of cases) {
      await render({ pair });
      const figure = (fixture?.nativeElement as HTMLElement).querySelector('.fare-figure');
      expect(figure?.textContent?.trim()).toBe(fare);
    }
  });

  it('prices a journey the same in both directions', async () => {
    await render({ pair: 'mg-road-to-aluva' });
    const there = (fixture?.nativeElement as HTMLElement)
      .querySelector('.fare-figure')
      ?.textContent?.trim();
    await render({ pair: 'aluva-to-mg-road' });
    const back = (fixture?.nativeElement as HTMLElement)
      .querySelector('.fare-figure')
      ?.textContent?.trim();
    expect(there).toBe('₹50');
    expect(back).toBe(there);
  });
});

describe('Route — Sunday is not a footnote', () => {
  it('reports both patterns, with Sunday starting an hour and a half later', async () => {
    await render({ pair: 'mg-road-to-aluva' });
    const rendered = text();
    expect(rendered).toContain('Monday to Saturday');
    expect(rendered).toContain('6:05 AM');
    expect(rendered).toContain('Sunday');
    expect(rendered).toContain('7:34 AM');
    // Never "weekday": WK is Monday to Saturday in this feed.
    expect(rendered).not.toContain('Weekday');
    expect(rendered).not.toContain('Monday to Friday');
  });

  it('shows Sunday departures on a Sunday, and the same reference block', async () => {
    await render({ pair: 'mg-road-to-aluva', now: at(SUNDAY, 6, 30) });
    const rendered = text();
    // 6:05 AM is the Mon-Sat first train; on a Sunday the next one is 7:34.
    // Scoped to the hero, which is the train the engine actually chose — the
    // reference block below names both patterns' times, so a page-wide match
    // on "7:34 AM" would pass even if the hero were showing Monday's service.
    // (The old "Leaves 7:34 AM" wording came from `route.leaves`, which the
    // redesigned hero does not use: it sets the clock beside the countdown
    // rather than labelling it.)
    const hero =
      (fixture?.nativeElement as HTMLElement)
        .querySelector('.hero-row')
        ?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(hero).toContain('7:34 AM');
    expect(hero).not.toContain('6:05 AM');
    expect(rendered).toContain('Monday to Saturday');
    expect(rendered).toContain('Sunday');
  });
});

describe('Route — booking, honesty and cross-links', () => {
  it('links KMRL WhatsApp booking without prefilling the journey', async () => {
    await render({ pair: 'aluva-to-edapally' });
    const link = (fixture?.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[href^="https://wa.me/"]',
    );
    // Not "Book Ticket Aluva to Edapally": nobody has tested the bot's grammar.
    expect(link?.getAttribute('href')).toBe('https://wa.me/919188957488?text=Book%20Ticket');
    const rendered = text();
    expect(rendered).toContain('tell the bot where you are going');
    expect(rendered).toContain("Booking is KMRL's service");
    expect(rendered).not.toContain('discount');
  });

  it('offers exactly one booking block, not two', async () => {
    /*
     * The second real-browser finding. Phase D shipped a `btn-primary` "Book on
     * KMRL WhatsApp" after the journey *and* an `<app-booking>` panel below the
     * grid, both linking the same chat — two calls to action for one action,
     * against DESIGN.md §5.6's one primary action per screen.
     *
     * Counted as links rather than as components, because a component could be
     * renamed and a second raw anchor added; what the reader sees is how many
     * things on the page offer to book.
     */
    await render({ pair: 'aluva-to-edapally' });
    const host = fixture?.nativeElement as HTMLElement;

    expect(host.querySelectorAll('a[href^="https://wa.me/"]')).toHaveLength(1);
    expect(host.querySelectorAll('app-booking')).toHaveLength(0);
    // And it is the primary one, in the flow after the journey.
    const link = host.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(link?.classList.contains('btn-primary')).toBe(true);
    expect(host.querySelector('.answer-journey')?.contains(link ?? null)).toBe(true);
  });

  it('keeps the licence framing on whichever block survived', async () => {
    /*
     * The `<app-booking>` panel carried the sentences the open-data licence
     * needs: whose channel this is, that KMRL runs the booking, and that
     * getmymetro sells nothing and sees nothing. CLAUDE.md finding 1 ends the
     * licence automatically if the app implies KMRL endorses it, so deleting
     * the panel without moving those sentences would have traded a duplicate
     * for a licence breach. This is the test that would have caught that.
     */
    await render({ pair: 'aluva-to-edapally' });
    const host = fixture?.nativeElement as HTMLElement;
    const book = host.querySelector('.book');
    if (book === null) throw new Error('no booking block on the route page');
    const framing = book.textContent?.replace(/\s+/g, ' ') ?? '';

    expect(framing).toContain("KMRL's own channel");
    expect(framing).toContain("Booking is KMRL's service");
    expect(framing).toContain('getmymetro does not sell tickets, take payment');
    expect(framing).toContain('tell the bot where you are going');
    // Nothing that would read as an endorsement or an unverified claim.
    expect(framing).not.toContain('discount');
  });

  it('puts the map above the reference block, not at the foot of the page', async () => {
    /*
     * The third finding, in the user's own priority order: "Where the trains
     * are now" is the high-priority section and the reference block — first and
     * last train, fare, related links — is the low-priority one. Phase D had
     * them the other way round, with the map last on the page.
     *
     * Ordering only. Every reference fact stays in the prerendered HTML,
     * because CLAUDE.md search strategy 1 rests on a crawler reading the fare
     * and the first and last train from the source, and the assertions below
     * check they are all still there.
     */
    await render({ pair: 'aluva-to-edapally' });
    const host = fixture?.nativeElement as HTMLElement;
    const map = host.querySelector('app-line-map');
    const fare = host.querySelector('section.reference');
    const firstLast = host.querySelector('#first-last');
    const related = host.querySelector('section.related');
    if (map === null || fare === null || firstLast === null || related === null) {
      throw new Error('the map and all three reference sections must be on the route page');
    }

    const follows = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(map, fare)).toBe(true);
    expect(follows(map, firstLast)).toBe(true);
    expect(follows(map, related)).toBe(true);

    // Reordered, never removed: the reference content is still in the source.
    const rendered = text();
    expect(rendered).toContain('Fare');
    expect(rendered).toContain('First train');
    expect(rendered).toContain('Aluva to Edapally');
  });

  it('labels the journey time as riding time and nothing more', async () => {
    await render({ pair: 'aluva-to-edapally' });
    expect(text()).toContain(
      'Riding time only. It does not include getting to the platform, the security check or the queue for a ticket.',
    );
  });

  it('links the reverse journey and both station pages', async () => {
    // CLAUDE.md search strategy 2: internal linking is how the 600 route pages
    // get discovered and valued, so these are real anchors with real hrefs and
    // not a widget. Scoped to the "Related" section rather than the whole
    // page, because the map's station index below it also links /station/*
    // and would satisfy two of the three assertions on its own.
    await render({ pair: 'aluva-to-edapally' });
    const hrefs = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '.link-list a.link-row',
      ),
    ].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/route/edapally-to-aluva');
    expect(hrefs).toContain('/station/aluva');
    expect(hrefs).toContain('/station/edapally');
  });

  it('hands the journey to the map, and the map to the diagram when tiles fail', async () => {
    // The route page draws <app-line-map>, not the schematic directly. What
    // matters is that the journey survives the hand-off: when the basemap
    // cannot be reached the diagram must still come up with this journey
    // marked on it, because that is the whole point of keeping it.
    await render({ pair: 'aluva-to-edapally' });
    const map = fixture?.debugElement.query(By.directive(LineMap));
    expect(map).toBeTruthy();

    (map?.componentInstance as LineMap).mode.set('diagram');
    fixture?.detectChanges();

    const tags = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<SVGTextElement>('text.tag'),
    ].map((t) => t.textContent?.trim());
    expect(tags).toEqual(['From', 'To']);
  });
});
