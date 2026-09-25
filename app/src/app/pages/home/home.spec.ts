/**
 * The home screen, as a user meets it.
 *
 * The rule under test throughout is that **nothing dead-ends**. Location can
 * be refused, dismissed, timed out, unsupported, or simply wrong about which
 * city you are in, and every one of those has to land on a screen with a
 * station on it, a way to change it, and no fabricated times.
 *
 * Rendering is asserted here rather than component state, because the
 * component's state being right while the template renders the wrong branch is
 * exactly the bug class this phase can introduce. `detectChanges` is called
 * for that reason and no other.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NetworkDataService } from '../../core/data/network-data';
import type { NetworkData } from '../../core/data/network.types';
import { CLOCK, HOLIDAY_CALENDAR } from '../../core/engine/metro-engine.service';
import { NO_HOLIDAY_DATA, type HolidayCalendar } from '../../core/engine/holiday';
import { at, loadNetwork, VOUCHED_2026 } from '../../core/engine/testing/network';
import { GEOLOCATION } from '../../core/location/geolocation';
import { STATION_MEMORY_KEY } from '../../core/location/station-memory';
import { Home } from './home';

const network: NetworkData = loadNetwork();

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

const MG_ROAD = network.stopsById.get('MGRD');
if (MG_ROAD === undefined) throw new Error('MGRD missing from the bundle');

function fixAt(lat: number, lon: number, accuracy = 25): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lon, accuracy },
    timestamp: 0,
  } as unknown as GeolocationPosition;
}

function grantsFix(position: GeolocationPosition): Geolocation {
  return {
    getCurrentPosition: (ok: PositionCallback) => ok(position),
    watchPosition: () => 0,
    clearWatch: () => undefined,
  } as unknown as Geolocation;
}

function refuses(code: number): Geolocation {
  return {
    getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
      fail?.({ code, message: `code ${code}` } as unknown as GeolocationPositionError),
    watchPosition: () => 0,
    clearWatch: () => undefined,
  } as unknown as Geolocation;
}

interface Options {
  readonly geolocation?: Geolocation | null;
  readonly now?: number;
  readonly holidays?: HolidayCalendar;
  readonly remembered?: string | null;
  readonly dataFails?: boolean;
}

let fixture: ComponentFixture<Home> | undefined;

/**
 * Bootstrap the component with the real network and a fake everything else.
 *
 * The clock is a token, so "22:30 on a Tuesday" is an argument rather than a
 * wait. The data service is stubbed at the seam rather than by faking `fetch`,
 * because what is under test is the screen, not the decoder.
 */
