/**
 * A to B on a single line.
 *
 * The whole routing problem is the sign of a subtraction (CLAUDE.md decision
 * 1), so most of what can go wrong here is not routing:
 *
 *   picking the direction from the wrong end, which silently returns the
 *   trains going the other way;
 *   offering a short turn that never reaches the destination;
 *   pricing a journey from a station to itself because the feed does.
 *
 * `build_pages.py` publishes "Aluva → Edapally: 114 trains Mon–Sat, 89 Sun,
 * 17 min, ₹40, 7 stops between" on a prerendered page. Those five numbers are
 * asserted against the raw feed below, because a page that contradicts the
 * engine is worse than no page.
 */

import { directionBetween, stopsBetween } from './stops';
import { buildDepartureIndex } from './departures';
import { planJourney } from './journey';
import { resolveServiceWindows, serviceWindowFor } from './service-day';
import { parseCivilDate, type Instant } from './civil-time';
import { gtfsSeconds, rawTrips } from './testing/feed';
import { at, loadNetwork, VOUCHED_2026 } from './testing/network';

const network = loadNetwork();
const index = buildDepartureIndex(network);

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

const plan = (origin: string, destination: string, instant: Instant, limit = 3) =>
  planJourney(index, {
    origin,
    destination,
    at: instant,
    windows: resolveServiceWindows(network, instant, VOUCHED_2026),
    limit,
  });

/** Trips serving origin then destination, from the raw feed. */
function oracleRuns(origin: string, destination: string, service: string) {
  return rawTrips()
    .filter((trip) => trip.service === service)
    .flatMap((trip) => {
      const ids = trip.stops.map((s) => s.stopId);
      const from = ids.indexOf(origin);
      const to = ids.indexOf(destination);
      if (from === -1 || to === -1 || from >= to) return [];
      return [
        {
          id: trip.id,
          departure: trip.stops[from].departure,
          arrival: trip.stops[to].arrival,
        },
      ];
    })
    .sort((a, b) => a.departure - b.departure);
}

describe('direction', () => {
  it('falls out of the stop indices, in both directions', () => {
    const aluva = network.stopsById.get('ALVA')!;
    const edapally = network.stopsById.get('EDAP')!;
    expect(directionBetween(aluva, edapally)).toBe(0);
    expect(directionBetween(edapally, aluva)).toBe(1);
  });

  it('gives a journey the platform sign at the end of the line', () => {
    const noon = at(TUESDAY, 12);
    expect(plan('ALVA', 'EDAP', noon).towards.name.en).toBe('Tripunithura');
    expect(plan('EDAP', 'ALVA', noon).towards.name.en).toBe('Aluva');
  });

  it('never returns trains going the wrong way', () => {
    const noon = at(TUESDAY, 12);
    for (const option of plan('EDAP', 'ALVA', noon).options) {
      expect(option.board.direction).toBe(1);
      const ids = rawTrips().find((t) => t.id === option.tripId)!.stops.map((s) => s.stopId);
      expect(ids.indexOf('EDAP')).toBeLessThan(ids.indexOf('ALVA'));
    }
  });
});

describe('Aluva to Edapally', () => {
  it('matches the five numbers the prerendered page publishes', () => {
    const journey = plan('ALVA', 'EDAP', at(TUESDAY, 12));
    expect(journey.fare).toBe(40);
    expect(journey.hops).toBe(8);
    expect(journey.stopsBetween).toHaveLength(7);
    expect(journey.stopsBetween.map((s) => s.id)).toEqual([
      'PNCU',
      'CPPY',
      'ATTK',
      'MUTT',
      'KLMT',
      'CCUV',
      'PDPM',
    ]);
    expect(oracleRuns('ALVA', 'EDAP', 'WK')).toHaveLength(114);
    expect(oracleRuns('ALVA', 'EDAP', 'WE')).toHaveLength(89);

    // "17 min" — the median riding time, rounded.
    const durations = oracleRuns('ALVA', 'EDAP', 'WK')
      .map((r) => r.arrival - r.departure)
      .sort((a, b) => a - b);
    expect(Math.round(durations[Math.floor(durations.length / 2)] / 60)).toBe(17);
  });

  it('offers the next departures with their arrivals and durations', () => {
    const instant = at(TUESDAY, 12);
    const journey = plan('ALVA', 'EDAP', instant);
    const expected = oracleRuns('ALVA', 'EDAP', 'WK')
      .filter((r) => r.departure >= 12 * 3600)
      .slice(0, 3);

    expect(journey.options.map((o) => o.tripId)).toEqual(expected.map((e) => e.id));
    expect(journey.options.map((o) => o.board.time as number)).toEqual(
      expected.map((e) => e.departure),
    );
    expect(journey.options.map((o) => o.arrival as number)).toEqual(
      expected.map((e) => e.arrival),
    );
    for (const option of journey.options) {
      expect(option.durationSeconds).toBe(
        (option.arrival as number) - (option.board.time as number),
      );
      expect(option.arrivalAt).toBe(option.window.origin + (option.arrival as number) * 1000);
      expect(option.arrivalAt).toBeGreaterThan(option.board.at);
    }
    expect(journey.next).toBe(journey.options[0]);
  });

  it('has fewer trains on a Sunday than Monday to Saturday', () => {
    const sunday = plan('ALVA', 'EDAP', at(SUNDAY, 12));
    expect(sunday.options.every((o) => o.serviceId === 'WE')).toBe(true);
    expect(sunday.fare).toBe(40);
    expect(oracleRuns('ALVA', 'EDAP', 'WE').length).toBeLessThan(
      oracleRuns('ALVA', 'EDAP', 'WK').length,
    );
  });
});

