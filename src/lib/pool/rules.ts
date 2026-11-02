import { BREAK_SPOT, FOOT_SPOT, freeSpot, rack, simulate, type Ball, type Shot, type ShotResult, type Vec } from './physics';

/**
 * 8-ball pool rules as pure functions (close to the WPA rules, simplified for casual play):
 * - the table is open after the break; the first ball a player legally pockets decides their group;
 * - a player keeps shooting while they pocket their own balls without a foul;
 * - fouls (cue ball pocketed, no ball hit, the wrong ball hit first, no cushion after contact) give
 *   the opponent the cue ball in hand anywhere on the table;
 * - the 8 wins once a player's group is cleared; pocketing it earlier, or with a foul, loses;
 *   an 8 pocketed on the break comes back to the foot spot.
 * Pockets are not called.
 */

export type Group = 'solid' | 'stripe';

export interface PoolState {
  balls: Ball[];
  /** Player ids; seat 0 breaks. */
  players: [string, string];
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  /** The shooter may place the cue ball anywhere first. */
  ballInHand: boolean;
  breakShot: boolean;
  /** Counts shots; a shot is played on the state with the same seq. */
  seq: number;
  over: boolean;
  winner: 0 | 1 | null;
  /** What the last shot did, for the status line. */
  last?: { by: 0 | 1; pocketed: number[]; foul?: string; note: string };
}

export const groupOf = (n: number): Group | null => (n >= 1 && n <= 7 ? 'solid' : n >= 9 ? 'stripe' : null);
export const GROUP_NAMES: Record<Group, string> = { solid: 'сплошные', stripe: 'полосатые' };

export function newGame(players: [string, string], shuffle: () => number = Math.random): PoolState {
  return { balls: rack(shuffle), players, turn: 0, groups: [null, null], ballInHand: false, breakShot: true, seq: 0, over: false, winner: null };
}

/** Balls of a group still on the table. */
export function left(state: PoolState, group: Group): number[] {
  return state.balls.filter((b) => !b.down && groupOf(b.n) === group).map((b) => b.n);
}

/** Which balls the shooter may hit first: their group, the 8 once it is cleared, any but the 8 on an open table. */
export function targets(state: PoolState, seat: 0 | 1 = state.turn): number[] {
  const g = state.groups[seat];
  const onTable = state.balls.filter((b) => !b.down && b.n !== 0).map((b) => b.n);
  if (state.breakShot) return onTable;
  if (!g) return onTable.filter((n) => n !== 8);
  const own = left(state, g);
  return own.length ? own : [8];
}

export interface Played {
  next: PoolState;
  result: ShotResult;
  /** Where the cue ball was put when it was in hand. */
  placed: Vec | null;
}

/** Plays a shot on the state: places the cue ball if in hand, runs the physics, applies the rules. */
export function playShot(state: PoolState, shot: Shot, place?: Vec | null, record = true): Played {
  let balls = state.balls.map((b) => ({ ...b }));
  let placed: Vec | null = null;
  if (state.ballInHand) {
    const cue = balls.find((b) => b.n === 0)!;
    const spot = freeSpot(balls, place ?? { x: cue.x, y: cue.y });
    cue.x = spot.x;
    cue.y = spot.y;
    cue.down = false;
    placed = spot;
  }
  const result = simulate(balls, shot, record);
  balls = result.balls.map((b) => ({ ...b }));
  return { next: judge(state, balls, result), result, placed };
}

