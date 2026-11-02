'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { deadline, poolNow, shooter, usePool, type PoolRoom, type ShotRecord } from '@/lib/pool/store';
import { GROUP_NAMES, groupOf, left, playShot, targets, type PoolState } from '@/lib/pool/rules';
import { HEAD, L, POCKETS, R, W, castAim, canPlace, freeSpot, normalize, type Ball, type ShotResult, type Vec } from '@/lib/pool/physics';
import { poolSound, wakeSound } from '@/lib/pool/sound';
import { Avatar } from './Avatar';
import { ActionButton, AppBar, BlueScreen, CloseIcon, RoundButton } from './ui';

// Ball colours: 1–7 solids, 9–15 the same colours as stripes, 8 black.
const COLORS = ['#ffffff', '#f6c21c', '#1f5fd1', '#e0332b', '#6c3fb5', '#f07c1a', '#16944a', '#8a1f24', '#1a1a1a'];
const colorOf = (n: number) => COLORS[n > 8 ? n - 8 : n];

/** Rail width around the cloth, mm. */
const RAIL = 78;
const TW = W + 2 * RAIL;
const TL = L + 2 * RAIL;

interface Anim {
  result: ShotResult;
  shot: ShotRecord;
  start: number;
  event: number;
  next: number;
}

