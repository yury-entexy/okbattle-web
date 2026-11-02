/**
 * «Очо»: a colour-and-number shedding card game for 2–6 players, with the classic rules of the genre.
 *
 * Deck (108 cards), four colours: red `R`, yellow `Y`, green `G`, blue `B`. Each colour has one 0,
 * two of each 1–9, and two of each action card: «Пропуск» `S`, «Разворот» `V` and «+2» `D`. Plus
 * four «Смена цвета» `WW` and four «+4» `W4`, which belong to no colour.
 *
 * On your turn play one card that matches the top of the pile by colour, number or action, or a
 * wild card. If you can't or won't, draw a card; if it fits you may play it at once, otherwise
 * the turn passes.
 * - «Пропуск»: the next player misses the turn;
 * - «Разворот»: play goes the other way (with two players it works as «Пропуск»);
 * - «+2»: the next player draws two and misses the turn;
 * - «Смена цвета»: the player names the colour that follows;
 * - «+4»: names the colour, and the next player draws four and misses the turn. It may only be
 *   played when the player holds no card of the colour in play.
 * Whoever plays down to one card must call «Очо!» with that move, or draws two as a penalty.
 * The first player with no cards left wins; the others place by how few cards they hold.
 *
 * Pure functions over plain JSON, so the same state can live in the Realtime Database and be read
 * by any client. A card is two characters, colour then value, e.g. `G7`, `RS`, `BD`, `WW`, `W4`.
 */

export type Card = string;
export type Color = 'R' | 'Y' | 'G' | 'B';
export const COLORS: Color[] = ['R', 'Y', 'G', 'B'];
export const HAND = 7;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
/** Cards drawn for not calling «Очо!». */
export const CALL_PENALTY = 2;
/** Draws in a row that find no card (deck and pile both empty) before the game ends on card count. */
const STUCK_LIMIT = 3;

export interface OchoState {
  /** Player ids in seating order. */
  seats: string[];
  hands: Record<string, Card[]>;
  /** Drawn from the front. */
  deck: Card[];
  /** The discard pile; the last card is on top. */
  pile: Card[];
  /** The colour to follow: the top card's, or the one named with a wild card. */
  color: Color;
  /** Whose turn it is. */
  turn: string;
  /** 1 clockwise, -1 after a «Разворот». */
  dir: 1 | -1;
  /** The card the player to move has just drawn; they may play it or pass. */
  drawn: Card | null;
  /** Draws in a row that found no card at all. */
  stuck: number;
  over: boolean;
  winner: string | null;
  /** Everyone once the game is over: the winner first, then by fewest cards. */
  places: string[];
  /** Bumped by every move, so clients can tell states apart. */
  seq: number;
  last?: LastMove;
}

export type Move =
  | { kind: 'play'; card: Card; color?: Color; /** «Очо!»: called with the move that leaves one card. */ call?: boolean }
  | { kind: 'draw' }
  | { kind: 'pass' };

export type LastMove = Move & {
  by: string;
  /** Cards the mover drew (a draw, or a missed «Очо!» call). */
  drew?: number;
  /** The player who missed the turn, and how many cards they had to draw. */
  hit?: { id: string; drew: number };
  /** The mover went down to one card: true if they called «Очо!», false if they were caught. */
  called?: boolean;
};

export const isWild = (c: Card) => c[0] === 'W';
export const colorOf = (c: Card): Color | null => (isWild(c) ? null : (c[0] as Color));
/** '0'–'9', 'S' skip, 'V' reverse, 'D' +2, 'W' colour change, '4' +4. */
export const valueOf = (c: Card) => c[1];
export const isNumber = (c: Card) => !isWild(c) && /\d/.test(c[1]);
export const top = (s: OchoState) => s.pile[s.pile.length - 1];

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const c of COLORS) {
    deck.push(c + '0');
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'V', 'D']) deck.push(c + v, c + v);
  }
  for (let i = 0; i < 4; i++) deck.push('WW', 'W4');
  return deck;
}

export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The Realtime Database drops empty arrays and nulls: put them back. */
export function normalize(raw: OchoState): OchoState {
  const hands: Record<string, Card[]> = {};
  for (const id of raw.seats) hands[id] = Object.values(raw.hands?.[id] ?? {});
  return {
    ...raw,
    hands,
    deck: Object.values(raw.deck ?? {}),
    pile: Object.values(raw.pile ?? {}),
    places: Object.values(raw.places ?? {}),
    drawn: raw.drawn ?? null,
    stuck: raw.stuck ?? 0,
    over: !!raw.over,
    winner: raw.winner ?? null,
    dir: raw.dir === -1 ? -1 : 1,
  };
}

export function deal(seats: string[], random: () => number = Math.random): OchoState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) throw new Error('2–6 players');
  const deck = shuffle(fullDeck(), random);
  const hands: Record<string, Card[]> = {};
  for (const id of seats) hands[id] = [];
  for (let i = 0; i < HAND; i++) for (const id of seats) hands[id].push(deck.shift()!);
  // The game opens on a number: action and wild cards go back under the deck.
  let first = deck.shift()!;
  while (!isNumber(first)) {
    deck.push(first);
    first = deck.shift()!;
  }
  const opener = seats[Math.floor(random() * seats.length)];
  return {
    seats, hands, deck, pile: [first], color: colorOf(first)!, turn: opener, dir: 1, drawn: null,
    stuck: 0, over: false, winner: null, places: [], seq: 0,
  };
}

