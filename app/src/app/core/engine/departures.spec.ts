/**
 * The departure board — the part of the engine a passenger actually reads.
 *
 * Every expectation here is derived from `KMRLOpenData/` by `testing/feed.ts`,
 * which shares no code with the engine. Where the coordinating brief supplied
 * an independent number (85,451 s for the last MG Road train towards Aluva,
 * 2,756 s for the gap before it), the literal is asserted *as well as* the
 * derivation, so a bug that corrupted the oracle and the engine identically
 * still fails.
 *
 * Four failure modes are covered because all four have been observed in
 * shipped products:
 *
 *   the last train vanishing at midnight (CLAUDE.md finding 7);
 *   the four pre-06:00 revenue trips being dropped (finding 7);
 *   short turns going unlabelled (finding 10);
 *   the 45-minute cliff going unshown (finding 9).
 */

import type { Direction } from '../data/network.types';
import { formatClock } from './clock';
import { formatCivilDate, parseCivilDate, type Instant } from './civil-time';
import {
  buildDepartureIndex,
  departureBoard,
  departuresFrom,
  lastTrainAt,
  NUDGE_CATCH_SECONDS,
  NUDGE_PENALTY_SECONDS,
  runNudge,
} from './departures';
import { resolveServiceWindows, serviceWindowFor } from './service-day';
import { gtfsSeconds, rawDepartures, rawTrips } from './testing/feed';
import { at, loadNetwork, VOUCHED_2026 } from './testing/network';

const network = loadNetwork();
const index = buildDepartureIndex(network);

const windows = (instant: Instant) => resolveServiceWindows(network, instant, VOUCHED_2026);

const board = (stop: string, direction: Direction, instant: Instant, limit = 3) =>
  departureBoard(index, { stop, direction, at: instant, windows: windows(instant), limit });

/** A Tuesday and a Sunday, so both services are exercised throughout. */
const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

describe('the index', () => {
  it('holds every boardable stop event and no terminating ones', () => {
    const trips = rawTrips();
    const boardable = trips.reduce((n, trip) => n + trip.stops.length - 1, 0);
    const total = [...index.buckets.values()].reduce((n, bucket) => n + bucket.length, 0);

    expect(trips.length).toBe(450);
    expect(trips.reduce((n, t) => n + t.stops.length, 0)).toBe(10_726);
    // 10,726 stop events minus one unboardable terminus per trip.
    expect(boardable).toBe(10_276);
    expect(total).toBe(boardable);
  });

  it('offers nothing at a terminus in the direction it cannot be boarded', () => {
    // Direction 1 ends at Aluva, direction 0 at Tripunithura. Neither can be
    // boarded there, and a board that advertised one would be selling a train
    // that only opens its doors to let people off.
    const noon = at(TUESDAY, 12);
    expect(board('ALVA', 1, noon).departures).toEqual([]);
    expect(board('ALVA', 1, noon).lastTrain).toBeNull();
    expect(board('TPHT', 0, noon).departures).toEqual([]);
    expect(board('TPHT', 0, noon).lastTrain).toBeNull();
  });
});

