/**
 * The reference facts, checked against the feed rather than against a fixture.
 *
 * Two of these are censuses, not examples. CLAUDE.md finding 9 makes a claim
 * about a population — "at all 20 cliff stations the final towards-Aluva
 * departure terminates at Muttom" — and an example would not catch a
 * regression that hardcoded a direction or a station. They are counted here.
 */

import { loadNetwork } from '../core/engine/testing/network';
import type { Direction } from '../core/data/network.types';
import { dayLabel, platformTimings, routeTimings } from './schedule-view';

const network = loadNetwork();

const stop = (id: string) => {
  const found = network.stopsById.get(id);
  if (found === undefined) throw new Error(`${id} missing from the bundle`);
  return found;
};

const endOfLine = (direction: Direction) => (direction === 0 ? network.stops.length - 1 : 0);

const timings = (id: string, direction: Direction) =>
  platformTimings(network, stop(id), direction, endOfLine(direction));

const monSat = (id: string, direction: Direction) => {
  const found = timings(id, direction).find((t) => t.serviceId === 'WK');
  if (found === undefined) throw new Error(`no WK pattern at ${id} direction ${direction}`);
  return found;
};

/** Towards Aluva. `direction_id=1` — verified from the data, never assumed. */
const ALUVA: Direction = 1;
/** Towards Tripunithura. */
const TPHT: Direction = 0;

describe('naming the days', () => {
  it('calls WK Monday to Saturday, because that is what the calendar says', () => {
    const wk = network.services.find((service) => service.id === 'WK');
    const we = network.services.find((service) => service.id === 'WE');
    expect(wk && dayLabel(wk)).toBe('Monday to Saturday');
    expect(we && dayLabel(we)).toBe('Sunday');
  });
});

describe('first and last train at a platform', () => {
  it('keeps the four pre-06:00 trips the competitor drops', () => {
    // keralam.co answers "6-something" for the first train from MG Road.
    expect(monSat('MGRD', TPHT).firstClock).toBe('5:25 AM');
    expect(monSat('MUTT', TPHT).firstClock).toBe('5:00 AM');
    expect(monSat('KLMT', TPHT).firstClock).toBe('5:03 AM');
  });

  it('renders a past-midnight departure as 12:01 AM, not 12:01 PM', () => {
    const last = monSat('KLMT', ALUVA);
    expect(last.lastClock).toBe('12:01 AM');
    expect(last.lastShortTurn).toBe(true);
    expect(last.lastTerminusName).toBe('Muttom');
  });

  it('separates the last train from the last train home at MG Road', () => {
    const board = monSat('MGRD', ALUVA);
    expect(board.lastClock).toBe('11:44 PM');
    expect(board.lastThroughClock).toBe('10:52 PM');
    expect(board.strandMinutes).toBe(52);
    // And the 45-minute cliff is measured, not written down.
    expect(board.finalGapMinutes).toBe(45);
  });

  it('counts 20 platforms where the last towards-Aluva train stops at Muttom', () => {
    const stranding = network.stops
      .filter((s) => timings(s.id, ALUVA).length > 0)
      .map((s) => monSat(s.id, ALUVA))
      .filter((t) => t.lastShortTurn);
    expect(stranding).toHaveLength(20);
    for (const t of stranding) {
      expect(t.lastTerminusName).toBe('Muttom');
      expect(t.strandMinutes).toBeGreaterThanOrEqual(51);
      expect(t.strandMinutes).toBeLessThanOrEqual(53);
    }
  });

  it('finds the mirrored strand at the four northern stations, without a cliff', () => {
    // Finding 9: the strand mirrors even though the 45-minute gap does not.
    const northern = ['ALVA', 'PNCU', 'CPPY', 'ATTK'].map((id) => monSat(id, TPHT));
    for (const t of northern) {
      expect(t.lastShortTurn).toBe(true);
      expect(t.lastTerminusName).toBe('Muttom');
      expect(t.strandMinutes).toBeGreaterThan(0);
      // 15-16 minutes, so nothing here should read as a cliff.
      expect(t.finalGapMinutes).toBeLessThan(30);
    }
  });

  it('reports no cliff at all towards Tripunithura', () => {
    const gaps = network.stops
      .filter((s) => timings(s.id, TPHT).length > 0)
      .map((s) => monSat(s.id, TPHT).finalGapMinutes ?? 0);
    expect(gaps).toHaveLength(24);
    expect(Math.max(...gaps)).toBeLessThan(30);
  });

  it('finds the strand on Sunday too, in both directions', () => {
    // CLAUDE.md finding 9 has been revised four times and the Sunday half of
    // it is still understated. It reads as one case — "the Sunday
    // towards-Aluva final departure also short-turns at Muttom, 21 minutes
    // after the last through train" — and never mentions Sunday southbound at
    // all. Measured over the feed, the strand exists in all four
    // (service pattern x direction) groups:
    //
    //     WK towards Aluva          20 of 24, 51-53 min
    //     WK towards Tripunithura    4 of 24, 21 min   (the four northern)
    //     WE towards Aluva          20 of 24, 20-22 min
    //     WE towards Tripunithura    4 of 24, 20 min   (never stated)
    //
    // The conclusion CLAUDE.md draws is unchanged and correct — lastThrough is
    // needed in both directions on both patterns — but the Sunday numbers are
    // a population, not an example, so they are counted here.
    const sundayOf = (id: string, direction: Direction) => {
      const found = timings(id, direction).find((t) => t.serviceId === 'WE');
      if (found === undefined) throw new Error(`no WE pattern at ${id} direction ${direction}`);
      return found;
    };
    const census = (direction: Direction) =>
      network.stops
        .filter((s) => timings(s.id, direction).length > 0)
        .map((s) => sundayOf(s.id, direction))
        .filter((t) => t.lastShortTurn);

    const towardsAluva = census(ALUVA);
    expect(towardsAluva).toHaveLength(20);
    for (const t of towardsAluva) {
      expect(t.lastTerminusName).toBe('Muttom');
      expect(t.strandMinutes).toBeGreaterThanOrEqual(20);
      expect(t.strandMinutes).toBeLessThanOrEqual(22);
      // And no cliff: the largest Sunday final gap anywhere is 22 minutes.
      expect(t.finalGapMinutes).toBeLessThan(30);
    }

    const towardsTripunithura = census(TPHT);
    expect(towardsTripunithura).toHaveLength(4);
    for (const t of towardsTripunithura) {
      expect(t.lastTerminusName).toBe('Muttom');
      expect(t.strandMinutes).toBe(20);
    }
  });

  it('gives a terminus no platform in the direction it cannot be boarded for', () => {
    expect(timings('TPHT', TPHT)).toHaveLength(0);
    expect(timings('ALVA', ALUVA)).toHaveLength(0);
  });
});

