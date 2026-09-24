/**
 * The one error the engine raises.
 *
 * Everything that is a *data outcome* — no trains left today, a station with no
 * departures in a direction, an unverifiable date — is expressed in the return
 * type instead, because the UI has to render those. An `EngineError` means the
 * caller asked something that cannot be answered at all: an unknown station, a
 * journey from a station to itself, a coordinate that is not on Earth.
 */
export class EngineError extends Error {
  override readonly name = 'EngineError';
}
