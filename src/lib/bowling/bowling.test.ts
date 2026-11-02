import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marks, score, totals, type Frame } from './score';
import { allPins, newGame, roll, standings, type GameState } from './game';
import { count, crossing, knocked, simulate, LANE_HALF, PIN_SPOTS } from './physics';
import { aimAt, botThrow } from './bot';

/** Frames from a flat list of rolls, as a bowler would throw them. */
function framesOf(rolls: number[]): Frame[] {
  const frames: Frame[] = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (f < 9) {
      if (rolls[i] === 10) frames.push([rolls[i++]]);
      else frames.push(rolls.slice(i, (i += 2)));
    } else frames.push(rolls.slice(i));
  }
  return frames;
}

test('perfect game scores 300', () => {
  assert.equal(score(framesOf(new Array(12).fill(10))), 300);
});

test('all spares with 5 score 150', () => {
  assert.equal(score(framesOf(new Array(21).fill(5))), 150);
});

test('all nines score 90, gutter game 0', () => {
  assert.equal(score(framesOf(new Array(10).fill([9, 0]).flat())), 90);
  assert.equal(score(framesOf(new Array(20).fill(0))), 0);
});

test('a known mixed game', () => {
  // X 7/ 9- X -8 8/ -6 X X X81
  const rolls = [10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1];
  const t = totals(framesOf(rolls));
  assert.deepEqual(t, [20, 39, 48, 66, 74, 84, 90, 120, 148, 167]);
});

test('running totals wait for bonus rolls', () => {
  assert.deepEqual(totals([[10], [3]]).slice(0, 2), [null, null]);
  assert.deepEqual(totals([[10], [3, 4]]).slice(0, 2), [17, 24]);
  assert.deepEqual(totals([[6, 4]]).slice(0, 1), [null]);
});

test('marks', () => {
  assert.deepEqual(marks([10], 0), ['X']);
  assert.deepEqual(marks([7, 3], 0), ['7', '/']);
  assert.deepEqual(marks([0, 10], 0), ['−', '/']);
  assert.deepEqual(marks([10, 10, 10], 9), ['X', 'X', 'X']);
  assert.deepEqual(marks([10, 7, 3], 9), ['X', '7', '/']);
  assert.deepEqual(marks([6, 4, 10], 9), ['6', '/', 'X']);
});

const knock = (n: number[]) => allPins().map((_, i) => n.includes(i + 1));
const pinsFor = (k: number) => knock(Array.from({ length: k }, (_, i) => i + 1));

function play(state: GameState, rolls: number[]): GameState {
  // Knocks the first k standing pins each roll.
  for (const k of rolls) {
    const standingIdx = state.standing.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    const down = allPins().map((_, i) => standingIdx.slice(0, k).includes(i));
    state = roll(state, down).state;
  }
  return state;
}

test('turns pass between bowlers after each frame', () => {
  let g = newGame([
    { id: 'a', name: 'A', avatar: '', bot: false, skill: 0 },
    { id: 'b', name: 'B', avatar: '', bot: true, skill: 0.8 },
  ]);
  let r = roll(g, pinsFor(10));
  assert.equal(r.strike, true);
  assert.equal(r.frameOver, true);
  g = r.state;
  assert.equal(g.turn, 1);
  assert.equal(g.frame, 0);
  r = roll(g, pinsFor(4));
  assert.equal(r.frameOver, false);
  assert.deepEqual(r.state.standing, knock([1, 2, 3, 4]).map((x) => !x));
  r = roll(r.state, knock([5, 6, 7, 8, 9, 10]));
  assert.equal(r.spare, true);
  assert.equal(r.state.turn, 0);
  assert.equal(r.state.frame, 1);
});

test('fallen pins are not counted twice', () => {
  const g = newGame([{ id: 'a', name: 'A', avatar: '', bot: false, skill: 0 }]);
  const r1 = roll(g, knock([1, 2]));
  const r2 = roll(r1.state, knock([1, 2, 3]));
  assert.equal(r2.pins, 1);
});