describe('a route pair', () => {
  it('reports both service patterns, and Sunday is not a footnote', () => {
    const patterns = routeTimings(network, stop('MGRD'), stop('ALVA'));
    const wk = patterns.find((p) => p.serviceId === 'WK');
    const we = patterns.find((p) => p.serviceId === 'WE');
    expect(wk?.dayLabel).toBe('Monday to Saturday');
    expect(wk?.firstClock).toBe('6:05 AM');
    expect(wk?.trains).toBe(119);
    expect(we?.dayLabel).toBe('Sunday');
    expect(we?.firstClock).toBe('7:34 AM');
    expect(we?.trains).toBe(92);
  });

  it('makes the last useful train the last one that arrives, not the last one out', () => {
    const wk = routeTimings(network, stop('MGRD'), stop('ALVA')).find((p) => p.serviceId === 'WK');
    expect(wk?.lastClock).toBe('10:52 PM');
    expect(wk?.lastFromPlatformClock).toBe('11:44 PM');
    expect(wk?.strandMinutes).toBe(52);
  });

  it('reports no strand where the last train off the platform does arrive', () => {
    const wk = routeTimings(network, stop('MGRD'), stop('TPHT')).find((p) => p.serviceId === 'WK');
    expect(wk?.strandMinutes).toBe(0);
    expect(wk?.lastClock).toBe(wk?.lastFromPlatformClock);
  });

  it('strands a northbound passenger at Aluva too, 21 minutes before the last train out', () => {
    // Not in CLAUDE.md's table, and the same shape as the southern cliff: the
    // last departure from Aluva towards Tripunithura terminates at Muttom, so
    // anyone going further than Muttom needs the one 21 minutes earlier.
    const wk = routeTimings(network, stop('ALVA'), stop('EDAP')).find((p) => p.serviceId === 'WK');
    expect(wk?.lastClock).toBe('10:30 PM');
    expect(wk?.lastFromPlatformClock).toBe('10:51 PM');
    expect(wk?.strandMinutes).toBe(21);
  });

  it('agrees with CLAUDE.md on Aluva to Edapally', () => {
    const patterns = routeTimings(network, stop('ALVA'), stop('EDAP'));
    expect(patterns.find((p) => p.serviceId === 'WK')?.trains).toBe(114);
    expect(patterns.find((p) => p.serviceId === 'WE')?.trains).toBe(89);
    expect(patterns.find((p) => p.serviceId === 'WK')?.fastestMinutes).toBe(17);
  });

  it('serves all 600 ordered pairs on both patterns', () => {
    // Which is why the only impossible pair is a station to itself.
    let missing = 0;
    for (const origin of network.stops) {
      for (const destination of network.stops) {
        if (origin.index === destination.index) continue;
        if (routeTimings(network, origin, destination).length !== 2) missing++;
      }
    }
    expect(missing).toBe(0);
  });
});
