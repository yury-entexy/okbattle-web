import { allBeaten, beats, canTransfer, legal, rank, suit, throwable, throwers, type Card, type DurakState, type Move } from './rules';

// A plain greedy player: spend the cheapest card that does the job, keep trumps while the deck lasts.
const cost = (c: Card, trump: string) => rank(c) + (suit(c) === trump ? 20 : 0);
const cheapest = (cards: Card[], trump: string) => [...cards].sort((x, y) => cost(x, trump) - cost(y, trump))[0];

/** The bot's move, or null if it has nothing to do now. */
export function botMove(s: DurakState, id: string): Move | null {
  if (s.over) return null;
  const trump = suit(s.trump);
  const hand = s.hands[id] ?? [];
  const late = s.deck.length === 0;

  if (id === s.defender && !s.taking && s.table.some((p) => !p.d)) {
    if (s.mode === 'transfer') {
      const pass = hand.filter((c) => suit(c) !== trump && canTransfer(s, id, c));
      if (pass.length) return { kind: 'transfer', card: cheapest(pass, trump) };
    }
    // Beat every open card with the cheapest answer, or take if one can't be beaten.
    const used = new Set<Card>();
    let first: Move | null = null;
    let trumpsSpent = 0;
    for (let i = 0; i < s.table.length; i++) {
      const pair = s.table[i];
      if (pair.d) continue;
      const options = hand.filter((c) => !used.has(c) && beats(c, pair.a, trump));
      if (!options.length) return { kind: 'take' };
      const card = cheapest(options, trump);
      used.add(card);
      if (suit(card) === trump && rank(card) >= rank('Q' + trump)) trumpsSpent++;
      first ??= { kind: 'defend', card, target: i };
    }
    // Early on, don't burn high trumps on a couple of small cards.
    if (!late && trumpsSpent > 0 && s.table.length <= 2 && s.deck.length > 6) return { kind: 'take' };
    return first;
  }

  if (!s.table.length) {
    if (id !== s.attacker || !hand.length) return null;
    return { kind: 'attack', card: cheapest(hand, trump) };
  }

  if (throwers(s).includes(id)) {
    const cards = throwable(s, id).filter((c) => late || (suit(c) !== trump && rank(c) < rank('K' + trump)));
    // While the defender takes, only throw in what is worth getting rid of.
    if (cards.length) return { kind: 'attack', card: cheapest(cards, trump) };
  }
  if ((s.taking || allBeaten(s)) && legal(s, id, { kind: 'pass' })) return { kind: 'pass' };
  return null;
}
