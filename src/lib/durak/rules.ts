/**
 * «Дурак» on a 36-card deck for 2–5 players, in three modes:
 * - `classic` (обычный): players throw in by turns: the attacker first, then clockwise from the
 *   defender's left, each until they pass;
 * - `throwin` (подкидной): every player but the defender throws in at any time;
 * - `transfer` (переводной): as подкидной, and the defender may pass the attack on with a card of
 *   the same rank before beating anything.
 *
 * Pure functions over a plain JSON state, so the same state can live in the Realtime Database and
 * be read by any client (web now, the mobile app later). Cards are two characters: rank
 * `6789TJQKA` and suit `SCDH` (♠♣♦♥), e.g. `TH` is the ten of hearts.
 */

export type Card = string;
export type Mode = 'classic' | 'throwin' | 'transfer';
export const MODES: Mode[] = ['classic', 'throwin', 'transfer'];

export const RANKS = '6789TJQKA';
export const SUITS = 'SCDH';
export const HAND = 6;
/** With the deck gone, this many takes in a row and no discard end the game in a draw. */
export const STALE_BOUTS = 24;

export interface Pair {
  /** The attacking card. */
  a: Card;
  /** The card that beat it, once beaten. */
  d?: Card;
}

export interface DurakState {
  mode: Mode;
  /** Player ids clockwise. */
  seats: string[];
  hands: Record<string, Card[]>;
  /** Drawn from the front; the last card is the trump, shown face up. */
  deck: Card[];
  trump: Card;
  table: Pair[];
  attacker: string;
  defender: string;
  /** Players who passed in this bout. */
  passed: string[];
  /** The defender said «Беру»; the others may still throw in before they take. */
  taking: boolean;
  /** At most this many attack cards this bout: 6, or fewer if the defender had fewer cards. */
  limit: number;
  /** Players who got rid of all their cards, in order. */
  out: string[];
  over: boolean;
  /** The loser once the game is over; null on a draw. */
  fool: string | null;
  discarded: number;
  /** Bouts in a row taken after the deck ran out; the game is a draw if cards only go round. */
  stale: number;
  /** Bumped by every move, so clients can tell states apart. */
  seq: number;
  last?: Move & { by: string };
}

export type Move =
  | { kind: 'attack'; card: Card }
  | { kind: 'defend'; card: Card; target: number }
  | { kind: 'transfer'; card: Card }
  | { kind: 'take' }
  | { kind: 'pass' };

export const rank = (c: Card) => RANKS.indexOf(c[0]);
export const suit = (c: Card) => c[1];

/** True if `card` beats `attack` with `trump` as the trump suit. */
export function beats(card: Card, attack: Card, trumpSuit: string): boolean {
  if (suit(card) === suit(attack)) return rank(card) > rank(attack);
  return suit(card) === trumpSuit && suit(attack) !== trumpSuit;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The Realtime Database drops empty arrays and objects: put them back. */
export function normalize(raw: DurakState): DurakState {
  const hands: Record<string, Card[]> = {};
  for (const id of raw.seats) hands[id] = Object.values(raw.hands?.[id] ?? {});
  return {
    ...raw,
    hands,
    deck: Object.values(raw.deck ?? {}),
    table: Object.values(raw.table ?? {}),
    passed: Object.values(raw.passed ?? {}),
    out: Object.values(raw.out ?? {}),
    taking: !!raw.taking,
    over: !!raw.over,
    fool: raw.fool ?? null,
    discarded: raw.discarded ?? 0,
    stale: raw.stale ?? 0,
  };
}

export function deal(seats: string[], mode: Mode, random: () => number = Math.random): DurakState {
  if (seats.length < 2 || seats.length > 5) throw new Error('2–5 players');
  const deck = shuffle(fullDeck(), random);
  const hands: Record<string, Card[]> = {};
  for (const id of seats) hands[id] = [];
  for (let i = 0; i < HAND; i++) for (const id of seats) hands[id].push(deck.shift()!);
  const trump = deck[deck.length - 1];
  // The player with the lowest trump leads.
  let attacker = seats[0];
  let low = Infinity;
  for (const id of seats) {
    for (const c of hands[id]) {
      if (suit(c) === suit(trump) && rank(c) < low) {
        low = rank(c);
        attacker = id;
      }
    }
  }
  const state: DurakState = {
    mode, seats, hands, deck, trump, table: [], attacker, defender: attacker, passed: [], taking: false,
    limit: HAND, out: [], over: false, fool: null, discarded: 0, stale: 0, seq: 0,
  };
  state.defender = nextActive(state, attacker);
  state.limit = Math.min(HAND, hands[state.defender].length);
  return state;
}

const active = (s: DurakState, id: string) => !s.out.includes(id);

/** The next player clockwise who is still in the game. */
export function nextActive(s: DurakState, from: string): string {
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= s.seats.length; k++) {
    const id = s.seats[(i + k) % s.seats.length];
    if (active(s, id)) return id;
  }
  return from;
}

