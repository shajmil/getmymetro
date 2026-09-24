/**
 * Remembering a station, and failing to, without either being an error.
 *
 * The failure case is the point: `localStorage` throws on access in a private
 * window with site data blocked, and is simply absent during server rendering.
 * A returning user losing their station is a small disappointment; an
 * exception thrown out of a getter during the first render is a blank page.
 */

import { TestBed } from '@angular/core/testing';

import { STATION_MEMORY_KEY, StationMemoryService } from './station-memory';

function service(): StationMemoryService {
  TestBed.resetTestingModule();
  return TestBed.inject(StationMemoryService);
}

describe('StationMemoryService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers nothing to start with', () => {
    expect(service().read()).toBeNull();
  });

  it('round-trips a station id', () => {
    const memory = service();
    memory.write('MGRD');
    expect(memory.read()).toBe('MGRD');
    expect(localStorage.getItem(STATION_MEMORY_KEY)).toBe('MGRD');
  });

  it('forgets on request', () => {
    const memory = service();
    memory.write('MGRD');
    memory.forget();
    expect(memory.read()).toBeNull();
  });

  it('rejects an empty or implausibly long stored value', () => {
    const memory = service();
    localStorage.setItem(STATION_MEMORY_KEY, '   ');
    expect(memory.read()).toBeNull();
    localStorage.setItem(STATION_MEMORY_KEY, 'x'.repeat(200));
    expect(memory.read()).toBeNull();
  });

  it('trims whitespace rather than failing to resolve the station', () => {
    const memory = service();
    localStorage.setItem(STATION_MEMORY_KEY, ' MGRD ');
    expect(memory.read()).toBe('MGRD');
  });

  it('degrades to forgetting when storage itself throws', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      const memory = service();
      expect(memory.read()).toBeNull();
      expect(() => memory.write('MGRD')).not.toThrow();
      expect(() => memory.forget()).not.toThrow();
    } finally {
      if (real === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', real);
    }
  });
});
