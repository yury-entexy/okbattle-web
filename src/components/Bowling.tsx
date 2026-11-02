'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { track } from '@/lib/analytics';
import { useBowling } from '@/lib/bowling/store';
import { newGame, roll, standings, type Bowler, type GameState } from '@/lib/bowling/game';
import { FRAMES, marks, score, totals } from '@/lib/bowling/score';
import { botThrow } from '@/lib/bowling/bot';
import { LANE_HALF, BALL_R, MAX_ANGLE, PIN_SPOTS, RELEASE_Y, clampThrow, knocked, start, step, type Ball, type Pin, type Sim, type Throw } from '@/lib/bowling/physics';
import { drawAim, drawScene, followZ, metresPerPixel, type Camera } from '@/lib/bowling/draw';
import { crash, startRumble, stopRumble, unlockLane } from '@/lib/bowling/sfx';
import { Avatar } from './Avatar';
import { ActionButton, AppBar, BlueScreen, CloseIcon, Lottie, RoundButton } from './ui';

type Phase = 'aim' | 'bot' | 'roll' | 'result' | 'over';
const REST_Z = followZ(0);
const BALL_Y = RELEASE_Y;
const SIM_SPEED = 1.15;
const X_LIMIT = LANE_HALF - BALL_R;

interface Drag {
  id: number;
  mode: 'pending' | 'move' | 'swipe';
  startX: number;
  startY: number;
  ballX: number;
  path: Array<{ x: number; y: number; t: number }>;
}

/**
 * The swipe's tilt on screen, scaled down: a 7° tilt moves the ball about a pin's width at the
 * pins, so a slightly crooked swipe still reaches them.
 */
function aimAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.x - from.x, Math.max(1, from.y - to.y)) * 0.12;
}

/** Turn a swipe into a throw: direction from its tilt, speed from its pace, hook from its curve. */
function swipeThrow(cam: Camera, ballX: number, path: Drag['path']): Throw | null {
  const first = path[0];
  const last = path[path.length - 1];
  if (first.y - last.y < 50) return null;
  const angle = aimAngle(first, last);
  // The swipe's fastest stretch sets the speed, so a pause before lifting the finger does not weaken it.
  let pace = 0; // screen heights per ms
  for (let i = 1, j = 0; i < path.length; i++) {
    while (path[i].t - path[j].t > 100 && j < i - 1) j++;
    const dt = Math.max(16, path[i].t - path[j].t);
    pace = Math.max(pace, Math.hypot(path[i].x - path[j].x, path[i].y - path[j].y) / dt / cam.hgt);
  }
  const speed = 4.5 + pace * 1400;
  const mid = path[Math.floor(path.length / 2)];
  const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.x - a.x, a.y - b.y);
  const bend = dir(mid, last) - dir(first, mid);
  const spin = Math.abs(bend) < 0.08 ? 0 : bend * 1.6;
  return clampThrow({ x: ballX, angle, speed, spin });
}

function restingPins(standing: boolean[]): Pin[] {
  return start(standing, { x: 0, angle: 0, speed: 7, spin: 0 }).pins;
}

function resultText(pins: number, strike: boolean, spare: boolean, gutter: boolean): string {
  if (strike) return 'Страйк!';
  if (spare) return 'Спэр!';
  if (pins === 0) return gutter ? 'В желоб' : 'Мимо';
  return `Сбито: ${pins}`;
}

/** Ten little pins, back row on top, as the alley's monitor shows them. */
function PinMap({ standing }: { standing: boolean[] }) {
  return (
    <svg className="pinmap" viewBox="-0.55 -0.1 1.1 0.9" aria-label={`Стоят кегли: ${standing.filter(Boolean).length}`}>
      {PIN_SPOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={0.72 - ((y - PIN_SPOTS[0][1]) / (PIN_SPOTS[1][1] - PIN_SPOTS[0][1])) * 0.21} r={0.07} className={standing[i] ? 'up' : 'down'} />
      ))}
    </svg>
  );
}

