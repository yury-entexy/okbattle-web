/**
 * A top-down simulation of one roll, in metres and seconds. x runs across the lane (0 is the
 * middle, right is positive), y runs from the foul line towards the pins. It is deterministic:
 * the same throw on the same pins always ends the same way, which the bot and tests rely on.
 */

export const LANE_HALF = 0.527; // 41.5 in wide
export const GUTTER = 0.235; // each gutter's width
export const WALL = LANE_HALF + GUTTER; // kickback walls
export const HEAD_PIN = 18.29; // foul line to the head pin
export const PIT = HEAD_PIN + 1.0; // past the pin deck: pins and the ball drop out
export const BALL_R = 0.108;
/** Where the ball leaves the bowler's hand, just past the foul line. */
export const RELEASE_Y = 0.9;
export const PIN_R = 0.06;
export const PIN_LYING_R = 0.075;
const BALL_M = 6.8;
const PIN_M = 1.53;
/** Where the oil ends and the ball starts to hook. */
const OIL_END = 11.5;
/** Lateral pull at full spin on dry boards. */
const HOOK = 1.25;
const BALL_DECEL = 0.25;
const PIN_DECEL = 4.5;
/** Pins tip over when a hit moves them faster than this. */
const TOPPLE = 0.45;
const RESTITUTION = 0.45;

const ROW = 0.2638; // 12 in × √3 / 2
const COL = 0.1524; // half the 12 in spacing
/** Pin spots 1–10, front to back, left to right. */
export const PIN_SPOTS: Array<[number, number]> = [
  [0, HEAD_PIN],
  [-COL, HEAD_PIN + ROW], [COL, HEAD_PIN + ROW],
  [-2 * COL, HEAD_PIN + 2 * ROW], [0, HEAD_PIN + 2 * ROW], [2 * COL, HEAD_PIN + 2 * ROW],
  [-3 * COL, HEAD_PIN + 3 * ROW], [-COL, HEAD_PIN + 3 * ROW], [COL, HEAD_PIN + 3 * ROW], [3 * COL, HEAD_PIN + 3 * ROW],
];

export interface Throw {
  /** Release point across the lane. */
  x: number;
  /** Direction in radians from straight down the lane; positive goes right. */
  angle: number;
  /** Release speed, m/s (about 5–9.5). */
  speed: number;
  /** −1…1: how hard the ball hooks once it leaves the oil; positive hooks right. */
  spin: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Pin extends Body {
  n: number; // 1–10
  /** standing, falling over and sliding, or gone into the pit/gutter. */
  state: 'standing' | 'down' | 'gone';
  /** Lying direction, for drawing. */
  rot: number;
  spinRate: number;
}

export interface Ball extends Body {
  spin: number;
  gutter: boolean;
  gone: boolean;
  roll: number; // distance rolled, for drawing the ball's rotation
}

export interface Sim {
  t: number;
  ball: Ball;
  pins: Pin[];
  /** Pins that were standing before this roll. */
  before: boolean[];
  /** Collisions so far, ball–pin and pin–pin, for sound. */
  hits: number;
  done: boolean;
}

export const MIN_SPEED = 4.5;
export const MAX_SPEED = 9.5;
export const MAX_ANGLE = 0.06;
const START_LIMIT = LANE_HALF - BALL_R;

export function clampThrow(t: Throw): Throw {
  const c = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : 0));
  return {
    x: c(t.x, -START_LIMIT, START_LIMIT),
    angle: c(t.angle, -MAX_ANGLE, MAX_ANGLE),
    speed: c(t.speed, MIN_SPEED, MAX_SPEED),
    spin: c(t.spin, -1, 1),
  };
}

export function start(standing: boolean[], raw: Throw): Sim {
  const t = clampThrow(raw);
  return {
    t: 0,
    ball: {
      x: t.x, y: RELEASE_Y, vx: Math.sin(t.angle) * t.speed, vy: Math.cos(t.angle) * t.speed,
      spin: t.spin, gutter: false, gone: false, roll: 0,
    },
    pins: PIN_SPOTS.map(([x, y], i) => ({
      n: i + 1, x, y, vx: 0, vy: 0, state: standing[i] ? 'standing' : 'gone', rot: 0, spinRate: 0,
    })),
    before: [...standing],
    hits: 0,
    done: false,
  };
}

function slow(b: Body, decel: number, dt: number) {
  const v = Math.hypot(b.vx, b.vy);
  if (v === 0) return;
  const nv = Math.max(0, v - decel * dt);
  b.vx *= nv / v;
  b.vy *= nv / v;
}

/** Bounce two circles apart; a standing pin that is hit hard enough falls. Returns true on contact. */
function collide(a: Body, ma: number, ra: number, b: Body, mb: number, rb: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= ra + rb || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  // Push them apart in proportion to mass, so they never sink into each other.
  const overlap = ra + rb - d;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rel <= 0) return true;
  const j = ((1 + RESTITUTION) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx;
  b.vy += (j / mb) * ny;
  return true;
}