describe('next departures', () => {
  it('matches the raw feed at a sample of stops, directions and services', () => {
    const cases: { stop: string; direction: Direction; date: string; service: string; hour: number }[] = [
      { stop: 'MGRD', direction: 0, date: TUESDAY, service: 'WK', hour: 9 },
      { stop: 'MGRD', direction: 1, date: TUESDAY, service: 'WK', hour: 17 },
      { stop: 'EDAP', direction: 1, date: TUESDAY, service: 'WK', hour: 21 },
      { stop: 'ALVA', direction: 0, date: SUNDAY, service: 'WE', hour: 10 },
      { stop: 'VYTA', direction: 1, date: SUNDAY, service: 'WE', hour: 14 },
    ];
    for (const c of cases) {
      const instant = at(c.date, c.hour);
      const expected = rawDepartures(c.stop, c.direction, c.service)
        .filter((d) => d.time >= c.hour * 3600)
        .slice(0, 3);
      const actual = board(c.stop, c.direction, instant).departures;
      const label = `${c.stop} dir${c.direction} ${c.date} ${c.hour}:00`;
      expect(actual.map((d) => d.tripId), label).toEqual(expected.map((e) => e.tripId));
      expect(actual.map((d) => d.time as number), label).toEqual(expected.map((e) => e.time));
      expect(actual.map((d) => d.terminus.id), label).toEqual(expected.map((e) => e.terminus));
    }
  });

  it('reports the gap between next and following, and the wait to each', () => {
    const instant = at(TUESDAY, 9);
    const b = board('MGRD', 0, instant);
    expect(b.next).not.toBeNull();
    expect(b.following).not.toBeNull();
    const next = b.next!;
    const following = b.following!;
    expect(next.waitSeconds).toBe(next.time - 9 * 3600);
    expect(b.gapSeconds).toBe(following.time - next.time);
    expect(b.gapSeconds).toBeGreaterThan(0);
  });

  it('labels the platform from the end of the line, not from a hardcoded name', () => {
    const noon = at(TUESDAY, 12);
    expect(board('MGRD', 0, noon).towards.id).toBe(network.stops[network.stops.length - 1].id);
    expect(board('MGRD', 0, noon).towards.name.en).toBe('Tripunithura');
    expect(board('MGRD', 1, noon).towards.id).toBe(network.stops[0].id);
    expect(board('MGRD', 1, noon).towards.name.en).toBe('Aluva');
  });

  it('lists what each train serves onward, excluding the boarding stop', () => {
    const b = board('MGRD', 0, at(TUESDAY, 9));
    const next = b.next!;
    const trip = rawTrips().find((t) => t.id === next.tripId)!;
    const from = trip.stops.findIndex((s) => s.stopId === 'MGRD');
    expect(next.serves.map((s) => s.id)).toEqual(
      trip.stops.slice(from + 1).map((s) => s.stopId),
    );
    expect(next.serves.map((s) => s.id)).not.toContain('MGRD');
  });
});

