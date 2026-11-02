/**
 * Rules tests and a bot-only simulation for «Очо».
 *
 *   npx tsx scripts/ocho-test.ts [games]
 */
import assert from 'node:assert/strict';
import { botMove } from '../src/lib/ocho/bot';
import { refereeStep, startPatch, view, type OchoRoom } from '../src/lib/ocho/room';
import { deal, fits, fullDeck, legal, nextSeat, play, playable, type OchoState } from '../src/lib/ocho/rules';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
}

/** A hand-made state: players in `hands` order, the first on turn, the pile showing `topCard`. */
function make(topCard: string, hands: Record<string, string[]>, extra: Partial<OchoState> = {}): OchoState {
  return {
    seats: Object.keys(hands), hands, deck: ['R1', 'R3', 'Y4', 'G5', 'B6', 'R9', 'G1', 'B2'], pile: [topCard],
    color: (topCard[0] === 'W' ? 'R' : topCard[0]) as OchoState['color'], turn: Object.keys(hands)[0], dir: 1,
    drawn: null, stuck: 0, over: false, winner: null, places: [], seq: 0, ...extra,
  };
}
const total = (s: OchoState) => s.deck.length + s.pile.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0);

test('deck: 108 cards, classic composition', () => {
  const d = fullDeck();
  assert.equal(d.length, 108);
  assert.equal(d.filter((c) => c === 'WW').length, 4);
  assert.equal(d.filter((c) => c === 'W4').length, 4);
  for (const col of 'RYGB') {
    assert.equal(d.filter((c) => c === col + '0').length, 1);
    for (const v of '123456789SVD') assert.equal(d.filter((c) => c === col + v).length, 2, col + v);
  }
});

test('deal: 7 each, opener is a number', () => {
  for (let i = 0; i < 300; i++) {
    const s = deal(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const id of s.seats) assert.equal(s.hands[id].length, 7);
    assert.equal(total(s), 108);
    assert.match(s.pile[0], /^[RYGB]\d$/);
    assert.equal(s.color, s.pile[0][0]);
  }
});

test('match by colour, number or symbol; wild always', () => {
  const s = make('R5', { a: ['R1', 'G5', 'Y3', 'WW', 'BS'], b: ['B1'], c: ['B2'] });
  assert.deepEqual(playable(s, 'a'), ['R1', 'G5', 'WW']);
  const t = make('GS', { a: ['BS', 'Y3', 'G9'], b: ['B1'], c: ['B2'] });
  assert.deepEqual(playable(t, 'a'), ['BS', 'G9']);
  assert.ok(!legal(s, 'b', { kind: 'play', card: 'B1' }), 'not your turn');
  assert.ok(!legal(s, 'a', { kind: 'play', card: 'WW' }), 'wild needs a colour');
  assert.ok(legal(s, 'a', { kind: 'play', card: 'WW', color: 'Y' }));
});

test('+4 only without a card of the colour in play', () => {
  const s = make('R5', { a: ['R1', 'W4', 'G5'], b: ['B1'], c: ['B2'] });
  assert.ok(!fits(s, 'W4', s.hands.a));
  assert.ok(!legal(s, 'a', { kind: 'play', card: 'W4', color: 'G' }));
  const t = make('R5', { a: ['Y1', 'W4', 'G5'], b: ['B1'], c: ['B2'] });
  assert.ok(legal(t, 'a', { kind: 'play', card: 'W4', color: 'G' }));
});

test('wild names the colour; next player must follow it', () => {
  let s = make('R5', { a: ['WW', 'R1'], b: ['Y1', 'R2'], c: ['B2'] });
  s = play(s, 'a', { kind: 'play', card: 'WW', color: 'Y' });
  assert.equal(s.color, 'Y');
  assert.equal(s.turn, 'b');
  assert.ok(fits(s, 'Y1'));
  assert.ok(!fits(s, 'R2'));
});

test('skip', () => {
  const s = play(make('R5', { a: ['RS', 'R1'], b: ['B1'], c: ['B2'] }), 'a', { kind: 'play', card: 'RS' });
  assert.equal(s.turn, 'c');
  assert.deepEqual(s.last?.hit, { id: 'b', drew: 0 });
});

test('reverse; with two players it skips', () => {
  const s = play(make('R5', { a: ['RV', 'R1'], b: ['B1'], c: ['B2'] }), 'a', { kind: 'play', card: 'RV' });
  assert.equal(s.dir, -1);
  assert.equal(s.turn, 'c');
  assert.equal(nextSeat(s, 'c'), 'b');
  const two = play(make('R5', { a: ['RV', 'R1'], b: ['B1'] }), 'a', { kind: 'play', card: 'RV' });
  assert.equal(two.turn, 'a');
});

test('+2: next draws two and misses the turn', () => {
  const s = play(make('R5', { a: ['RD', 'R1'], b: ['G2', 'G9'], c: ['B1'] }), 'a', { kind: 'play', card: 'RD' });
  assert.equal(s.hands.b.length, 4);
  assert.equal(s.turn, 'c');
  assert.deepEqual(s.last?.hit, { id: 'b', drew: 2 });
});

test('+4: colour named, next draws four and misses the turn', () => {
  const s = play(make('R5', { a: ['W4', 'G1'], b: ['G2'], c: ['B1'] }), 'a', { kind: 'play', card: 'W4', color: 'G' });
  assert.equal(s.color, 'G');
  assert.equal(s.hands.b.length, 5);
  assert.equal(s.turn, 'c');
});

