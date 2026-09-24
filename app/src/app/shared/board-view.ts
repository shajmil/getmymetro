/**
 * The departure board's view model: engine output, turned into strings.
 *
 * Shared by the home screen and the station page, which show the same board at
 * different lengths. It lived in `pages/home/home-view.ts` through Phase 4 and
 * moved here unchanged in Phase 5 rather than being copied — the last-train
 * wording is the most dangerous copy in the product and two divergent versions
 * of it is exactly how one of them goes stale.
 *
 * Kept out of the component on purpose. Everything in here is a pure function
 * of `(network, board, now)`, so the decisions that matter — when a cliff
 * warning is honest, when a train strands you, what a countdown says with one
 * second left — are tested without a DOM, a TestBed or a fake clock.
 *
 * Three rules are enforced here rather than in the template, because a
 * template is the wrong place to be careful:
 *
 * **The cliff is measured, never assumed.** CLAUDE.md finding 9 was revised:
 * the 45m56s gap before the last train exists towards Aluva at 20 of the 48
 * station/direction pairs and nowhere at all towards Tripunithura, where every
 * final gap is 15-16 minutes. An earlier revision claimed it mirrored. So the
 * warning fires on {@link CLIFF_SECONDS} against the gap the engine actually
 * measured, and a hardcoded direction appears nowhere. Overstating uncertainty
 * breaks the honesty rules exactly as badly as understating it.
 *
 * **The last train and the last train home are different trains.** CLAUDE.md
 * finding 9 gives Kalamassery as the example: the 12:01 AM terminates at
 * Muttom, one station on, and the last train that reaches Aluva left 51
 * minutes earlier. Measured across the feed it is not an example, it is the
 * rule — the final departure towards Aluva terminates at Muttom at **all 20**
 * stations from Kalamassery to Tripunithura, and at the four northernmost
 * stations towards Tripunithura as well. At MG Road the advertised last train
 * is 11:44 PM and the last one that reaches Aluva is 10:52 PM, 52 minutes
 * earlier and *before* the 10:58 PM that finding 9's table calls the
 * second-to-last. So `lastThrough` leads the panel whenever it differs, and
 * the short-turn train is reported as the later, shorter option it is.
 *
 * **Short turns are labelled on every row**, not only on the last one. 20 of
 * 450 trips terminate early (finding 10) and a departure board has none of the
 * accidental protection an A-to-B search has.
 */

import type { Direction, NetworkData, Stop } from '../core/data/network.types';
import { istDateOf, sameCivilDate, type Instant } from '../core/engine/civil-time';
import { formatClock, waitMinutes } from '../core/engine/clock';
import type { Departure, DepartureBoard, LastTrainReport } from '../core/engine/departures';
import { localWait } from '../core/i18n/format';
import type { AppLocale } from '../core/i18n/locale';

/**
 * A final gap this long or longer is worth warning about.
 *
 * 30 minutes separates the two populations cleanly: towards Aluva the final
 * gap reaches 45m56s at 20 pairs, and towards Tripunithura it is 15-16 minutes
 * everywhere. Nothing in this feed falls between, so no judgement call is
 * being made today — and because the test is against measured data, a future
 * feed that flattens or introduces a cliff changes the warning on its own.
 */
export const CLIFF_SECONDS = 30 * 60;

/**
 * How early the screen starts talking about the last train.
 *
 * The MVP scope says "from ~21:00 the app changes character". Three hours puts
 * that at about 20:45 for MG Road towards Aluva and moves with the timetable
 * instead of against a hardcoded clock time.
 */
export const LAST_TRAIN_WINDOW_SECONDS = 3 * 60 * 60;

/**
 * A wait longer than this can only be across the overnight gap.
 *
 * Service runs 05:00 to 24:03:45, so the shortest possible night is about 4h
 * 56m, and the longest gap inside service is the 45m56s cliff. Four hours
 * therefore separates "later tonight" from "tomorrow" with no overlap. The
 * calendar date is checked as well, so the 12:01 AM train — tonight's train,
 * on tomorrow's date — is never labelled as tomorrow's.
 */
export const NEXT_DAY_SECONDS = 4 * 60 * 60;

/** Names shown before the served list is elided. */
const SERVES_PREVIEW = 3;

export interface DepartureRow {
  readonly key: string;
  /** "Due", "6 min", "1 h 12 min". Rounded down — see `clock.ts`. */
  readonly countdown: string;
  /** "11:44 PM". Correct across midnight: 24:01 is 12:01 AM, not 12:01 PM. */
  readonly clock: string;
  /** Where this train actually finishes. */
  readonly terminusName: string;
  /** True for the 20 trips that stop short of the end of the line. */
  readonly shortTurn: boolean;
  /** The end of the line this train does not reach. Null unless it short-turns. */
  readonly missesName: string | null;
  /** True when this departure is across the overnight gap. */
  readonly nextDay: boolean;
  /** True when this is the final departure of the service day. */
  readonly isLast: boolean;
}

export interface CliffView {
  /** Whole minutes of the gap. 45 at the pairs that have one. */
  readonly minutes: number;
  /** The departure you actually want to catch. */
  readonly previousClock: string;
  /** Whether that one has already gone. */
  readonly previousGone: boolean;
}

export interface ThroughView {
  /** The last departure that runs the whole line in this direction. */
  readonly clock: string;
  /** "22 min" until it leaves. "Due" once it is leaving. */
  readonly remaining: string;
  readonly gone: boolean;
  readonly terminusName: string;
}