describe('the four pre-06:00 departures', () => {
  it('keeps every trip that starts before 06:00, which the competitor drops', () => {
    const early = rawTrips()
      .filter((t) => t.stops[0].departure < 6 * 3600)
      .map((t) => [t.stops[0].departure, t.id, t.stops[0].stopId] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(early).toEqual([
      [gtfsSeconds('05:00:00'), 'WK_4', 'MUTT'],
      [gtfsSeconds('05:20:00'), 'WK_256', 'MUTT'],
      [gtfsSeconds('05:45:00'), 'WK_18', 'MUTT'],
      [gtfsSeconds('05:57:00'), 'WK_12', 'KVTR'],
    ]);
  });

  it('surfaces them on a real board at 04:55, not just in the data', () => {
    // Three of the four leave from Muttom towards Tripunithura. KMRL's own
    // station pages advertise the 5:03 AM at Kalamassery, which is WK_4
    // passing through, so these are revenue service and a board that starts
    // at 06:00 is wrong by an hour on the query people search for.
    const muttom = board('MUTT', 0, at(TUESDAY, 4, 55));
    expect(muttom.departures.map((d) => d.tripId)).toEqual(['WK_4', 'WK_256', 'WK_18']);
    expect(muttom.next!.time as number).toBe(gtfsSeconds('05:00:00'));
    expect(formatClock(muttom.next!.time)).toBe('5:00 AM');

    // The fourth runs the other way, out of Kadavanthra.
    const kadavanthra = board('KVTR', 1, at(TUESDAY, 4, 55));
    expect(kadavanthra.next!.tripId).toBe('WK_12');
    expect(kadavanthra.next!.time as number).toBe(gtfsSeconds('05:57:00'));
  });

  it('does not offer them on a Sunday, when they do not run', () => {
    expect(board('MUTT', 0, at(SUNDAY, 4, 55)).next!.tripId).not.toBe('WK_4');
    expect(board('MUTT', 0, at(SUNDAY, 4, 55)).next!.serviceId).toBe('WE');
  });
});

describe('short-turn labelling', () => {
  /** Trips that stop short of the end of the line, straight from the feed. */
  const terminatingEarly = rawTrips()
    .filter((trip) => {
      const end = trip.stops[trip.stops.length - 1].stopId;
      return trip.direction === 0 ? end !== 'TPHT' : end !== 'ALVA';
    })
    .map((t) => t.id)
    .sort();

  it('finds exactly 20 trips that terminate early, and 38 partial overall', () => {
    expect(terminatingEarly.length).toBe(20);
    expect(terminatingEarly.slice(0, 5)).toEqual([
      'WE_1',
      'WE_142',
      'WE_150',
      'WE_156',
      'WE_166',
    ]);
    const partial = rawTrips().filter((t) => t.stops.length < 25);
    expect(partial.length).toBe(38);
  });

  it('includes weekend trips, so a WK-only fixture would miss eight of them', () => {
    const weekend = terminatingEarly.filter((id) => id.startsWith('WE_'));
    expect(weekend.length).toBe(8);
    expect(weekend).toContain('WE_1');
  });

  it('flags every one of the 20 and nothing else', () => {
    // Sweep every boardable departure in the whole feed through the engine and
    // compare the set it labels against the set the feed defines.
    // One whole service day at a time, from offset 0, so every trip in the
    // feed passes through the engine exactly once per direction.
    const wholeDay = [TUESDAY, SUNDAY].map((iso) =>
      serviceWindowFor(network, parseCivilDate(iso), 0, VOUCHED_2026),
    );
    const flagged = new Set<string>();
    const unflagged = new Set<string>();
    for (const stop of network.stops) {
      for (const direction of [0, 1] as Direction[]) {
        for (const window of wholeDay) {
          const all = departuresFrom(index, {
            stop,
            direction,
            at: window.origin,
            windows: [window],
            limit: 500,
          });
          for (const d of all) (d.shortTurn ? flagged : unflagged).add(d.tripId);
        }
      }
    }
    // The sweep really did see the whole feed, not a lucky subset.
    expect(flagged.size + unflagged.size).toBe(450);
    expect([...flagged].sort()).toEqual(terminatingEarly);
    for (const id of terminatingEarly) expect(unflagged.has(id), id).toBe(false);
  });

  it('names the real terminus on a board where a short turn is next', () => {
    // 19:38:25 from Aluva looks like an ordinary southbound train and stops at
    // the depot. The one seven minutes later runs the whole line.
    const b = board('ALVA', 0, at(TUESDAY, 19, 36));
    const [first, second] = b.departures;
    expect(first.tripId).toBe('WK_211');
    expect(first.time as number).toBe(gtfsSeconds('19:38:25'));
    expect(first.shortTurn).toBe(true);
    expect(first.terminus.id).toBe('MUTT');
    expect(first.serves.map((s) => s.id)).toEqual(['PNCU', 'CPPY', 'ATTK', 'MUTT']);
    expect(first.serves.map((s) => s.id)).not.toContain('EDAP');

    expect(second.tripId).toBe('WK_212');
    expect(second.shortTurn).toBe(false);
    expect(second.terminus.id).toBe('TPHT');
  });

  it('labels the two that terminate at Kadavanthra, not only the depot runs', () => {
    const byTerminus = new Map(
      rawTrips().map((t) => [t.id, t.stops[t.stops.length - 1].stopId]),
    );
    const kadavanthra = terminatingEarly.filter((id) => byTerminus.get(id) === 'KVTR');
    expect(kadavanthra).toEqual(['WE_196', 'WK_256']);

    const b = board('MUTT', 0, at(TUESDAY, 5, 10));
    expect(b.next!.tripId).toBe('WK_256');
    expect(b.next!.shortTurn).toBe(true);
    expect(b.next!.terminus.id).toBe('KVTR');
  });
});

describe('the last-train cliff', () => {
  const lastTrain = (stop: string, direction: Direction, instant: Instant) =>
    lastTrainAt(index, { stop, direction, at: instant, windows: windows(instant) });

  it('reports the last MG Road train towards Aluva and the gap before it', () => {
    const oracle = rawDepartures('MGRD', 1, 'WK');
    const last = oracle[oracle.length - 1];
    const previous = oracle[oracle.length - 2];
    // Independently supplied numbers, asserted alongside the derivation.
    expect(last.time).toBe(85_451);
    expect(previous.time).toBe(82_695);
    expect(last.time - previous.time).toBe(2756);

    const report = lastTrain('MGRD', 1, at(TUESDAY, 21))!;
    expect(report.departure.tripId).toBe(last.tripId);
    expect(report.departure.time as number).toBe(85_451);
    expect(formatClock(report.departure.time)).toBe('11:44 PM');
    expect(report.previous!.time as number).toBe(82_695);
    expect(report.gapBeforeSeconds).toBe(2756);
    expect(report.departed).toBe(false);
    expect(report.remainingSeconds).toBe(85_451 - 21 * 3600);
  });

  it('shows the same 2,756-second gap at every station the last train serves', () => {
    // WK_253 and WK_250 run the same stretch, so the cliff is identical all
    // the way down the line rather than merely "about 45 minutes".
    for (const stop of ['TPHT', 'VYTA', 'MGRD', 'EDAP', 'KLMT']) {
      const report = lastTrain(stop, 1, at(TUESDAY, 21))!;
      expect(report.gapBeforeSeconds, stop).toBe(2756);
      expect(report.departure.tripId, stop).toBe('WK_253');
    }
  });

  it('does NOT mirror the cliff towards Tripunithura', () => {
    // CLAUDE.md finding 9 says "the southbound pattern mirrors it". It does
    // not: towards Tripunithura the final gap is a quarter of an hour. See the
    // note in the Phase 3 report.
    for (const stop of ['ALVA', 'EDAP', 'MGRD', 'VYTA']) {
      const report = lastTrain(stop, 0, at(TUESDAY, 21))!;
      expect(report.gapBeforeSeconds, stop).toBeLessThan(1000);
      expect(report.gapBeforeSeconds, stop).toBeGreaterThan(890);
    }
    // And at the three stations north of the depot, towards Aluva, there is no
    // cliff either, because WK_253 terminates at Muttom before reaching them.
    for (const stop of ['ATTK', 'CPPY', 'PNCU']) {
      const report = lastTrain(stop, 1, at(TUESDAY, 21))!;
      expect(report.gapBeforeSeconds, stop).toBeLessThan(1000);
      expect(report.departure.tripId, stop).toBe('WK_245');
    }
  });

  it('separates the last train from the last train that gets you there', () => {
    // From Kalamassery towards Aluva the final departure runs one station and
    // terminates at the depot. Someone bound for Aluva has to catch the 23:10.
    const report = lastTrain('KLMT', 1, at(TUESDAY, 22))!;
    expect(report.departure.tripId).toBe('WK_253');
    expect(report.departure.shortTurn).toBe(true);
    expect(report.departure.terminus.id).toBe('MUTT');
    expect(formatClock(report.departure.time)).toBe('12:01 AM');

    expect(report.lastThrough!.tripId).toBe('WK_245');
    expect(report.lastThrough!.time as number).toBe(gtfsSeconds('23:10:28'));
    expect(report.lastThrough!.terminus.id).toBe('ALVA');
    expect(report.lastThrough!.shortTurn).toBe(false);
  });

  it('has a different last train on a Sunday', () => {
    const weekday = lastTrain('MGRD', 1, at(TUESDAY, 21))!;
    const sunday = lastTrain('MGRD', 1, at(SUNDAY, 21))!;
    const oracle = rawDepartures('MGRD', 1, 'WE');
    expect(sunday.departure.serviceId).toBe('WE');
    expect(sunday.departure.time as number).toBe(oracle[oracle.length - 1].time);
    expect(sunday.departure.tripId).not.toBe(weekday.departure.tripId);
    // No Sunday trip crosses midnight at all.
    expect(sunday.departure.time as number).toBeLessThan(86_400);
  });
});

describe('midnight rollover', () => {
  it('finds the 12:01 AM train from the previous service day at 00:01', () => {
    // 00:01 on Wednesday. The only departure left anywhere on the network
    // belongs to Tuesday's timetable, at service-day offset 86,505.
    const instant = at('2026-09-23', 0, 1);
    const b = board('KLMT', 1, instant);
    expect(b.next).not.toBeNull();
    expect(b.next!.tripId).toBe('WK_253');
    expect(b.next!.time as number).toBe(gtfsSeconds('24:01:45'));
    expect(b.next!.serviceId).toBe('WK');
    // It belongs to yesterday, and says so.
    expect(formatCivilDate(b.next!.window.date)).toBe('2026-09-22');
    expect(b.next!.waitSeconds).toBe(45);
    // Rendered as one minute past midnight, never as lunchtime.
    expect(formatClock(b.next!.time)).toBe('12:01 AM');
  });

  it('confirms the post-midnight window holds exactly one trip', () => {
    // Independently: at 86,520 s only WK_253 is in motion, between Kalamassery
    // (24:01:15) and Muttom (24:03:45). Nothing else extends past 24:00.
    const running = rawTrips().filter(
      (t) =>
        t.stops[0].departure <= 86_520 && t.stops[t.stops.length - 1].arrival >= 86_520,
    );
    expect(running.map((t) => t.id)).toEqual(['WK_253']);
    expect(rawTrips().filter((t) => t.stops[t.stops.length - 1].arrival > 86_400)).toHaveLength(1);
  });

  it('reports the last train as gone at 00:02, fifteen seconds after it left', () => {
    const instant = at('2026-09-23', 0, 2);
    const report = lastTrainAt(index, {
      stop: 'KLMT',
      direction: 1,
      at: instant,
      windows: windows(instant),
    })!;
    expect(report.departure.tripId).toBe('WK_253');
    expect(formatCivilDate(report.window.date)).toBe('2026-09-22');
    expect(report.departed).toBe(true);
    expect(report.remainingSeconds).toBe(0);
    expect(report.departure.waitSeconds).toBe(-15);
  });

  it('moves on to today once the previous service day is over at 00:04', () => {
    const instant = at('2026-09-23', 0, 4);
    const b = board('KLMT', 1, instant);
    // Nothing is left of Tuesday, so the next train is Wednesday morning.
    expect(formatCivilDate(b.next!.window.date)).toBe('2026-09-23');
    expect(b.next!.time as number).toBe(gtfsSeconds('06:27:10'));
    expect(b.lastTrain!.departed).toBe(false);
    expect(formatCivilDate(b.lastTrain!.window.date)).toBe('2026-09-23');
  });

  it('sorts across the midnight boundary by real time, not by offset', () => {
    // At 23:50 the 24:01 departure (offset 86,505) must come before the next
    // morning's 06:27 (offset 23,230). Sorting by offset reverses them.
    const instant = at(TUESDAY, 23, 50);
    const b = board('KLMT', 1, instant, 2);
    expect(b.departures.map((d) => d.tripId)).toEqual(['WK_253', 'WK_12']);
    expect(b.departures.map((d) => formatCivilDate(d.window.date))).toEqual([
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(b.departures[0].at).toBeLessThan(b.departures[1].at);
    expect((b.departures[0].time as number) > (b.departures[1].time as number)).toBe(true);
  });

  it('carries the previous day’s Sunday timetable past midnight into Monday', () => {
    // 00:01 on a Monday. No WE trip runs past midnight, so there is nothing
    // left — but the window resolved must still have been Sunday's.
    const instant = at('2026-09-28', 0, 1);
    const resolved = windows(instant);
    expect(resolved[0].services).toEqual(['WE']);
    const b = board('KLMT', 1, instant);
    expect(formatCivilDate(b.next!.window.date)).toBe('2026-09-28');
    expect(b.next!.serviceId).toBe('WK');
  });
});

describe('the run nudge', () => {
  it('fires when the next is within two minutes and the following is eight away', () => {
    // MG Road towards Tripunithura: 20:13:53 then 20:23:53. Queried a minute
    // before the first, that is "run — 1 min, then 11".
    const instant = at(TUESDAY, 20, 12, 53);
    const b = board('MGRD', 0, instant);
    expect(b.next!.time as number).toBe(gtfsSeconds('20:13:53'));
    expect(b.following!.time as number).toBe(gtfsSeconds('20:23:53'));
    expect(b.nudge).not.toBeNull();
    expect(b.nudge!.next.waitSeconds).toBe(60);
    expect(b.nudge!.following.waitSeconds).toBe(660);
    expect(b.nudge!.gapSeconds).toBe(600);
  });

  it('stays quiet when the next train is further off than a sprint', () => {
    // Same pair, queried three minutes earlier: the train is 4 minutes away,
    // so telling someone to run would spend credibility for nothing.
    const b = board('MGRD', 0, at(TUESDAY, 20, 9, 53));
    expect(b.next!.waitSeconds).toBeGreaterThan(NUDGE_CATCH_SECONDS);
    expect(b.nudge).toBeNull();
  });

  it('stays quiet when missing it costs almost nothing', () => {
    // Peak morning: trains every few minutes, so there is no penalty to warn
    // about even when the next one is imminent.
    const oracle = rawDepartures('MGRD', 0, 'WK');
    // A departure with a short headway after it, and enough clear air before
    // it that querying 30 s early cannot pick up the previous train instead.
    const i = oracle.findIndex((entry, k) => {
      const next = oracle[k + 1];
      const previous = oracle[k - 1];
      return (
        next !== undefined &&
        previous !== undefined &&
        next.time - entry.time < NUDGE_PENALTY_SECONDS &&
        entry.time - previous.time > 60
      );
    });
    expect(i).toBeGreaterThan(-1);
    const instant = at(TUESDAY, 0, 0, oracle[i].time - 30);
    const b = board('MGRD', 0, instant);
    expect(b.next!.tripId).toBe(oracle[i].tripId);
    expect(b.next!.waitSeconds).toBeLessThanOrEqual(NUDGE_CATCH_SECONDS);
    expect(b.following!.waitSeconds).toBeLessThan(NUDGE_PENALTY_SECONDS);
    expect(b.nudge).toBeNull();
  });

  it('needs two departures to say anything', () => {
    expect(runNudge([])).toBeNull();
    expect(runNudge(board('MGRD', 0, at(TUESDAY, 20, 12, 53), 1).departures)).toBeNull();
  });
});

describe('departuresFrom', () => {
  it('refuses a nonsensical limit rather than returning nothing', () => {
    const instant = at(TUESDAY, 12);
    expect(() =>
      departuresFrom(index, {
        stop: 'MGRD',
        direction: 0,
        at: instant,
        windows: windows(instant),
        limit: 0,
      }),
    ).toThrow(/positive whole number/);
  });

  it('applies its predicate before the limit, not after', () => {
    // Three options that reach Tripunithura, even though short turns are
    // interleaved with them at Aluva in the evening.
    const instant = at(TUESDAY, 19, 36);
    const through = departuresFrom(index, {
      stop: 'ALVA',
      direction: 0,
      at: instant,
      windows: windows(instant),
      limit: 3,
      accepts: (trip) => trip.stops[trip.stops.length - 1].stopIndex === 24,
    });
    const expected = rawDepartures('ALVA', 0, 'WK')
      .filter((d) => d.time >= 19 * 3600 + 36 * 60 && d.terminus === 'TPHT')
      .slice(0, 3)
      .map((d) => d.tripId);
    expect(through).toHaveLength(3);
    expect(through.every((d) => !d.shortTurn)).toBe(true);
    expect(through.map((d) => d.tripId)).toEqual(expected);
    // The short turn that sits between them is genuinely skipped, not merely
    // pushed past the limit.
    expect(through.map((d) => d.tripId)).not.toContain('WK_211');
    expect(expected[0]).toBe('WK_212');
  });
});