test('tenth frame: bonus rolls after strike/spare, game ends', () => {
  const solo = () => newGame([{ id: 'a', name: 'A', avatar: '', bot: false, skill: 0 }]);
  let g = play(solo(), new Array(12).fill(10));
  assert.equal(g.over, true);
  assert.equal(score(g.bowlers[0].frames), 300);
  g = play(solo(), [...new Array(18).fill(0), 3, 4]);
  assert.equal(g.over, true);
  assert.equal(g.bowlers[0].frames[9].length, 2);
  g = play(solo(), [...new Array(18).fill(0), 3, 7]);
  assert.equal(g.over, false);
  assert.deepEqual(g.standing, allPins());
  g = play(g, [5]);
  assert.equal(g.over, true);
  assert.equal(score(g.bowlers[0].frames), 15);
});

test('standings share places on ties', () => {
  let g = newGame([
    { id: 'a', name: 'A', avatar: '', bot: false, skill: 0 },
    { id: 'b', name: 'B', avatar: '', bot: true, skill: 0 },
    { id: 'c', name: 'C', avatar: '', bot: true, skill: 0 },
  ]);
  g = play(g, [10, 5, 4, 5, 4, 3, 4]);
  const s = standings(g);
  assert.equal(s[0].bowler.id, 'a');
  assert.deepEqual(s.map((x) => x.place), [1, 2, 2]);
});

const ALL = allPins();

test('gutter ball knocks nothing', () => {
  const s = simulate(ALL, { x: 0.4, angle: 0.05, speed: 8, spin: 0 });
  assert.equal(s.ball.gutter, true);
  assert.equal(count(knocked(s)), 0);
});

test('a pocket hit can strike, a head-on hit usually leaves pins', () => {
  const base = { x: 0.25, speed: 8, spin: -0.7 };
  const pocket = simulate(ALL, { ...base, angle: aimAt(0.075, base) });
  assert.equal(count(knocked(pocket)), 10);
  const straight = simulate(ALL, { x: 0, angle: 0, speed: 8, spin: 0 });
  assert.ok(count(knocked(straight)) < 10);
  assert.ok(count(knocked(straight)) >= 5);
});

test('an edge hit takes only a few pins', () => {
  const s = simulate(ALL, { x: 0.38, angle: 0, speed: 7, spin: 0 });
  const n = count(knocked(s));
  assert.ok(n >= 1 && n <= 5, `knocked ${n}`);
});

test('physics is deterministic and stays in bounds', () => {
  const t = { x: -0.1, angle: 0.01, speed: 7.3, spin: 0.4 };
  assert.deepEqual(knocked(simulate(ALL, t)), knocked(simulate(ALL, t)));
  for (let i = 0; i < 200; i++) {
    const sim = simulate(ALL, { x: (i % 9) / 10 - 0.4, angle: ((i % 7) - 3) / 50, speed: 4 + (i % 6), spin: ((i % 5) - 2) / 2 });
    assert.ok(sim.done);
    assert.ok(sim.t < 8.01);
    for (const p of sim.pins) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('only standing pins can fall', () => {
  const standing = ALL.map((_, i) => i === 6); // 7-pin only
  const s = simulate(standing, { x: -0.3, angle: aimAt(PIN_SPOTS[6][0], { x: -0.3, speed: 7.5, spin: 0 }), speed: 7.5, spin: 0 });
  assert.deepEqual(knocked(s), standing);
});

test('aimAt sends the ball where asked', () => {
  for (const target of [-0.3, 0, 0.2]) {
    const base = { x: 0.1, speed: 7, spin: 0.5 };
    const c = crossing({ ...base, angle: aimAt(target, base) });
    assert.ok(Math.abs(c.x - target) < 0.005, `${target} → ${c.x}`);
    assert.ok(Math.abs(c.x) < LANE_HALF);
  }
});

test('bots bowl a plausible game', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const scores: number[] = [];
  for (const skill of [0.5, 0.9]) {
    let total = 0;
    for (let n = 0; n < 6; n++) {
      let g = newGame([{ id: 'b', name: 'B', avatar: '', bot: true, skill }]);
      while (!g.over) g = roll(g, knocked(simulate(g.standing, botThrow(g.standing, skill, rand)))).state;
      total += score(g.bowlers[0].frames);
    }
    scores.push(total / 6);
  }
  assert.ok(scores[0] > 60 && scores[0] < 250, `weak bot ${scores[0]}`);
  assert.ok(scores[1] > scores[0], `strong ${scores[1]} vs weak ${scores[0]}`);
});