export interface LastTrainView {
  readonly clock: string;
  /** "1 h 20 min" until it leaves. */
  readonly remaining: string;
  /** True when the next train on the board is the last one. */
  readonly isNext: boolean;
  /** Where the last train ends. Not always the end of the line. */
  readonly terminusName: string;
  readonly shortTurn: boolean;
  /** Present only where the data shows a gap worth warning about. */
  readonly cliff: CliffView | null;
  /** Present only when the last train does not reach the end of the line. */
  readonly through: ThroughView | null;
}

export interface NudgeView {
  readonly nextMinutes: number;
  /** The penalty for missing it. This is the number that changes behaviour. */
  readonly gapMinutes: number;
}

export interface BoardView {
  readonly direction: Direction;
  /** "Aluva" / "Tripunithura" — read from the end of the line, never hardcoded. */
  readonly towardsName: string;
  /** "Kaloor, Town Hall, MG Road" — the plain-language answer to "which platform". */
  readonly servesPreview: string;
  /** Every station this platform serves, in travel order. */
  readonly servesAll: readonly string[];
  /** How many are hidden behind the preview. 0 when the preview is the whole list. */
  readonly servesMore: number;
  readonly rows: readonly DepartureRow[];
  readonly nudge: NudgeView | null;
  readonly lastTrain: LastTrainView | null;
}

/** Stations this platform serves from `stop`, in travel order. */
export function servedStations(
  network: NetworkData,
  stop: Stop,
  direction: Direction,
  locale: AppLocale = 'en',
): readonly string[] {
  const step = direction === 0 ? 1 : -1;
  const names: string[] = [];
  for (let i = stop.index + step; i >= 0 && i < network.stops.length; i += step) {
    names.push(network.stops[i].name[locale]);
  }
  return names;
}

function isNextDay(departure: Departure, now: Instant): boolean {
  return (
    departure.waitSeconds > NEXT_DAY_SECONDS &&
    !sameCivilDate(istDateOf(departure.at), istDateOf(now))
  );
}

function rowFor(
  departure: Departure,
  now: Instant,
  endOfLine: Stop,
  last: LastTrainReport | null,
  locale: AppLocale,
): DepartureRow {
  return {
    key: `${departure.tripId}:${departure.time}`,
    countdown: localWait(departure.waitSeconds, locale),
    clock: formatClock(departure.time),
    terminusName: departure.terminus.name[locale],
    shortTurn: departure.shortTurn,
    missesName: departure.shortTurn ? endOfLine.name[locale] : null,
    nextDay: isNextDay(departure, now),
    isLast: last !== null && last.departure.tripId === departure.tripId,
  };
}

/**
 * The last-train panel, or `null` when it is not yet the right time for one.
 *
 * Also `null` once the last train has gone: by then the board is showing
 * tomorrow morning's first train, which is the useful answer, and a panel
 * about a train that has already left is not.
 */
export function lastTrainView(
  report: LastTrainReport | null,
  next: Departure | null,
  locale: AppLocale = 'en',
): LastTrainView | null {
  if (report === null || report.departed) return null;
  if (report.remainingSeconds > LAST_TRAIN_WINDOW_SECONDS) return null;

  const { departure, previous, gapBeforeSeconds, lastThrough } = report;

  const cliff: CliffView | null =
    previous !== null && gapBeforeSeconds !== null && gapBeforeSeconds >= CLIFF_SECONDS
      ? {
          minutes: Math.floor(gapBeforeSeconds / 60),
          previousClock: formatClock(previous.time),
          previousGone: previous.waitSeconds <= 0,
        }
      : null;

  const through: ThroughView | null =
    departure.shortTurn && lastThrough !== null && lastThrough.tripId !== departure.tripId
      ? {
          clock: formatClock(lastThrough.time),
          remaining: localWait(lastThrough.waitSeconds, locale),
          gone: lastThrough.waitSeconds <= 0,
          terminusName: lastThrough.terminus.name[locale],
        }
      : null;

  return {
    clock: formatClock(departure.time),
    remaining: localWait(report.remainingSeconds, locale),
    isNext: next !== null && next.tripId === departure.tripId,
    terminusName: departure.terminus.name[locale],
    shortTurn: departure.shortTurn,
    cliff,
    through,
  };
}

/** Everything one platform needs to render. */
export function boardView(
  network: NetworkData,
  board: DepartureBoard,
  now: Instant,
  rowLimit = 2,
  locale: AppLocale = 'en',
): BoardView {
  const servesAll = servedStations(network, board.stop, board.direction, locale);
  const preview = servesAll.slice(0, SERVES_PREVIEW);
  const rows = board.departures
    .slice(0, rowLimit)
    .map((departure) => rowFor(departure, now, board.towards, board.lastTrain, locale));

  return {
    direction: board.direction,
    towardsName: board.towards.name[locale],
    servesPreview: preview.join(', '),
    servesAll,
    servesMore: Math.max(0, servesAll.length - preview.length),
    rows,
    nudge:
      board.nudge === null
        ? null
        : {
            nextMinutes: waitMinutes(board.nudge.next.waitSeconds),
            gapMinutes: Math.floor(board.nudge.gapSeconds / 60),
          },
    lastTrain: lastTrainView(board.lastTrain, board.next, locale),
  };
}