function judge(state: PoolState, balls: Ball[], r: ShotResult): PoolState {
  const me = state.turn;
  const other = (1 - me) as 0 | 1;
  const legalFirst = targets(state);
  const onEight = !state.breakShot && legalFirst.length === 1 && legalFirst[0] === 8;
  const objects = r.pocketed.filter((n) => n !== 0);
  const scratch = r.pocketed.includes(0);

  let foul: string | undefined;
  if (scratch) foul = 'биток в лузе';
  else if (r.firstHit === null) foul = 'не задет ни один шар';
  else if (!legalFirst.includes(r.firstHit)) foul = onEight ? 'сначала нужно попасть в восьмёрку' : state.groups[me] ? 'первым задет чужой шар' : 'первой задета восьмёрка';
  else if (!state.breakShot && !objects.length && !r.railAfterHit) foul = 'после касания ни один шар не коснулся борта';

  const next: PoolState = { ...state, balls, seq: state.seq + 1, breakShot: false, ballInHand: false, groups: [...state.groups] as PoolState['groups'] };

  // The 8.
  if (objects.includes(8)) {
    if (state.breakShot) {
      const eight = balls.find((b) => b.n === 8)!;
      const spot = freeSpot(balls.filter((b) => b.n !== 8), FOOT_SPOT);
      Object.assign(eight, { x: spot.x, y: spot.y, down: false });
    } else {
      const win = onEight && !foul;
      next.over = true;
      next.winner = win ? me : other;
      next.last = {
        by: me,
        pocketed: objects,
        foul,
        note: win ? 'Восьмёрка забита после всех своих шаров' : foul ? `Восьмёрка забита с фолом (${foul})` : 'Восьмёрка забита раньше времени',
      };
      return next;
    }
  }

  // Groups are decided by the first ball pocketed on a legal shot after the break.
  if (!state.breakShot && !foul && !state.groups[me]) {
    const first = objects.map(groupOf).find((g): g is Group => !!g);
    if (first) {
      next.groups[me] = first;
      next.groups[other] = first === 'solid' ? 'stripe' : 'solid';
    }
  }

  if (scratch) {
    const cue = balls.find((b) => b.n === 0)!;
    const spot = freeSpot(balls.filter((b) => b.n !== 0), BREAK_SPOT);
    Object.assign(cue, { x: spot.x, y: spot.y, down: false });
  }

  const mine = next.groups[me];
  const scored = state.breakShot
    ? objects.filter((n) => n !== 8).length > 0
    : objects.some((n) => (mine ? groupOf(n) === mine : groupOf(n) !== null));
  const keep = !foul && scored;

  let note: string;
  if (foul) note = `Фол: ${foul}. Шар с руки у соперника`;
  else if (keep && !state.groups[me] && mine) note = `Забит шар — ваши ${GROUP_NAMES[mine]}`;
  else if (keep) note = state.breakShot ? 'Шар забит с разбоя — бьёт снова' : 'Забит — удар ещё раз';
  else note = objects.length ? 'Забит чужой шар — ход переходит' : 'Мимо — ход переходит';

  next.turn = keep ? me : other;
  next.ballInHand = !!foul;
  next.last = { by: me, pocketed: objects, foul, note };
  return next;
}

/** The shooter ran out of time: it counts as a foul. */
export function timeOut(state: PoolState): PoolState {
  const other = (1 - state.turn) as 0 | 1;
  return {
    ...state,
    seq: state.seq + 1,
    turn: other,
    ballInHand: true,
    breakShot: false,
    last: { by: state.turn, pocketed: [], foul: 'время вышло', note: 'Время вышло. Шар с руки у соперника' },
  };
}

/** The player in a seat left: the other wins. */
export function forfeit(state: PoolState, seat: 0 | 1): PoolState {
  const other = (1 - seat) as 0 | 1;
  return { ...state, seq: state.seq + 1, over: true, winner: other, last: { by: seat, pocketed: [], note: 'Игрок вышел из партии' } };
}

/** Firebase drops empty arrays and `false`; this puts the shape back. */
export function normalizeState(raw: PoolState): PoolState {
  return {
    ...raw,
    balls: (raw.balls ?? []).map((b) => ({ n: b.n, x: b.x, y: b.y, down: !!b.down })),
    groups: [raw.groups?.[0] ?? null, raw.groups?.[1] ?? null],
    ballInHand: !!raw.ballInHand,
    breakShot: !!raw.breakShot,
    over: !!raw.over,
    winner: raw.winner ?? null,
    last: raw.last ? { ...raw.last, pocketed: raw.last.pocketed ?? [] } : undefined,
  };
}