/** Everyone but the defender, in throwing order: the attacker, then clockwise from the defender. */
export function throwOrder(s: DurakState): string[] {
  const order = [s.attacker];
  let id = s.defender;
  for (let k = 0; k < s.seats.length; k++) {
    id = nextActive(s, id);
    if (id === s.defender || order.includes(id)) continue;
    order.push(id);
  }
  return order.filter((p) => p !== s.defender && active(s, p));
}

const unbeaten = (s: DurakState) => s.table.filter((p) => !p.d).length;
export const allBeaten = (s: DurakState) => s.table.length > 0 && unbeaten(s) === 0;
const tableRanks = (s: DurakState) => new Set(s.table.flatMap((p) => (p.d ? [p.a[0], p.d[0]] : [p.a[0]])));

/** Room for one more attack card: under the bout's limit and no more open cards than the defender holds. */
function roomForMore(s: DurakState): boolean {
  return s.table.length < s.limit && unbeaten(s) < s.hands[s.defender].length;
}

/** The cards `id` could throw in right now (ignoring whose turn it is). */
export function throwable(s: DurakState, id: string): Card[] {
  if (s.over || id === s.defender || !active(s, id) || !s.table.length || !roomForMore(s)) return [];
  const ranks = tableRanks(s);
  return s.hands[id].filter((c) => ranks.has(c[0]));
}

/** Who may throw in now. In обычный mode one player at a time; otherwise anyone with a card. */
export function throwers(s: DurakState): string[] {
  if (!s.table.length) return [];
  const able = throwOrder(s).filter((id) => !s.passed.includes(id) && throwable(s, id).length > 0);
  return s.mode === 'classic' ? able.slice(0, 1) : able;
}

export function canTransfer(s: DurakState, id: string, card: Card): boolean {
  if (s.mode !== 'transfer' || s.over || id !== s.defender || s.taking || !s.table.length) return false;
  if (s.table.some((p) => p.d) || !s.hands[id].includes(card) || card[0] !== s.table[0].a[0]) return false;
  // The next player has to be able to answer every card, the new one included.
  return s.table.length + 1 <= s.hands[nextActive(s, id)].length;
}

/** Whether `move` by `id` is allowed now. */
export function legal(s: DurakState, id: string, move: Move): boolean {
  if (s.over || !active(s, id)) return false;
  const hand = s.hands[id] ?? [];
  switch (move.kind) {
    case 'attack':
      if (!hand.includes(move.card)) return false;
      if (!s.table.length) return id === s.attacker;
      return throwers(s).includes(id) && throwable(s, id).includes(move.card);
    case 'defend': {
      const pair = s.table[move.target];
      return id === s.defender && !s.taking && hand.includes(move.card) && !!pair && !pair.d && beats(move.card, pair.a, suit(s.trump));
    }
    case 'transfer':
      return canTransfer(s, id, move.card);
    case 'take':
      return id === s.defender && !s.taking && unbeaten(s) > 0;
    case 'pass':
      return (s.taking || allBeaten(s)) && throwOrder(s).includes(id) && !s.passed.includes(id) &&
        (s.mode !== 'classic' || throwers(s)[0] === id || throwable(s, id).length === 0);
  }
}

