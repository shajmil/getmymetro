/**
 * The last station the user chose, remembered between visits.
 *
 * This is what makes the second open faster than the first. Geolocation costs
 * a permission prompt and a second or two of radio; a remembered station costs
 * a synchronous string read, so a returning commuter has an answer on screen
 * before the browser has finished deciding whether to ask about location at
 * all. Geolocation still runs and still wins if it disagrees — the memory is
 * a head start, not an override.
 *
 * `localStorage` throws rather than returning null in a private window with
 * site data blocked, and is simply absent during server rendering. Both are
 * expected, neither is an error, and forgetting a station is not a failure
 * worth telling anyone about — so every access is wrapped and every failure is
 * "we don't remember".
 */

import { Injectable } from '@angular/core';

import type { StopId } from '../data/network.types';

/** Namespaced so a future preference cannot collide with it. */
export const STATION_MEMORY_KEY = 'gm.station';

/** Longest plausible GTFS stop id. Guards against a corrupted or hostile value. */
const MAX_ID_LENGTH = 32;

@Injectable({ providedIn: 'root' })
export class StationMemoryService {
  /**
   * The remembered stop id, or `null`.
   *
   * The id is not resolved against the network here: this layer knows nothing
   * about which stations exist, and a feed change that retires a code should
   * surface as "station not found" at the point of use, not as a silent empty
   * memory.
   */
  read(): StopId | null {
    try {
      const raw = globalThis.localStorage?.getItem(STATION_MEMORY_KEY) ?? null;
      if (raw === null) return null;
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return null;
      return trimmed;
    } catch {
      return null;
    }
  }

  write(id: StopId): void {
    try {
      globalThis.localStorage?.setItem(STATION_MEMORY_KEY, id);
    } catch {
      // Storage full, blocked, or absent. The app works exactly as well
      // without it; there is nothing to report and nothing to retry.
    }
  }

  forget(): void {
    try {
      globalThis.localStorage?.removeItem(STATION_MEMORY_KEY);
    } catch {
      // As above.
    }
  }
}