function knock(p: Pin) {
  p.state = 'down';
  p.rot = Math.atan2(p.vy, p.vx);
  p.spinRate = (Math.hypot(p.vx, p.vy) * (p.n % 2 ? 4 : -4));
}

const STEP = 1 / 600;
const MAX_T = 8;

/** Advance the roll by `dt` seconds. */
export function step(sim: Sim, dt: number) {
  const n = Math.max(1, Math.round(dt / STEP));
  for (let i = 0; i < n && !sim.done; i++) tick(sim, STEP);
}

function tick(sim: Sim, dt: number) {
  sim.t += dt;
  const { ball, pins } = sim;

  if (!ball.gone) {
    if (!ball.gutter && ball.y > OIL_END && ball.y < HEAD_PIN + 0.3) {
      const dry = Math.min(1, (ball.y - OIL_END) / 3);
      // Hook grows on the dry boards and with a slower ball.
      ball.vx += ball.spin * HOOK * dry * (7.5 / Math.max(4, ball.vy)) * dt;
    }
    slow(ball, BALL_DECEL, dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.roll += Math.hypot(ball.vx, ball.vy) * dt;
    if (!ball.gutter && Math.abs(ball.x) > LANE_HALF) {
      // Off the lane: it drops into the gutter and rolls straight past the pins.
      ball.gutter = true;
      ball.x = Math.sign(ball.x) * (LANE_HALF + GUTTER / 2);
      ball.vx = 0;
      ball.spin = 0;
    }
    if (ball.y > PIT || ball.vy <= 0.05) ball.gone = true;
  }

  for (const p of pins) {
    if (p.state !== 'down') continue;
    slow(p, PIN_DECEL, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spinRate * dt;
    p.spinRate *= 1 - 2 * dt;
    // Kickback walls send pins back across the deck.
    if (Math.abs(p.x) > WALL - PIN_LYING_R) {
      p.x = Math.sign(p.x) * (WALL - PIN_LYING_R);
      p.vx = -p.vx * 0.3;
    }
    if (p.y > PIT + 0.3 || p.y < HEAD_PIN - 1.5) p.state = 'gone';
  }

  // Ball against pins.
  if (!ball.gone && !ball.gutter && ball.y > HEAD_PIN - 0.5) {
    for (const p of pins) {
      if (p.state === 'gone') continue;
      const r = p.state === 'standing' ? PIN_R : PIN_LYING_R;
      if (collide(ball, BALL_M, BALL_R, p, PIN_M, r)) {
        sim.hits++;
        if (p.state === 'standing') {
          if (Math.hypot(p.vx, p.vy) > TOPPLE) knock(p);
          else { p.vx = 0; p.vy = 0; p.x = PIN_SPOTS[p.n - 1][0]; p.y = PIN_SPOTS[p.n - 1][1]; }
        }
      }
    }
  }

  // Pins against pins: only a moving pin can knock another.
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i];
    if (a.state === 'gone') continue;
    for (let j = i + 1; j < pins.length; j++) {
      const b = pins[j];
      if (b.state === 'gone') continue;
      if (a.state === 'standing' && b.state === 'standing') continue;
      const ra = a.state === 'standing' ? PIN_R : PIN_LYING_R;
      const rb = b.state === 'standing' ? PIN_R : PIN_LYING_R;
      const sa = { x: a.x, y: a.y };
      const sb = { x: b.x, y: b.y };
      if (!collide(a, PIN_M, ra, b, PIN_M, rb)) continue;
      sim.hits++;
      for (const [p, s] of [[a, sa], [b, sb]] as const) {
        if (p.state !== 'standing') continue;
        if (Math.hypot(p.vx, p.vy) > TOPPLE) knock(p);
        else { p.vx = 0; p.vy = 0; p.x = s.x; p.y = s.y; }
      }
    }
  }

  const moving = pins.some((p) => p.state === 'down' && Math.hypot(p.vx, p.vy) > 0.02);
  if ((ball.gone && !moving) || sim.t > MAX_T) sim.done = true;
}

/** Run a roll to the end. */
export function simulate(standing: boolean[], t: Throw): Sim {
  const sim = start(standing, t);
  while (!sim.done) tick(sim, STEP);
  return sim;
}

/** Which of the pins standing before the roll went down. */
export function knocked(sim: Sim): boolean[] {
  return sim.pins.map((p, i) => sim.before[i] && p.state !== 'standing');
}

export const count = (mask: boolean[]) => mask.filter(Boolean).length;

/**
 * Where an un-obstructed ball crosses the head-pin line; the bot uses it to aim. Rolls only the
 * ball, without pins.
 */
export function crossing(t: Throw): { x: number; gutter: boolean } {
  const sim = start(new Array(10).fill(false), t);
  while (!sim.ball.gone && sim.ball.y < HEAD_PIN) tick(sim, STEP * 4);
  return { x: sim.ball.x, gutter: sim.ball.gutter };
}
