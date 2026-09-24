/**
 * The scheduled-position engine, against the real feed.
 *
 * The three things a map of this line can get visibly wrong are all here:
 * the trains vanishing at midnight, the arrow pointing backwards, and the
 * train cutting the corner at Edapally because someone interpolated latitude
 * instead of chainage. Each has its own test.
 */

import { describe, expect, it } from 'vitest';

import type { NetworkData } from '../data/network.types';
import { NO_HOLIDAY_DATA } from './holiday';
import { createMetroEngine } from './metro-engine';
import {
  buildPositionIndex,
  placeOnShape,
  shapeForDirection,
  trainsAt,
} from './positions';
import { resolveServiceWindows } from './service-day';
import { at, loadNetwork, VOUCHED_2026 } from './testing/network';

const network: NetworkData = loadNetwork();
const index = buildPositionIndex(network);

const TUESDAY = '2026-09-22';
const SUNDAY = '2026-09-27';

/** Metres between two coordinates. Good enough to assert "on the track". */
function metresApart(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const midLat = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const x = dLon * Math.cos(midLat);
  return Math.hypot(dLat, x) * R;
}

function trainsOn(date: string, hours: number, minutes: number) {
  const instant = at(date, hours, minutes);
  return trainsAt(index, resolveServiceWindows(network, instant, NO_HOLIDAY_DATA));
}

/**
 * One trip, placed at an explicit service-day offset.
 *
 * The window is hand-built rather than resolved from a clock so the offset is
 * the thing under test: these assertions are about the arithmetic, not about
 * which calendar day it is.
 */
function placeAt(service: string, offset: number, tripId: string) {
  return trainsAt(index, [
    {
      date: { year: 2026, month: 9, day: 22 },
      weekday: 2,
      effectiveWeekday: 2,
      services: [service],
      offset,
      origin: 0,
      ruling: { kind: 'ordinary' },
    },
  ]).find((t) => t.tripId === tripId);
}

describe('the index', () => {
  it('keeps every trip in the feed', () => {
    expect(index.tripCount).toBe(450);
    const indexed = [...index.byService.values()].reduce((n, g) => n + g.tracks.length, 0);
    expect(indexed).toBe(450);
  });

  it('derives the shape for each direction from the chainage, not the id', () => {
    const up = shapeForDirection(network, 0);
    const down = shapeForDirection(network, 1);
    expect(up.id).not.toBe(down.id);
    // direction 0 runs in increasing stop index, so its chainage rises with it.
    expect(up.stopDistance[24]).toBeGreaterThan(up.stopDistance[0]);
    expect(down.stopDistance[24]).toBeLessThan(down.stopDistance[0]);
  });
});

describe('placing a train', () => {
  it('puts a train standing at a platform on that platform', () => {
    // WK_1 is a direction-0 trip. At its first stop's arrival it is standing
    // there, so the position must be the station itself.
    const trip = network.tripsById.get('WK_1');
    if (trip === undefined) throw new Error('WK_1 missing');
    const first = trip.stops[0];
    const stop = network.stops[first.stopIndex];
    const shape = shapeForDirection(network, trip.direction);
    const placed = placeOnShape(shape, shape.stopDistance[first.stopIndex]);
    // Measured, not guessed: across all 25 stations and both shapes the
    // feed's own stop coordinate sits up to 75.8 m from the point its
    // chainage resolves to (worst: Vadakkekotta on R1_0, Aluva on R1_1).
    // `stops.txt` marks the station, `shapes.txt` marks the track, and they
    // are not the same point. 100 m is that measurement plus headroom, not a
    // tolerance chosen to make the test pass.
    expect(metresApart(placed, stop)).toBeLessThan(100);
  });

  it('follows the alignment rather than the chord between stations', () => {
    // Edapally to Changampuzha Park is the sharpest curve on the line. Half
    // way along it by chainage, the alignment and the straight chord between
    // the two stations are far apart — which is the whole reason this module
    // interpolates chainage and not latitude.
    const shape = shapeForDirection(network, 0);
    const a = network.stops.findIndex((s) => s.id === 'EDAP');
    const b = a + 1;
    const mid = (shape.stopDistance[a] + shape.stopDistance[b]) / 2;
    const onTrack = placeOnShape(shape, mid);
    const chord = {
      lat: (network.stops[a].lat + network.stops[b].lat) / 2,
      lon: (network.stops[a].lon + network.stops[b].lon) / 2,
    };
    expect(metresApart(onTrack, chord)).toBeGreaterThan(20);
  });

  it('points the arrow the way the train is going', () => {
    const up = shapeForDirection(network, 0);
    const down = shapeForDirection(network, 1);
    // The line runs broadly north-south: up the line means southbound
    // (bearing near 180), down the line means northbound (near 0 or 360).
    const upBearing = placeOnShape(up, 14_000).bearing;
    const downBearing = placeOnShape(down, 14_000).bearing;
    expect(upBearing).toBeGreaterThan(90);
    expect(upBearing).toBeLessThan(270);
    expect(downBearing > 270 || downBearing < 90).toBe(true);
  });

  it('walks a whole trip past every one of its own stations, in order', () => {
    // This is the test that would fail if a trip were placed on the shape for
    // the other direction, or if chainage were read against the wrong stop
    // index: the arithmetic would still produce a point on the viaduct, just
    // the wrong one. So it is checked against the stations the trip itself
    // claims to serve, at the times it claims to serve them.
    const trip = network.tripsById.get('WK_2');
    if (trip === undefined) throw new Error('WK_2 missing');
    expect(trip.direction).toBe(1);

    let previous: { lat: number; lon: number } | null = null;
    let travelled = 0;
    for (const event of trip.stops) {
      const found = placeAt(trip.service, event.arrival, trip.id);
      expect(found).toBeDefined();
      if (found === undefined) return;
      expect(found.atStation).toBe(true);
      expect(found.nextStopIndex).toBe(event.stopIndex);
      // 100 m for the reason given above: the station coordinate and the
      // track coordinate are different published points.
      expect(metresApart(found, network.stops[event.stopIndex])).toBeLessThan(100);
      if (previous !== null) travelled += metresApart(previous, found);
      previous = found;
    }
    // Aluva to Tripunithura is about 28 km along the viaduct; a trip that
    // doubled back or teleported would not add up to it.
    expect(travelled).toBeGreaterThan(25_000);
    expect(travelled).toBeLessThan(30_000);
  });

  it('moves forward, never backwards, between two stations', () => {
    const trip = network.tripsById.get('WK_1');
    if (trip === undefined) throw new Error('WK_1 missing');
    const from: number = trip.stops[3].departure;
    const to: number = trip.stops[4].arrival;
    let previous: { lat: number; lon: number } | null = null;
    let advanced = 0;
    for (let sec = from; sec <= to; sec += 5) {
      const found = placeAt(trip.service, sec, trip.id);
      expect(found).toBeDefined();
      if (found === undefined) return;
      if (previous !== null) advanced += metresApart(previous, found);
      previous = found;
    }
    const hop = metresApart(network.stops[3], network.stops[4]);
    // Following the curve is always at least as long as the straight line.
    expect(advanced).toBeGreaterThanOrEqual(hop);
  });
});

