/**
 * The only Angular in the engine: two injection tokens and a signal around a
 * promise.
 *
 * The logic lives in `metro-engine.ts` as plain functions over plain data, so
 * this file has nothing to get wrong. Two deliberate omissions:
 *
 * **No timer.** A countdown needs a tick, but a service that starts its own
 * `setInterval` runs during server rendering, keeps running on a hidden tab,
 * and in a zoneless app schedules change detection nobody asked for. The
 * component that shows a countdown owns its own cadence and calls
 * {@link MetroEngineService.tick}.
 *
 * **No implicit clock read.** Every query takes an explicit `at`. `Date.now()`
 * reaches the engine through the {@link CLOCK} token and nowhere else, which
 * is what makes "at 00:01 on a Tuesday" a test rather than a thought
 * experiment.
 */

import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';

import { NetworkDataService } from '../data/network-data';
import type { Instant } from './civil-time';
import { NO_HOLIDAY_DATA, type HolidayCalendar } from './holiday';
import { createMetroEngine, type MetroEngine } from './metro-engine';

/**
 * What runs on a given date.
 *
 * Defaults to {@link NO_HOLIDAY_DATA}: Sundays are certain, everything else is
 * reported `unverified`. Override it with `declaredHolidays(...)` once someone
 * has checked a real list against a real source — and note the range they
 * checked, because that is what the default is missing, not the dates.
 */
export const HOLIDAY_CALENDAR = new InjectionToken<HolidayCalendar>('HOLIDAY_CALENDAR', {
  providedIn: 'root',
  factory: () => NO_HOLIDAY_DATA,
});

/** The wall clock, as epoch milliseconds. Replaceable so time is an input, not ambient. */
export const CLOCK = new InjectionToken<() => Instant>('CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

@Injectable({ providedIn: 'root' })
export class MetroEngineService {
  readonly #data = inject(NetworkDataService);
  readonly #holidays = inject(HOLIDAY_CALENDAR);
  readonly #clock = inject(CLOCK);

  readonly #engine = signal<MetroEngine | null>(null);
  #pending: Promise<MetroEngine> | undefined;

  /** The engine once the bundle has loaded, `null` before. */
  readonly engine = this.#engine.asReadonly();
  readonly ready = computed(() => this.#engine() !== null);

  readonly #now = signal<Instant>(this.#clock());
  /** The instant the UI is rendering for. Advanced by {@link tick}, never on its own. */
  readonly now = this.#now.asReadonly();

  /** Re-read the clock. Call it from whatever owns the countdown's cadence. */
  tick(): Instant {
    const at = this.#clock();
    this.#now.set(at);
    return at;
  }

  /**
   * Fetch, decode and index the network. At most once per app instance; a
   * failure clears the cache so a retry is a real retry.
   */
  load(): Promise<MetroEngine> {
    this.#pending ??= this.#data
      .load()
      .then((network) => {
        const engine = createMetroEngine(network, { holidays: this.#holidays });
        this.#engine.set(engine);
        return engine;
      })
      .catch((error: unknown) => {
        this.#pending = undefined;
        throw error;
      });
    return this.#pending;
  }
}