test('«Очо!»: called keeps one card, forgotten draws two', () => {
  const ok = play(make('R5', { a: ['R1', 'R2'], b: ['B1'], c: ['B2'] }), 'a', { kind: 'play', card: 'R1', call: true });
  assert.equal(ok.hands.a.length, 1);
  assert.equal(ok.last?.called, true);
  const bad = play(make('R5', { a: ['R1', 'R2'], b: ['B1'], c: ['B2'] }), 'a', { kind: 'play', card: 'R1' });
  assert.equal(bad.hands.a.length, 3);
  assert.equal(bad.last?.called, false);
  assert.equal(bad.turn, 'b');
  const early = play(make('R5', { a: ['R1', 'R2', 'R3'], b: ['B1'], c: ['B2'] }), 'a', { kind: 'play', card: 'R1' });
  assert.equal(early.last?.called, undefined, 'no call needed with more cards left');
});

test('drawn card that fits may be played, else pass', () => {
  let s = make('R5', { a: ['Y3'], b: ['B1'], c: ['B2'] }, { deck: ['R1', 'G4'] });
  s = play(s, 'a', { kind: 'draw' });
  assert.equal(s.drawn, 'R1');
  assert.equal(s.turn, 'a');
  assert.ok(!legal(s, 'a', { kind: 'play', card: 'Y3' }));
  assert.ok(!legal(s, 'a', { kind: 'draw' }));
  assert.equal(play(s, 'a', { kind: 'pass' }).turn, 'b');
  s = play(s, 'a', { kind: 'play', card: 'R1', call: true });
  assert.equal(s.turn, 'b');
});

test('drawn card that does not fit ends the turn', () => {
  const s = play(make('R5', { a: ['Y3'], b: ['B1'], c: ['B2'] }, { deck: ['G4'] }), 'a', { kind: 'draw' });
  assert.equal(s.drawn, null);
  assert.equal(s.turn, 'b');
});

test('empty deck: the pile under the top card is reshuffled', () => {
  const s = play(make('R5', { a: ['Y3'], b: ['B1'], c: ['B2'] }, { deck: [], pile: ['G1', 'G4', 'R5'] }), 'a', { kind: 'draw' });
  assert.deepEqual(s.pile, ['R5']);
  assert.equal(s.hands.a.length, 2);
  assert.equal(s.deck.length, 1);
});

test('last card wins, places by fewest cards', () => {
  const s = play(make('R5', { a: ['R1'], b: ['B1', 'B2', 'B3'], c: ['B4'] }), 'a', { kind: 'play', card: 'R1' });
  assert.ok(s.over);
  assert.equal(s.winner, 'a');
  assert.deepEqual(s.places, ['a', 'c', 'b']);
  assert.ok(!legal(s, 'b', { kind: 'draw' }));
});

test('nothing left to draw ends the game on card count', () => {
  let s = make('R5', { a: ['Y3'], b: ['B1', 'B2'], c: ['G2', 'G3', 'G4'] }, { deck: [], pile: ['R5'] });
  for (const id of ['a', 'b', 'c']) s = play(s, id, { kind: 'draw' });
  assert.ok(s.over);
  assert.equal(s.winner, 'a');
});

test('bot: plays what fits, calls «Очо!» unless it forgets', () => {
  const s = make('R5', { a: ['R1', 'G2'], b: ['B1'], c: ['B2'] });
  assert.deepEqual(botMove(s, 'a', () => 0.5), { kind: 'play', card: 'R1', call: true });
  assert.deepEqual(botMove(s, 'a', () => 0), { kind: 'play', card: 'R1' });
  assert.deepEqual(botMove(make('R5', { a: ['G1'], b: ['B1'] }), 'a'), { kind: 'draw' });
  const w = botMove(make('R5', { a: ['WW', 'G1', 'G2'], b: ['B1'] }), 'a');
  assert.equal(w?.kind === 'play' && w.color, 'G');
});

// Bot-only games through the room referee, as the host runs them.
const games = Number(process.argv[2] ?? 2000);
let moves = 0;
let forgotten = 0;
let called = 0;
const wins = new Map<number, number>();
for (let g = 0; g < games; g++) {
  const players = 2 + (g % 5);
  const room: OchoRoom = {
    kind: 'ocho', code: '123456', hostId: 'p0', bots: players - 1, status: 'lobby', createdAt: 0,
    members: { p0: { name: 'p0', avatar: '', joinedAt: 0 } },
  };
  let r = view({ ...room, ...(startPatch(room, 0, (a) => a) as Partial<OchoRoom>) });
  // The person leaves at once, so the referee plays their turns too.
  r.members.p0.left = true;
  const due = new Map<string, number>();
  let now = 0;
  for (let step = 0; r.status === 'playing'; step++) {
    assert.ok(step < 20_000, `game ${g} never ends`);
    const s = r.state!;
    assert.equal(total(s), 108, 'cards are conserved');
    const m = botMove(s, s.turn);
    assert.ok(m && legal(s, s.turn, m), 'the bot always has a legal move');
    now += 2000;
    const patch = refereeStep(r, now, due);
    if (!patch) continue;
    moves++;
    if (r.state && (patch.state as OchoState)?.last?.called === false) forgotten++;
    if ((patch.state as OchoState)?.last?.called) called++;
    r = view({ ...r, ...(patch as Partial<OchoRoom>) });
  }
  const s = r.state!;
  assert.ok(s.over && s.winner && s.places.length === players);
  assert.equal(total(s), 108);
  wins.set(s.seats.indexOf(s.winner!), (wins.get(s.seats.indexOf(s.winner!)) ?? 0) + 1);
}
console.log(`${passed} rule tests passed; ${games} bot games, ${(moves / games).toFixed(1)} moves a game on average; «Очо!» called ${called}, forgotten ${forgotten}`);