describe('short turns', () => {
  it('never offers a train that terminates before the destination', () => {
    // 19:38 from Aluva runs to the depot. Someone going to Edapally must not
    // be offered it, even though it is the next southbound departure.
    const journey = plan('ALVA', 'EDAP', at(TUESDAY, 19, 36));
    expect(journey.options.map((o) => o.tripId)).not.toContain('WK_211');
    expect(journey.options[0].tripId).toBe('WK_212');
    expect(journey.options.every((o) => !o.board.shortTurn)).toBe(true);
  });

  it('does offer one when the destination is on its shortened run', () => {
    // WK_211 terminates at Muttom, so Aluva to Muttom is a real option on it.
    const journey = plan('ALVA', 'MUTT', at(TUESDAY, 19, 36));
    expect(journey.options[0].tripId).toBe('WK_211');
    expect(journey.options[0].board.shortTurn).toBe(true);
    expect(journey.options[0].board.terminus.id).toBe('MUTT');
  });

  it('sweeps the whole feed without ever offering an unreachable destination', () => {
    // Every option, for every ordered pair, on a whole service day: the
    // boarding trip must actually call at the destination after the origin.
    const window = serviceWindowFor(network, parseCivilDate(TUESDAY), 0, VOUCHED_2026);
    const byId = new Map(rawTrips().map((t) => [t.id, t.stops.map((s) => s.stopId)]));
    let checked = 0;
    for (let a = 0; a < network.stops.length; a++) {
      for (let b = 0; b < network.stops.length; b++) {
        if (a === b) continue;
        const journey = planJourney(index, {
          origin: a,
          destination: b,
          at: window.origin,
          windows: [window],
          limit: 2,
        });
        for (const option of journey.options) {
          const ids = byId.get(option.tripId)!;
          const from = ids.indexOf(network.stops[a].id);
          const to = ids.indexOf(network.stops[b].id);
          expect(from, option.tripId).toBeGreaterThan(-1);
          expect(to, option.tripId).toBeGreaterThan(from);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('journeys that are not journeys', () => {
  it('refuses a station to itself even though the feed prices it', () => {
    const noon = at(TUESDAY, 12);
    expect(() => plan('ALVA', 'ALVA', noon)).toThrow(/not a journey/);
    expect(() => directionBetween(network.stops[3], network.stops[3])).toThrow(/same station/);
  });

  it('refuses a station that is not on this line', () => {
    expect(() => plan('ALVA', 'NOPE', at(TUESDAY, 12))).toThrow(/no station with id/);
  });
});

describe('stopsBetween', () => {
  it('excludes both ends and reads in travel order', () => {
    const northbound = stopsBetween(
      network,
      network.stopsById.get('EDAP')!,
      network.stopsById.get('ALVA')!,
    );
    expect(northbound.map((s) => s.id)).toEqual([
      'PDPM',
      'CCUV',
      'KLMT',
      'MUTT',
      'ATTK',
      'CPPY',
      'PNCU',
    ]);
    // Adjacent stations have nothing between them.
    expect(stopsBetween(network, network.stops[0], network.stops[1])).toEqual([]);
    // End to end is the other 23.
    expect(stopsBetween(network, network.stops[0], network.stops[24])).toHaveLength(23);
  });
});

describe('journeys across midnight', () => {
  it('plans the last train of the night from the previous service day', () => {
    // 00:01 on Wednesday. The only remaining option anywhere is WK_253, and
    // only for destinations it still reaches.
    const instant = at('2026-09-23', 0, 1);
    const journey = plan('KLMT', 'MUTT', instant);
    expect(journey.options[0].tripId).toBe('WK_253');
    expect(journey.options[0].board.time as number).toBe(gtfsSeconds('24:01:45'));
    expect(journey.options[0].arrival as number).toBe(gtfsSeconds('24:03:45'));
    expect(journey.options[0].durationSeconds).toBe(120);

    // Kalamassery to Aluva is not possible on it — the next option is the
    // following morning.
    const toAluva = plan('KLMT', 'ALVA', instant);
    expect(toAluva.options[0].tripId).not.toBe('WK_253');
    expect(toAluva.options[0].board.waitSeconds).toBeGreaterThan(6 * 3600);
  });
});
