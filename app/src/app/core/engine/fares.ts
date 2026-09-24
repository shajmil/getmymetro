/**
 * Fares, read from the table and never computed.
 *
 * KMRL publishes all 625 ordered pairs across six flat bands (CLAUDE.md
 * finding 5). The temptation is to replace 625 numbers with a formula over
 * distance; a distance model misprices 104 of the 600 travelled pairs, because
 * the bands step on station count rather than kilometres and the line's
 * spacing runs from 465 m to 2,017 m. Quoting a passenger ₹30 for a ₹40
 * journey is a defect they discover at the gate.
 *
 * (The table happens to be an exact function of how many stations apart the
 * two stops are — every pair 8 to 11 stations apart is ₹40, and so on. That is
 * an observation about today's table, not a licence to generate it. KMRL
 * revises fares without revising the feed's version number, and a formula
 * would go on being confidently wrong; a table just goes stale, which the
 * feed-watch job catches.)
 *
 * Self-pairs are in the feed at ₹10, KMRL's minimum. The licence forbids
 * modifying the data, so the value stays readable through
 * {@link publishedFare} — but {@link fareFor} refuses it, because selling
 * someone a ticket from Aluva to Aluva is not a rounding error, it is a
 * journey that does not exist.
 */

import type { NetworkData, Rupees } from '../data/network.types';
import { EngineError } from './errors';
import { resolveStop, type StopRef } from './stops';

/**
 * The feed's value for a pair, including the ₹10 self-pairs.
 *
 * Here so provenance is inspectable and so a test can compare the decoded
 * table against all 625 rows of `fare_rules.txt`. Not for quoting a price.
 */
export function publishedFare(network: NetworkData, origin: StopRef, destination: StopRef): Rupees {
  const from = resolveStop(network, origin);
  const to = resolveStop(network, destination);
  const row = network.fares.matrix[from.index];
  const fare = row?.[to.index];
  if (fare === undefined) {
    throw new EngineError(`no published fare for ${from.id} to ${to.id}`);
  }
  return fare;
}

/** The price to quote. Throws for a journey from a station to itself. */
export function fareFor(network: NetworkData, origin: StopRef, destination: StopRef): Rupees {
  const from = resolveStop(network, origin);
  const to = resolveStop(network, destination);
  if (from.index === to.index) {
    throw new EngineError(`${from.id} to ${from.id} is not a journey`);
  }
  return publishedFare(network, from, to);
}

/** The distinct bands the feed uses, ascending. Six of them: ₹10 to ₹60. */
export function fareBands(network: NetworkData): readonly Rupees[] {
  const bands = new Set<Rupees>();
  for (const row of network.fares.matrix) for (const fare of row) bands.add(fare);
  return [...bands].sort((a, b) => a - b);
}
