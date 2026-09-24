/**
 * The 25 station names, available before the data bundle has loaded.
 *
 * The manual picker is the app's guaranteed path — it must be reachable in one
 * tap and usable as the primary route through the product (docs/build-checklist
 * Phase 4). That makes the station list the one piece of data worth having in
 * the prerendered HTML, so it is in the document source rather than behind a
 * fetch: a reader with JavaScript disabled, a crawler, and a browser still
 * downloading `network.json` all see the real list of stations.
 *
 * Departure times deliberately are **not** here and cannot be. They are a
 * function of the wall clock, and a time baked into a page at build time is a
 * wrong time — CLAUDE.md's honesty rules rule out shipping one even as
 * scaffolding. So the prerendered page carries the network and the provenance;
 * the answer itself is computed in the browser, at the moment it is read.
 *
 * The list travels by `TransferState`, which means the server writes it into
 * the HTML and the client reads it back **synchronously during bootstrap**.
 * That is what keeps hydration clean: the client's first render is identical
 * to the server's, rather than an empty list that Angular would have to
 * discard and rebuild. Roughly 1 KB per document.
 *
 * Once the real bundle arrives the engine becomes the source of truth and this
 * falls away. The two can't drift — both are generated from the same
 * `network.json` — but the engine's copy carries coordinates and line order,
 * so it wins as soon as it exists.
 */

import { Injectable, computed, inject, makeStateKey, TransferState } from '@angular/core';

import { MetroEngineService } from '../engine/metro-engine.service';
import type { StopId } from './network.types';

/** A station, reduced to what a picker needs. */
export interface StationEntry {
  readonly id: StopId;
  /** Position along the line, 0 at Aluva. Also the sort order of the picker. */
  readonly index: number;
  /**
   * The feed's English name, and therefore the one the slug is built from.
   *
   * This stays English on a Malayalam page. The URL is the same in both
   * languages (`/ml/station/aluva`), because a transliterated slug would be a
   * second spelling to maintain, a second set of aliases to resolve, and a
   * second way for `build_pages.py`'s manifest and the router to disagree.
   * {@link ml} is what the reader sees; this is what the link points at.
   */
  readonly name: string;
  /**
   * KMRL's own Malayalam name, from `translations.txt`.
   *
   * Absent on an English page: the server only transfers it when it is going
   * to be rendered, so 625 English documents do not each carry a kilobyte of
   * Malayalam they will never show.
   */
  readonly ml?: string;
}

/**
 * The name to render for a station, in the reader's language.
 *
 * Falls back to the feed's English name rather than to the id. A Malayalam
 * page that is missing one translation should read a little oddly, not print
 * `MGRD`.
 */
export function stationName(
  entry: { readonly name: string; readonly ml?: string },
  locale: 'en' | 'ml',
): string {
  return locale === 'ml' ? (entry.ml ?? entry.name) : entry.name;
}

export const STATION_DIRECTORY_KEY = makeStateKey<readonly StationEntry[]>('gm.stations');

/**
 * `FeedProvenance.confirmed` — the month KMRL last confirmed these timings.
 *
 * Travels with the station list so the provenance sentence is complete in the
 * document source. A claim about where the data came from that only appears
 * once JavaScript has run is a claim a crawler never sees and a reader with
 * JavaScript off never sees either.
 */
export const FEED_CONFIRMED_KEY = makeStateKey<string>('gm.confirmed');

@Injectable({ providedIn: 'root' })
export class StationDirectoryService {
  readonly #state = inject(TransferState);
  readonly #engine = inject(MetroEngineService);

  /**
   * Every station, in line order. Empty only if neither source has arrived.
   *
   * Reading `TransferState` inside the computed rather than once in the
   * constructor keeps this correct on the server too, where the value is
   * written by an app initialiser that may run after this service is created.
   */
  readonly stations = computed<readonly StationEntry[]>(() => {
    const engine = this.#engine.engine();
    if (engine !== null) {
      return engine.network.stops.map((stop) => ({
        id: stop.id,
        index: stop.index,
        name: stop.name.en,
        ml: stop.name.ml,
      }));
    }
    return this.#state.get(STATION_DIRECTORY_KEY, []);
  });

  /** `'2026-09'`, or `''` when neither source has arrived. */
  readonly confirmed = computed<string>(() => {
    const engine = this.#engine.engine();
    if (engine !== null) return engine.network.feed.confirmed;
    return this.#state.get(FEED_CONFIRMED_KEY, '');
  });
}
