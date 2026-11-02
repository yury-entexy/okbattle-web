import { COLORS, colorOf, isWild, nextSeat, playable, valueOf, type Card, type Color, type Move, type OchoState } from './rules';

/** The colour this hand holds most of (ignoring `except`), for a wild card. */
export function bestColor(hand: Card[], except?: Card): Color {
  const count = (c: Color) => hand.filter((x) => x !== except && colorOf(x) === c).length;
  return [...COLORS].sort((a, b) => count(b) - count(a))[0];
}

/** How often a bot forgets to call «Очо!», so people can see the penalty happen. */
const FORGET = 0.12;

/**
 * A plain greedy player: keep wild cards for when nothing else fits, hit the next player with an
 * action card when they are close to winning, otherwise play the colour it holds most of.
 * `random` decides the odd forgotten «Очо!»; a player who timed out always calls.
 */
export function botMove(s: OchoState, id: string, random: () => number = Math.random): Move | null {
  if (s.over || s.turn !== id) return null;
  const hand = s.hands[id] ?? [];
  const options = playable(s, id);
  if (!options.length) return s.drawn ? { kind: 'pass' } : { kind: 'draw' };

  const threat = (s.hands[nextSeat(s, id)]?.length ?? 99) <= 2;
  const plain = options.filter((c) => !isWild(c));
  const score = (c: Card) => {
    const action = /[SVD]/.test(valueOf(c));
    const sameColour = hand.filter((x) => colorOf(x) === colorOf(c)).length;
    return (action ? (threat ? 50 : 1) : 0) + sameColour * 2 + (Number(valueOf(c)) || 0) / 10;
  };
  let card: Card;
  if (plain.length && !(threat && options.includes('W4'))) card = [...plain].sort((a, b) => score(b) - score(a))[0];
  else card = options.includes('WW') && !threat ? 'WW' : options.find(isWild) ?? options[0];
  const call = hand.length === 2 && random() >= FORGET;
  return {
    kind: 'play',
    card,
    ...(isWild(card) ? { color: bestColor(hand, card) } : {}),
    ...(call ? { call: true } : {}),
  };
}
