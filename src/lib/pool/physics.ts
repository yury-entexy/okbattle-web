/**
 * Pool table physics: a top-down 2D model with a fixed time step.
 *
 * Every client simulates a shot from the same state and the same shot, so the code only uses
 * + − × ÷ and Math.sqrt (which IEEE 754 rounds exactly): no Math.sin/cos/hypot, whose results may
 * differ between browsers. The same shot then gives the same table on every device.
 *
 * Units are millimetres and seconds. The table is portrait: x across (0…W), y along (0…L); a
 * compact bar-table size, so the balls read well on a phone.
 */

export const W = 1000;
export const L = 2000;
export const R = 28.6;
const D = 2 * R;

/** Simulation step and how often a frame is recorded for playback. */
const DT = 1 / 1000;
const FRAME_EVERY = 16;
/** Rolling friction (mm/s²) and drag (1/s): a full-power shot runs for about 6 s. */
const ROLL = 260;
const DRAG = 0.42;
const BALL_E = 0.95;
const RAIL_E = 0.78;
const STOP = 6;
export const MAX_SPEED = 6400;
/** A shot never runs longer than this, as a guard. */
const MAX_STEPS = 30_000;

export interface Ball {
  /** 0 is the cue ball, 8 the black, 1–7 solids, 9–15 stripes. */
  n: number;
  x: number;
  y: number;
  /** Pocketed. */
  down?: boolean;
}

export interface Vec {
  x: number;
  y: number;
}

/** Pockets: corners and the middle of the long rails; a ball whose centre gets within `r` drops. */
export const POCKETS: Array<Vec & { r: number }> = [
  { x: -0.35 * R, y: -0.35 * R, r: 2.1 * R },
  { x: W + 0.35 * R, y: -0.35 * R, r: 2.1 * R },
  { x: -1.15 * R, y: L / 2, r: 1.65 * R },
  { x: W + 1.15 * R, y: L / 2, r: 1.65 * R },
  { x: -0.35 * R, y: L + 0.35 * R, r: 2.1 * R },
  { x: W + 0.35 * R, y: L + 0.35 * R, r: 2.1 * R },
];

/** Where the pocket opening is, for aiming: a point just inside the jaws. */
export const POCKET_AIMS: Vec[] = [
  { x: 0.6 * R, y: 0.6 * R },
  { x: W - 0.6 * R, y: 0.6 * R },
  { x: 0, y: L / 2 },
  { x: W, y: L / 2 },
  { x: 0.6 * R, y: L - 0.6 * R },
  { x: W - 0.6 * R, y: L - 0.6 * R },
];

const CORNER_GAP = 3.1 * R;
const SIDE_GAP = 1.9 * R;

/** Cushion noses as segments between the pockets. Their ends act as rounded knuckles. */
export const RAILS: Array<[Vec, Vec]> = [
  [{ x: CORNER_GAP, y: 0 }, { x: W - CORNER_GAP, y: 0 }],
  [{ x: CORNER_GAP, y: L }, { x: W - CORNER_GAP, y: L }],
  [{ x: 0, y: CORNER_GAP }, { x: 0, y: L / 2 - SIDE_GAP }],
  [{ x: 0, y: L / 2 + SIDE_GAP }, { x: 0, y: L - CORNER_GAP }],
  [{ x: W, y: CORNER_GAP }, { x: W, y: L / 2 - SIDE_GAP }],
  [{ x: W, y: L / 2 + SIDE_GAP }, { x: W, y: L - CORNER_GAP }],
  // Jaws: short angled cushions leading into each pocket.
  [{ x: CORNER_GAP, y: 0 }, { x: CORNER_GAP - 1.3 * R, y: -1.3 * R }],
  [{ x: 0, y: CORNER_GAP }, { x: -1.3 * R, y: CORNER_GAP - 1.3 * R }],
  [{ x: W - CORNER_GAP, y: 0 }, { x: W - CORNER_GAP + 1.3 * R, y: -1.3 * R }],
  [{ x: W, y: CORNER_GAP }, { x: W + 1.3 * R, y: CORNER_GAP - 1.3 * R }],
  [{ x: CORNER_GAP, y: L }, { x: CORNER_GAP - 1.3 * R, y: L + 1.3 * R }],
  [{ x: 0, y: L - CORNER_GAP }, { x: -1.3 * R, y: L - CORNER_GAP + 1.3 * R }],
  [{ x: W - CORNER_GAP, y: L }, { x: W - CORNER_GAP + 1.3 * R, y: L + 1.3 * R }],
  [{ x: W, y: L - CORNER_GAP }, { x: W + 1.3 * R, y: L - CORNER_GAP + 1.3 * R }],
  [{ x: 0, y: L / 2 - SIDE_GAP }, { x: -1.2 * R, y: L / 2 - SIDE_GAP + 0.5 * R }],
  [{ x: 0, y: L / 2 + SIDE_GAP }, { x: -1.2 * R, y: L / 2 + SIDE_GAP - 0.5 * R }],
  [{ x: W, y: L / 2 - SIDE_GAP }, { x: W + 1.2 * R, y: L / 2 - SIDE_GAP + 0.5 * R }],
  [{ x: W, y: L / 2 + SIDE_GAP }, { x: W + 1.2 * R, y: L / 2 + SIDE_GAP - 0.5 * R }],
];

