/**
 * The facade, and the two lines of Angular on top of it.
 *
 * The facade is where the holiday guard is actually applied, so most of this
 * file is about certainty rather than timetables: the same query on the same
 * instant must come back `timetabled`, `holiday-sunday` or `unverified`
 * depending only on what the injected calendar is willing to say.
 *
 * The service is deliberately thin — a signal, a promise and a clock token —
 * and is tested for the three things it could still get wrong: loading twice,
 * caching a failure, and reading the wall clock behind the caller's back.
 */

import { TestBed } from '@angular/core/testing';

import { NetworkDataService } from '../data/network-data';
import type { NetworkData } from '../data/network.types';
import { formatClock } from './clock';
import { formatCivilDate, type Instant } from './civil-time';
import { declaredHolidays, NO_HOLIDAY_DATA } from './holiday';
import { createMetroEngine, type MetroEngine } from './metro-engine';
import { CLOCK, HOLIDAY_CALENDAR, MetroEngineService } from './metro-engine.service';
import { payloadIgnoringCertainty, serviceDayHorizon } from './service-day';
import { gtfsSeconds } from './testing/feed';
import { at, loadNetwork, VOUCHED_2026 } from './testing/network';

const network: NetworkData = loadNetwork();
const engine: MetroEngine = createMetroEngine(network, { holidays: VOUCHED_2026 });

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

describe('createMetroEngine', () => {
  it('exposes the horizon it measured from the feed', () => {
    expect(engine.horizon).toBe(serviceDayHorizon(network));
    expect(engine.horizon as number).toBe(gtfsSeconds('24:03:45'));
  });

  it('resolves a station by id, by index or by itself', () => {
    expect(engine.stop('MGRD').index).toBe(14);
    expect(engine.stop(14).id).toBe('MGRD');
    expect(engine.stop(engine.stop('MGRD')).id).toBe('MGRD');
    expect(() => engine.stop('NOPE')).toThrow(/no station with id/);
  });

  it('answers the date-free questions without an outlook', () => {
    // Nothing a holiday can change, so nothing to caveat.
    expect(engine.fare('ALVA', 'EDAP')).toBe(40);
    expect(engine.publishedFare('ALVA', 'ALVA')).toBe(10);
    expect(() => engine.fare('ALVA', 'ALVA')).toThrow(/not a journey/);
    expect(engine.nearestStation({ lat: 9.9834, lon: 76.2823 }).stop.id).toBe('MGRD');
    expect(engine.nearest({ lat: 9.9834, lon: 76.2823 }, 3)).toHaveLength(3);
  });

  it('shows both platforms at a station, and one at each terminus', () => {
    const station = payloadIgnoringCertainty(engine.station('MGRD', at(TUESDAY, 12)));
    expect(station.stop.id).toBe('MGRD');
    expect(station.boards).toHaveLength(2);
    expect(station.boards.map((b) => b.towards.name.en).sort()).toEqual([
      'Aluva',
      'Tripunithura',
    ]);

    // Aluva can only be left in one direction.
    const aluva = payloadIgnoringCertainty(engine.station('ALVA', at(TUESDAY, 12)));
    expect(aluva.boards).toHaveLength(1);
    expect(aluva.boards[0].direction).toBe(0);
    expect(aluva.boards[0].towards.name.en).toBe('Tripunithura');
  });

  it('plans a journey through the facade exactly as the module does', () => {
    const journey = payloadIgnoringCertainty(engine.journey('ALVA', 'EDAP', at(TUESDAY, 12)));
    expect(journey.fare).toBe(40);
    expect(journey.stopsBetween).toHaveLength(7);
    expect(journey.options).toHaveLength(3);
  });

  it('finds the last train through the facade at 00:01', () => {
    const board = payloadIgnoringCertainty(
      engine.board('KLMT', 1, at('2026-09-23', 0, 1)),
    );
    expect(board.next!.tripId).toBe('WK_253');
    expect(formatClock(board.next!.time)).toBe('12:01 AM');
    expect(formatCivilDate(board.next!.window.date)).toBe('2026-09-22');
  });
});