describe('which trains are running', () => {
  it('finds a plausible number of trains in the weekday peak', () => {
    const peak = trainsOn(TUESDAY, 9, 0);
    expect(peak.length).toBeGreaterThanOrEqual(10);
    expect(peak.length).toBeLessThanOrEqual(30);
    // Both directions are running at 09:00.
    expect(peak.some((t) => t.direction === 0)).toBe(true);
    expect(peak.some((t) => t.direction === 1)).toBe(true);
  });

  it('runs no trains at 03:00', () => {
    expect(trainsOn(TUESDAY, 3, 0)).toHaveLength(0);
  });

  it('still shows last night’s trains at ten past midnight', () => {
    // The competitor's map loses these: it compares a service-day offset of
    // 86,475 against a wall clock that cannot exceed 86,399 (CLAUDE.md
    // finding 7), so its last train vanishes at midnight every night.
    const after = trainsOn('2026-09-23', 0, 2);
    expect(after.length).toBeGreaterThan(0);
  });

  it('shows a different, later-starting service on Sunday', () => {
    // Sunday service starts up to 103 minutes later than Monday-Saturday.
    const sunday = trainsOn(SUNDAY, 5, 30);
    const tuesday = trainsOn(TUESDAY, 5, 30);
    expect(tuesday.length).toBeGreaterThan(sunday.length);
  });

  it('labels only the trains that terminate early', () => {
    // 20 of 450 trips terminate before the end of the line; the other 18
    // partial trips merely start late and are ordinary trains from then on
    // (CLAUDE.md finding 10).
    let short = 0;
    for (const group of index.byService.values()) {
      for (const track of group.tracks) if (track.shortTurn) short++;
    }
    expect(short).toBe(20);
  });
});

describe('through the engine', () => {
  it('carries the same certainty the boards do', () => {
    const engine = createMetroEngine(network, { holidays: NO_HOLIDAY_DATA });
    const outlook = engine.trains(at(TUESDAY, 9, 0));
    // NO_HOLIDAY_DATA vouches for Sundays and nothing else, so a Tuesday is
    // unverified and the payload is `provisional`, not `result`.
    expect(outlook.certainty).toBe('unverified');
    if (outlook.certainty !== 'unverified') return;
    expect(outlook.provisional.length).toBeGreaterThan(0);
  });

  it('reports a plain timetabled outlook on a vouched date', () => {
    const engine = createMetroEngine(network, { holidays: VOUCHED_2026 });
    const outlook = engine.trains(at(TUESDAY, 9, 0));
    expect(outlook.certainty).toBe('timetabled');
  });

  it('reports no trains, not an error, in the middle of the night', () => {
    const engine = createMetroEngine(network, { holidays: VOUCHED_2026 });
    const outlook = engine.trains(at(TUESDAY, 3, 0));
    if (outlook.certainty === 'unverified') throw new Error('unexpected caveat');
    expect(outlook.result).toHaveLength(0);
  });
});
