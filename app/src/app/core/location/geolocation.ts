/**
 * One position fix, or a reason there isn't one.
 *
 * The zero-tap open (CLAUDE.md MVP item 1) hangs off this, but the product
 * rule is stronger than the feature: **location is never required**. Every
 * path through here ends in a value the UI can act on, and nothing throws.
 *
 * Two things the browser API gets wrong for this use case are corrected here.
 *
 * **The permission prompt is not covered by `timeout`.** The spec starts the
 * `timeout` clock after the user answers, and Chrome leaves a dismissed prompt
 * pending indefinitely — no success callback, no error callback, ever. A user
 * who swipes the prompt away would sit on a spinner forever. So there is a
 * wall-clock watchdog here as well, and a dismissed prompt resolves `timeout`
 * like any other non-answer.
 *
 * **`enableHighAccuracy` is off on purpose.** Stations are a median 1,051 m
 * apart and never closer than 465 m (`geo.ts`), so a 50-100 m network fix
 * already resolves the answer. Waking the GPS chip would cost seconds and
 * battery on the mid-range Android this is built for, to decide something that
 * is already decided. `maximumAge` lets a fix from the last minute answer
 * instantly, which is the difference between zero-tap and zero-tap-eventually.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';

import type { GeoPoint } from '../engine/geo';

/**
 * `navigator.geolocation`, or `null` where there is none.
 *
 * `null` on the server, in a jsdom test and in a browser with the API removed
 * — all three are the same case to this module, and all three are a token
 * override away from being tested.
 */
export const GEOLOCATION = new InjectionToken<Geolocation | null>('GEOLOCATION', {
  providedIn: 'root',
  factory: () =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? navigator.geolocation
      : null,
});

export type LocationFailure =
  /** The user said no, or a previous no is still remembered. Do not re-ask. */
  | 'denied'
  /** No answer in time — including a prompt the user dismissed without choosing. */
  | 'timeout'
  /** The device tried and could not get a fix. Indoors, airplane mode, no GPS. */
  | 'unavailable'
  /** No geolocation API at all. Server render, old browser, or a locked-down one. */
  | 'unsupported';

export type LocationOutcome =
  | {
      readonly kind: 'fix';
      readonly point: GeoPoint;
      /** Radius of 95% confidence, metres. `Infinity` when the device won't say. */
      readonly accuracyM: number;
    }
  | { readonly kind: 'failed'; readonly reason: LocationFailure };

/** Wall-clock budget for the whole attempt, prompt included. */
export const LOCATE_TIMEOUT_MS = 10_000;

/** A fix from the last minute is good enough to name a station, and is instant. */
export const LOCATE_MAX_AGE_MS = 60_000;

/**
 * `GeolocationPositionError` codes, by number.
 *
 * The named constants live on the error instance, and a fake supplied by a
 * test has no reason to carry them. The numbers are fixed by the W3C spec and
 * are the stable contract.
 */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

function reasonFor(error: { readonly code?: number }): LocationFailure {
  if (error.code === PERMISSION_DENIED) return 'denied';
  if (error.code === TIMEOUT) return 'timeout';
  // POSITION_UNAVAILABLE, and anything a browser invents later.
  return 'unavailable';
}

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  readonly #geolocation = inject(GEOLOCATION);

  /** True when asking is even possible. The UI uses it to not offer a dead button. */
  get supported(): boolean {
    return this.#geolocation !== null;
  }

  /**
   * Ask once. Resolves, never rejects.
   *
   * The returned promise settles exactly once even if the browser calls back
   * after the watchdog has already given up, which Chrome does when a user
   * answers a prompt minutes later.
   */
  locate(timeoutMs: number = LOCATE_TIMEOUT_MS): Promise<LocationOutcome> {
    const api = this.#geolocation;
    if (api === null) return Promise.resolve({ kind: 'failed', reason: 'unsupported' });

    return new Promise<LocationOutcome>((resolve) => {
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;

      const done = (outcome: LocationOutcome): void => {
        if (settled) return;
        settled = true;
        if (watchdog !== undefined) clearTimeout(watchdog);
        resolve(outcome);
      };

      watchdog = setTimeout(() => done({ kind: 'failed', reason: 'timeout' }), timeoutMs);

      try {
        api.getCurrentPosition(
          (position) =>
            done({
              kind: 'fix',
              point: { lat: position.coords.latitude, lon: position.coords.longitude },
              accuracyM: Number.isFinite(position.coords.accuracy)
                ? position.coords.accuracy
                : Number.POSITIVE_INFINITY,
            }),
          (error: GeolocationPositionError) => done({ kind: 'failed', reason: reasonFor(error) }),
          {
            enableHighAccuracy: false,
            timeout: timeoutMs,
            maximumAge: LOCATE_MAX_AGE_MS,
          },
        );
      } catch {
        // Some embedded webviews throw synchronously instead of calling back.
        done({ kind: 'failed', reason: 'unavailable' });
      }
    });
  }
}