async function render(options: Options = {}): Promise<ComponentFixture<Home>> {
  localStorage.clear();
  if (options.remembered != null) localStorage.setItem(STATION_MEMORY_KEY, options.remembered);

  const now = options.now ?? at(TUESDAY, 12, 0);

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      // Phase 5: the screen now links to the station page, so RouterLink needs
      // an ActivatedRoute. No routes are registered — nothing here navigates.
      provideRouter([]),
      { provide: CLOCK, useValue: () => now },
      { provide: HOLIDAY_CALENDAR, useValue: options.holidays ?? NO_HOLIDAY_DATA },
      { provide: GEOLOCATION, useValue: options.geolocation ?? null },
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

  fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  // The bootstrap work runs in afterNextRender and then chains two promises
  // (the bundle, then the fix). Flush both, and render what they produced.
  for (let i = 0; i < 6; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
  return fixture;
}

function text(): string {
  return (fixture?.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
}

function stationButtons(): HTMLButtonElement[] {
  const host = fixture?.nativeElement as HTMLElement;
  return [...host.querySelectorAll<HTMLButtonElement>('button.station-button')];
}

afterEach(() => {
  // The screen owns a 1 Hz interval and a visibilitychange listener.
  fixture?.destroy();
  fixture = undefined;
  localStorage.clear();
});

describe('Home — the picker is always there', () => {
  it('lists all 25 stations whatever else has happened', async () => {
    await render();
    expect(stationButtons()).toHaveLength(25);
    expect(text()).toContain('Aluva');
    expect(text()).toContain('Tripunithura');
  });

  it('shows a station and its two platforms once one is chosen', async () => {
    await render();
    expect(text()).toContain('Choose your station');

    const kaloor = stationButtons().find((button) => button.textContent?.includes('Kaloor'));
    kaloor?.click();
    fixture?.detectChanges();

    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Kaloor');
    expect(text()).toContain('Towards Aluva');
    expect(text()).toContain('Towards Tripunithura');
    // The choice outlives the visit.
    expect(localStorage.getItem(STATION_MEMORY_KEY)).toBe('KALR');
  });

  it('shows the station from last time before anything else resolves', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('MG Road');
    expect(text()).toContain('The station you last used');
  });
});

describe('Home — "Change" is not a dead control', () => {
  /**
   * The first real-browser finding, and the highest priority one.
   *
   * Phase D shipped a "Change" button whose handler set a signal read by a
   * `<details>` several sections further down the page. Nothing scrolled, focus
   * never moved, and the page looked identical after the click — so the control
   * was dead to anyone using it, while passing every test that only checked the
   * signal.
   *
   * These assert the three things that make it not dead: the picker opens,
   * focus lands inside it, and the button says what it controls. Focus is the
   * one that cannot be faked — WCAG 3.2.1 asks that a control which changes
   * context move focus with it, and it is also the only part of "the user can
   * tell something happened" that jsdom can observe. The scroll itself needs a
   * viewport, so it is asserted by proxy (the call is made) and listed as
   * browser-only below.
   */
  it('opens the picker, and moves focus into it', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const host = fixture?.nativeElement as HTMLElement;

    const change = [...host.querySelectorAll<HTMLButtonElement>('button.btn-secondary')].find(
      (button) => button.textContent?.trim() === 'Change',
    );
    if (change === undefined) throw new Error('no Change button beside the station name');

    const details = host.querySelector<HTMLDetailsElement>('details.picker');
    if (details === null) throw new Error('no picker');
    expect(details.open).toBe(false);

    change.click();
    fixture?.detectChanges();
    // The handler defers to a microtask so the <details> has rendered its
    // input before focus moves to it.
    await Promise.resolve();
    fixture?.detectChanges();

    expect(details.open).toBe(true);
    // Focus is *inside* the picker, not left on a button 900px above it.
    const focused = document.activeElement;
    expect(focused).not.toBeNull();
    expect(details.contains(focused)).toBe(true);
    // And on the fastest way through 25 stations, not merely on the summary.
    expect((focused as HTMLElement).classList.contains('picker-input')).toBe(true);
  });

  it('tells assistive technology what the button controls, and whether it is open', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const host = fixture?.nativeElement as HTMLElement;
    const change = [...host.querySelectorAll<HTMLButtonElement>('button.btn-secondary')].find(
      (button) => button.textContent?.trim() === 'Change',
    );

    expect(change?.getAttribute('aria-controls')).toBe('stations');
    expect(change?.getAttribute('aria-expanded')).toBe('false');
    // The id it names has to be the picker's, or the relationship is a lie.
    expect(host.querySelector('#stations')?.tagName.toLowerCase()).toBe('details');

    change?.click();
    fixture?.detectChanges();
    expect(change?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Home — a reader nowhere near the metro', () => {
  /**
   * The fifth finding: a user 23.8 km out read "Nearest station — 23.8 km
   * away", which states a distance and implies the station is usable. It is
   * not — 23.8 km is most of a district away from a 25-station line.
   *
   * The honesty rules cut both ways here (CLAUDE.md): the *times* are not in
   * doubt, only whether this is the reader's station, so the copy doubts
   * exactly that and nothing more. No banner about stale data, no hedge on the
   * timetable.
   */
  it('does not display the off-network fix note banner', async () => {
    // Bengaluru: ~360 km from the line, and well past the 5 km catchment.
    await render({ geolocation: grantsFix(fixAt(12.9716, 77.5946)) });
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('.fix-note')).toBeNull();
  });

  it('still answers, and still lists every station', async () => {
    // Being far away must never cost the reader the screen: the times at the
    // nearest station are real times and the picker is right there.
    await render({ geolocation: grantsFix(fixAt(12.9716, 77.5946)) });
    expect(text()).toContain('Towards');
    expect(stationButtons()).toHaveLength(25);
  });
});

describe('Home — reaching the rest of the app', () => {
  it('links the full timetable page for the station on screen', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const link = (fixture?.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.link-row',
    );
    expect(link?.getAttribute('href')).toBe('/station/mg-road');
    expect(link?.textContent?.trim()).toBe('All departures and fares from MG Road');
  });

  it('offers no station link before there is a station', async () => {
    await render({ geolocation: null });
    expect((fixture?.nativeElement as HTMLElement).querySelector('a.link-row')).toBeNull();
  });

  it('puts the last-train question behind its own label, not under "fares"', async () => {
    // The last train is the dangerous question — at 20 stations the advertised
    // one does not reach Aluva (CLAUDE.md finding 9) — so it gets a label that
    // names it and a link that lands on that section rather than the top of
    // the page.
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const links = [
      ...(fixture?.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'a.link-row',
      ),
    ];
    const labels = links.map((a) => a.textContent?.trim());
    expect(labels).toEqual([
      'All departures and fares from MG Road',
      'First and last train from MG Road',
    ]);
    expect(links[1].getAttribute('href')).toBe('/station/mg-road#first-last');
  });

  it('offers every destination, priced, one tap from the answer', async () => {
    // This is the whole discoverability complaint: A-to-B journeys, fares and
    // the 600 route pages used to be three taps away, through the station
    // page. They are one tap now, and the rows are the same `platformViews`
    // rows the station page renders rather than a second fare list.
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const host = fixture?.nativeElement as HTMLElement;
    const rows = [...host.querySelectorAll<HTMLAnchorElement>('a.fare-row[href^="/route/"]')];
    expect(rows).toHaveLength(24);

    const byHref = new Map(
      rows.map((row) => [row.getAttribute('href'), row.textContent?.replace(/\s+/g, ' ') ?? '']),
    );
    // Straight out of the 625-pair table, never computed from distance.
    expect(byHref.get('/route/mg-road-to-aluva')).toContain('₹50');
    expect(byHref.get('/route/mg-road-to-aluva')).toContain('14 stops');
    expect(byHref.get('/route/mg-road-to-maharajas-college')).toContain('₹10');
    expect(byHref.get('/route/mg-road-to-maharajas-college')).toContain('1 stop');
    // A journey from a station to itself is not offered, whatever the feed prices.
    expect([...byHref.keys()]).not.toContain('/route/mg-road-to-mg-road');
  });

  it('names both platforms in station names, not only as "towards"', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const rendered = text();
    expect(rendered).toContain('Where are you going?');
    expect(rendered).toContain('Towards Aluva');
    expect(rendered).toContain('Towards Tripunithura');
  });
});

