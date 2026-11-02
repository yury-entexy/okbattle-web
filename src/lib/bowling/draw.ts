import { BALL_R, GUTTER, HEAD_PIN, LANE_HALF, PIN_SPOTS, PIT, WALL, type Ball, type Pin } from './physics';

/**
 * Draws the lane in perspective from behind the bowler. A camera sits `h` metres above the lane
 * at distance `z` along it; the view follows the ball down to the pins.
 */
export interface Camera {
  z: number;
  /** Screen size in CSS pixels. */
  w: number;
  hgt: number;
}

const BACK = 2.0; // camera distance behind its point of interest
const HORIZON = 0.1; // share of the height above the lane's end

function lens(cam: Camera) {
  // Fit the lane's front edge to ~88% of the width and the near point to the bottom.
  const F = (cam.w * 0.88 * BACK) / (2 * LANE_HALF);
  const hy = cam.hgt * HORIZON;
  const hF = (cam.hgt * 0.94 - hy) * BACK; // camera height × F
  return { F, hy, hF };
}

/** Lane point (x, y) at height z → screen; null behind the camera. */
export function project(cam: Camera, x: number, y: number, z = 0): { sx: number; sy: number; s: number } | null {
  const { F, hy, hF } = lens(cam);
  const dz = y - (cam.z - BACK);
  if (dz < 0.2) return null;
  const s = F / dz;
  return { sx: cam.w / 2 + x * s, sy: hy + hF / dz - z * s, s };
}

/** Lane metres per screen pixel across the lane at distance y. */
export function metresPerPixel(cam: Camera, y: number): number {
  const p = project(cam, 0, y);
  return p ? 1 / p.s : 0.01;
}

/** Where the camera looks when the ball is at `ballY` (rolling), clamped before the pins. */
export function followZ(ballY: number): number {
  return Math.min(Math.max(0.6, ballY - 1.0), HEAD_PIN - 1.7);
}

