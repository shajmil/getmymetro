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
    expect(host.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Aluva to Edapally',
    );
    const rendered = text();
    expect(rendered).toContain('Platform towards Tripunithura');
    expect(rendered).toContain('8 stops');
    expect(rendered).toContain('₹40');
    expect(rendered).toContain('7 between Aluva and Edapally, in order');
    expect(rendered).toContain('minutes on the train');
  });

  it('names the platform by the end of the line, in both directions', async () => {
    await render({ pair: 'edapally-to-aluva' });
    expect(text()).toContain('Platform towards Aluva');
  });

  it('says so plainly when the destination is the very next station', async () => {
    await render({ pair: 'aluva-to-pulinchodu' });
    expect(text()).toContain('Pulinchodu is the next station. No stops in between.');
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
    // Scoped to the departures panel: the reference block below it names the
    // 10:51 PM on purpose, as the later train that does not get you there.
    const panel =
      (fixture?.nativeElement as HTMLElement)
        .querySelector('.journey-slot')
        ?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(panel).toContain('Leaves 10:30 PM');
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
    expect(rendered).toContain('Leaves 7:34 AM');
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

  it('labels the journey time as riding time and nothing more', async () => {
    await render({ pair: 'aluva-to-edapally' });
    expect(text()).toContain(
      'Riding time only. It does not include getting to the platform, the security check or the queue for a ticket.',
    );
  });

  it('links the reverse journey and both station pages', async () => {
    await render({ pair: 'aluva-to-edapally' });
    const hrefs = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a.link-button',
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
