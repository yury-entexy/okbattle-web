import { FRAMES, PINS, frameDone, pinsReset, score, type Frame } from './score';

/** One local game of ten frames: the visitor and bots take their frames in turn. */

export interface Bowler {
  id: string;
  name: string;
  avatar: string;
  bot: boolean;
  /** 0–1, bots only: how close their throws land to what they aimed for. */
  skill: number;
  frames: Frame[];
}

export interface GameState {
  bowlers: Bowler[];
  /** Whose turn it is. */
  turn: number;
  /** 0-based frame being played. */
  frame: number;
  standing: boolean[];
  over: boolean;
}

export const allPins = () => new Array<boolean>(PINS).fill(true);

export function newGame(bowlers: Array<Omit<Bowler, 'frames'>>): GameState {
  return { bowlers: bowlers.map((b) => ({ ...b, frames: [] })), turn: 0, frame: 0, standing: allPins(), over: false };
}

export interface RollResult {
  state: GameState;
  /** Pins this roll knocked down. */
  pins: number;
  strike: boolean;
  spare: boolean;
  /** The roll ended the bowler's frame (the next roll is someone else's or a new frame). */
  frameOver: boolean;
}

/** Apply a roll: `down` marks pins that fell (only standing pins count). */
export function roll(state: GameState, down: boolean[]): RollResult {
  if (state.over) return { state, pins: 0, strike: false, spare: false, frameOver: false };
  const fell = state.standing.map((s, i) => s && !!down[i]);
  const pins = fell.filter(Boolean).length;
  const bowlers = state.bowlers.map((b) => ({ ...b, frames: b.frames.map((f) => [...f]) }));
  const me = bowlers[state.turn];
  const frame = (me.frames[state.frame] ??= []);
  const first = state.standing.every(Boolean);
  frame.push(pins);
  const strike = first && pins === PINS;
  const spare = !first && pins > 0 && state.standing.filter(Boolean).length === pins;

  if (!frameDone(frame, state.frame)) {
    const standing = pinsReset(frame, state.frame) ? allPins() : state.standing.map((s, i) => s && !fell[i]);
    return { state: { ...state, bowlers, standing }, pins, strike, spare, frameOver: false };
  }
  let turn = state.turn + 1;
  let f = state.frame;
  if (turn >= bowlers.length) {
    turn = 0;
    f += 1;
  }
  const over = f >= FRAMES;
  return {
    state: { bowlers, turn: over ? state.turn : turn, frame: over ? FRAMES - 1 : f, standing: allPins(), over },
    pins, strike, spare, frameOver: true,
  };
}

/** Places by final score; equal scores share a place. */
export function standings(state: GameState): Array<{ bowler: Bowler; score: number; place: number }> {
  const list = state.bowlers.map((bowler) => ({ bowler, score: score(bowler.frames) })).sort((a, b) => b.score - a.score);
  return list.map((x) => ({ ...x, place: list.findIndex((y) => y.score === x.score) + 1 }));
}