/** Applies a legal move and returns the new state; `settle` then closes the bout when it is over. */
export function play(prev: DurakState, id: string, move: Move): DurakState {
  if (!legal(prev, id, move)) throw new Error(`illegal ${move.kind} by ${id}`);
  const s: DurakState = structuredClone(prev);
  const drop = (card: Card) => (s.hands[id] = s.hands[id].filter((c) => c !== card));
  switch (move.kind) {
    case 'attack':
      drop(move.card);
      s.table.push({ a: move.card });
      // In подкидной and переводной, a new card gives everyone who passed another go.
      if (s.mode !== 'classic') s.passed = [];
      break;
    case 'defend':
      drop(move.card);
      s.table[move.target].d = move.card;
      break;
    case 'transfer': {
      drop(move.card);
      s.table.push({ a: move.card });
      s.attacker = id;
      s.defender = nextActive(s, id);
      s.limit = Math.min(HAND, s.hands[s.defender].length);
      s.passed = [];
      break;
    }
    case 'take':
      s.taking = true;
      s.passed = [];
      break;
    case 'pass':
      s.passed.push(id);
      break;
  }
  s.seq += 1;
  s.last = { ...move, by: id };
  return s;
}

/** The bout is over: every card is beaten (or the defender takes) and nobody can or will add one. */
export function boutOver(s: DurakState): boolean {
  return !s.over && s.table.length > 0 && (s.taking || allBeaten(s)) && throwers(s).length === 0;
}

/** Closes a finished bout: the cards go to the discard or to the defender, hands are refilled and
 *  the turn moves on. Returns a new state. */
export function settle(prev: DurakState): DurakState {
  if (!boutOver(prev)) return prev;
  const s: DurakState = structuredClone(prev);
  s.seq += 1;
  const taken = s.taking;
  const cards = s.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
  if (taken) s.hands[s.defender].push(...cards);
  else s.discarded += cards.length;
  // Refill: the attacker first, then the other throwers, the defender last.
  for (const id of [...throwOrder(s), s.defender]) {
    while (s.hands[id].length < HAND && s.deck.length) s.hands[id].push(s.deck.shift()!);
  }
  const defender = s.defender;
  for (const id of s.seats) if (!s.deck.length && !s.hands[id].length && active(s, id)) s.out.push(id);
  s.table = [];
  s.passed = [];
  s.taking = false;
  s.stale = taken && !s.deck.length ? s.stale + 1 : 0;
  const left = s.seats.filter((id) => active(s, id));
  if (left.length <= 1 || s.stale >= STALE_BOUTS) {
    s.over = true;
    s.fool = left.length === 1 ? left[0] : null;
    return s;
  }
  // After a successful defence the defender leads; after taking, the player after them does.
  s.attacker = taken ? nextActive(s, defender) : active(s, defender) ? defender : nextActive(s, defender);
  s.defender = nextActive(s, s.attacker);
  s.limit = Math.min(HAND, s.hands[s.defender].length);
  return s;
}

/** Whose move the table is waiting on: the defender, the throwers, or the attacker to lead. */
export function waitingOn(s: DurakState): string[] {
  if (s.over || boutOver(s)) return [];
  if (!s.table.length) return [s.attacker];
  const list = new Set<string>();
  if (!s.taking && unbeaten(s) > 0) list.add(s.defender);
  for (const id of throwers(s)) list.add(id);
  if (s.taking || allBeaten(s)) for (const id of throwOrder(s)) if (!s.passed.includes(id) && legal(s, id, { kind: 'pass' })) list.add(id);
  return [...list];
}