describe('Home — the map sits under the answer, never over it', () => {
  it('renders the departure answer first, then the map, then the picker', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    const host = fixture?.nativeElement as HTMLElement;
    const board = host.querySelector('app-board-panel');
    const map = host.querySelector('app-line-map');
    const picker = host.querySelector('details.picker');
    if (board === null || map === null || picker === null) {
      throw new Error('the answer, the map and the picker must all be on the home screen');
    }

    // DOCUMENT_POSITION_FOLLOWING === 4: the argument comes after the subject.
    const follows = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(board, map)).toBe(true);
    expect(follows(map, picker)).toBe(true);
  });

  it('says on the home screen itself that the positions are scheduled', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    expect(text()).toContain('Scheduled positions');
    expect(text()).toContain('No live tracking is published for this metro');
  });
});

describe('Home — every way location can fail', () => {
  it('permission denied: explains, does not re-prompt, still answers', async () => {
    await render({ geolocation: refuses(1), remembered: 'MGRD' });
    expect(text()).toContain('Location is turned off for this site');
    expect(text()).not.toContain('Try location again');
    expect(text()).toContain('Towards Aluva');
  });

  it('prompt dismissed or timed out: offers a retry', async () => {
    await render({ geolocation: refuses(3) });
    expect(text()).toContain('Finding your location took too long');
    expect(text()).toContain('Try location again');
    expect(stationButtons()).toHaveLength(25);
  });

  it('no fix available: offers a retry', async () => {
    await render({ geolocation: refuses(2) });
    expect(text()).toContain('Your device could not work out where it is');
    expect(text()).toContain('Try location again');
  });

  it('no geolocation API at all: says so without offering a dead button', async () => {
    await render({ geolocation: null });
    expect(text()).toContain('This browser will not share your location');
    expect(text()).not.toContain('Try location again');
    expect(stationButtons()).toHaveLength(25);
  });

  it('a fix at a station answers with no taps at all', async () => {
    await render({ geolocation: grantsFix(fixAt(MG_ROAD.lat, MG_ROAD.lon)) });
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('MG Road');
    expect(text()).toContain('Nearest station');
    expect(text()).toContain('Towards Aluva');
  });

  it('a fix too coarse to trust is shown as a guess, not as fact', async () => {
    await render({ geolocation: grantsFix(fixAt(MG_ROAD.lat, MG_ROAD.lon, 2500)) });
    expect(text()).toContain('only accurate to about 2500 m');
    expect(text()).toContain('this may be the wrong station');
  });

  it('a user outside Kochi gets the nearest station and a way to change it', async () => {
    await render({ geolocation: grantsFix(fixAt(12.9716, 77.5946)) });
    expect(text()).toContain('from the metro line');
    expect(stationButtons()).toHaveLength(25);
    expect(text()).toContain('Towards');
  });

  it('an explicit choice outranks the fix', async () => {
    await render({ geolocation: grantsFix(fixAt(MG_ROAD.lat, MG_ROAD.lon)) });
    const aluva = stationButtons().find((button) => button.textContent?.includes('Aluva'));
    aluva?.click();
    fixture?.detectChanges();
    const host = fixture?.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Aluva');
    expect(text()).toContain('The station you chose');
  });
});

