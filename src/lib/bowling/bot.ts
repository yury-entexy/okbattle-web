import { BALL_R, LANE_HALF, MAX_ANGLE, PIN_SPOTS, crossing, type Throw } from './physics';

/** A deterministic random source for tests; the game passes Math.random. */
export type Rand = () => number;

/** Roughly normal noise with standard deviation 1. */
function gauss(rand: Rand): number {
  return (rand() + rand() + rand() + rand() - 2) * Math.sqrt(3);
}

/** The release angle that sends this ball across the head-pin line at `target`. */
export function aimAt(target: number, base: Omit<Throw, 'angle'>): number {
  let lo = -MAX_ANGLE;
  let hi = MAX_ANGLE;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (crossing({ ...base, angle: mid }).x < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The bot's throw. A full rack: a hooking ball into the pocket (between pins 1 and 3 for a
 * right-hander). Spares: straight at the middle of the front-most pins still standing.
 */
export function botThrow(standing: boolean[], skill: number, rand: Rand = Math.random): Throw {
  const full = standing.every(Boolean);
  const left = rand() < 0.3; // some bots bowl left-handed
  let base: Omit<Throw, 'angle'>;
  let target: number;
  if (full) {
    const hand = left ? -1 : 1;
    base = { x: hand * (0.18 + rand() * 0.12), speed: 7 + rand() * 1.5, spin: -hand * (0.5 + rand() * 0.4) };
    target = hand * 0.065;
  } else {
    const up = PIN_SPOTS.map(([x, y], i) => ({ x, y, up: standing[i] })).filter((p) => p.up);
    const front = Math.min(...up.map((p) => p.y));
    const near = up.filter((p) => p.y < front + 0.3);
    target = near.reduce((s, p) => s + p.x, 0) / Math.max(1, near.length);
    base = { x: Math.max(-0.35, Math.min(0.35, -target * 0.8)), speed: 7.5 + rand(), spin: 0 };
  }
  target = Math.max(-LANE_HALF + BALL_R, Math.min(LANE_HALF - BALL_R, target));
  // Misses grow as skill drops: about ±2 cm at the pins at skill 1, ±14 cm at 0.5, ±30 cm at 0.1.
  const miss = 0.02 + Math.pow(1 - skill, 1.5) * 0.35;
  const angle = aimAt(target + gauss(rand) * miss, base);
  return { ...base, angle, speed: base.speed + gauss(rand) * 0.3 * (1 - skill) };
}
