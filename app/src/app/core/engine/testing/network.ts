/**
 * Test scaffolding. Excluded from the app build by `tsconfig.app.json`.
 *
 * The specs run against the real `public/data/network.json` — the same file
 * the browser downloads — rather than a hand-written fixture. A fixture would
 * let a wrong assumption about the timetable live in two places and agree with
 * itself; the real bundle cannot. It decodes in about two milliseconds, so
 * every spec file loads its own copy and none of them share state.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeNetwork } from '../../data/network-codec';
import type { NetworkBundle, NetworkData } from '../../data/network.types';
import { buildDepartureIndex, type DepartureIndex } from '../departures';
import { declaredHolidays, type HolidayCalendar } from '../holiday';
import { istInstant, parseCivilDate, type Instant } from '../civil-time';

/** Vitest runs from `app/`. */
const BUNDLE_PATH = join(process.cwd(), 'public', 'data', 'network.json');

export function loadNetwork(): NetworkData {
  return decodeNetwork(JSON.parse(readFileSync(BUNDLE_PATH, 'utf8')) as NetworkBundle);
}

export function loadIndex(network: NetworkData): DepartureIndex {
  return buildDepartureIndex(network);
}

/**
 * `at('2026-09-22', 12, 0)` — noon IST on a Tuesday, as an instant.
 *
 * Built through the engine's own IST arithmetic rather than `new Date(...)`,
 * so the specs mean the same thing on a machine set to UTC, IST or US/Pacific.
 */
export function at(date: string, hours: number, minutes = 0, seconds = 0): Instant {
  return istInstant(parseCivilDate(date), hours * 3600 + minutes * 60 + seconds);
}

/**
 * A calendar that vouches for all of 2026 and declares no holidays.
 *
 * **Test scaffolding, not shippable data.** Nobody has checked Kerala's 2026
 * holidays; this exists so a spec can assert the *timetable* without every
 * assertion also being about the holiday caveat. The specs that care about the
 * caveat use `NO_HOLIDAY_DATA` instead, which is what the app actually ships.
 */
export const VOUCHED_2026: HolidayCalendar = declaredHolidays({
  sundayService: {},
  vouchedFrom: '2026-01-01',
  vouchedThrough: '2026-12-31',
  source: 'test scaffolding',
});
