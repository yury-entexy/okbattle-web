# «Дурак» room protocol

The web plays «Дурак» through the Realtime Database of the same Firebase project as the app. This
page is the contract a second client (the mobile app) needs to join the same tables. The reference
implementation is `src/lib/durak/rules.ts` (rules, pure functions) and `src/lib/durak/store.ts`
(room flow).

## Where a room lives

`Games/durak_{code}`, where `code` is the six-digit room code. The prefix keeps these rooms apart
from the quiz rooms (`Games/{OKGames doc id}`), which the app already reads. A code is never used by
a quiz room and a «Дурак» room at the same time, so the join screen can try `durak_{code}` first and
fall back to `OKGames` where `code == …`.

```jsonc
{
  "kind": "durak",
  "code": "512438",
  "hostId": "<Users doc id of the creator>",
  "mode": "classic | throwin | transfer",   // обычный | подкидной | переводной
  "bots": 2,                                 // bots to add at the start, 0–4
  "status": "lobby | playing | over | closed",
  "createdAt": 1761650000000,
  "changedAt": 1761650012345,                // server time of the last state change
  "members": {
    "<player id>": { "name": "Аня", "avatar": "https://…", "joinedAt": 1761650001000, "bot": true, "left": true }
  },
  "state": { /* see below; present once the game started */ },
  "moves": { "<serverTime>_<player id>": { "by": "<player id>", "move": { /* Move */ }, "at": 1761650013000 } }
}
```

## Cards and state

A card is two characters: rank `6789TJQKA` and suit `S C D H` (♠ ♣ ♦ ♥). `TH` is the ten of hearts.

```jsonc
{
  "mode": "throwin",
  "seats": ["p1", "bot0_512438", "p2"],   // clockwise
  "hands": { "p1": ["6S", "TH"] },        // every player's cards
  "deck": ["…"],                          // drawn from index 0; the last card is the trump
  "trump": "9D",                          // shown face up under the deck
  "table": [{ "a": "7S", "d": "9S" }, { "a": "7H" }],  // attack card, and the card that beat it
  "attacker": "p1", "defender": "bot0_512438",
  "passed": ["p2"],                       // players who said «Бито»/«Пас» this bout
  "taking": false,                        // the defender said «Беру»
  "limit": 6,                             // max attack cards this bout
  "out": ["p2"],                          // finished players, in order
  "over": false, "fool": null,            // the loser, or null on a draw
  "discarded": 12, "stale": 0, "seq": 41,
  "last": { "by": "p1", "kind": "attack", "card": "7H" }
}
```

The Realtime Database drops empty arrays, so a reader must treat a missing `hands[id]`, `deck`,
`table`, `passed` or `out` as empty (`normalize()` does this).

## Moves

```jsonc
{ "kind": "attack",   "card": "7H" }              // lead, or throw in a rank already on the table
{ "kind": "defend",   "card": "9H", "target": 1 } // beat table[target]
{ "kind": "transfer", "card": "7C" }              // переводной only, before anything is beaten
{ "kind": "take" }
{ "kind": "pass" }                                // «Бито» when everything is beaten, «Пас» while the defender takes
```

## Who does what

- The **host's device is the referee.** It applies its own moves directly, reads `moves/`, applies
  the legal ones in key order, deletes them, and writes the new `state` with `changedAt`.
- **Players** only write `moves/{serverTime}_{id}`; they never write `state`.
- The host also moves for **bots** (after 0.7–1.5 s), for players who **left** (`members/{id}/left`,
  set by an onDisconnect), and for anyone who doesn't move within **30 s** of `changedAt` (they take,
  lead their lowest card, or pass).
- When a bout is over (everything beaten or the defender takes, and nobody can or will add a card),
  the host waits 1.1 s so everyone sees the table, then settles it: refill hands (attacker first,
  defender last), mark players without cards as `out`, move the turn on.
- The host sets `status: "closed"` on disconnect; clients leave the room when they see it.

## Rules in short

- 36 cards, 6 each, the bottom card of the deck is the trump. The lowest trump leads the first bout.
- No more attack cards than `limit` (6, or the defender's hand size at the bout start), and never
  more open cards than the defender holds.
- **обычный**: throwing in goes by turns: the attacker until they pass, then clockwise from the
  defender's left. **подкидной**: anyone but the defender at any time; a new card gives everyone who
  passed another go. **переводной**: as подкидной; before beating anything, the defender may add a
  card of the same rank if the next player holds enough cards to answer them all; the next player
  becomes the defender.
- After a successful defence the defender leads; after taking, the player after them leads.
- The last player with cards is the fool. Everyone out at once is a draw, and so is a game where,
  with the deck gone, 24 bouts in a row end in taking.

Known limit: every hand is readable by every client in the room. A referee in Cloud Functions with
per-player hand paths would close that once the game is worth cheating at.
