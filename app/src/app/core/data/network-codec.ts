/**
 * Turn `network.json` into `NetworkData`.
 *
 * Pure, synchronous and free of Angular, so it can be tested against the raw
 * GTFS files without a browser. Decoding is the whole job — everything the
 * wire format compresses away (absolute times, whole objects, lookups) is
 * restored here, so no later phase ever has to know that the bundle is
 * columnar or delta-encoded.
 *
 * ~10,700 stop events decode in a couple of milliseconds and cost a few
 * hundred kilobytes of heap. That is a deliberate trade: pay once at load so
 * the engine can index and compare plain numbers, rather than re-walking a
 * delta chain on every tick of a one-second countdown.
 */

import { asMetres, asSeconds } from './seconds';
import {
  NETWORK_FORMAT,
  type Direction,
  type FareTable,
  type FeedProvenance,
  type IsoWeekday,
  type NetworkBundle,
  type NetworkData,
  type Service,
  type Shape,
  type ShapePoint,
  type Stop,
  type StopEvent,
  type Trip,
} from './network.types';

/** Thrown for anything the codec will not guess at. */
export class NetworkDataError extends Error {
  override readonly name = 'NetworkDataError';
}

/** `[100, 3, 6]` → `[100, 103, 109]`. */
function undelta(values: readonly number[]): number[] {
  const out = new Array<number>(values.length);
  let running = 0;
  for (let i = 0; i < values.length; i++) {
    running += values[i];
    out[i] = running;
  }
  return out;
}

function decodeFeed(bundle: NetworkBundle): FeedProvenance {
  const f = bundle.feed;
  return {
    version: f.version,
    startDate: f.start_date,
    endDate: f.end_date,
    confirmed: f.confirmed,
    sha256: f.sha256,
    timezone: f.timezone,
    attribution: f.attribution,
  };
}

function decodeStops(bundle: NetworkBundle): Stop[] {
  const s = bundle.stops;
  return s.id.map((id, index) => ({
    id,
    index,
    name: { en: s.en[index], ml: s.ml[index], hi: s.hi[index] },
    lat: s.lat[index],
    lon: s.lon[index],
  }));
}

function decodeServices(bundle: NetworkBundle): Service[] {
  return bundle.services.id.map((id, i) => {
    const flags = bundle.services.days[i];
    const days = new Set<IsoWeekday>();
    for (let d = 0; d < flags.length; d++) {
      // Position 0 is Monday, so the ISO weekday is the position plus one.
      if (flags[d] === '1') days.add((d + 1) as IsoWeekday);
    }
    return { id, days };
  });
}

function decodeFares(bundle: NetworkBundle): FareTable {
  const { bands, matrix, currency } = bundle.fares;
  return {
    currency,
    matrix: matrix.map((row) => {
      const out = new Array<number>(row.length);
      for (let i = 0; i < row.length; i++) {
        const band = bands[row.charCodeAt(i) - 48];
        if (band === undefined) {
          throw new NetworkDataError(`fare matrix references band '${row[i]}'`);
        }
        out[i] = band;
      }
      return out;
    }),
  };
}

function decodeTrips(bundle: NetworkBundle, stopCount: number): Trip[] {
  const t = bundle.trips;
  const p = t.pattern;
  const serviceIds = bundle.services.id;
  const starts = undelta(t.t0);
  const trips = new Array<Trip>(t.id.length);

  for (let i = 0; i < t.id.length; i++) {
    const pattern = t.pat[i];
    const direction = p.dir[pattern] as Direction;
    const first = p.first[pattern];
    const count = p.n[pattern];
    const hops = p.hops[pattern];
    // Direction 0 runs up the line, direction 1 runs down it. Every trip in
    // this feed walks a contiguous run, which build_network.py asserts.
    const step = direction === 0 ? 1 : -1;

    let arrival = starts[i];
    let departure = arrival + t.dwell0[i];
    const stops = new Array<StopEvent>(count);
    stops[0] = {
      stopIndex: first,
      arrival: asSeconds(arrival),
      departure: asSeconds(departure),
    };

    for (let k = 1; k < count; k++) {
      arrival = departure + hops[2 * (k - 1)];
      departure = arrival + hops[2 * (k - 1) + 1];
      const stopIndex = first + step * k;
      if (stopIndex < 0 || stopIndex >= stopCount) {
        throw new NetworkDataError(`${t.id[i]}: stop index ${stopIndex} is off the line`);
      }
      stops[k] = {
        stopIndex,
        arrival: asSeconds(arrival),
        departure: asSeconds(departure),
      };
    }

    const service = serviceIds[t.service.charCodeAt(i) - 48];
    if (service === undefined) {
      throw new NetworkDataError(`${t.id[i]}: unknown service '${t.service[i]}'`);
    }
    trips[i] = { id: t.id[i], service, direction, stops };
  }

  return trips;
}

function decodeShapes(bundle: NetworkBundle): Shape[] {
  const s = bundle.shapes;
  const scale = 10 ** s.precision;
  return s.id.map((id, i) => {
    const lat = undelta(s.lat[i]);
    const lon = undelta(s.lon[i]);
    const dist = undelta(s.dist[i]);
    const points = new Array<ShapePoint>(lat.length);
    for (let k = 0; k < lat.length; k++) {
      points[k] = {
        lat: lat[k] / scale,
        lon: lon[k] / scale,
        distance: asMetres(dist[k]),
      };
    }
    return {
      id,
      points,
      stopDistance: s.stop_dist[i].map(asMetres),
      toleranceM: s.tolerance_m,
      maxDeviationM: s.max_deviation_m,
    };
  });
}

function byId<T extends { readonly id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Decode a parsed `network.json`.
 *
 * Throws `NetworkDataError` rather than returning a half-built network: a
 * departure board that renders from partly-decoded data is worse than one that
 * says it could not load.
 */
export function decodeNetwork(bundle: NetworkBundle): NetworkData {
  if (bundle?.format !== NETWORK_FORMAT) {
    throw new NetworkDataError(
      `network.json is format ${bundle?.format}, this build reads ${NETWORK_FORMAT}`,
    );
  }

  const stops = decodeStops(bundle);
  const services = decodeServices(bundle);
  const trips = decodeTrips(bundle, stops.length);
  const shapes = decodeShapes(bundle);

  // Counts are in the bundle so a truncated or half-written file is caught
  // here rather than as a quietly short departure board.
  if (trips.length !== bundle.trips.count) {
    throw new NetworkDataError(
      `decoded ${trips.length} trips, bundle declares ${bundle.trips.count}`,
    );
  }
  const events = trips.reduce((n, trip) => n + trip.stops.length, 0);
  if (events !== bundle.trips.stop_events) {
    throw new NetworkDataError(
      `decoded ${events} stop events, bundle declares ${bundle.trips.stop_events}`,
    );
  }
  if (bundle.fares.matrix.length !== stops.length) {
    throw new NetworkDataError(
      `fare table is ${bundle.fares.matrix.length} rows for ${stops.length} stops`,
    );
  }

  return {
    format: bundle.format,
    feed: decodeFeed(bundle),
    stops,
    stopsById: byId(stops),
    services,
    servicesById: byId(services),
    trips,
    tripsById: byId(trips),
    fares: decodeFares(bundle),
    shapes,
    shapesById: byId(shapes),
  };
}