function Sheet({ bowler, live }: { bowler: Bowler; live?: boolean }) {
  const t = totals(bowler.frames);
  return (
    <div className={`sheet ${live ? 'live' : ''}`} role="table" aria-label={`Счёт: ${bowler.name}`}>
      {Array.from({ length: FRAMES }, (_, i) => {
        const f = bowler.frames[i] ?? [];
        const m = marks(f, i);
        const slots = i === FRAMES - 1 ? 3 : 2;
        // A strike in frames 1–9 is written in the second box.
        const boxes = i < FRAMES - 1 && m[0] === 'X' ? ['', 'X'] : Array.from({ length: slots }, (_, k) => m[k] ?? '');
        return (
          <div key={i} className={`sheet-frame ${i === FRAMES - 1 ? 'tenth' : ''}`} role="cell">
            <span className="sheet-n">{i + 1}</span>
            <span className="sheet-rolls">{boxes.map((b, k) => <i key={k} className={b === 'X' || b === '/' ? 'mark' : ''}>{b}</i>)}</span>
            <span className="sheet-total">{t[i] ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function Over({ game, onAgain, onLeave }: { game: GameState; onAgain(): void; onLeave(): void }) {
  const list = standings(game);
  const won = list[0]?.bowler.bot === false && list[0].place === 1;
  useEffect(() => click('results'), []);
  const solo = game.bowlers.length === 1;
  return (
    <div className="bowl-over">
      {won && !solo && <Lottie src="lottie/fireworks_lottie.json" className="bowl-fireworks" loop={false} />}
      <img src="ui/logo.png" width={72} height={72} alt="" />
      <h2>{solo ? `Ваш счёт: ${list[0].score}` : won ? 'Вы победили!' : `Победил ${list[0].bowler.name}`}</h2>
      {list.map(({ bowler, score: s, place }) => (
        <div key={bowler.id} className={`bowl-result ${!bowler.bot ? 'me' : ''}`}>
          <div className="bowl-result-head">
            <span className="bowl-place">{place}</span>
            <Avatar name={bowler.avatar} size={32} />
            <span className="bowl-name">{bowler.name}</span>
            <b>{s}</b>
          </div>
          <Sheet bowler={bowler} />
        </div>
      ))}
      <ActionButton primary onClick={onAgain}>Ещё партию</ActionButton>
      <ActionButton onClick={onLeave}>Выйти</ActionButton>
    </div>
  );
}

/** «Боулинг»: ten frames against bots on one device. */
export function Bowling() {
  const { lineup, leave, again } = useBowling();
  const [game, setGame] = useState<GameState>(() => newGame(lineup));
  const [phase, setPhase] = useState<Phase>('aim');
  const [message, setMessage] = useState('');
  const [mapPins, setMapPins] = useState<boolean[]>(game.standing);
  const [kmh, setKmh] = useState(0);
  const [hint, setHint] = useState(true);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ z: REST_Z, w: 360, hgt: 480 });
  const sim = useRef<Sim | null>(null);
  const pins = useRef<Pin[]>(restingPins(game.standing));
  const ballX = useRef(0);
  const ballTarget = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const aim = useRef<number | null>(null);
  const gameRef = useRef(game);
  const phaseRef = useRef(phase);
  const hits = useRef(0);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pause.current), []);
  gameRef.current = game;
  phaseRef.current = phase;

  // A new line-up (the «Ещё партию» button) starts a fresh game.
  useEffect(() => {
    const g = newGame(lineup);
    setGame(g);
    setMapPins(g.standing);
    pins.current = restingPins(g.standing);
    sim.current = null;
    cam.current.z = REST_Z;
    ballX.current = 0;
    setMessage('');
    setPhase(g.bowlers[0]?.bot ? 'bot' : 'aim');
    click('startGame');
  }, [lineup]);

  const bowler = game.bowlers[game.turn];
  const myTurn = !!bowler && !bowler.bot;

  const finish = useCallback(() => {
    const s = sim.current;
    if (!s) return;
    stopRumble();
    const res = roll(gameRef.current, knocked(s));
    setMessage(resultText(res.pins, res.strike, res.spare, s.ball.gutter));
    if (res.strike || res.spare) click('rightAnswer');
    else if (res.pins === 0) click('wrongAnswer');
    setGame(res.state);
    setPhase('result');
    pause.current = setTimeout(() => {
      const g = res.state;
      setMessage('');
      sim.current = null;
      pins.current = restingPins(g.standing);
      setMapPins(g.standing);
      if (g.over) {
        setPhase('over');
        track('game_finish', { game: 'bowling', room: useBowling.getState().config?.ad ? 'ad' : 'private' });
        return;
      }
      const next = g.bowlers[g.turn];
      if (next.bot || res.frameOver) ballX.current = 0;
      setPhase(next.bot ? 'bot' : 'aim');
    }, 1500);
  }, []);

  const throwBall = useCallback((t: Throw) => {
    sim.current = start(gameRef.current.standing, t);
    pins.current = sim.current.pins;
    hits.current = 0;
    aim.current = null;
    setKmh(Math.round(t.speed * 3.6));
    setPhase('roll');
    startRumble();
  }, []);

  // Bots take a moment, step to their spot, and throw.
  useEffect(() => {
    if (phase !== 'bot') return;
    const g = gameRef.current;
    const b = g.bowlers[g.turn];
    const t = botThrow(g.standing, b.skill);
    const a = setTimeout(() => (ballTarget.current = t.x), 700);
    const z = setTimeout(() => {
      ballTarget.current = null;
      ballX.current = t.x;
      throwBall(t);
    }, 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(z);
    };
  }, [phase, game.turn, throwBall]);

  // Sizing and the draw loop.
  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      cam.current.w = r.width;
      cam.current.hgt = r.height;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let last = performance.now();
    let raf = 0;
    let settled = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      let ball: Ball;
      if (s && phaseRef.current === 'roll') {
        step(s, dt * SIM_SPEED);
        if (s.hits > hits.current) {
          crash(s.hits - hits.current);
          hits.current = s.hits;
        }
        if (s.ball.y > 17 || s.ball.gone) stopRumble();
        if (s.done) {
          settled += dt;
          if (settled > 0.5) {
            settled = 0;
            phaseRef.current = 'result';
            finish();
          }
        }
        if (!s.ball.gone) cam.current.z += (followZ(s.ball.y) - cam.current.z) * Math.min(1, dt * 6);
      } else if (!s) {
        cam.current.z += (REST_Z - cam.current.z) * Math.min(1, dt * 5);
        if (ballTarget.current !== null) ballX.current += (ballTarget.current - ballX.current) * Math.min(1, dt * 6);
      }
      if (s) ball = s.ball;
      else ball = { x: ballX.current, y: BALL_Y, vx: 0, vy: 0, spin: 0, gutter: false, gone: false, roll: 0 };
      // Hide the waiting ball while the camera flies back from the pins.
      const showBall = !!s || cam.current.z - REST_Z < 1;
      drawScene(ctx, cam.current, showBall ? ball : null, pins.current);
      if (aim.current !== null && !s) drawAim(ctx, cam.current, ballX.current, BALL_Y, aim.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopRumble();
    };
  }, [finish]);

  // Keep the pin map in step with the roll.
  useEffect(() => {
    if (phase !== 'roll') return;
    const t = setInterval(() => {
      const s = sim.current;
      if (s) setMapPins(s.pins.map((p) => p.state === 'standing'));
    }, 120);
    return () => clearInterval(t);
  }, [phase]);

  // Swipe controls.
  const local = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };
  const onDown = (e: React.PointerEvent) => {
    if (phase !== 'aim' || !myTurn) return;
    unlockAudio();
    unlockLane();
    const p = local(e);
    canvas.current?.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, mode: 'pending', startX: p.x, startY: p.y, ballX: ballX.current, path: [p] };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = local(e);
    d.path.push(p);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (d.mode === 'pending') {
      if (dy < -16) d.mode = 'swipe';
      else if (Math.abs(dx) > 8) d.mode = 'move';
    }
    if (d.mode === 'move') {
      ballX.current = Math.max(-X_LIMIT, Math.min(X_LIMIT, d.ballX + dx * metresPerPixel(cam.current, BALL_Y)));
      // Moving and then pushing up in one gesture also throws.
      if (dy < -40) {
        d.mode = 'swipe';
        d.path = [p];
        d.startY = p.y;
      }
    }
    if (d.mode === 'swipe' && d.path.length > 2) {
      aim.current = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, aimAngle(d.path[0], p)));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    aim.current = null;
    if (d.mode !== 'swipe') return;
    d.path.push(local(e));
    const t = swipeThrow(cam.current, ballX.current, d.path);
    if (!t) return;
    setHint(false);
    throwBall(t);
  };

  // Keyboard: arrows move the ball, Space throws it straight.
  useEffect(() => {
    if (phase !== 'aim' || !myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        ballX.current = Math.max(-X_LIMIT, Math.min(X_LIMIT, ballX.current + (e.key === 'ArrowLeft' ? -0.03 : 0.03)));
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        unlockAudio();
        unlockLane();
        setHint(false);
        throwBall(clampThrow({ x: ballX.current, angle: 0, speed: 7.5, spin: 0 }));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase, myTurn, throwBall]);

  const exit = () => {
    stopRumble();
    leave();
  };

  if (!bowler) return null;
  const rollNo = (bowler.frames[game.frame]?.length ?? 0) + 1;
  let status = '';
  if (phase === 'aim') status = 'Ваш бросок: смахните вверх';
  else if (phase === 'bot') status = `Бросает ${bowler.name}`;
  else if (phase === 'roll') status = `${kmh} км/ч`;

  return (
    <BlueScreen className="bowl-screen">
      <AppBar
        leading={<RoundButton label="Выйти" onClick={exit}><CloseIcon /></RoundButton>}
        title="Боулинг"
      />
      {phase === 'over' ? (
        <Over game={game} onAgain={() => { click('startGame'); again(); }} onLeave={exit} />
      ) : (
        <>
          <div className="bowlers">
            {game.bowlers.map((b, i) => (
              <div key={b.id} className={`bowler ${i === game.turn ? 'turn' : ''}`}>
                <Avatar name={b.avatar} size={28} />
                <span className="bowler-name">{b.bot ? b.name : 'Вы'}</span>
                <b>{score(b.frames)}</b>
              </div>
            ))}
          </div>
          <Sheet bowler={bowler} live />
          <div className="lane-wrap" ref={wrap}>
            <canvas
              ref={canvas}
              className="lane"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => { drag.current = null; aim.current = null; }}
              aria-label="Дорожка. Двигайте шар влево-вправо и смахните вверх, чтобы бросить. Клавиши: стрелки и пробел."
              role="img"
            />
            <div className="lane-hud">
              <span className="pill">Фрейм {game.frame + 1} · бросок {rollNo}</span>
              <PinMap standing={mapPins} />
            </div>
            {message && <div className="lane-message" role="status">{message}</div>}
            {hint && myTurn && phase === 'aim' && (
              <div className="lane-hint">
                Двигайте шар влево-вправо, потом смахните вверх. Чем быстрее свайп, тем сильнее бросок; дуга закручивает шар.
              </div>
            )}
          </div>
          <p className={`bowl-status ${myTurn && phase === 'aim' ? 'mine' : ''}`}>{status || ' '}</p>
        </>
      )}
    </BlueScreen>
  );
}