/** The player `steps` seats on from `from` in the current direction. */
export function nextSeat(s: OchoState, from: string, steps = 1): string {
  const n = s.seats.length;
  const i = s.seats.indexOf(from);
  return s.seats[(((i + s.dir * steps) % n) + n) % n];
}

/** True if `card` may go on the pile now from this hand (ignoring whose turn it is). */
export function fits(s: OchoState, card: Card, hand: Card[] = []): boolean {
  if (card === 'W4') return !hand.some((c) => colorOf(c) === s.color);
  if (isWild(card)) return true;
  const t = top(s);
  return colorOf(card) === s.color || (!isWild(t) && valueOf(card) === valueOf(t));
}

export function playable(s: OchoState, id: string): Card[] {
  if (s.over || s.turn !== id) return [];
  const hand = s.hands[id] ?? [];
  if (s.drawn) return hand.includes(s.drawn) && fits(s, s.drawn, hand) ? [s.drawn] : [];
  return hand.filter((c) => fits(s, c, hand));
}

export function legal(s: OchoState, id: string, move: Move): boolean {
  if (s.over || s.turn !== id) return false;
  const hand = s.hands[id] ?? [];
  switch (move.kind) {
    case 'play':
      if (!hand.includes(move.card) || !fits(s, move.card, hand)) return false;
      if (s.drawn && move.card !== s.drawn) return false;
      return isWild(move.card) ? COLORS.includes(move.color as Color) : true;
    case 'draw':
      return !s.drawn;
    case 'pass':
      return !!s.drawn;
  }
}

/** The next card off the deck, turning the pile (all but its top card) into a new deck if needed. */
function drawOne(s: OchoState, random: () => number): Card | null {
  if (!s.deck.length && s.pile.length > 1) {
    s.deck = shuffle(s.pile.slice(0, -1), random);
    s.pile = s.pile.slice(-1);
  }
  return s.deck.shift() ?? null;
}

function drawMany(s: OchoState, id: string, count: number, random: () => number): number {
  s.hands[id] = [...s.hands[id]];
  let got = 0;
  for (let i = 0; i < count; i++) {
    const c = drawOne(s, random);
    if (!c) break;
    s.hands[id].push(c);
    got++;
  }
  return got;
}

function finish(s: OchoState, winner: string | null): OchoState {
  const count = (id: string) => s.hands[id].length;
  const rest = s.seats.filter((id) => id !== winner).sort((a, b) => count(a) - count(b));
  return { ...s, over: true, winner: winner ?? rest[0] ?? null, places: winner ? [winner, ...rest] : rest, drawn: null };
}

/** Applies a legal move. Callers check `legal` first. */
export function play(prev: OchoState, id: string, move: Move, random: () => number = Math.random): OchoState {
  const s: OchoState = {
    ...prev,
    hands: { ...prev.hands, [id]: [...prev.hands[id]] },
    deck: [...prev.deck],
    pile: [...prev.pile],
    seq: prev.seq + 1,
  };

  if (move.kind === 'play') {
    const hand = s.hands[id];
    hand.splice(hand.indexOf(move.card), 1);
    s.pile.push(move.card);
    s.drawn = null;
    s.stuck = 0;
    s.color = isWild(move.card) ? move.color! : colorOf(move.card)!;
    const last: LastMove = { kind: 'play', card: move.card, ...(move.color ? { color: move.color } : {}), by: id };
    s.last = last;
    if (!hand.length) return finish(s, id);
    if (hand.length === 1) {
      last.called = !!move.call;
      if (!move.call) last.drew = drawMany(s, id, CALL_PENALTY, random);
    }
    const v = valueOf(move.card);
    const next = nextSeat(s, id);
    if (v === 'D' || v === '4') {
      const drew = drawMany(s, next, v === 'D' ? 2 : 4, random);
      last.hit = { id: next, drew };
      s.turn = nextSeat(s, id, 2);
    } else if (v === 'S' || (v === 'V' && s.seats.length === 2)) {
      last.hit = { id: next, drew: 0 };
      s.turn = nextSeat(s, id, 2);
    } else if (v === 'V') {
      s.dir = s.dir === 1 ? -1 : 1;
      s.turn = nextSeat(s, id);
    } else {
      s.turn = next;
    }
    return s;
  }

  if (move.kind === 'pass') {
    s.drawn = null;
    s.last = { kind: 'pass', by: id };
    s.turn = nextSeat(s, id);
    return s;
  }

  // Draw one card; play it at once if it fits.
  const got = drawMany(s, id, 1, random);
  s.last = { kind: 'draw', by: id, drew: got };
  s.stuck = got ? 0 : s.stuck + 1;
  if (s.stuck >= STUCK_LIMIT) return finish(s, null);
  const card = got ? s.hands[id][s.hands[id].length - 1] : null;
  if (card && fits(s, card, s.hands[id])) s.drawn = card;
  else s.turn = nextSeat(s, id);
  return s;
}