/** The head string (the breaker's end is y > HEAD) and the foot spot where the rack's apex sits. */
export const HEAD = L * 0.75;
export const FOOT_SPOT: Vec = { x: W / 2, y: L * 0.25 };
export const BREAK_SPOT: Vec = { x: W / 2, y: L * 0.8 };

export interface Shot {
  /** Aim as a unit vector, so every client starts from the same numbers. */
  dx: number;
  dy: number;
  /** 0…1 of MAX_SPEED. */
  power: number;
}

export type ShotEvent =
  | { t: number; kind: 'ball'; a: number; b: number; speed: number }
  | { t: number; kind: 'rail'; ball: number; speed: number }
  | { t: number; kind: 'pocket'; ball: number };

export interface ShotResult {
  balls: Ball[];
  /** First ball the cue ball touched, or null. */
  firstHit: number | null;
  /** Pocketed in this shot, in order. */
  pocketed: number[];
  /** Some ball touched a cushion after the cue ball's first contact. */
  railAfterHit: boolean;
  /** Ball positions every FRAME_EVERY steps, for playback: frames[i][k] = [x, y, down]. */
  frames: Array<Array<[number, number, number]>>;
  events: ShotEvent[];
  /** Seconds per frame. */
  frameDt: number;
}

export function normalize(x: number, y: number): Vec {
  const len = Math.sqrt(x * x + y * y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: -1 };
}

/** Closest point to p on segment ab. */
function closest(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Runs one shot to the end. `record` keeps frames for playback (off for the bot's trial shots). */
export function simulate(start: Ball[], shot: Shot, record = true): ShotResult {
  const balls = start.map((b) => ({ ...b }));
  const n = balls.length;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const cue = balls.findIndex((b) => b.n === 0);
  const speed0 = Math.max(0, Math.min(1, shot.power)) * MAX_SPEED;
  const dir = normalize(shot.dx, shot.dy);
  vx[cue] = dir.x * speed0;
  vy[cue] = dir.y * speed0;

  let firstHit: number | null = null;
  let railAfterHit = false;
  const pocketed: number[] = [];
  const events: ShotEvent[] = [];
  const frames: ShotResult['frames'] = [];
  const snap = () => frames.push(balls.map((b) => [b.x, b.y, b.down ? 1 : 0]));
  if (record) snap();

  let step = 0;
  for (; step < MAX_STEPS; step++) {
    const t = step * DT;
    let moving = false;
    // Move and slow down.
    for (let i = 0; i < n; i++) {
      if (balls[i].down) continue;
      const sx = vx[i];
      const sy = vy[i];
      if (sx === 0 && sy === 0) continue;
      const sp = Math.sqrt(sx * sx + sy * sy);
      const next = sp - (ROLL + DRAG * sp) * DT;
      if (next <= STOP) {
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      moving = true;
      vx[i] = (sx / sp) * next;
      vy[i] = (sy / sp) * next;
      balls[i].x += vx[i] * DT;
      balls[i].y += vy[i] * DT;
    }
    if (!moving) break;

    // Ball against ball.
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (a.down) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (b.down) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx > D || dx < -D || dy > D || dy < -D) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D * D || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        // Push apart, then exchange the speed along the line of centres if they close in.
        const push = (D - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
        if (rel <= 0) continue;
        const k = ((1 + BALL_E) / 2) * rel;
        vx[i] -= k * nx;
        vy[i] -= k * ny;
        vx[j] += k * nx;
        vy[j] += k * ny;
        if (firstHit === null && (a.n === 0 || b.n === 0)) firstHit = a.n === 0 ? b.n : a.n;
        events.push({ t, kind: 'ball', a: a.n, b: b.n, speed: rel });
      }
    }

    // Cushions and pockets.
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.down) continue;
      // Only balls near the edge can touch a cushion or drop.
      if (b.x > 2 * R && b.x < W - 2 * R && b.y > 2 * R && b.y < L - 2 * R) continue;
      for (const [a, c] of RAILS) {
        const q = closest(b, a, c);
        const dx = b.x - q.x;
        const dy = b.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        b.x = q.x + nx * R;
        b.y = q.y + ny * R;
        const vn = vx[i] * nx + vy[i] * ny;
        if (vn >= 0) continue;
        vx[i] -= (1 + RAIL_E) * vn * nx;
        vy[i] -= (1 + RAIL_E) * vn * ny;
        if (firstHit !== null) railAfterHit = true;
        events.push({ t, kind: 'rail', ball: b.n, speed: -vn });
      }
      let dropped = false;
      for (const p of POCKETS) {
        const px = b.x - p.x;
        const py = b.y - p.y;
        if (px * px + py * py < p.r * p.r) {
          dropped = true;
          break;
        }
      }
      // Over the lip: the cushions hold a ball's centre a radius off the edge everywhere but in a
      // pocket mouth, so a centre past that line has nothing under it and goes down.
      const lip = R - 1;
      if (!dropped && (b.x < lip || b.x > W - lip || b.y < lip || b.y > L - lip)) dropped = true;
      if (dropped) {
        b.down = true;
        vx[i] = 0;
        vy[i] = 0;
        pocketed.push(b.n);
        events.push({ t, kind: 'pocket', ball: b.n });
      }
    }

    if (record && step % FRAME_EVERY === FRAME_EVERY - 1) snap();
  }
  if (record) snap();
  return { balls, firstHit, pocketed, railAfterHit, frames, events, frameDt: FRAME_EVERY * DT };
}

