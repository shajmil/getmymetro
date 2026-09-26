/**
 * The station page, as a reader meets it.
 *
 * Rendering is asserted rather than component state, because the state being
 * right while the template renders the wrong branch is exactly the bug this
 * phase can introduce. `detectChanges` is called for that reason and no other;
 * the slug arrives through `setInput`, which settles synchronously.
 *
 * The test that matters most is the 10pm one. At MG Road the advertised last
 * train towards Aluva is 11:44 PM and the last one that reaches Aluva is 10:52
 * PM — earlier than the 10:58 PM that CLAUDE.md finding 9's table calls
 * second-to-last. A page that leads with the 11:44 strands the passenger it
 * exists to protect, and there are 20 stations where it would.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NetworkDataService } from '../../core/data/network-data';
import type { NetworkData } from '../../core/data/network.types';
import { NO_HOLIDAY_DATA, type HolidayCalendar } from '../../core/engine/holiday';
import { CLOCK, HOLIDAY_CALENDAR } from '../../core/engine/metro-engine.service';
import { at, loadNetwork, VOUCHED_2026 } from '../../core/engine/testing/network';
import { StationPage } from './station';

const network: NetworkData = loadNetwork();

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

interface Options {
  readonly slug?: string;
  readonly now?: number;
  readonly holidays?: HolidayCalendar;
  readonly dataFails?: boolean;
}

let fixture: ComponentFixture<StationPage> | undefined;

async function render(options: Options = {}): Promise<ComponentFixture<StationPage>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [StationPage],
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

  fixture = TestBed.createComponent(StationPage);
  fixture.componentRef.setInput('slug', options.slug ?? 'mg-road');
  fixture.detectChanges();
  // Bootstrap runs in afterNextRender and then awaits the bundle. Flush both.
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

describe('Station — finding the right station', () => {
  it('names the station the slug asks for', async () => {
    await render({ slug: 'mg-road' });
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('MG Road');
    expect(text()).toContain('Station 15 of 25 on the line');
  });

  it('accepts a spelling KMRL publishes that the feed does not', async () => {
    await render({ slug: 'thrippunithura' });
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Tripunithura');
  });

  it('does not invent a station for a slug that names none', async () => {
    await render({ slug: 'kochi-central' });
    expect(text()).toContain('No station with that name');
    expect(text()).not.toContain('Towards Aluva');
    // Still not a dead end: every station on the line is linked from here.
    // Phase 7 moved those links out of the SVG schematic and into the map
    // section's station index, which is plain HTML and therefore reaches a
    // reader with no JavaScript and a crawler that runs none.
    expect(
      (fixture?.nativeElement as HTMLElement).querySelectorAll('a[href^="/station/"]'),
    ).toHaveLength(25);
  });
});

describe('Station — the last train that gets you home', () => {
  it('leads with the through train, not the later one that stops at Muttom', async () => {
    await render({ slug: 'mg-road', now: at(TUESDAY, 22, 30) });
    const rendered = text();
    // The live panel, shared with the home screen.
    expect(rendered).toContain('That is the last train all the way to Aluva');
    expect(rendered).toContain('A later train leaves at 11:44 PM, but it stops at Muttom');
    // The reference block, which is on the page at any hour.
    expect(rendered).toContain('Last train all the way to Aluva');
    expect(rendered).toContain(
      'The 11:44 PM leaves 52 minutes later but stops at Muttom. If you are going past there, the 10:52 PM is the last train you can take.',
    );
  });

  it('states the first and last train at noon, when no live panel is showing', async () => {
    await render({ slug: 'mg-road', now: at(TUESDAY, 12, 0) });
    const rendered = text();
    expect(rendered).not.toContain('Last train towards');
    expect(rendered).toContain('Monday to Saturday');
    expect(rendered).toContain('5:25 AM');
    expect(rendered).toContain('10:52 PM');
    expect(rendered).toContain('Sunday');
    expect(rendered).toContain('6:55 AM');
  });

  it('warns about the 45-minute gap on Mon-Sat only, and never towards Tripunithura', async () => {
    await render({ slug: 'mg-road', now: at(TUESDAY, 12, 0) });
    const rendered = text();
    expect(rendered).toContain('Nothing leaves this platform for 45 minutes before the 11:44 PM');
    // Exactly one warning on a page carrying four patterns (two platforms x
    // two service days). CLAUDE.md finding 9 does not say which service day it
    // measured; it is Mon-Sat. The largest Sunday gap anywhere on the network
    // is 22 minutes, and towards Tripunithura nothing exceeds 16 on either
    // pattern, so three of the four must stay silent.
    expect(rendered.match(/Nothing leaves this platform for/g)).toHaveLength(1);
    expect(rendered).not.toContain('minutes before the 10:59 PM');
    expect(rendered).not.toContain('minutes before the 11:14 PM');
  });

  it('still strands a Sunday passenger, even with no cliff to warn about', async () => {
    // The 45-minute gap is weekday-only but the short-turn is not: the last
    // Sunday departure towards Aluva also terminates at Muttom, 21 minutes
    // after the last one that arrives. The reference block is the same on any
    // day — it reports the timetable, not today — so the single cliff sentence
    // on the page is still the Mon-Sat one.
    await render({ slug: 'mg-road', now: at(SUNDAY, 12, 0) });
    const rendered = text();
    expect(rendered).toContain(
      'The 11:14 PM leaves 21 minutes later but stops at Muttom. If you are going past there, the 10:52 PM is the last train you can take.',
    );
    expect(rendered.match(/Nothing leaves this platform for/g)).toHaveLength(1);
    expect(rendered).toContain('45 minutes before the 11:44 PM');
  });

  it('reads out, but does not print, where a short-turn next train ends', async () => {
    // 22:36 from Aluva towards Tripunithura runs only to Muttom depot. The
    // board no longer prints "Ends at Muttom" (a product decision); the
    // sentence is still read to assistive tech with the countdown.
    await render({ slug: 'aluva', now: at(TUESDAY, 22, 32) });
    const host = fixture?.nativeElement as HTMLElement;
    expect(text()).not.toContain('Ends at Muttom');
    const spoken = [...host.querySelectorAll('app-board-lane .sr-only')].map(
      (el) => el.textContent ?? '',
    );
    expect(spoken.some((sentence) => sentence.includes('does not reach Tripunithura'))).toBe(true);
  });

  it('gives a terminus one platform, not an empty second one', async () => {
    // Asserted structurally rather than by matching a heading string. The
    // redesigned board names each platform in a lane head ("← ALUVA") rather
    // than in the sentence "Towards Aluva" the old card used, so a string
    // match here would be testing the copy. What has to hold at a terminus is
    // that there is exactly one lane and it points the only way trains go —
    // an empty second lane would leave a reader waiting on a platform that
    // does not exist.
    await render({ slug: 'tripunithura' });
    const host = fixture?.nativeElement as HTMLElement;
    const lanes = [...host.querySelectorAll('app-board-lane')];

    expect(lanes).toHaveLength(1);
    expect(lanes[0].className).toContain('lane-aluva');
    expect(lanes[0].querySelector('.head')?.textContent?.trim()).toBe('Aluva');
    // And the page still says so in words, for a reader who cannot see which
    // half of the track was drawn.
    expect(text()).toContain('Every train goes towards Aluva');
  });
});

describe('Station — fares to everywhere', () => {
  it('prices all 24 destinations from the published table', async () => {
    await render({ slug: 'aluva' });
    // Scoped to the route links: the same class now also styles the station
    // index that replaced the schematic's 25 links, and the point of this test
    // is the 24 fares.
    const rows = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a.fare-row[href^="/route/"]',
      ),
    ];
    expect(rows).toHaveLength(24);

    const byName = new Map(
      rows.map((row) => [
        row.querySelector('span')?.textContent?.trim() ?? '',
        row.textContent?.replace(/\s+/g, ' ') ?? '',
      ]),
    );
    // Every one of these is read back out of fare_rules.txt, not computed.
    expect(byName.get('Pulinchodu')).toContain('₹10');
    expect(byName.get('Edapally')).toContain('₹40');
    expect(byName.get('MG Road')).toContain('₹50');
    expect(byName.get('Tripunithura')).toContain('₹60');
    expect(rows[0].getAttribute('href')).toBe('/route/aluva-to-pulinchodu');
  });

  it('never offers a journey from the station to itself', async () => {
    await render({ slug: 'mg-road' });
    const hrefs = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a.fare-row[href^="/route/"]',
      ),
    ].map((row) => row.getAttribute('href'));
    expect(hrefs).toHaveLength(24);
    expect(hrefs).not.toContain('/route/mg-road-to-mg-road');
  });
});

describe('Station — booking, honesty and provenance', () => {
  it('links KMRL WhatsApp booking as KMRL, and claims nothing for us', async () => {
    await render();
    const link = (fixture?.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[href^="https://wa.me/"]',
    );
    expect(link?.getAttribute('href')).toBe('https://wa.me/919188957488?text=Book%20Ticket');
    const rendered = text();
    expect(rendered).toContain('KMRL sells tickets over WhatsApp on their own number');
    expect(rendered).toContain('getmymetro does not sell tickets');
    // The discount figure that circulates is unverified. Never repeat it.
    expect(rendered).not.toContain('10%');
    expect(rendered).not.toContain('discount');
  });

  it('carries the holiday caveat on a weekday and not on a Sunday', async () => {
    await render({ now: at(TUESDAY, 12, 0) });
    expect(text()).toContain('Public holiday?');

    await render({ now: at(SUNDAY, 12, 0) });
    expect(text()).not.toContain('Public holiday?');
  });

  it('states provenance and its date, and nothing stronger', async () => {
    await render({ holidays: VOUCHED_2026 });
    const rendered = text();
    expect(rendered).toContain('KMRL timetable, not live.');
    expect(rendered).toContain('Confirmed September 2026.');
    expect(rendered).not.toContain('may be wrong');
    expect(rendered).not.toContain('out of date');
  });

  it('says the timetable failed rather than showing invented times', async () => {
    await render({ dataFails: true });
    const rendered = text();
    expect(rendered).toContain('The timetable could not be loaded');
    expect(rendered).toContain('Try again');
    expect(rendered).not.toContain('Towards Aluva');
  });
});
