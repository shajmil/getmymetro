/**
 * Fares, checked against all 625 rows of `fare_rules.txt`.
 *
 * Two things are being defended.
 *
 * **The table is never replaced by a calculation.** CLAUDE.md finding 5 says a
 * distance model misprices 104 of the 600 travelled pairs; the test below
 * makes the stronger point, that no distance model can exist at all, by
 * finding two journeys of the same length priced differently.
 *
 * **Same-station journeys are blocked without editing the data.** All 25 self
 * pairs are in the feed at ₹10 and the licence forbids modifying the data, so
 * the published value stays readable and the sellable one refuses.
 */

import type { NetworkData } from '../data/network.types';
import { fareBands, fareFor, publishedFare } from './fares';
import { haversineMetres } from './geo';
import { readFeedCsv } from './testing/feed';
import { loadNetwork } from './testing/network';

const network = loadNetwork();

/** `fare_rules.txt` joined to `fare_attributes.txt`. The oracle. */
const prices = new Map(
  readFeedCsv('fare_attributes.txt').map((a) => [a['fare_id'], Number(a['price'])]),
);
const rules = readFeedCsv('fare_rules.txt').map((r) => ({
  origin: r['origin_id'],
  destination: r['destination_id'],
  price: prices.get(r['fare_id'])!,
}));

describe('the 625-pair table', () => {
  it('covers every ordered pair exactly once', () => {
    expect(rules).toHaveLength(625);
    expect(new Set(rules.map((r) => `${r.origin}|${r.destination}`)).size).toBe(625);
    expect(network.stops).toHaveLength(25);
  });

  it('agrees with the feed on all 625 pairs', () => {
    for (const rule of rules) {
      expect(
        publishedFare(network, rule.origin, rule.destination),
        `${rule.origin}->${rule.destination}`,
      ).toBe(rule.price);
    }
  });

  it('uses the six flat bands the feed declares, and no others', () => {
    expect(fareBands(network)).toEqual([10, 20, 30, 40, 50, 60]);
    expect([...new Set(prices.values())].sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('is symmetric: A to B always costs what B to A costs', () => {
    for (const rule of rules) {
      expect(
        publishedFare(network, rule.destination, rule.origin),
        `${rule.destination}->${rule.origin}`,
      ).toBe(rule.price);
    }
  });

  it('spot-checks the prices CLAUDE.md quotes', () => {
    expect(fareFor(network, 'ALVA', 'EDAP')).toBe(40);
    expect(fareFor(network, 'ALVA', 'TPHT')).toBe(60);
    expect(fareFor(network, 'ALVA', 'PNCU')).toBe(10);
    expect(fareFor(network, 'MGRD', 'EDAP')).toBe(30);
  });
});

describe('same-station journeys', () => {
  it('keeps all 25 self pairs readable at KMRL’s published minimum', () => {
    // The licence forbids modifying the data, so the value stays inspectable.
    for (const stop of network.stops) {
      expect(publishedFare(network, stop.id, stop.id), stop.id).toBe(10);
    }
    expect(rules.filter((r) => r.origin === r.destination)).toHaveLength(25);
  });

  it('refuses to quote one, whichever way the station is named', () => {
    expect(() => fareFor(network, 'ALVA', 'ALVA')).toThrow(/not a journey/);
    expect(() => fareFor(network, 0, 0)).toThrow(/not a journey/);
    expect(() => fareFor(network, network.stops[14], 'MGRD')).toThrow(/not a journey/);
  });
});

describe('fares are not a function of distance', () => {
  it('prices two journeys of identical length differently', () => {
    // Cochin University to Elamkulam and JLN Stadium to Muttom are the same
    // great-circle distance to within a metre, and cost ₹50 and ₹30. No
    // distance model can produce both, so computing fares is not a shortcut
    // that happens to be inexact — it is impossible.
    const a = { from: 'CCUV', to: 'EMKM' };
    const b = { from: 'JLSD', to: 'MUTT' };
    const stop = (id: string) => network.stopsById.get(id)!;
    const distanceA = haversineMetres(stop(a.from), stop(a.to));
    const distanceB = haversineMetres(stop(b.from), stop(b.to));

    expect(Math.abs(distanceA - distanceB)).toBeLessThan(1);
    expect(fareFor(network, a.from, a.to)).toBe(50);
    expect(fareFor(network, b.from, b.to)).toBe(30);
  });

  it('has overlapping distance ranges across every adjacent band', () => {
    // Each band's shortest journey is shorter than the previous band's
    // longest, so no set of distance thresholds separates them.
    const byBand = new Map<number, number[]>();
    for (const rule of rules) {
      if (rule.origin === rule.destination) continue;
      const metres = haversineMetres(
        network.stopsById.get(rule.origin)!,
        network.stopsById.get(rule.destination)!,
      );
      byBand.set(rule.price, [...(byBand.get(rule.price) ?? []), metres]);
    }
    const bands = [...byBand.keys()].sort((x, y) => x - y);
    for (let i = 1; i < bands.length; i++) {
      const lowerMax = Math.max(...byBand.get(bands[i - 1])!);
      const upperMin = Math.min(...byBand.get(bands[i])!);
      expect(upperMin, `₹${bands[i - 1]} vs ₹${bands[i]}`).toBeLessThan(lowerMax);
    }
  });
});

describe('the table is the source of truth, not a formula', () => {
  it('follows a republished table rather than any rule derived from today’s', () => {
    // Today's 625 pairs happen to be an exact function of how many stations
    // apart the two stops are — every pair 8 to 11 apart is ₹40, and so on. So
    // a hop-count formula reproduces the whole table and no comparison against
    // the current feed can tell the two apart. That is precisely the trap:
    // KMRL revises fares without revising `feed_version`, and a formula would
    // go on being confidently wrong where a table just goes stale.
    //
    // This test swaps the table underneath the lookup. Anything that computes
    // the answer ignores the swap and fails.
    const rewritten: NetworkData = {
      ...network,
      fares: {
        currency: network.fares.currency,
        matrix: network.fares.matrix.map((row) => row.map(() => 999)),
      },
    };
    expect(publishedFare(rewritten, 'ALVA', 'EDAP')).toBe(999);
    expect(fareFor(rewritten, 'MGRD', 'VYTA')).toBe(999);
    // Every pair, so no single hardcoded case can be passing by accident.
    for (const rule of rules) {
      expect(publishedFare(rewritten, rule.origin, rule.destination)).toBe(999);
    }
    // And the real table is untouched.
    expect(fareFor(network, 'ALVA', 'EDAP')).toBe(40);
  });

  it('refuses a table that does not cover the pair rather than inventing a price', () => {
    const truncated: NetworkData = {
      ...network,
      fares: { currency: network.fares.currency, matrix: [network.fares.matrix[0].slice(0, 3)] },
    };
    expect(() => publishedFare(truncated, 'ALVA', 'TPHT')).toThrow(/no published fare/);
    expect(() => publishedFare(truncated, 'EDAP', 'ALVA')).toThrow(/no published fare/);
  });
});

describe('unknown stations', () => {
  it('refuses a station that is not on this line', () => {
    expect(() => fareFor(network, 'NOPE', 'ALVA')).toThrow(/no station with id/);
    expect(() => fareFor(network, 'ALVA', 25)).toThrow(/no station at index 25/);
    expect(() => publishedFare(network, -1, 'ALVA')).toThrow(/no station at index/);
  });
});
