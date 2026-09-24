/**
 * Fetch and decode the runtime data bundle.
 *
 * One file, ~28 KB raw and ~7 KB over the wire, holding the entire network.
 * There is no API and no live data, so this is fetched once, decoded once, and
 * then the app is complete and works offline forever (CLAUDE.md decision 2).
 *
 * Plain `fetch`, not `HttpClient`: the app shell provides no HTTP client and
 * nothing here needs interceptors, and one request for one static asset is not
 * worth the bundle weight.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';

import { decodeNetwork, NetworkDataError } from './network-codec';
import type { NetworkBundle, NetworkData } from './network.types';

/**
 * Where the bundle lives.
 *
 * Root-absolute because a relative path would resolve against the current
 * route and break on `/station/aluva`. Overridable so a test, or a server
 * render that has to read from disk, can point somewhere else.
 */
export const NETWORK_DATA_URL = new InjectionToken<string>('NETWORK_DATA_URL', {
  providedIn: 'root',
  factory: () => '/data/network.json',
});

/** Fetch and decode, with no Angular involved. */
export async function fetchNetwork(url: string, init?: RequestInit): Promise<NetworkData> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    // A network failure must surface. The competitor fetches, discards the
    // error and leaves a permanently blank UI (CLAUDE.md finding 7).
    throw new NetworkDataError(`could not fetch ${url}: ${String(cause)}`);
  }
  if (!response.ok) {
    throw new NetworkDataError(`${url} returned ${response.status} ${response.statusText}`);
  }
  return decodeNetwork((await response.json()) as NetworkBundle);
}

@Injectable({ providedIn: 'root' })
export class NetworkDataService {
  readonly #url = inject(NETWORK_DATA_URL);
  #pending: Promise<NetworkData> | undefined;

  /**
   * The decoded network. Fetched at most once per app instance.
   *
   * A failed load clears the cache so a retry is a real retry rather than the
   * same rejected promise handed back forever.
   */
  load(): Promise<NetworkData> {
    this.#pending ??= fetchNetwork(this.#url).catch((error: unknown) => {
      this.#pending = undefined;
      throw error;
    });
    return this.#pending;
  }
}
