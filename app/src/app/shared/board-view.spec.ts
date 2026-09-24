/**
 * The home screen's judgement calls, tested without a DOM.
 *
 * Two of these are censuses rather than examples, because the corresponding
 * claims in CLAUDE.md are about populations and an example would not catch a
 * regression that reintroduced a hardcoded direction:
 *
 *   - the cliff warning must appear at exactly the 20 station/direction pairs
 *     with a long final gap, and at none of the 24 towards Tripunithura;
 *   - the last departure towards Aluva terminates at Muttom at every one of
 *     those 20, so the through-train warning is the rule and not a Kalamassery
 *     special case.
 */

import { createMetroEngine, type MetroEngine } from '../core/engine/metro-engine';
import { payloadIgnoringCertainty } from '../core/engine/service-day';
import { at, loadNetwork, VOUCHED_2026 } from '../core/engine/testing/network';
import type { Direction } from '../core/data/network.types';
import { boardView, CLIFF_SECONDS, servedStations, type BoardView } from './board-view';

const network = loadNetwork();
const engine: MetroEngine = createMetroEngine(network, { holidays: VOUCHED_2026 });

const TUESDAY = '2026-09-22';

function view(stop: string, direction: Direction, instant: number, rows = 2): BoardView {
  const board = payloadIgnoringCertainty(engine.board(stop, direction, instant, rows));
  return boardView(network, board, instant, rows);
}

describe('platform, in plain language', () => {
  it('lists the stations each direction actually serves', () => {
    const towardsTripunithura = servedStations(network, engine.stop('MGRD'), 0);
    const towardsAluva = servedStations(network, engine.stop('MGRD'), 1);

    expect(towardsTripunithura[0]).toBe('Maharajas College');
    expect(towardsTripunithura.at(-1)).toBe('Tripunithura');
    expect(towardsAluva[0]).toBe('Town Hall');
    expect(towardsAluva.at(-1)).toBe('Aluva');
    // 25 stations, MG Road at index 14: 10 one way, 14 the other.
    expect(towardsTripunithura).toHaveLength(10);
    expect(towardsAluva).toHaveLength(14);
  });

  it('previews three names and counts the rest, rather than printing 24', () => {
    const board = view('MGRD', 1, at(TUESDAY, 12, 0));
    expect(board.servesPreview).toBe('Town Hall, Kaloor, JLN Stadium');
    expect(board.servesMore).toBe(11);
    expect(board.towardsName).toBe('Aluva');
  });
});

describe('short-turn labelling', () => {
  it('labels a departure that stops short of the end of the line', () => {
    // 22:36 from Aluva towards Tripunithura terminates at Muttom, the depot.
    const board = view('ALVA', 0, at(TUESDAY, 22, 30));
    const shortTurn = board.rows.find((row) => row.shortTurn);
    expect(shortTurn).toBeDefined();
    expect(shortTurn?.terminusName).toBe('Muttom');
    expect(shortTurn?.missesName).toBe('Tripunithura');
  });

  it('leaves a full-line departure unlabelled', () => {
    const board = view('MGRD', 1, at(TUESDAY, 12, 0));
    expect(board.rows.every((row) => !row.shortTurn)).toBe(true);
    expect(board.rows.every((row) => row.missesName === null)).toBe(true);
  });
});

describe('the last-train cliff', () => {
  it('warns towards Aluva at MG Road, where the gap is 45m56s', () => {
    const board = view('MGRD', 1, at(TUESDAY, 22, 30));
    expect(board.lastTrain?.cliff).toEqual({
      minutes: 45,
      previousClock: '10:58 PM',
      previousGone: false,
    });
  });

  it('does not warn towards Tripunithura, where the final gap is 15 minutes', () => {
    const board = view('MGRD', 0, at(TUESDAY, 22, 30));
    expect(board.lastTrain).not.toBeNull();
    expect(board.lastTrain?.cliff).toBeNull();
  });

  it('fires at exactly the 20 pairs with a long final gap, all towards Aluva', () => {
    // Late enough that every pair's last train is inside the panel's window,
    // and early enough that none of them has left.
    const instant = at(TUESDAY, 22, 30);
    const withCliff: string[] = [];
    let boardable = 0;
    let worstTowardsTripunithura = 0;

    for (const stop of network.stops) {
      for (const direction of [0, 1] as const) {
        const board = payloadIgnoringCertainty(engine.board(stop, direction, instant, 2));
        if (board.lastTrain === null) continue;
        boardable++;
        const gap = board.lastTrain.gapBeforeSeconds ?? 0;
        if (direction === 0) worstTowardsTripunithura = Math.max(worstTowardsTripunithura, gap);
        if (boardView(network, board, instant).lastTrain?.cliff !== null) {
          withCliff.push(`${stop.id}:${direction}`);
        }
      }
    }

    // 48 boardable pairs: 25 x 2 less the two termini in the direction they
    // cannot be boarded for.
    expect(boardable).toBe(48);
    expect(withCliff).toHaveLength(20);
    expect(withCliff.every((pair) => pair.endsWith(':1'))).toBe(true);
    expect(withCliff[0]).toBe('KLMT:1');
    expect(withCliff.at(-1)).toBe('TPHT:1');
    // Nothing southbound comes close to the threshold, so the 30-minute line
    // is not a judgement call against this feed.
    expect(worstTowardsTripunithura).toBeLessThan(CLIFF_SECONDS);
  });

  it('stays quiet in the middle of the day', () => {
    const board = view('MGRD', 1, at(TUESDAY, 12, 0));
    expect(board.lastTrain).toBeNull();
  });
});

