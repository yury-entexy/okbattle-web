import { FOOT_SPOT, L, POCKET_AIMS, R, W, canPlace, normalize, type Ball, type Shot, type Vec } from './physics';
import { playShot, targets, type PoolState } from './rules';

/**
 * The bot picks a shot like a player does: for each ball it may hit and each pocket it finds the
 * ghost-ball aim, keeps the shots with clear lines, tries them on a copy of the table and plays the
 * best one with a small hand tremor. With nothing to pot it plays a safe hit on its own ball.
 */

export interface BotShot {
  shot: Shot;
  place: Vec | null;
}

export interface BotLevel {
  /** Aim error, radians (one standard deviation). */
  aim: number;
  /** How many pot candidates it tries. */
  tries: number;
}

export const BOT_NORMAL: BotLevel = { aim: 0.018, tries: 8 };

const D = 2 * R;
const dist = (a: Vec, b: Vec) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

/** True if no ball (other than those skipped) lies within a ball's width of the segment ab. */
function clear(balls: Ball[], a: Vec, b: Vec, skip: number[]): boolean {
  const len = dist(a, b);
  if (len === 0) return true;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  for (const o of balls) {
    if (o.down || skip.includes(o.n)) continue;
    const ox = o.x - a.x;
    const oy = o.y - a.y;
    const t = ox * ux + oy * uy;
    if (t < 0 || t > len) continue;
    const perp = Math.abs(ox * uy - oy * ux);
    if (perp < D * 0.98) return false;
  }
  return true;
}