function drawBall(g: CanvasRenderingContext2D, n: number, x: number, y: number, s: number, alpha = 1) {
  const r = R * s;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(r * 0.18, r * 0.22, r, r, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.clip();
  if (n > 8) {
    g.fillStyle = '#fbfaf4';
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.fillStyle = colorOf(n);
    g.fillRect(-r, -r * 0.55, 2 * r, r * 1.1);
  } else {
    g.fillStyle = n === 0 ? '#fbfaf4' : colorOf(n);
    g.fillRect(-r, -r, 2 * r, 2 * r);
  }
  if (n > 0) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.font = `700 ${Math.max(7, r * 0.62)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 0, r * 0.04);
  }
  // Light from the top left.
  const shade = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = shade;
  g.fillRect(-r, -r, 2 * r, 2 * r);
  g.restore();
}

function drawTable(g: CanvasRenderingContext2D, s: number) {
  // Rails in the app's dark blue, with a wooden edge and yellow sights.
  g.fillStyle = '#1f3d63';
  g.beginPath();
  g.roundRect(0, 0, TW * s, TL * s, 26 * s);
  g.fill();
  g.strokeStyle = '#13294a';
  g.lineWidth = 6 * s;
  g.stroke();
  const cloth = g.createRadialGradient((TW / 2) * s, (TL / 2) * s, 50 * s, (TW / 2) * s, (TL / 2) * s, TL * 0.6 * s);
  cloth.addColorStop(0, '#2c9b5c');
  cloth.addColorStop(1, '#1d7444');
  g.fillStyle = '#16603a';
  g.fillRect((RAIL - 14) * s, (RAIL - 14) * s, (W + 28) * s, (L + 28) * s);
  g.fillStyle = cloth;
  g.fillRect(RAIL * s, RAIL * s, W * s, L * s);
  // Sights.
  g.fillStyle = '#facd62';
  for (let i = 1; i < 4; i++) {
    for (const y of [RAIL / 2, TL - RAIL / 2]) {
      g.beginPath();
      g.arc((RAIL + (W * i) / 4) * s, y * s, 6 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    for (const x of [RAIL / 2, TW - RAIL / 2]) {
      g.beginPath();
      g.arc(x * s, (RAIL + (L * i) / 8) * s, 6 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Head string and foot spot.
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2 * s;
  g.beginPath();
  g.moveTo(RAIL * s, (RAIL + HEAD) * s);
  g.lineTo((RAIL + W) * s, (RAIL + HEAD) * s);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.arc((RAIL + W / 2) * s, (RAIL + L / 4) * s, 5 * s, 0, Math.PI * 2);
  g.fill();
  // Pockets.
  for (const p of POCKETS) {
    g.fillStyle = '#0b0f14';
    g.beginPath();
    g.arc((RAIL + p.x) * s, (RAIL + p.y) * s, (p.r > 2 * R ? 1.95 : 1.75) * R * s, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCue(g: CanvasRenderingContext2D, cue: Vec, dir: Vec, pull: number, s: number) {
  const back = R + 14 + pull * 220;
  const len = 1250;
  const ax = (RAIL + cue.x - dir.x * back) * s;
  const ay = (RAIL + cue.y - dir.y * back) * s;
  const bx = (RAIL + cue.x - dir.x * (back + len)) * s;
  const by = (RAIL + cue.y - dir.y * (back + len)) * s;
  const px = -dir.y;
  const py = dir.x;
  const tip = 5.5 * s;
  const butt = 14 * s;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 8 * s;
  const wood = g.createLinearGradient(ax, ay, bx, by);
  wood.addColorStop(0, '#f3e2c0');
  wood.addColorStop(0.62, '#d9b77e');
  wood.addColorStop(0.63, '#284d79');
  wood.addColorStop(1, '#1a385a');
  g.fillStyle = wood;
  g.beginPath();
  g.moveTo(ax + px * tip, ay + py * tip);
  g.lineTo(bx + px * butt, by + py * butt);
  g.lineTo(bx - px * butt, by - py * butt);
  g.lineTo(ax - px * tip, ay - py * tip);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = '#70a8df';
  g.beginPath();
  g.arc(ax, ay, tip, 0, Math.PI * 2);
  g.fill();
}

function drawGuide(g: CanvasRenderingContext2D, balls: Ball[], cue: Vec, dir: Vec, allowed: number[], s: number) {
  const hit = castAim(balls, cue, dir);
  const X = (v: number) => (RAIL + v) * s;
  g.save();
  g.setLineDash([10 * s, 10 * s]);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(X(cue.x), X(cue.y));
  g.lineTo(X(hit.at.x), X(hit.at.y));
  g.stroke();
  g.setLineDash([]);
  // Ghost ball where the cue ball meets the object ball (or the cushion).
  const bad = hit.ball && !allowed.includes(hit.ball.n);
  g.strokeStyle = bad ? '#fa6b62' : 'rgba(255,255,255,0.9)';
  g.lineWidth = 3 * s;
  g.beginPath();
  g.arc(X(hit.at.x), X(hit.at.y), R * s, 0, Math.PI * 2);
  g.stroke();
  if (hit.ball) {
    if (bad) {
      g.beginPath();
      g.moveTo(X(hit.at.x - R * 0.6), X(hit.at.y - R * 0.6));
      g.lineTo(X(hit.at.x + R * 0.6), X(hit.at.y + R * 0.6));
      g.moveTo(X(hit.at.x + R * 0.6), X(hit.at.y - R * 0.6));
      g.lineTo(X(hit.at.x - R * 0.6), X(hit.at.y + R * 0.6));
      g.stroke();
    } else {
      // Where the object ball goes, and where the cue ball glances off.
      const nrm = normalize(hit.ball.x - hit.at.x, hit.ball.y - hit.at.y);
      const along = dir.x * nrm.x + dir.y * nrm.y;
      const len = 120 + 420 * along;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.moveTo(X(hit.ball.x), X(hit.ball.y));
      g.lineTo(X(hit.ball.x + nrm.x * len), X(hit.ball.y + nrm.y * len));
      g.stroke();
      const tan = normalize(dir.x - nrm.x * along, dir.y - nrm.y * along);
      if (along < 0.999) {
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.beginPath();
        g.moveTo(X(hit.at.x), X(hit.at.y));
        g.lineTo(X(hit.at.x + tan.x * (90 + 260 * (1 - along))), X(hit.at.y + tan.y * (90 + 260 * (1 - along))));
        g.stroke();
      }
    }
  }
  g.restore();
}

function GroupBalls({ state, seat }: { state: PoolState; seat: 0 | 1 }) {
  const g = state.groups[seat];
  if (!g) return <span className="pool-group open">{state.breakShot ? 'разбой' : 'стол открыт'}</span>;
  const on = left(state, g);
  return (
    <span className="pool-group" aria-label={`${GROUP_NAMES[g]}: осталось ${on.length}`}>
      {(on.length ? on : [8]).map((n) => (
        <i key={n} className={n > 8 ? 'stripe' : ''} style={{ ['--c' as string]: colorOf(n) }}>{n}</i>
      ))}
    </span>
  );
}

function Players({ room, state, me, busy }: { room: PoolRoom; state: PoolState; me: string; busy: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const timed = !room.vsBot && !state.over && !busy;
  const leftMs = Math.max(0, deadline(room) - poolNow());
  return (
    <div className="pool-players">
      {state.players.map((id, seat) => {
        const m = room.members[id];
        const turn = !state.over && state.turn === seat;
        return (
          <div key={id} className={`pool-player ${turn ? 'turn' : ''} ${seat === 1 ? 'right' : ''}`}>
            <Avatar name={m?.avatar ?? ''} size={40} />
            <div className="pool-player-info">
              <span className="pool-player-name">{id === me ? 'Вы' : m?.name ?? 'Игрок'}{m?.left ? ' (вышел)' : ''}</span>
              <GroupBalls state={state} seat={seat as 0 | 1} />
            </div>
            {turn && timed && <span className="pool-clock">{Math.ceil(leftMs / 1000)}</span>}
          </div>
        );
      })}
      {(room.wins && Object.keys(room.wins).length > 0) && (
        <span className="pool-score">{room.wins[state.players[0]] ?? 0} : {room.wins[state.players[1]] ?? 0}</span>
      )}
    </div>
  );
}

function Table({ room, me }: { room: PoolRoom; me: string }) {
  const shoot = usePool((s) => s.shoot);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [shown, setShown] = useState<PoolState>(room.state!);
  const shownRef = useRef(shown);
  const roomRef = useRef(room);
  roomRef.current = room;
  const anim = useRef<Anim | null>(null);
  const [animating, setAnimating] = useState(false);
  const [aim, setAim] = useState<Vec>({ x: 0, y: -1 });
  const [power, setPower] = useState(0);
  const [place, setPlace] = useState<Vec | null>(null);
  const drag = useRef<null | 'aim' | 'place'>(null);
  const powerDrag = useRef<{ left: number; width: number } | null>(null);

  const state = shown;
  const myTurn = !animating && !state.over && state.players[state.turn] === me && room.status === 'playing' && room.state?.seq === state.seq;
  const cueBall = state.balls.find((b) => b.n === 0)!;
  const cuePos: Vec = myTurn && state.ballInHand && place ? place : { x: cueBall.x, y: cueBall.y };
  const allowed = useMemo(() => targets(state), [state]);

  // Fit the table into the space between the players bar and the controls.
  useEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = Math.max(260, window.innerHeight - 300);
      setScale(Math.min(w / TW, h / TL));
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  // Each new turn: aim at the nearest ball the player may hit, and put a ball in hand where it is.
  useEffect(() => {
    if (state.over) return;
    const cue = state.balls.find((b) => b.n === 0)!;
    let best: Ball | null = null;
    let bd = Infinity;
    for (const b of state.balls) {
      if (b.down || !allowed.includes(b.n)) continue;
      const d = (b.x - cue.x) * (b.x - cue.x) + (b.y - cue.y) * (b.y - cue.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) setAim(normalize(best.x - cue.x, best.y - cue.y));
    setPlace(state.ballInHand ? freeSpot(state.balls, { x: cue.x, y: cue.y }) : null);
    setPower(0);
  }, [state, allowed]);

  // Show the room's table: replay a new shot from the table we show, or jump to it.
  const sync = useCallback(() => {
    const r = roomRef.current;
    const target = r.state;
    if (!target || anim.current) return;
    const cur = shownRef.current;
    if (target.seq === cur.seq && target.players.join() === cur.players.join() && target.over === cur.over) return;
    if (r.shot && r.shot.seq === cur.seq && target.seq === cur.seq + 1 && target.players.join() === cur.players.join()) {
      const played = playShot(cur, r.shot, r.shot.place ?? null, true);
      // Skip the part of the playback a late joiner already missed.
      const late = Math.max(0, poolNow() - (r.changedAt ?? poolNow()));
      anim.current = { result: played.result, shot: r.shot, start: performance.now() - Math.min(late, 1500), event: 0, next: 0 };
      poolSound.cue(r.shot.power);
      setAnimating(true);
      return;
    }
    shownRef.current = target;
    setShown(target);
  }, []);
  useEffect(sync, [room.state, room.shot, sync]);

  // Drawing loop.
  useEffect(() => {
    let raf = 0;
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = canvas.current!;
      const cw = Math.round(TW * scale * dpr);
      const ch = Math.round(TL * scale * dpr);
      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }
      const s = scale * dpr;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      drawTable(g, s);
      const a = anim.current;
      let balls: Ball[] = shownRef.current.balls;
      if (a) {
        const t = (performance.now() - a.start) / 1000;
        const fi = Math.min(a.result.frames.length - 1, Math.floor(t / a.result.frameDt));
        const f = a.result.frames[fi];
        balls = a.result.balls.map((b, i) => ({ n: b.n, x: f[i][0], y: f[i][1], down: !!f[i][2] }));
        // Sounds as the playback passes them, at most a few per frame.
        let played = 0;
        while (a.event < a.result.events.length && a.result.events[a.event].t <= t) {
          const e = a.result.events[a.event++];
          if (played++ > 3) continue;
          if (e.kind === 'ball') poolSound.ball(e.speed);
          else if (e.kind === 'rail') poolSound.rail(e.speed);
          else poolSound.pocket();
        }
        if (fi >= a.result.frames.length - 1) {
          anim.current = null;
          const target = roomRef.current.state!;
          shownRef.current = target;
          setShown(target);
          setAnimating(false);
          if (target.last?.foul) click('wrongAnswer');
          else if (target.last?.pocketed.length) click('rightAnswer');
          setTimeout(sync, 0);
        }
      }
      for (const b of balls) {
        if (b.down) continue;
        if (b.n === 0 && !a) continue;
        drawBall(g, b.n, (RAIL + b.x) * s, (RAIL + b.y) * s, s);
      }
      if (!a) {
        const st = shownRef.current;
        const r = roomRef.current;
        const mine = !st.over && st.players[st.turn] === me && r.status === 'playing' && r.state?.seq === st.seq;
        const cue = mine && st.ballInHand && placeRef.current ? placeRef.current : balls.find((b) => b.n === 0)!;
        if (mine && st.ballInHand) {
          const ok = canPlace(st.balls, cue);
          g.strokeStyle = ok ? 'rgba(250,205,98,0.95)' : '#fa6b62';
          g.lineWidth = 4 * s;
          g.beginPath();
          g.arc((RAIL + cue.x) * s, (RAIL + cue.y) * s, (R + 14 + 6 * Math.sin(performance.now() / 200)) * s, 0, Math.PI * 2);
          g.stroke();
        }
        if (mine) drawGuide(g, st.balls.map((b) => (b.n === 0 ? { ...b, x: cue.x, y: cue.y } : b)), cue, aimRef.current, targets(st), s);
        drawBall(g, 0, (RAIL + cue.x) * s, (RAIL + cue.y) * s, s);
        if (mine) drawCue(g, cue, aimRef.current, powerRef.current, s);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scale, me, sync]);

  // The drawing loop reads these without re-subscribing.
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const powerRef = useRef(power);
  powerRef.current = power;
  const placeRef = useRef(place);
  placeRef.current = place;

  function toTable(e: React.PointerEvent): Vec {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale - RAIL, y: (e.clientY - rect.top) / scale - RAIL };
  }

  function onDown(e: React.PointerEvent) {
    if (!myTurn) return;
    unlockAudio();
    wakeSound();
    const p = toTable(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    const d = Math.sqrt((p.x - cuePos.x) ** 2 + (p.y - cuePos.y) ** 2);
    if (state.ballInHand && d < R * 4) {
      drag.current = 'place';
    } else {
      drag.current = 'aim';
      if (d > R) setAim(normalize(p.x - cuePos.x, p.y - cuePos.y));
    }
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current || !myTurn) return;
    const p = toTable(e);
    if (drag.current === 'place') {
      setPlace({ x: Math.min(W - R, Math.max(R, p.x)), y: Math.min(L - R, Math.max(R, p.y)) });
    } else {
      const d = Math.sqrt((p.x - cuePos.x) ** 2 + (p.y - cuePos.y) ** 2);
      if (d > R) setAim(normalize(p.x - cuePos.x, p.y - cuePos.y));
    }
  }
  function onUp() {
    if (drag.current === 'place' && place) setPlace(freeSpot(state.balls, place));
    drag.current = null;
  }

  const rotate = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    setAim((a) => normalize(a.x * Math.cos(t) - a.y * Math.sin(t), a.x * Math.sin(t) + a.y * Math.cos(t)));
  };

  function fire(p: number) {
    if (!myTurn || p < 0.03) return;
    unlockAudio();
    wakeSound();
    shoot({ dx: aim.x, dy: aim.y, power: p }, state.ballInHand ? freeSpot(state.balls, cuePos) : null);
  }

  function powerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!myTurn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    powerDrag.current = { left: rect.left, width: rect.width };
    setPower(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  }
  function powerMove(e: React.PointerEvent) {
    const d = powerDrag.current;
    if (!d) return;
    setPower(Math.min(1, Math.max(0, (e.clientX - d.left) / d.width)));
  }
  function powerUp() {
    if (!powerDrag.current) return;
    powerDrag.current = null;
    const p = powerRef.current;
    setPower(0);
    fire(p);
  }

  const who = room.members[state.players[state.turn]];
  const last = state.last;
  const lastMine = !!last && state.players[last.by] === me;
  let said = '';
  if (last?.foul) said = lastMine ? `Фол: ${last.foul}` : `Фол соперника: ${last.foul}`;
  else if (last?.pocketed.length) said = `${last.pocketed.length > 1 ? 'Забиты' : 'Забит'} ${last.pocketed.join(', ')}`;
  else if (last) said = 'Мимо';
  let status: string;
  if (state.over) status = 'Партия окончена';
  else if (animating) status = room.shot?.by === me ? 'Удар!' : `Бьёт ${room.members[room.shot?.by ?? '']?.name ?? 'соперник'}`;
  else if (myTurn) {
    const what = state.breakShot ? 'Ваш разбой' : state.ballInHand ? 'У вас шар с руки: перетащите биток' : 'Ваш удар';
    status = said ? `${said}. ${what}` : what;
  } else status = `${said ? `${said}. ` : ''}Бьёт ${who?.name ?? 'соперник'}…`;

  return (
    <div className="pool">
      <Players room={room} state={state} me={me} busy={animating} />
      <p className={`pool-status ${myTurn ? 'mine' : ''}`} role="status">{status}</p>
      <div className="pool-box" ref={box}>
        <canvas
          ref={canvas}
          className="pool-canvas"
          style={{ width: TW * scale, height: TL * scale }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Бильярдный стол"
        />
      </div>
      <div className={`pool-controls ${myTurn ? '' : 'off'}`}>
        <button type="button" className="pool-nudge" aria-label="Повернуть кий влево" disabled={!myTurn} onClick={() => rotate(-0.4)}>‹</button>
        <div
          className="pool-power"
          role="slider"
          aria-label="Сила удара"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(power * 100)}
          tabIndex={myTurn ? 0 : -1}
          onPointerDown={powerDown}
          onPointerMove={powerMove}
          onPointerUp={powerUp}
          onPointerCancel={() => { powerDrag.current = null; setPower(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setPower((p) => Math.min(1, p + 0.05));
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setPower((p) => Math.max(0, p - 0.05));
            else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const p = power;
              setPower(0);
              fire(p);
            }
          }}
        >
          <div className="pool-power-fill" style={{ width: `${power * 100}%` }} />
          <span>{power > 0 ? `Сила ${Math.round(power * 100)}% · отпустите` : myTurn ? 'Тяните вправо и отпустите' : animating ? 'Шары катятся…' : 'Ждём удара соперника'}</span>
        </div>
        <button type="button" className="pool-nudge" aria-label="Повернуть кий вправо" disabled={!myTurn} onClick={() => rotate(0.4)}>›</button>
      </div>
    </div>
  );
}

function Lobby({ room }: { room: PoolRoom }) {
  const start = usePool((s) => s.start);
  const me = useGame((s) => s.me.id);
  const host = room.hostId === me;
  const [copied, setCopied] = useState(false);
  const people = Object.entries(room.members).filter(([, m]) => !m.left).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';
  const share = () => {
    const text = `Сыграем в бильярд в OK Battle: код комнаты ${room.code}`;
    if (navigator.share) return void navigator.share({ title: 'OK Battle', text, url: link }).catch(() => {});
    navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
  };
  return (
    <>
      <p className="code-label">Код комнаты:</p>
      <div className="code-box">
        <div>
          {room.code}
          <button type="button" aria-label="Поделиться ссылкой" onClick={share}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#284D79" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13 11.0008L21.2 2.80078" /><path d="M21.9992 6.8V2H17.1992" />
              <path d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13" />
            </svg>
          </button>
        </div>
      </div>
      {copied && <p className="copied">Ссылка скопирована</p>}
      <div className="durak-lobby">
        <p className="section-title">За столом: {people.length} из 2</p>
        <div className="await-list">
          {people.map(([id, m]) => (
            <div key={id} className="await-item">
              <Avatar name={m.avatar} size={36} />
              <span>{m.name}</span>
              <small>{id === room.hostId ? 'создатель' : ''}</small>
            </div>
          ))}
        </div>
        <div className="panel"><small className="hint">Пул «восьмёрка»: забейте свои шары — сплошные или полосатые — и последней восьмёрку.</small></div>
        {host ? (
          <ActionButton primary disabled={people.length < 2} onClick={() => { unlockAudio(); click('startGame'); start(); }}>
            {people.length < 2 ? 'Ждём соперника…' : 'Начать игру'}
          </ActionButton>
        ) : (
          <p className="wait-text">Ждём, когда создатель начнёт игру…</p>
        )}
      </div>
    </>
  );
}

function Result({ room, me }: { room: PoolRoom; me: string }) {
  const { start, leave } = usePool();
  const s = room.state!;
  const host = room.hostId === me;
  const winner = s.players[s.winner ?? 0];
  const won = winner === me;
  const playing = s.players.includes(me);
  useEffect(() => click(won ? 'results' : 'wrongAnswer'), [won]);
  const name = (id: string) => (id === me ? 'Вы' : room.members[id]?.name ?? 'Игрок');
  const rival = s.players.find((id) => id !== me);
  const canAgain = host && (room.vsBot || Object.values(room.members).filter((m) => !m.left).length >= 2);
  return (
    <div className="pool-result" role="dialog" aria-label="Итог партии">
      <img src="ui/logo.png" width={64} height={64} alt="" />
      <h2>{playing ? (won ? 'Победа!' : 'Поражение') : `${name(winner)} побеждает`}</h2>
      {s.last && <p className="pool-result-why">{name(s.players[s.last.by])}: {s.last.note.toLowerCase()}</p>}
      {rival && room.wins && <p className="pool-result-score">{name(me)} {room.wins[me] ?? 0} : {room.wins[rival] ?? 0} {name(rival)}</p>}
      {canAgain && <ActionButton primary onClick={() => { click('startGame'); start(); }}>Ещё партию</ActionButton>}
      {!host && <p className="wait-text">Ждём, начнёт ли создатель ещё партию…</p>}
      <ActionButton onClick={leave}>Выйти</ActionButton>
    </div>
  );
}

/** «Бильярд»: lobby, table and the result for one room. */
export function Billiards() {
  const { room, leave, drive } = usePool();
  const me = useGame((s) => s.me.id);
  const host = !!room && room.hostId === me;
  const [rolled, setRolled] = useState(true);

  // The host's device plays for the bot and calls time-outs.
  useEffect(() => {
    if (!host) return;
    const t = setInterval(drive, 200);
    return () => clearInterval(t);
  }, [host, drive]);

  // The result shows once the last shot has rolled out.
  const over = room?.status === 'over';
  useEffect(() => {
    if (!over) return setRolled(false);
    const ms = Math.max(0, (room?.changedAt ?? 0) + (room?.shot?.dur ?? 0) + 600 - poolNow());
    const t = setTimeout(() => setRolled(true), ms);
    return () => clearTimeout(t);
  }, [over, room?.changedAt, room?.shot?.dur]);

  if (!room) return <BlueScreen><p className="wait-text">Подключаемся…</p></BlueScreen>;

  return (
    <BlueScreen className="pool-screen">
      <AppBar
        leading={<RoundButton label="Выйти" onClick={leave}><CloseIcon /></RoundButton>}
        title={room.vsBot ? 'Бильярд · с ботом' : 'Бильярд'}
      />
      {room.status === 'lobby' && !room.vsBot && <Lobby room={room} />}
      {(room.status === 'playing' || room.status === 'over') && room.state && <Table key={room.state.players.join()} room={room} me={me} />}
      {over && rolled && room.state && <Result room={room} me={me} />}
    </BlueScreen>
  );
}
