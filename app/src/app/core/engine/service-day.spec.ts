/**
 * Which timetable is running, and what we are willing to claim about it.
 *
 * Two things are easy to get wrong in this dataset and both are asserted here
 * against `calendar.txt` rather than against a memory of it:
 *
 *   `WK` is Monday to **Saturday**, not Monday to Friday. Copy that says
 *   "weekday" is wrong, and a Saturday resolving to `WE` would show a Sunday
 *   timetable — which starts 90 minutes later — to everyone out on a Saturday
 *   morning.
 *
 *   A service day outlives its calendar date. At 00:02 on Wednesday, Tuesday's
 *   timetable is still running; at 00:04 it is not, because the feed's last
 *   train is off the network at 24:03:45.
 */

import { asSeconds } from '../data/seconds';
import {
  addDays,
  formatCivilDate,
  istInstant,
  parseCivilDate,
  type CivilDate,
} from './civil-time';
import { declaredHolidays, NO_HOLIDAY_DATA, VOUCHES_FOR_NOTHING } from './holiday';
import {
  mapOutlook,
  outlookOver,
  payloadIgnoringCertainty,
  resolveServiceWindows,
  serviceDayHorizon,
  serviceWindowFor,
  type ServiceWindow,
} from './service-day';
import { gtfsSeconds, rawTrips, readFeedCsv } from './testing/feed';
import { at, loadNetwork, VOUCHED_2026 } from './testing/network';

const network = loadNetwork();

/** `calendar.txt`, as the oracle: service id to the ISO weekdays it runs. */
function calendarOracle(): Map<string, number[]> {
  const columns = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return new Map(
    readFeedCsv('calendar.txt').map((row) => [
      row['service_id'],
      columns.map((name, i) => (row[name] === '1' ? i + 1 : 0)).filter((iso) => iso !== 0),
    ]),
  );
}

const windowOn = (iso: string, holidays = VOUCHED_2026): ServiceWindow =>
  serviceWindowFor(network, parseCivilDate(iso), 0, holidays);