describe('the holiday guard', () => {
  const noon = at(TUESDAY, 12);

  it('marks a date it cannot vouch for, and withholds `result`', () => {
    const unsure = createMetroEngine(network, { holidays: NO_HOLIDAY_DATA });
    const outlook = unsure.board('MGRD', 0, noon);
    expect(outlook.certainty).toBe('unverified');
    expect('result' in outlook).toBe(false);
    expect(outlook.certainty === 'unverified' && outlook.caveat).toMatch(/90 minutes later/);
    expect(outlook.certainty === 'unverified' && outlook.dates).toContain(TUESDAY);
    // The timetable is still there — provisionally.
    expect(payloadIgnoringCertainty(outlook).departures.length).toBeGreaterThan(0);
  });

  it('vouches for a Sunday even with no holiday data at all', () => {
    const unsure = createMetroEngine(network, { holidays: NO_HOLIDAY_DATA });
    const outlook = unsure.board('MGRD', 0, at(SUNDAY, 12));
    expect(outlook.certainty).toBe('timetabled');
    expect(outlook.certainty === 'timetabled' && outlook.result.departures.length).toBeGreaterThan(
      0,
    );
  });

  it('runs the Sunday timetable on a declared holiday and says which one', () => {
    // 2026-08-26 is a Wednesday. On a declared holiday the engine must serve
    // WE trips, which start about 90 minutes later — the whole reason the
    // guard exists.
    const holidays = declaredHolidays({
      sundayService: { '2026-08-26': 'Thiruvonam' },
      vouchedFrom: '2026-01-01',
      vouchedThrough: '2026-12-31',
      source: 'spec fixture',
    });
    const festive = createMetroEngine(network, { holidays });
    const outlook = festive.board('ALVA', 0, at('2026-08-26', 6, 30));
    expect(outlook.certainty).toBe('holiday-sunday');
    expect(outlook.certainty === 'holiday-sunday' && outlook.holidays).toEqual(['Thiruvonam']);

    const board = payloadIgnoringCertainty(outlook);
    expect(board.next!.serviceId).toBe('WE');
    // Weekday service would have offered a 06:30 departure; Sunday does not.
    const weekday = createMetroEngine(network, { holidays: VOUCHED_2026 });
    const ordinary = payloadIgnoringCertainty(weekday.board('ALVA', 0, at(TUESDAY, 6, 30)));
    expect(ordinary.next!.time as number).toBe(gtfsSeconds('06:30:00'));
    expect(board.next!.time as number).toBeGreaterThan(gtfsSeconds('07:00:00'));
    expect(board.next!.waitSeconds).toBeGreaterThan(ordinary.next!.waitSeconds + 3000);
  });

  it('does not caveat a certain day because an unchecked one was a candidate', () => {
    // At noon on a Sunday, tomorrow's unverified Monday window is resolved but
    // contributes no departures, so the answer stays certain.
    const unsure = createMetroEngine(network, { holidays: NO_HOLIDAY_DATA });
    const outlook = unsure.board('MGRD', 0, at(SUNDAY, 12));
    expect(outlook.windows.map((w) => formatCivilDate(w.date))).toEqual([SUNDAY]);
    expect(outlook.certainty).toBe('timetabled');
  });

  it('caveats a board that really does spill into an unchecked tomorrow', () => {
    // Late on a Sunday the board runs out of Sunday trains and reaches into
    // Monday, which nobody has vouched for. The caveat must follow.
    const unsure = createMetroEngine(network, { holidays: NO_HOLIDAY_DATA });
    const outlook = unsure.board('MGRD', 0, at(SUNDAY, 23, 30), 2);
    const dates = payloadIgnoringCertainty(outlook).departures.map((d) =>
      formatCivilDate(d.window.date),
    );
    expect(dates).toContain('2026-09-28');
    expect(outlook.certainty).toBe('unverified');
  });
});

describe('MetroEngineService', () => {
  const FIXED: Instant = at(TUESDAY, 12);

  function configure(clock: () => Instant = () => FIXED) {
    TestBed.configureTestingModule({
      providers: [
        { provide: NetworkDataService, useValue: { load: () => Promise.resolve(network) } },
        { provide: HOLIDAY_CALENDAR, useValue: VOUCHED_2026 },
        { provide: CLOCK, useValue: clock },
      ],
    });
    return TestBed.inject(MetroEngineService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('is not ready until the bundle has loaded', async () => {
    const service = configure();
    expect(service.ready()).toBe(false);
    expect(service.engine()).toBeNull();

    const loaded = await service.load();
    expect(service.ready()).toBe(true);
    expect(service.engine()).toBe(loaded);
    expect(loaded.stop('MGRD').name.en).toBe('MG Road');
  });

  it('loads at most once, however often it is asked', async () => {
    let calls = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NetworkDataService,
          useValue: {
            load: () => {
              calls++;
              return Promise.resolve(network);
            },
          },
        },
        { provide: HOLIDAY_CALENDAR, useValue: VOUCHED_2026 },
        { provide: CLOCK, useValue: () => FIXED },
      ],
    });
    const service = TestBed.inject(MetroEngineService);
    const [a, b] = await Promise.all([service.load(), service.load()]);
    await service.load();
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it('lets a failed load be retried for real', async () => {
    let calls = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NetworkDataService,
          useValue: {
            load: () => {
              calls++;
              return calls === 1
                ? Promise.reject(new Error('offline'))
                : Promise.resolve(network);
            },
          },
        },
        { provide: HOLIDAY_CALENDAR, useValue: VOUCHED_2026 },
        { provide: CLOCK, useValue: () => FIXED },
      ],
    });
    const service = TestBed.inject(MetroEngineService);
    await expect(service.load()).rejects.toThrow('offline');
    expect(service.ready()).toBe(false);
    await expect(service.load()).resolves.toBeDefined();
    expect(calls).toBe(2);
    expect(service.ready()).toBe(true);
  });

  it('reads the clock only through the token, and only when told to tick', () => {
    let reads = 0;
    let now = FIXED;
    const service = configure(() => {
      reads++;
      return now;
    });
    // One read to seed `now` at construction, and none since.
    const seeded = reads;
    expect(service.now()).toBe(FIXED);
    expect(reads).toBe(seeded);

    now = at(TUESDAY, 13);
    // Still the old instant: nothing advances on its own, so no timer can be
    // running and no countdown can drift under a hidden tab.
    expect(service.now()).toBe(FIXED);

    expect(service.tick()).toBe(now);
    expect(service.now()).toBe(now);
    expect(reads).toBe(seeded + 1);
  });

  it('uses the injected holiday calendar, not a default of its own', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: NetworkDataService, useValue: { load: () => Promise.resolve(network) } },
        { provide: HOLIDAY_CALENDAR, useValue: NO_HOLIDAY_DATA },
        { provide: CLOCK, useValue: () => FIXED },
      ],
    });
    const service = TestBed.inject(MetroEngineService);
    const loaded = await service.load();
    expect(loaded.board('MGRD', 0, FIXED).certainty).toBe('unverified');
  });

  it('defaults to the calendar that vouches for nothing but Sundays', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: NetworkDataService, useValue: { load: () => Promise.resolve(network) } },
        { provide: CLOCK, useValue: () => FIXED },
      ],
    });
    const calendar = TestBed.inject(HOLIDAY_CALENDAR);
    expect(calendar).toBe(NO_HOLIDAY_DATA);
  });
});
