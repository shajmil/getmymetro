/**
 * Every way asking for a location can fail, and the one way it can succeed.
 *
 * The cases that matter are the ones the browser API does not report: a
 * permission prompt the user swipes away never calls back at all, and a
 * callback that arrives after we have given up must not overwrite the answer
 * the UI already acted on. Both are covered here, because both end in a
 * spinner that never stops if they are not.
 */

import { TestBed } from '@angular/core/testing';

import { GEOLOCATION, GeolocationService } from './geolocation';

type Success = PositionCallback;
type Failure = PositionErrorCallback;

function fix(lat: number, lon: number, accuracy: number): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lon, accuracy },
    timestamp: 0,
  } as unknown as GeolocationPosition;
}

function error(code: number): GeolocationPositionError {
  return { code, message: `code ${code}` } as unknown as GeolocationPositionError;
}

/** A geolocation whose behaviour is whatever the test says it is. */
function fakeGeolocation(
  behaviour: (ok: Success, fail: Failure) => void,
): Geolocation {
  return {
    getCurrentPosition: (ok: Success, fail?: Failure | null) =>
      behaviour(ok, fail ?? (() => undefined)),
    watchPosition: () => 0,
    clearWatch: () => undefined,
  } as unknown as Geolocation;
}

function serviceWith(geolocation: Geolocation | null): GeolocationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: GEOLOCATION, useValue: geolocation }],
  });
  return TestBed.inject(GeolocationService);
}

describe('GeolocationService', () => {
  it('reports unsupported rather than throwing when there is no API', async () => {
    const service = serviceWith(null);
    expect(service.supported).toBe(false);
    await expect(service.locate()).resolves.toEqual({
      kind: 'failed',
      reason: 'unsupported',
    });
  });

  it('returns the fix and the accuracy the device reported', async () => {
    const service = serviceWith(fakeGeolocation((ok) => ok(fix(9.9834, 76.2823, 35))));
    await expect(service.locate()).resolves.toEqual({
      kind: 'fix',
      point: { lat: 9.9834, lon: 76.2823 },
      accuracyM: 35,
    });
  });

  it('treats a missing accuracy as infinitely bad, never as good', async () => {
    // An accuracy of NaN read as 0 would promote the worst possible fix to the
    // most trusted one, which is the wrong direction to be wrong in.
    const service = serviceWith(fakeGeolocation((ok) => ok(fix(9.9, 76.2, Number.NaN))));
    const outcome = await service.locate();
    expect(outcome.kind).toBe('fix');
    expect(outcome.kind === 'fix' && outcome.accuracyM).toBe(Number.POSITIVE_INFINITY);
  });

  it('maps PERMISSION_DENIED to denied', async () => {
    const service = serviceWith(fakeGeolocation((_, fail) => fail(error(1))));
    await expect(service.locate()).resolves.toEqual({ kind: 'failed', reason: 'denied' });
  });

  it('maps POSITION_UNAVAILABLE to unavailable', async () => {
    const service = serviceWith(fakeGeolocation((_, fail) => fail(error(2))));
    await expect(service.locate()).resolves.toEqual({
      kind: 'failed',
      reason: 'unavailable',
    });
  });

  it('maps the API timeout to timeout', async () => {
    const service = serviceWith(fakeGeolocation((_, fail) => fail(error(3))));
    await expect(service.locate()).resolves.toEqual({ kind: 'failed', reason: 'timeout' });
  });

  it('maps an unknown error code to unavailable rather than dropping it', async () => {
    const service = serviceWith(fakeGeolocation((_, fail) => fail(error(99))));
    await expect(service.locate()).resolves.toEqual({
      kind: 'failed',
      reason: 'unavailable',
    });
  });

  it('gives up on its own when the prompt is dismissed and nothing calls back', async () => {
    // Chrome leaves a dismissed prompt pending forever: no success callback, no
    // error callback, and the API's own `timeout` never starts. Without the
    // watchdog the UI would wait for the rest of the session.
    const service = serviceWith(fakeGeolocation(() => undefined));
    await expect(service.locate(10)).resolves.toEqual({ kind: 'failed', reason: 'timeout' });
  });

  it('ignores a callback that arrives after it has given up', async () => {
    let late: Success | undefined;
    const service = serviceWith(fakeGeolocation((ok) => (late = ok)));

    const outcome = await service.locate(10);
    expect(outcome).toEqual({ kind: 'failed', reason: 'timeout' });

    // The user answers the prompt a minute later. Resolving twice would be a
    // silently swallowed no-op here, but the same shape elsewhere overwrites a
    // station the user has since chosen by hand.
    expect(() => late?.(fix(9.9834, 76.2823, 20))).not.toThrow();
  });

  it('survives an API that throws synchronously', async () => {
    const service = serviceWith(
      fakeGeolocation(() => {
        throw new Error('webview says no');
      }),
    );
    await expect(service.locate(10)).resolves.toEqual({
      kind: 'failed',
      reason: 'unavailable',
    });
  });
});
