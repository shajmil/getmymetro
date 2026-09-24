/**
 * How much a fix is worth, which is a different question from which station is
 * closest.
 *
 * Run against the real bundle and real station coordinates, because the
 * thresholds only mean anything against the real spacing of the line.
 */

import { createMetroEngine, type MetroEngine } from '../engine/metro-engine';
import { loadNetwork, VOUCHED_2026 } from '../engine/testing/network';
import {
  AT_STATION_METRES,
  CATCHMENT_METRES,
  classifyFix,
  formatDistance,
  USABLE_ACCURACY_METRES,
} from './nearest';

const network = loadNetwork();
const engine: MetroEngine = createMetroEngine(network, { holidays: VOUCHED_2026 });

const MG_ROAD = network.stopsById.get('MGRD');
if (MG_ROAD === undefined) throw new Error('MGRD missing from the bundle');

describe('classifyFix', () => {
  it('names the station when the fix lands on it', () => {
    const result = classifyFix(engine, { lat: MG_ROAD.lat, lon: MG_ROAD.lon }, 20);
    expect(result.kind).toBe('at');
    expect(result.stop.id).toBe('MGRD');
    expect(result.distanceM).toBe(0);
  });

  it('still names a station just inside the confident radius', () => {
    // ~0.004 degrees of latitude is about 440 m — inside 900 m, and inside the
    // 465 m minimum station spacing, so the answer is unambiguous.
    const result = classifyFix(
      engine,
      { lat: MG_ROAD.lat + 0.004, lon: MG_ROAD.lon },
      20,
    );
    expect(result.kind).toBe('at');
    expect(result.distanceM).toBeLessThan(AT_STATION_METRES);
  });

  it('says "nearest", not "you are here", from a couple of kilometres away', () => {
    const result = classifyFix(engine, { lat: MG_ROAD.lat, lon: MG_ROAD.lon - 0.025 }, 30);
    expect(result.kind).toBe('near');
    expect(result.distanceM).toBeGreaterThan(AT_STATION_METRES);
    expect(result.distanceM).toBeLessThanOrEqual(CATCHMENT_METRES);
  });

  it('reports a user outside Kochi as far, and still hands back a station', () => {
    // Bengaluru. The screen must not dead-end, so a station comes back anyway.
    const result = classifyFix(engine, { lat: 12.9716, lon: 77.5946 }, 40);
    expect(result.kind).toBe('far');
    expect(result.distanceM).toBeGreaterThan(CATCHMENT_METRES);
    expect(result.stop).toBeTruthy();
  });

  it('refuses to be confident about a fix too coarse to tell stations apart', () => {
    const result = classifyFix(
      engine,
      { lat: MG_ROAD.lat, lon: MG_ROAD.lon },
      USABLE_ACCURACY_METRES + 1200,
    );
    expect(result.kind).toBe('vague');
    expect(result.kind === 'vague' && result.accuracyM).toBe(USABLE_ACCURACY_METRES + 1200);
    // The station is still offered — "we are not sure" is not "we have nothing".
    expect(result.stop.id).toBe('MGRD');
  });

  it('calls a distant coarse fix far, because distance is the stronger signal', () => {
    const result = classifyFix(engine, { lat: 12.9716, lon: 77.5946 }, 9000);
    expect(result.kind).toBe('far');
  });
});

describe('formatDistance', () => {
  it('reads in metres below a kilometre and kilometres above', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(223)).toBe('220 m');
    expect(formatDistance(994)).toBe('990 m');
    expect(formatDistance(999)).toBe('1.0 km');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(12_500)).toBe('12.5 km');
  });
});