describe('the last train that actually gets you home', () => {
  it('leads with the through train where the last train short-turns', () => {
    // CLAUDE.md finding 9's example. The 12:01 AM runs one station to Muttom.
    const board = view('KLMT', 1, at(TUESDAY, 22, 30));
    expect(board.lastTrain?.clock).toBe('12:01 AM');
    expect(board.lastTrain?.terminusName).toBe('Muttom');
    expect(board.lastTrain?.shortTurn).toBe(true);
    expect(board.lastTrain?.through).toEqual({
      clock: '11:10 PM',
      remaining: '40 min',
      gone: false,
      terminusName: 'Aluva',
    });
  });

  it('is the rule, not a Kalamassery special case', () => {
    // At every station with a cliff, the final departure towards Aluva
    // terminates at Muttom and a through train left earlier. At MG Road that
    // through train is the 10:52 PM — before the 10:58 PM that finding 9's
    // table calls the second-to-last.
    const instant = at(TUESDAY, 22, 30);
    let stranding = 0;
    for (const stop of network.stops) {
      const board = payloadIgnoringCertainty(engine.board(stop, 1, instant, 2));
      const last = boardView(network, board, instant).lastTrain;
      if (last === null) continue;
      if (last.cliff === null) continue;
      expect(last.shortTurn).toBe(true);
      expect(last.through).not.toBeNull();
      stranding++;
    }
    expect(stranding).toBe(20);
    expect(view('MGRD', 1, instant).lastTrain?.through?.clock).toBe('10:52 PM');
  });

  it('says so plainly once the through train has gone', () => {
    const board = view('MGRD', 1, at(TUESDAY, 23, 0));
    expect(board.lastTrain?.through?.gone).toBe(true);
    expect(board.lastTrain?.through?.clock).toBe('10:52 PM');
    expect(board.lastTrain?.clock).toBe('11:44 PM');
  });
});

describe('the run nudge', () => {
  it('fires when the next is due and the following is a real wait away', () => {
    // 06:04 at MG Road towards Aluva: next inside two minutes, then 20.
    const board = view('MGRD', 1, at(TUESDAY, 6, 4));
    expect(board.nudge).toEqual({ nextMinutes: 1, gapMinutes: 20 });
  });

  it('stays silent when missing the next one costs nothing', () => {
    const board = view('MGRD', 1, at(TUESDAY, 12, 0));
    expect(board.nudge).toBeNull();
  });
});

describe('countdowns', () => {
  it('rounds a wait down, and reads "Due" only once the train is leaving', () => {
    // 1 min 44 s to the 6:05 reads "1 min", never "2 min": rounding up is how
    // someone misses a train a countdown told them they would catch.
    expect(view('MGRD', 1, at(TUESDAY, 6, 4)).rows[0].countdown).toBe('1 min');
    expect(view('MGRD', 1, at(TUESDAY, 6, 5)).rows[0].countdown).toBe('Due');
  });

  it('renders the after-midnight train as 12:01 AM, not 12:01 PM', () => {
    const board = view('KLMT', 1, at(TUESDAY, 23, 59));
    expect(board.rows[0].clock).toBe('12:01 AM');
    // Tonight's train, on tomorrow's date. Not "tomorrow".
    expect(board.rows[0].nextDay).toBe(false);
  });

  it('marks a departure across the overnight gap as tomorrow', () => {
    // Aluva's last southbound train is 10:51 PM, so at 23:00 the next one is
    // the following morning's — a different calendar date and hours away.
    const board = view('ALVA', 0, at(TUESDAY, 23, 0));
    expect(board.rows[0].nextDay).toBe(true);
  });
});