describe('services by day of week', () => {
  it('matches calendar.txt on all seven days, with WK running on Saturday', () => {
    const oracle = calendarOracle();
    expect([...oracle.keys()].sort()).toEqual(['WE', 'WK']);
    expect(oracle.get('WK')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(oracle.get('WE')).toEqual([7]);

    // Monday 2026-09-21 through Sunday 2026-09-27.
    const week = [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ];
    week.forEach((iso, index) => {
      const isoWeekday = index + 1;
      const expected = [...oracle.entries()]
        .filter(([, days]) => days.includes(isoWeekday))
        .map(([id]) => id)
        .sort();
      const window = windowOn(iso);
      expect(window.weekday, iso).toBe(isoWeekday);
      expect([...window.services].sort(), iso).toEqual(expected);
    });
  });

  it('runs WK on Saturday and WE only on Sunday', () => {
    expect(windowOn('2026-09-26').services).toEqual(['WK']); // Saturday
    expect(windowOn('2026-09-27').services).toEqual(['WE']); // Sunday
    expect(windowOn('2026-09-28').services).toEqual(['WK']); // Monday
  });
});

describe('serviceDayHorizon', () => {
  it('is the latest time in the feed, measured rather than assumed', () => {
    const latest = Math.max(
      ...rawTrips().flatMap((trip) => trip.stops.flatMap((s) => [s.arrival, s.departure])),
    );
    expect(latest).toBe(gtfsSeconds('24:03:45'));
    expect(serviceDayHorizon(network)).toBe(asSeconds(latest));
  });
});

describe('resolveServiceWindows', () => {
  const dates = (windows: readonly ServiceWindow[]): string[] =>
    windows.map((w) => formatCivilDate(w.date));

  it('keeps yesterday alive at 00:02 and drops it at 00:04', () => {
    // 00:02 IST on Wednesday. Tuesday's service day is at offset 86,520 —
    // inside the 86,625 horizon, because WK_253 is still between Kalamassery
    // and Muttom. This is the window keralam.co loses every night.
    const stillRunning = resolveServiceWindows(network, at('2026-09-23', 0, 2), VOUCHED_2026);
    expect(dates(stillRunning)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(stillRunning[0].offset).toBe(86_520);
    expect(stillRunning[1].offset).toBe(120);

    // 00:04. Offset 86,640 is past the horizon: the network is empty.
    const finished = resolveServiceWindows(network, at('2026-09-23', 0, 4), VOUCHED_2026);
    expect(dates(finished)).toEqual(['2026-09-23', '2026-09-24']);
  });

  it('reads the previous service day from its own calendar', () => {
    // 00:01 on a Monday. The service day still running is Sunday, so the
    // previous window must resolve WE even though today is a WK day.
    const windows = resolveServiceWindows(network, at('2026-09-28', 0, 1), VOUCHED_2026);
    expect(formatCivilDate(windows[0].date)).toBe('2026-09-27');
    expect(windows[0].weekday).toBe(7);
    expect(windows[0].services).toEqual(['WE']);
    expect(windows[1].services).toEqual(['WK']);
  });

  it('offers today and tomorrow during the day', () => {
    const windows = resolveServiceWindows(network, at('2026-09-22', 12, 0), VOUCHED_2026);
    expect(dates(windows)).toEqual(['2026-09-22', '2026-09-23']);
    expect(windows[0].offset).toBe(43_200);
    expect(windows[1].offset).toBe(43_200 - 86_400);
  });

  it('anchors each window at midnight IST on its own date', () => {
    const [window] = resolveServiceWindows(network, at('2026-09-22', 12, 0), VOUCHED_2026);
    expect(window.origin).toBe(istInstant(parseCivilDate('2026-09-22'), 0));
    // A departure at offset 86,475 on this window really is 00:01:15 the next
    // morning, which is what makes cross-midnight sorting work.
    expect(window.origin + 86_475_000).toBe(istInstant(parseCivilDate('2026-09-23'), 75));
  });
});

describe('holiday calendars', () => {
  const monday: CivilDate = parseCivilDate('2026-09-21');
  const sunday: CivilDate = parseCivilDate('2026-09-27');

  it('vouches for Sundays and nothing else by default', () => {
    // A Sunday already runs the Sunday timetable, so no holiday declaration
    // can change it. Caveating it would overstate the uncertainty.
    expect(NO_HOLIDAY_DATA.ruleFor(sunday)).toEqual({ kind: 'ordinary' });
    const ruling = NO_HOLIDAY_DATA.ruleFor(monday);
    expect(ruling.kind).toBe('unverified');
    expect(ruling.kind === 'unverified' && ruling.reason).toMatch(/calendar_dates/);
  });

  it('ships no holiday dates of its own', () => {
    // Nobody has checked Kerala's holidays, so nothing may be asserted about
    // any specific date. If this ever fails, someone invented a list.
    for (const iso of ['2026-08-26', '2026-01-26', '2026-12-25', '2026-04-14']) {
      expect(NO_HOLIDAY_DATA.ruleFor(parseCivilDate(iso)).kind, iso).toBe('unverified');
    }
  });

  it('accepts a reviewed list and confines it to the range it was reviewed for', () => {
    const calendar = declaredHolidays({
      sundayService: { '2026-08-26': 'Thiruvonam' },
      vouchedFrom: '2026-01-01',
      vouchedThrough: '2026-12-31',
      source: 'spec fixture',
    });
    expect(calendar.ruleFor(parseCivilDate('2026-08-26'))).toEqual({
      kind: 'sunday-service',
      name: 'Thiruvonam',
    });
    expect(calendar.ruleFor(monday)).toEqual({ kind: 'ordinary' });
    // 2027 was never reviewed, so it is unverified even though the list is
    // "complete". The range carries that, not the list.
    const next = calendar.ruleFor(parseCivilDate('2027-03-01'));
    expect(next.kind).toBe('unverified');
    expect(next.kind === 'unverified' && next.reason).toMatch(/spec fixture covers/);
    // A Sunday outside the range is still certain.
    expect(calendar.ruleFor(parseCivilDate('2027-03-07')).kind).toBe('ordinary');
  });

  it('refuses a malformed declaration rather than half-applying it', () => {
    expect(() =>
      declaredHolidays({
        sundayService: {},
        vouchedFrom: '2026-12-31',
        vouchedThrough: '2026-01-01',
        source: 'x',
      }),
    ).toThrow(/runs backwards/);
    expect(() =>
      declaredHolidays({
        sundayService: { '2027-08-26': 'Thiruvonam' },
        vouchedFrom: '2026-01-01',
        vouchedThrough: '2026-12-31',
        source: 'x',
      }),
    ).toThrow(/outside the vouched range/);
  });

  it('switches a declared holiday to the Sunday timetable', () => {
    const calendar = declaredHolidays({
      sundayService: { '2026-08-26': 'Thiruvonam' },
      vouchedFrom: '2026-01-01',
      vouchedThrough: '2026-12-31',
      source: 'spec fixture',
    });
    // 2026-08-26 is a Wednesday.
    const window = serviceWindowFor(network, parseCivilDate('2026-08-26'), 0, calendar);
    expect(window.weekday).toBe(3);
    expect(window.effectiveWeekday).toBe(7);
    expect(window.services).toEqual(['WE']);
  });

  it('keeps day-of-week service when a date is unverified', () => {
    // Unverified changes what we claim, not what we show. Pre-emptively
    // switching to Sunday on every unchecked weekday would be a different lie.
    const window = serviceWindowFor(network, monday, 0, NO_HOLIDAY_DATA);
    expect(window.ruling.kind).toBe('unverified');
    expect(window.effectiveWeekday).toBe(1);
    expect(window.services).toEqual(['WK']);
  });
});

describe('ServiceOutlook', () => {
  it('hides the payload behind a different key when it cannot be vouched for', () => {
    const outlook = outlookOver([windowOn('2026-09-21', NO_HOLIDAY_DATA)], 'departures');
    expect(outlook.certainty).toBe('unverified');
    // The runtime counterpart of the compile-time guarantee: `result` does not
    // exist, so a template that binds to it reads undefined and code that
    // types it does not compile. A boolean flag would have been ignorable.
    expect('result' in outlook).toBe(false);
    expect(outlook.certainty === 'unverified' && outlook.provisional).toBe('departures');
    expect(outlook.certainty === 'unverified' && outlook.dates).toEqual(['2026-09-21']);
  });

  it('exposes the payload as result when it is certain', () => {
    const outlook = outlookOver([windowOn('2026-09-27')], 'departures');
    expect(outlook.certainty).toBe('timetabled');
    expect('provisional' in outlook).toBe(false);
    expect(outlook.certainty === 'timetabled' && outlook.result).toBe('departures');
  });

  it('names the holiday when one was declared', () => {
    const calendar = declaredHolidays({
      sundayService: { '2026-08-26': 'Thiruvonam' },
      vouchedFrom: '2026-01-01',
      vouchedThrough: '2026-12-31',
      source: 'spec fixture',
    });
    const outlook = outlookOver([windowOn('2026-08-26', calendar)], 'departures');
    expect(outlook.certainty).toBe('holiday-sunday');
    expect(outlook.certainty === 'holiday-sunday' && outlook.holidays).toEqual(['Thiruvonam']);
  });

  it('takes the weakest claim of every contributing service day', () => {
    // One unchecked day in the mix taints the whole answer: a board that spans
    // midnight into an unverified tomorrow cannot be presented as fact.
    const mixed = outlookOver(
      [windowOn('2026-09-27'), windowOn('2026-09-28', NO_HOLIDAY_DATA)],
      1,
    );
    expect(mixed.certainty).toBe('unverified');

    // But a certain day is not tainted by a window that contributed nothing.
    expect(outlookOver([windowOn('2026-09-27')], 1).certainty).toBe('timetabled');
  });

  it('caveats everything when the calendar vouches for nothing', () => {
    expect(outlookOver([windowOn('2026-09-27', VOUCHES_FOR_NOTHING)], 1).certainty).toBe(
      'unverified',
    );
  });

  it('reads and maps the payload without losing the claim', () => {
    const unverified = outlookOver([windowOn('2026-09-21', NO_HOLIDAY_DATA)], 2);
    expect(payloadIgnoringCertainty(unverified)).toBe(2);
    expect(payloadIgnoringCertainty(mapOutlook(unverified, (n) => n * 3))).toBe(6);
    expect(mapOutlook(unverified, (n) => n * 3).certainty).toBe('unverified');

    const certain = outlookOver([windowOn('2026-09-27')], 2);
    expect(payloadIgnoringCertainty(mapOutlook(certain, (n) => n * 3))).toBe(6);
    expect(mapOutlook(certain, (n) => n * 3).certainty).toBe('timetabled');
  });
});

describe('the lapsed feed window', () => {
  it('is provenance and never restricts which services resolve', () => {
    // calendar.txt ends 2025-12-31. A spec-compliant consumer resolves zero
    // services for any 2026 date and renders an empty app (CLAUDE.md finding
    // 6). Dates well past the window must still resolve services.
    expect(network.feed.endDate).toBe('20251231');
    for (const iso of ['2026-09-22', '2027-06-15', '2030-01-01']) {
      const window = serviceWindowFor(network, parseCivilDate(iso), 0, VOUCHES_FOR_NOTHING);
      expect(window.services.length, iso).toBeGreaterThan(0);
    }
    // And a full year after the declared end, a Sunday is still WE.
    expect(
      serviceWindowFor(
        network,
        addDays(parseCivilDate('2026-09-27'), 364),
        0,
        VOUCHES_FOR_NOTHING,
      ).services,
    ).toEqual(['WE']);
  });
});
