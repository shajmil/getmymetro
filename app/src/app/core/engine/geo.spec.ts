/**
 * Nearest station, and the distance that says whether to believe it.
 *
 * The zero-tap home screen stands on this (CLAUDE.md MVP item 1). It resolves
 * because the line is sparse — a median 1,051 m between adjacent stations and
 * never less than 465 m — and both of those numbers are measured here from
 * `stops.txt` rather than quoted, so a feed change that closed the gap would
 * fail the test that the feature depends on.
 */

import { haversineMetres, nearestStop, nearestStops, EARTH_RADIUS_M } from './geo';
import { readFeedCsv } from './testing/feed';
import { loadNetwork } from './testing/network';

const network = loadNetwork();

/** `stops.txt` as the oracle, so nothing is checked against the bundle alone. */
const rawStops = readFeedCsv('stops.txt').map((s) => ({
  id: s['stop_id'],
  name: s['stop_name'],
  lat: Number(s['stop_lat']),
  lon: Number(s['stop_lon']),
}));

describe('haversineMetres', () => {
  it('is zero at a point and symmetric between two', () => {
    const a = rawStops[0];
    const b = rawStops[8];
    expect(haversineMetres(a, a)).toBe(0);
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 9);
  });

  it('measures a known great circle to within a tenth of a percent', () => {
    // A quarter of the way round the Earth, along a meridian.
    const quarter = haversineMetres({ lat: 0, lon: 0 }, { lat: 90, lon: 0 });
    expect(quarter).toBeCloseTo((Math.PI / 2) * EARTH_RADIUS_M, 3);
    // One degree of latitude at the equator.
    expect(haversineMetres({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, 0);
  });

  it('refuses a coordinate that is not on Earth', () => {
    expect(() => haversineMetres({ lat: 91, lon: 0 }, rawStops[0])).toThrow(/latitude out of range/);
    expect(() => haversineMetres({ lat: 0, lon: 181 }, rawStops[0])).toThrow(/longitude out of range/);
    expect(() => haversineMetres({ lat: Number.NaN, lon: 0 }, rawStops[0])).toThrow(/latitude/);
  });
});

describe('station spacing', () => {
  it('is never closer than 465 m, at Kaloor and Town Hall', () => {
    const gaps = rawStops
      .slice(0, -1)
      .map((stop, i) => ({ metres: haversineMetres(stop, rawStops[i + 1]), from: stop.name, to: rawStops[i + 1].name }));
    const sorted = [...gaps].sort((a, b) => a.metres - b.metres);

    expect(sorted[0].metres).toBeCloseTo(465.2, 1);
    expect([sorted[0].from, sorted[0].to]).toEqual(['Kaloor', 'Town Hall']);
    // The median CLAUDE.md quotes, confirmed rather than repeated.
    expect(sorted[Math.floor(sorted.length / 2)].metres).toBeCloseTo(1051.2, 1);
    // Comfortably beyond GPS error even at the tightest pair.
    expect(sorted[0].metres).toBeGreaterThan(100);
  });
});

describe('nearestStop', () => {
  it('resolves every station to itself from its own coordinates', () => {
    for (const stop of rawStops) {
      const found = nearestStop(network, stop);
      expect(found.stop.id, stop.name).toBe(stop.id);
      expect(found.distance, stop.name).toBeCloseTo(0, 6);
    }
  });

  it('resolves a point at Kaloor to Kaloor, not to Town Hall 465 m away', () => {
    // The tightest pair on the line, and the one a sloppy nearest-of-25 would
    // get wrong. Standing at Kaloor, and 40 m off it in each direction.
    const kaloor = rawStops.find((s) => s.id === 'KALR')!;
    expect(nearestStop(network, kaloor).stop.id).toBe('KALR');
    expect(nearestStop(network, { lat: kaloor.lat + 0.0003, lon: kaloor.lon }).stop.id).toBe('KALR');
    expect(nearestStop(network, { lat: kaloor.lat, lon: kaloor.lon + 0.0003 }).stop.id).toBe('KALR');
  });

  it('returns the runner-up so an ambiguous fix can be offered as a choice', () => {
    const kaloor = rawStops.find((s) => s.id === 'KALR')!;
    const townHall = rawStops.find((s) => s.id === 'TNHL')!;
    const midpoint = {
      lat: (kaloor.lat + townHall.lat) / 2,
      lon: (kaloor.lon + townHall.lon) / 2,
    };
    const [first, second] = nearestStops(network, midpoint, 2);
    expect([first.stop.id, second.stop.id].sort()).toEqual(['KALR', 'TNHL']);
    // Halfway between them, so neither answer is confident.
    expect(first.distance).toBeCloseTo(232.6, 1);
    expect(second.distance - first.distance).toBeLessThan(1);
  });

  it('still answers from outside Kochi, and says how far away it is', () => {
    // Bengaluru: 345 km from the northern terminus. The engine must not refuse
    // or guess — it answers, and hands the UI the number that says "you are
    // not at a station".
    const bengaluru = { lat: 12.9716, lon: 77.5946 };
    const found = nearestStop(network, bengaluru);
    expect(found.stop.id).toBe('ALVA');
    expect(found.distance).toBeGreaterThan(300_000);
    expect(found.distance).toBeLessThan(400_000);
    // The antipode of Kochi is farther still and does not break anything.
    expect(nearestStop(network, { lat: -10, lon: -103.7 }).distance).toBeGreaterThan(1e7);
  });

  it('orders the whole line by distance and never returns an empty list', () => {
    const all = nearestStops(network, rawStops[0], 25);
    expect(all).toHaveLength(25);
    expect(all[0].stop.id).toBe('ALVA');
    expect(all[24].stop.id).toBe('TPHT');
    for (let i = 1; i < all.length; i++) {
      expect(all[i].distance).toBeGreaterThanOrEqual(all[i - 1].distance);
    }
    expect(nearestStops(network, rawStops[0], 0)).toHaveLength(1);
  });

  it('refuses a coordinate that is not on Earth', () => {
    expect(() => nearestStop(network, { lat: 200, lon: 0 })).toThrow(/latitude out of range/);
  });
});
