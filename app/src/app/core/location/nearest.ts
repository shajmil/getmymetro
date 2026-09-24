/**
 * Turning a GPS fix into "you are at Kalamassery" — and knowing when not to.
 *
 * `geo.ts` answers which station is closest. It always answers, because the
 * nearest of 25 points always exists. This module answers the different and
 * more useful question of **how much that answer is worth**, which is what
 * decides whether the screen says "Kalamassery" or offers the picker.
 *
 * Two numbers make the call, and both come from the feed rather than from
 * taste. Adjacent stations are a median 1,051 m apart and never closer than
 * 465 m (Kaloor to Town Hall), so:
 *
 *   - a fix whose own accuracy radius exceeds ~1 km cannot distinguish
 *     neighbouring stations at all, whatever it reports as nearest;
 *   - beyond ~900 m from the nearest station the user is not at a station,
 *     they are somewhere near the line, and the honest word is "nearest";
 *   - beyond ~5 km they are off the network, and the picker is the answer.
 *
 * Nothing here dead-ends. Every classification still carries a station, so the
 * screen can always show something real — the label changes, the content does
 * not disappear.
 */

import type { Stop } from '../data/network.types';
import type { GeoPoint } from '../engine/geo';
import type { MetroEngine } from '../engine/metro-engine';

/** Inside this, "you are at X" is a fair thing to print. */
export const AT_STATION_METRES = 900;

/** Beyond this, the user is not travelling to this station on foot. */
export const CATCHMENT_METRES = 5_000;

/**
 * A fix reporting a worse radius than this cannot tell two stations apart.
 *
 * Deliberately generous against the 465 m minimum spacing: the reported radius
 * is a 95% confidence circle, not an error bar, and a cell-tower fix routinely
 * reports 1-3 km while landing within a few hundred metres.
 */
export const USABLE_ACCURACY_METRES = 1_000;

export type StationFix =
  /** Confident. Say the station's name. */
  | { readonly kind: 'at'; readonly stop: Stop; readonly distanceM: number }
  /** Near the line but not at a station. Say "nearest". */
  | { readonly kind: 'near'; readonly stop: Stop; readonly distanceM: number }
  /** Off the network. Show the station, lead with the picker. */
  | { readonly kind: 'far'; readonly stop: Stop; readonly distanceM: number }
  /** The fix is too coarse to name a station. Show it, and say so. */
  | {
      readonly kind: 'vague';
      readonly stop: Stop;
      readonly distanceM: number;
      readonly accuracyM: number;
    };

/** Classify a fix. Never throws for a valid point, never returns nothing. */
export function classifyFix(
  engine: MetroEngine,
  point: GeoPoint,
  accuracyM: number,
): StationFix {
  const nearest = engine.nearestStation(point);
  const distanceM = Math.round(nearest.distance);
  const stop = nearest.stop;

  if (accuracyM > USABLE_ACCURACY_METRES && distanceM <= CATCHMENT_METRES) {
    return { kind: 'vague', stop, distanceM, accuracyM: Math.round(accuracyM) };
  }
  if (distanceM > CATCHMENT_METRES) return { kind: 'far', stop, distanceM };
  if (distanceM > AT_STATION_METRES) return { kind: 'near', stop, distanceM };
  return { kind: 'at', stop, distanceM };
}

/**
 * "220 m" / "1.4 km". Metres below a kilometre, one decimal above.
 *
 * Rounded before the unit is chosen, so 999 m reads "1.0 km" rather than the
 * "1000 m" that picking the unit first would produce.
 */
export function formatDistance(metres: number): string {
  const rounded = Math.round(metres / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
