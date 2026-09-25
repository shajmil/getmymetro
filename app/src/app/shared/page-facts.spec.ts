/**
 * The prerendered slice, and the claim it rests on.
 *
 * The claim is that the server can render the reference content into the HTML
 * and the browser's first pass will reproduce it **exactly** — because both
 * run the same function over the same facts. If that is false the page throws
 * NG0500 in a real browser and Angular discards the server's DOM, which is
 * invisible to `npm run build` and to a TestBed that never hydrates. So it is
 * asserted here directly: the slice survives `JSON.stringify` (which is what
 * `TransferState` does to it) and produces the identical view model on the
 * other side.
 *
 * The second claim is the size. `network.json` is 7.2 kB gzipped and putting
 * all of it in every document would be ~34 MB of prerendered HTML across 1,252
 * pages — a real cost on Cloudflare Pages and a second copy of data the reader
 * is about to fetch anyway. The budget here is what keeps that honest.
 */

import { loadNetwork } from '../core/engine/testing/network';
import type { StationEntry } from '../core/data/station-directory';
import { platformViews } from './platform-view';
import { routeReference } from '../pages/route/route-view';
import { routeFactsOf, stationFactsOf } from './page-facts';

const network = loadNetwork();

const stop = (id: string) => {
  const found = network.stopsById.get(id);
  if (found === undefined) throw new Error(`${id} missing from the bundle`);
  return found;
};

const directory = (locale: 'en' | 'ml'): readonly StationEntry[] =>
  network.stops.map((s) =>
    locale === 'ml'
      ? { id: s.id, index: s.index, name: s.name.en, ml: s.name.ml }
      : { id: s.id, index: s.index, name: s.name.en },
  );

/** What TransferState does to the slice between the server and the browser. */
const overTheWire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Roughly what the slice costs in the document, before the HTML is compressed. */
const wireBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('a station page s slice', () => {
  it('renders identically before and after the wire', () => {
    for (const id of ['ALVA', 'MGRD', 'TPHT', 'MUTT']) {
      const facts = stationFactsOf(network, stop(id));
      const direct = platformViews(facts, directory('en'), 'en');
      const hydrated = platformViews(overTheWire(facts), directory('en'), 'en');
      expect(hydrated).toEqual(direct);
    }
  });

  it('carries the facts the page leads with', () => {
    const views = platformViews(stationFactsOf(network, stop('MGRD')), directory('en'), 'en');
    const towardsAluva = views.find((v) => v.towardsName === 'Aluva');
    const wk = towardsAluva?.patterns.find((p) => p.serviceId === 'WK');

    // The single most dangerous fact in the dataset, and it has to survive
    // being reduced to indexes and clock strings (CLAUDE.md finding 9).
    expect(wk?.lastThroughClock).toBe('10:52 PM');
    expect(wk?.lastClock).toBe('11:44 PM');
    expect(wk?.lastShortTurn).toBe(true);
    expect(wk?.lastTerminusName).toBe('Muttom');
    expect(wk?.strandMinutes).toBe(52);
    expect(wk?.finalGapMinutes).toBe(45);
    expect(wk?.dayLabel).toBe('Monday to Saturday');
  });

  it('prices all 24 destinations from the table it was given', () => {
    const views = platformViews(stationFactsOf(network, stop('ALVA')), directory('en'), 'en');
    const rows = views.flatMap((v) => v.destinations);
    expect(rows).toHaveLength(24);
    const byName = new Map(rows.map((row) => [row.name, row]));
    // Read out of fare_rules.txt, band boundaries included.
    expect(byName.get('Pulinchodu')?.fare).toBe(10);
    expect(byName.get('Companypady')?.fare).toBe(20);
    expect(byName.get('Kalamassery')?.fare).toBe(30);
    expect(byName.get('Edapally')?.fare).toBe(40);
    expect(byName.get('Kaloor')?.fare).toBe(50);
    expect(byName.get('Kadavanthra')?.fare).toBe(60);
    expect(byName.get('Pulinchodu')?.path).toBe('/route/aluva-to-pulinchodu');
  });

  it('gives a terminus one platform, not an empty second one', () => {
    expect(stationFactsOf(network, stop('TPHT')).platforms).toHaveLength(1);
    expect(stationFactsOf(network, stop('ALVA')).platforms).toHaveLength(1);
    expect(stationFactsOf(network, stop('MGRD')).platforms).toHaveLength(2);
  });

  it('keeps the URL English and the words Malayalam', () => {
    const views = platformViews(stationFactsOf(network, stop('ALVA')), directory('ml'), 'ml');
    const first = views[0].destinations[0];
    // The slug is the same in both languages — only the prefix changes.
    expect(first.path).toBe('/ml/route/aluva-to-pulinchodu');
    expect(first.name).toBe(network.stops[1].name.ml);
    expect(first.name).not.toBe(network.stops[1].name.en);
  });

  it('stays inside the per-document budget at every station', () => {
    // 2 KiB x 1,252 documents is about 2.5 MB of extra HTML across the whole
    // site. The whole bundle in every document would be 34 MB.
    const worst = Math.max(
      ...network.stops.map((s) => wireBytes(stationFactsOf(network, s))),
    );
    expect(worst).toBeLessThan(2048);
  });
});