/** The standard 8-ball rack: apex on the foot spot, the 8 in the middle, a solid and a stripe in the back corners. */
export function rack(shuffle: () => number = Math.random): Ball[] {
  const others = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  // Back corners: one of each group.
  const solid = others.findIndex((x) => x < 8);
  const backLeft = others.splice(solid, 1)[0];
  const stripe = others.findIndex((x) => x > 8);
  const backRight = others.splice(stripe, 1)[0];
  const order: number[] = [];
  let k = 0;
  // Rows from the apex (row 0) to the back row (row 4); the 8 is the middle of row 2.
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      if (row === 2 && i === 1) order.push(8);
      else if (row === 4 && i === 0) order.push(backLeft);
      else if (row === 4 && i === 4) order.push(backRight);
      else order.push(others[k++]);
    }
  }
  const balls: Ball[] = [{ n: 0, x: BREAK_SPOT.x, y: BREAK_SPOT.y }];
  // A hair of space between balls, so the rack is not one rigid block.
  const gap = D + 0.2;
  const rowStep = gap * 0.8660254037844386;
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({ n: order[idx++], x: FOOT_SPOT.x + (i - row / 2) * gap, y: FOOT_SPOT.y - row * rowStep });
    }
  }
  return balls;
}

/** Whether the cue ball may be placed at p: on the cloth and not touching another ball. */
export function canPlace(balls: Ball[], p: Vec, kitchen = false): boolean {
  if (p.x < R || p.x > W - R || p.y < R || p.y > L - R) return false;
  if (kitchen && p.y < HEAD) return false;
  return balls.every((b) => b.n === 0 || b.down || (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) >= D * D);
}

/** The nearest free spot to p (for a dragged cue ball or a re-spotted 8). */
export function freeSpot(balls: Ball[], p: Vec, kitchen = false): Vec {
  const clamp = (v: Vec): Vec => ({
    x: Math.min(W - R, Math.max(R, v.x)),
    y: Math.min(L - R, Math.max(kitchen ? HEAD : R, v.y)),
  });
  const start = clamp(p);
  if (canPlace(balls, start, kitchen)) return start;
  for (let ring = 1; ring < 40; ring++) {
    for (let k = 0; k < 16; k++) {
      // Fixed directions (no trig), so every client finds the same spot.
      const dirs = [[1, 0], [0.924, 0.383], [0.707, 0.707], [0.383, 0.924], [0, 1], [-0.383, 0.924], [-0.707, 0.707], [-0.924, 0.383],
        [-1, 0], [-0.924, -0.383], [-0.707, -0.707], [-0.383, -0.924], [0, -1], [0.383, -0.924], [0.707, -0.707], [0.924, -0.383]];
      const q = clamp({ x: start.x + dirs[k][0] * ring * R * 0.5, y: start.y + dirs[k][1] * ring * R * 0.5 });
      if (canPlace(balls, q, kitchen)) return q;
    }
  }
  return start;
}

/** Where a ray from p along unit dir first meets a ball (its centre at contact) or a cushion. */
export function castAim(balls: Ball[], from: Vec, dir: Vec, skip = 0): { ball: Ball | null; at: Vec; dist: number } {
  let best = Infinity;
  let hit: Ball | null = null;
  for (const b of balls) {
    if (b.down || b.n === skip) continue;
    const ox = b.x - from.x;
    const oy = b.y - from.y;
    const along = ox * dir.x + oy * dir.y;
    if (along <= 0) continue;
    const perp2 = ox * ox + oy * oy - along * along;
    if (perp2 >= D * D) continue;
    const t = along - Math.sqrt(D * D - perp2);
    if (t < best) {
      best = t;
      hit = b;
    }
  }
  // Cushion lines, inset by the radius.
  const walls: number[] = [];
  if (dir.x > 0) walls.push((W - R - from.x) / dir.x);
  if (dir.x < 0) walls.push((R - from.x) / dir.x);
  if (dir.y > 0) walls.push((L - R - from.y) / dir.y);
  if (dir.y < 0) walls.push((R - from.y) / dir.y);
  const wall = Math.max(0, Math.min(...walls));
  if (wall < best) {
    best = wall;
    hit = null;
  }
  return { ball: hit, at: { x: from.x + dir.x * best, y: from.y + dir.y * best }, dist: best };
}