function gauss(): number {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function tremble(shot: Shot, level: BotLevel): Shot {
  const e = gauss() * level.aim;
  const d = normalize(shot.dx - shot.dy * e, shot.dy + shot.dx * e);
  const power = Math.min(1, Math.max(0.05, shot.power * (1 + gauss() * 0.04)));
  return { dx: d.x, dy: d.y, power };
}

interface Candidate extends BotShot {
  ease: number;
}

/** Pot attempts from a cue position: ghost-ball aim, both lines clear, a cut the bot can make. */
function pots(state: PoolState, cue: Vec, allowed: number[]): Candidate[] {
  const out: Candidate[] = [];
  for (const n of allowed) {
    const t = state.balls.find((b) => b.n === n && !b.down);
    if (!t) continue;
    for (const p of POCKET_AIMS) {
      const u = normalize(p.x - t.x, p.y - t.y);
      const ghost = { x: t.x - u.x * D, y: t.y - u.y * D };
      const d = normalize(ghost.x - cue.x, ghost.y - cue.y);
      const cut = d.x * u.x + d.y * u.y;
      if (cut < 0.25) continue;
      if (!clear(state.balls, cue, ghost, [0, n]) || !clear(state.balls, t, p, [0, n])) continue;
      const a = dist(cue, ghost);
      const b = dist(t, p);
      // Thin cuts and long shots need more pace and are harder.
      const power = Math.min(1, 0.16 + (a * 0.35 + b) / (2.1 * L * Math.max(0.45, cut)));
      out.push({ shot: { dx: d.x, dy: d.y, power }, place: null, ease: cut * cut / (1 + (a + b) / (0.6 * L)) });
    }
  }
  return out.sort((x, y) => y.ease - x.ease);
}

function score(state: PoolState, shot: BotShot): number {
  const seat = state.turn;
  const { next } = playShot(state, shot.shot, shot.place, false);
  if (next.over) return next.winner === seat ? 10_000 : -10_000;
  let s = 0;
  if (next.last?.foul) s -= 300;
  if (next.turn === seat) s += 200;
  const g = next.groups[seat];
  if (g) s -= next.balls.filter((b) => !b.down && (b.n >= 9 ? 'stripe' : b.n >= 1 && b.n <= 7 ? 'solid' : '') === g).length * 15;
  // Prefer leaving the cue ball away from the cushions.
  const cue = next.balls.find((b) => b.n === 0)!;
  const edge = Math.min(cue.x, W - cue.x, cue.y, L - cue.y);
  if (edge < 2 * R) s -= 20;
  return s;
}

const pause = () => new Promise((r) => setTimeout(r, 0));

/** Chooses the bot's shot. Async so the page stays smooth while it tries shots on a copy of the table. */
export async function botShot(state: PoolState, level: BotLevel = BOT_NORMAL): Promise<BotShot> {
  const cueBall = state.balls.find((b) => b.n === 0)!;

  if (state.breakShot) {
    const d = normalize(FOOT_SPOT.x - cueBall.x + gauss() * 6, FOOT_SPOT.y - cueBall.y);
    return { shot: { dx: d.x, dy: d.y, power: 0.95 }, place: state.ballInHand ? { x: cueBall.x, y: cueBall.y } : null };
  }

  const allowed = targets(state);
  const candidates: Candidate[] = [];

  if (state.ballInHand) {
    // Put the cue ball straight behind a pottable ball, a little way back.
    for (const n of allowed) {
      const t = state.balls.find((b) => b.n === n && !b.down);
      if (!t) continue;
      for (const p of POCKET_AIMS) {
        const u = normalize(p.x - t.x, p.y - t.y);
        if (!clear(state.balls, t, p, [0, n])) continue;
        for (const back of [5, 9]) {
          const spot = { x: t.x - u.x * D * back / 2, y: t.y - u.y * D * back / 2 };
          if (!canPlace(state.balls, spot)) continue;
          const c = pots(state, spot, [n]).find((x) => Math.abs(x.shot.dx - u.x) < 0.05 && Math.abs(x.shot.dy - u.y) < 0.05);
          if (c) candidates.push({ ...c, place: spot });
        }
      }
    }
    candidates.sort((x, y) => y.ease - x.ease);
  } else {
    candidates.push(...pots(state, cueBall, allowed));
  }

  const tried: Array<{ shot: BotShot; s: number }> = [];
  const place = state.ballInHand ? { x: cueBall.x, y: cueBall.y } : null;
  for (const c of candidates.slice(0, level.tries)) {
    for (const k of [1, 1.35]) {
      const shot: BotShot = { shot: { ...c.shot, power: Math.min(1, c.shot.power * k) }, place: c.place ?? place };
      // A shot that only works when aimed perfectly is a bad bet: also try it slightly off.
      const off = (sign: number): BotShot => {
        const e = sign * level.aim * 1.5;
        const d = normalize(shot.shot.dx - shot.shot.dy * e, shot.shot.dy + shot.shot.dx * e);
        return { ...shot, shot: { ...shot.shot, dx: d.x, dy: d.y } };
      };
      tried.push({ shot, s: Math.min(score(state, shot), score(state, off(1)), score(state, off(-1))) + c.ease * 50 });
    }
    await pause();
  }

  // Safe hits: straight at each allowed ball, softly.
  const from = state.ballInHand ? place! : cueBall;
  for (const n of allowed) {
    const t = state.balls.find((b) => b.n === n && !b.down)!;
    if (!clear(state.balls, from, t, [0, n])) continue;
    const d = normalize(t.x - from.x, t.y - from.y);
    for (const power of [0.3, 0.5]) {
      const shot: BotShot = { shot: { dx: d.x, dy: d.y, power }, place };
      tried.push({ shot, s: score(state, shot) - 60 });
    }
    if (tried.length > 40) break;
  }
  await pause();

  tried.sort((a, b) => b.s - a.s);
  // Nothing clean (every line blocked): try a fan of directions, cushion first, and keep the least bad.
  if (!tried.length || tried[0].s < -250) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * 2 * Math.PI;
      for (const power of [0.35, 0.6]) {
        const shot: BotShot = { shot: { dx: Math.cos(a), dy: Math.sin(a), power }, place };
        tried.push({ shot, s: score(state, shot) - 80 });
      }
      if (k % 8 === 7) await pause();
    }
    tried.sort((a, b) => b.s - a.s);
  }
  const best = tried[0].shot;
  return { shot: tremble(best.shot, level), place: best.place };
}