describe('a route page s slice', () => {
  it('renders identically before and after the wire', () => {
    const pairs: readonly [string, string][] = [
      ['ALVA', 'EDAP'],
      ['MGRD', 'ALVA'],
      ['TPHT', 'ALVA'],
    ];
    for (const [from, to] of pairs) {
      const facts = routeFactsOf(network, stop(from), stop(to));
      const direct = routeReference(facts, directory('en'), 'en');
      const hydrated = routeReference(overTheWire(facts), directory('en'), 'en');
      expect(hydrated).toEqual(direct);
    }
  });

  it('reconstructs direction, fare and the stations between from indexes alone', () => {
    const reference = routeReference(
      routeFactsOf(network, stop('ALVA'), stop('EDAP')),
      directory('en'),
      'en',
    );
    expect(reference?.towardsName).toBe('Tripunithura');
    expect(reference?.hops).toBe(8);
    expect(reference?.fare).toBe(40);
    expect(reference?.stopsBetween).toEqual([
      'Pulinchodu',
      'Companypady',
      'Ambattukavu',
      'Muttom',
      'Kalamassery',
      'Cochin University',
      'Pathadipalam',
    ]);
  });

  it('reports no stations between two that are adjacent', () => {
    // The empty case drives the route page's prerendered `route.nextStation`
    // sentence — "Pulinchodu is the next station. No stops in between." —
    // which is the branch a crawler and a reader with JavaScript off get.
    // "1 stop" on its own does not say there is nothing between; an
    // off-by-one that silently included the destination would read as one.
    const reference = routeReference(
      routeFactsOf(network, stop('ALVA'), stop('PNCU')),
      directory('en'),
      'en',
    );
    expect(reference?.hops).toBe(1);
    expect(reference?.stopsBetween).toEqual([]);
  });

  it('reverses cleanly, which is what proves the direction is derived', () => {
    const back = routeReference(
      routeFactsOf(network, stop('EDAP'), stop('ALVA')),
      directory('en'),
      'en',
    );
    expect(back?.towardsName).toBe('Aluva');
    expect(back?.hops).toBe(8);
    expect(back?.fare).toBe(40);
    expect(back?.stopsBetween[0]).toBe('Pathadipalam');
  });

  it('keeps the last useful train and the last train out apart', () => {
    const reference = routeReference(
      routeFactsOf(network, stop('MGRD'), stop('ALVA')),
      directory('en'),
      'en',
    );
    const wk = reference?.patterns.find((p) => p.serviceId === 'WK');
    expect(wk?.lastClock).toBe('10:52 PM');
    expect(wk?.lastFromPlatformClock).toBe('11:44 PM');
    expect(wk?.strandMinutes).toBe(52);
  });

  it('stays inside the per-document budget on the longest journey', () => {
    const worst = wireBytes(routeFactsOf(network, stop('ALVA'), stop('TPHT')));
    expect(worst).toBeLessThan(2048);
  });
});