describe('Home — the timetable itself failing', () => {
  it('says so and offers a retry rather than showing invented times', async () => {
    await render({ dataFails: true, remembered: 'MGRD' });
    expect(text()).toContain('The timetable could not be loaded');
    expect(text()).toContain('Try again');
    expect(text()).not.toContain('Towards Aluva');
  });
});

describe('Home — warnings that only appear when they are true', () => {
  it('labels a train that terminates before the end of the line', async () => {
    // 22:36 from Aluva towards Tripunithura runs only to Muttom depot.
    await render({ remembered: 'ALVA', now: at(TUESDAY, 22, 30) });
    expect(text()).toContain('Ends at Muttom');
    expect(text()).toContain('does not reach Tripunithura');
  });

  it('warns about the 45-minute gap towards Aluva, and not towards Tripunithura', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 22, 30) });
    const rendered = text();
    expect(rendered).toContain('Last train towards Aluva');
    expect(rendered).toContain('Nothing leaves this platform between 10:58 PM and 11:44 PM');
    expect(rendered).toContain('a 45 minute gap');
    // Both platforms are on screen, and only one of them has a cliff.
    expect(rendered).toContain('Last train towards Tripunithura');
    expect(rendered.match(/Nothing leaves this platform/g)).toHaveLength(1);
  });

  it('leads with the train that actually reaches the end of the line', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 22, 30) });
    expect(text()).toContain('That is the last train all the way to Aluva');
    expect(text()).toContain('A later train leaves at 11:44 PM, but it stops at Muttom');
  });

  it('says nothing about the last train in the middle of the day', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 12, 0) });
    expect(text()).not.toContain('Last train towards');
    expect(text()).not.toContain('Nothing leaves this platform');
  });

  it('tells you to run only when missing the train costs something', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 6, 4) });
    expect(text()).toContain('Run — 1 min, then a 20 min wait');

    await render({ remembered: 'MGRD', now: at(TUESDAY, 12, 0) });
    expect(text()).not.toContain('Run —');
  });
});

describe('Home — the holiday caveat', () => {
  it('appears on a weekday, without alarming anyone', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 12, 0) });
    const rendered = text();
    expect(rendered).toContain('If today is a public holiday');
    expect(rendered).toContain("These are KMRL's Monday-to-Saturday times");
    expect(rendered).toContain('about 90 minutes later');
    // The times themselves are not in doubt, and the copy must not imply they are.
    expect(rendered).not.toContain('may be wrong');
    expect(rendered).not.toContain('out of date');
  });

  it('does not appear on a Sunday, which no holiday can change', async () => {
    await render({ remembered: 'MGRD', now: at(SUNDAY, 12, 0) });
    expect(text()).not.toContain('If today is a public holiday');
    expect(text()).toContain('Towards Aluva');
  });

  it('does not appear when a reviewed calendar vouches for the date', async () => {
    await render({ remembered: 'MGRD', now: at(TUESDAY, 12, 0), holidays: VOUCHED_2026 });
    expect(text()).not.toContain('If today is a public holiday');
  });
});

describe('Home — provenance', () => {
  it('states where the times came from and when that was last confirmed', async () => {
    await render({ remembered: 'MGRD' });
    expect(text()).toContain("Scheduled times from KMRL's published timetable — not live");
    expect(text()).toContain('KMRL confirmed these timings are current in September 2026');
  });
});