function quad(ctx: CanvasRenderingContext2D, cam: Camera, x1: number, x2: number, y1: number, y2: number, fill: string | CanvasGradient) {
  const a = project(cam, x1, y1);
  const b = project(cam, x2, y1);
  const c = project(cam, x2, y2);
  const d = project(cam, x1, y2);
  if (!a || !b || !c || !d) return;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.lineTo(c.sx, c.sy);
  ctx.lineTo(d.sx, d.sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, cam: Camera, x1: number, y1: number, x2: number, y2: number) {
  const a = project(cam, x1, y1);
  const b = project(cam, x2, y2);
  if (!a || !b) return;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
}

function drawLane(ctx: CanvasRenderingContext2D, cam: Camera) {
  const { w, hgt } = cam;
  const near = Math.max(-1.5, cam.z - BACK + 0.25);
  const end = PIT + 0.6;
  const top = project(cam, 0, end)!.sy;

  // The alley around the lane: the app's dark blue, lighter towards the pins.
  const bg = ctx.createLinearGradient(0, 0, 0, hgt);
  bg.addColorStop(0, '#1a385a');
  bg.addColorStop(1, '#284d79');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, hgt);

  // Masking panel hanging over the pin deck, with the app's yellow stripe.
  const mTop = project(cam, 0, end, 1.25);
  const mBot = project(cam, 0, end, 0.55);
  if (mTop && mBot) {
    const l = project(cam, -WALL - 0.3, end)!;
    const r = project(cam, WALL + 0.3, end)!;
    const hgt = mBot.sy - mTop.sy;
    ctx.fillStyle = '#0f243c';
    ctx.fillRect(l.sx, mTop.sy, r.sx - l.sx, hgt);
    ctx.fillStyle = '#facd62';
    ctx.fillRect(l.sx, mBot.sy - hgt * 0.1, r.sx - l.sx, Math.max(1, hgt * 0.06));
    ctx.font = `700 ${Math.max(6, hgt * 0.36)}px Evolventa, system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OK Battle', w / 2, mTop.sy + hgt * 0.45);
    // The dark pit and back wall behind the pins.
    ctx.fillStyle = '#0b1a2b';
    ctx.fillRect(l.sx, mBot.sy, r.sx - l.sx, top - mBot.sy);
  }

  // Kickback walls and gutters.
  quad(ctx, cam, -WALL - 0.08, -WALL, near, end, '#5e9ad5');
  quad(ctx, cam, WALL, WALL + 0.08, near, end, '#5e9ad5');
  const gutter = '#9fb0c2';
  quad(ctx, cam, -WALL, -LANE_HALF, near, end, gutter);
  quad(ctx, cam, LANE_HALF, WALL, near, end, gutter);
  ctx.strokeStyle = 'rgba(40,77,121,0.35)';
  ctx.lineWidth = 1;
  line(ctx, cam, -LANE_HALF - GUTTER / 2, near, -LANE_HALF - GUTTER / 2, PIT);
  line(ctx, cam, LANE_HALF + GUTTER / 2, near, LANE_HALF + GUTTER / 2, PIT);

  // Maple boards.
  const a = project(cam, 0, near)!;
  const wood = ctx.createLinearGradient(0, a.sy, 0, top);
  wood.addColorStop(0, '#f2cf98');
  wood.addColorStop(1, '#d9a25e');
  quad(ctx, cam, -LANE_HALF, LANE_HALF, near, PIT, wood);
  // The pit behind the deck.
  quad(ctx, cam, -WALL, WALL, PIT, end, '#0b1a2b');

  ctx.strokeStyle = 'rgba(150, 95, 40, 0.18)';
  ctx.lineWidth = 1;
  const boards = 39;
  const bw = (2 * LANE_HALF) / boards;
  for (let i = 1; i < boards; i++) {
    const x = -LANE_HALF + i * bw;
    line(ctx, cam, x, near, x, PIT);
  }
  // Approach / lane joint, foul line, dots and arrows.
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = Math.max(1.5, (project(cam, 0, 0)?.s ?? 0) * 0.012);
  line(ctx, cam, -LANE_HALF, 0, LANE_HALF, 0);
  ctx.fillStyle = 'rgba(60, 40, 20, 0.55)';
  for (let k = -3; k <= 3; k++) {
    const x = k * 5 * bw;
    // Dots at 7 ft.
    const d = project(cam, x, 2.13);
    if (d) {
      ctx.beginPath();
      ctx.ellipse(d.sx, d.sy, d.s * 0.012, d.s * 0.006, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Arrows in a shallow V, 12–16 ft.
    const y = 3.66 + Math.abs(k) * 0.3;
    const tip = project(cam, x, y + 0.18);
    const l = project(cam, x - bw * 0.45, y);
    const r = project(cam, x + bw * 0.45, y);
    if (tip && l && r) {
      ctx.beginPath();
      ctx.moveTo(tip.sx, tip.sy);
      ctx.lineTo(l.sx, l.sy);
      ctx.lineTo(r.sx, r.sy);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Pin spots on the deck.
  ctx.fillStyle = 'rgba(120, 70, 30, 0.35)';
  for (const [x, y] of PIN_SPOTS) {
    const p = project(cam, x, y);
    if (!p) continue;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, p.s * 0.03, p.s * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Half-profile of a pin: [height, radius] in metres.
const PROFILE: Array<[number, number]> = [
  [0, 0.026], [0.03, 0.045], [0.1, 0.06], [0.16, 0.055], [0.22, 0.03], [0.255, 0.023], [0.3, 0.03], [0.34, 0.032], [0.37, 0.022], [0.381, 0],
];

function drawStandingPin(ctx: CanvasRenderingContext2D, cam: Camera, p: Pin) {
  const base = project(cam, p.x, p.y);
  if (!base) return;
  const s = base.s;
  // Shadow.
  ctx.fillStyle = 'rgba(40, 20, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(base.sx, base.sy, 0.07 * s, 0.025 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base.sx - PROFILE[0][1] * s, base.sy);
  for (const [h, r] of PROFILE) ctx.lineTo(base.sx - r * s, base.sy - h * s);
  for (let i = PROFILE.length - 1; i >= 0; i--) ctx.lineTo(base.sx + PROFILE[i][1] * s, base.sy - PROFILE[i][0] * s);
  ctx.closePath();
  const g = ctx.createLinearGradient(base.sx - 0.06 * s, 0, base.sx + 0.06 * s, 0);
  g.addColorStop(0, '#d9dee5');
  g.addColorStop(0.35, '#ffffff');
  g.addColorStop(1, '#bfc7d1');
  ctx.fillStyle = g;
  ctx.fill();
  if (s > 25) {
    ctx.strokeStyle = 'rgba(40, 77, 121, 0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  // Two red neck stripes.
  ctx.fillStyle = '#e53935';
  for (const [h0, h1] of [[0.232, 0.245], [0.262, 0.275]]) {
    ctx.fillRect(base.sx - 0.026 * s, base.sy - h1 * s, 0.052 * s, Math.max(0.6, (h1 - h0) * s));
  }
}

function drawLyingPin(ctx: CanvasRenderingContext2D, cam: Camera, p: Pin) {
  const dx = Math.cos(p.rot) * 0.19;
  const dy = Math.sin(p.rot) * 0.19;
  const a = project(cam, p.x - dx, p.y - dy, 0.05);
  const b = project(cam, p.x + dx, p.y + dy, 0.05);
  const c = project(cam, p.x, p.y, 0.05);
  if (!a || !b || !c) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40, 20, 0, 0.2)';
  ctx.lineWidth = 0.11 * c.s;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy + 0.04 * c.s);
  ctx.lineTo(b.sx, b.sy + 0.04 * c.s);
  ctx.stroke();
  ctx.strokeStyle = '#f4f6f8';
  ctx.lineWidth = 0.1 * c.s;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
  // The neck stripe, two thirds of the way to the head.
  const nx = a.sx + (b.sx - a.sx) * 0.68;
  const ny = a.sy + (b.sy - a.sy) * 0.68;
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 0.05 * c.s;
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + (b.sx - a.sx) * 0.06, ny + (b.sy - a.sy) * 0.06);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawBall(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball) {
  const z = ball.gutter ? BALL_R * 0.4 : BALL_R;
  const c = project(cam, ball.x, ball.y, z);
  const g0 = project(cam, ball.x, ball.y);
  if (!c || !g0) return;
  const r = BALL_R * c.s;
  ctx.fillStyle = 'rgba(30, 10, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(g0.sx, g0.sy, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(c.sx - r * 0.35, c.sy - r * 0.4, r * 0.1, c.sx, c.sy, r);
  g.addColorStop(0, '#ff8a80');
  g.addColorStop(0.35, '#e53935');
  g.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
  ctx.fill();
  // Finger holes turn with the roll and hide behind the ball.
  const phase = (ball.roll / (2 * Math.PI * BALL_R)) % 1;
  const v = Math.cos(phase * Math.PI * 2);
  if (v > 0) {
    const hy = c.sy + Math.sin(phase * Math.PI * 2) * r * 0.55;
    ctx.fillStyle = 'rgba(40, 0, 0, 0.75)';
    for (const [ox, oy, rr] of [[-0.22, -0.1, 0.11], [0.22, -0.1, 0.11], [0, 0.25, 0.13]]) {
      ctx.beginPath();
      ctx.ellipse(c.sx + ox * r, hy + oy * r * v, rr * r, rr * r * v, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The aim guide: a dotted path from the ball in the swipe's direction. */
export function drawAim(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, angle: number) {
  ctx.fillStyle = 'rgba(40, 77, 121, 0.85)';
  for (let d = 1; d < 14; d += 0.8) {
    const p = project(cam, x + Math.sin(angle) * d, y + Math.cos(angle) * d, 0.01);
    if (!p) continue;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, Math.max(1.2, 0.025 * p.s), Math.max(0.8, 0.012 * p.s), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball | null, pins: Pin[]) {
  drawLane(ctx, cam);
  const items: Array<{ y: number; draw(): void }> = [];
  for (const p of pins) {
    if (p.state === 'gone') continue;
    items.push({ y: p.y, draw: () => (p.state === 'standing' ? drawStandingPin(ctx, cam, p) : drawLyingPin(ctx, cam, p)) });
  }
  if (ball && !ball.gone) items.push({ y: ball.y, draw: () => drawBall(ctx, cam, ball) });
  items.sort((a, b) => b.y - a.y);
  for (const it of items) it.draw();
}
