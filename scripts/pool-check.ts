/**
 * Checks for «Бильярд»: the physics is deterministic, the 8-ball rules give the right calls in
 * set-up positions, and bot-against-bot games always finish.
 *
 *   npx tsx scripts/pool-check.ts [games]
 */
import assert from 'node:assert/strict';
import { L, R, W, rack, simulate, type Ball } from '../src/lib/pool/physics';
import { newGame, playShot, timeOut, targets, type PoolState } from '../src/lib/pool/rules';
import { botShot } from '../src/lib/pool/bot';

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => {
      passed++;
      console.log(`ok  ${name}`);
    },
    (e) => {
      console.error(`FAIL ${name}\n`, e);
      process.exitCode = 1;
    },
  );
}

/** A mid-game state with given balls on the table (the rest pocketed). */
function position(on: Ball[], patch: Partial<PoolState> = {}): PoolState {
  const all = new Map(on.map((b) => [b.n, b]));
  const balls: Ball[] = [];
  for (let n = 0; n <= 15; n++) balls.push(all.get(n) ?? { n, x: 0, y: 0, down: true });
  return { ...newGame(['a', 'b']), balls, breakShot: false, ...patch };
}

/** Aim from the cue ball straight through ball n (a full hit). */
function at(s: PoolState, n: number, power: number) {
  const c = s.balls.find((b) => b.n === 0)!;
  const t = s.balls.find((b) => b.n === n)!;
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { dx: dx / len, dy: dy / len, power };
}

// Straight in: ball 1 sits in front of the top-left corner pocket, the cue ball behind it on the diagonal.
const straight = (n: number): Ball[] => [
  { n: 0, x: 500, y: 500 },
  { n, x: 250, y: 250 },
];

const games = Number(process.argv[2] ?? 60);

(async () => {
  await test('physics is deterministic', () => {
    const balls = rack(() => 0.42);
    const a = simulate(balls, { dx: 0.013, dy: -1, power: 1 });
    const b = simulate(balls, { dx: 0.013, dy: -1, power: 1 });
    assert.deepEqual(a.balls, b.balls);
    assert.deepEqual(a.pocketed, b.pocketed);
  });

  await test('balls stay on the cloth or drop', () => {
    for (let i = 0; i < 200; i++) {
      const r = simulate(rack(), { dx: Math.random() - 0.5, dy: -1, power: 0.6 + Math.random() * 0.4 }, false);
      for (const b of r.balls) if (!b.down) assert.ok(b.x >= R - 0.5 && b.x <= W - R + 0.5 && b.y >= R - 0.5 && b.y <= L - R + 0.5, `ball ${b.n} at ${b.x},${b.y}`);
      assert.ok(r.balls.length === 16);
    }
  });

  await test('a straight shot pots the ball and keeps the turn', () => {
    const s = position([...straight(3), { n: 8, x: 800, y: 1500 }, { n: 12, x: 800, y: 1750 }], { groups: ['solid', 'stripe'] });
    const { next, result } = playShot(s, at(s, 3, 0.45));
    assert.ok(result.pocketed.includes(3), `pocketed ${result.pocketed}`);
    assert.equal(next.turn, 0);
    assert.equal(next.last?.foul, undefined);
  });

  await test('open table: the first legal pot decides the groups', () => {
    const s = position([...straight(11), { n: 8, x: 800, y: 1500 }, { n: 2, x: 800, y: 1750 }]);
    const { next } = playShot(s, at(s, 11, 0.45));
    assert.deepEqual(next.groups, ['stripe', 'solid']);
    assert.equal(next.turn, 0);
  });

  await test('hitting the opponent ball first is a foul with ball in hand', () => {
    const s = position([...straight(12), { n: 8, x: 800, y: 1500 }, { n: 2, x: 800, y: 1750 }], { groups: ['solid', 'stripe'] });
    const { next } = playShot(s, at(s, 12, 0.45));
    assert.ok(next.last?.foul);
    assert.equal(next.turn, 1);
    assert.equal(next.ballInHand, true);
  });

  await test('missing everything is a foul', () => {
    const s = position([{ n: 0, x: 500, y: 700 }, { n: 1, x: 200, y: 300 }, { n: 8, x: 800, y: 1700 }], { groups: ['solid', 'stripe'] });
    const { next } = playShot(s, { dx: 1, dy: 0, power: 0.3 });
    assert.equal(next.last?.foul, 'не задет ни один шар');
    assert.equal(next.turn, 1);
  });

  await test('cue ball in a pocket is a foul and comes back to the table', () => {
    const s = position([{ n: 0, x: 250, y: 250 }, { n: 1, x: 600, y: 1300 }, { n: 8, x: 800, y: 1700 }], { groups: ['solid', 'stripe'] });
    const { next } = playShot(s, { dx: -0.7071, dy: -0.7071, power: 0.4 });
    assert.equal(next.last?.foul, 'биток в лузе');
    assert.equal(next.ballInHand, true);
    assert.equal(next.balls.find((b) => b.n === 0)!.down, false);
  });

  await test('the 8 after clearing the group wins', () => {
    const s = position([...straight(8), { n: 12, x: 800, y: 1750 }], { groups: ['solid', 'stripe'] });
    assert.deepEqual(targets(s), [8]);
    const { next } = playShot(s, at(s, 8, 0.45));
    assert.equal(next.over, true);
    assert.equal(next.winner, 0);
  });

  await test('the 8 too early loses', () => {
    const s = position([...straight(8), { n: 3, x: 800, y: 1500 }, { n: 12, x: 800, y: 1750 }], { groups: ['solid', 'stripe'] });
    const { next } = playShot(s, at(s, 8, 0.45));
    assert.equal(next.over, true);
    assert.equal(next.winner, 1);
  });

  await test('ball in hand is placed where asked when the spot is free', () => {
    const s = position([{ n: 0, x: 500, y: 700 }, { n: 1, x: 200, y: 300 }, { n: 8, x: 800, y: 1700 }], { groups: ['solid', 'stripe'], ballInHand: true });
    const { placed } = playShot(s, { dx: 0, dy: 1, power: 0.05 }, { x: 300, y: 900 });
    assert.deepEqual(placed, { x: 300, y: 900 });
  });

  await test('time out passes the turn with ball in hand', () => {
    const s = position([{ n: 0, x: 500, y: 700 }, { n: 1, x: 200, y: 300 }, { n: 8, x: 800, y: 1700 }]);
    const t = timeOut(s);
    assert.equal(t.turn, 1);
    assert.equal(t.ballInHand, true);
  });

  await test(`bot against bot: ${games} games finish`, async () => {
    const shotsPer: number[] = [];
    let fouls = 0;
    let shots = 0;
    const wins = [0, 0];
    for (let g = 0; g < games; g++) {
      let s = newGame(['a', 'b']);
      let n = 0;
      while (!s.over && n < 300) {
        const b = await botShot(s);
        s = playShot(s, b.shot, b.place, false).next;
        if (s.last?.foul) fouls++;
        n++;
      }
      assert.ok(s.over, `game ${g} did not finish in 300 shots`);
      wins[s.winner!]++;
      shotsPer.push(n);
      shots += n;
    }
    shotsPer.sort((a, b) => a - b);
    console.log(`    shots per game: median ${shotsPer[shotsPer.length >> 1]}, max ${shotsPer[shotsPer.length - 1]}; fouls ${(100 * fouls / shots).toFixed(1)}% of shots; breaker won ${wins[0]}/${games}`);
  });

  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
})();
