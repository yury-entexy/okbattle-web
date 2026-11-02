# «Очо» room protocol

«Очо» is a colour-and-number shedding card game (classic rules of the genre, our own name and card
design). The web plays it through the Realtime Database of the same Firebase project as the app;
this page is the contract a second client (the mobile app) needs to join the same tables. The
reference implementation is `src/lib/ocho/rules.ts` (rules, pure functions), `src/lib/ocho/room.ts`
(referee) and `src/lib/ocho/store.ts` (room flow). Tests: `npx tsx scripts/ocho-test.ts`.

## Where a room lives

`Games/ocho_{code}`, six-digit code. Codes are unique across quiz rooms (`OKGames`), `durak_{code}`
and `ocho_{code}`, so the join screen tries `durak_`, then `ocho_`, then `OKGames`.

```jsonc
{
  "kind": "ocho",
  "code": "512438",
  "hostId": "<Users doc id of the creator>",
  "bots": 3,                                 // bots to add at the start, 0–5
  "status": "lobby | playing | over | closed",
  "createdAt": 1761650000000,
  "changedAt": 1761650012345,                // server time of the last state change
  "members": {
    "<player id>": { "name": "Аня", "avatar": "https://…", "joinedAt": 1761650001000, "bot": true, "left": true }
  },
  "state": { /* see below; present once the game started */ },
  "moves": { "<serverTime>_<player id>": { "by": "<player id>", "move": { /* Move */ }, "at": 1761650013000 } },
  "eternal": true, "nextAt": 1761650020000   // ad tables only
}
```

## Cards

Two characters, colour then value. Colours `R Y G B` (red, yellow, green, blue). Values `0`–`9`,
`S` «Пропуск» (skip), `V` «Разворот» (reverse), `D` «+2». Wild cards: `WW` «Смена цвета», `W4` «+4».
Deck of 108: per colour one `0`, two each of `1`–`9`, `S`, `V`, `D`; four `WW`, four `W4`.

## State

```jsonc
{
  "seats": ["p1", "bot0_512438", "p2"],   // seating order
  "hands": { "p1": ["R5", "WW"] },        // every player's cards
  "deck": ["…"],                          // drawn from index 0
  "pile": ["G3", "R3"],                   // discard pile, last = top
  "color": "R",                           // colour to follow (top card's, or named with a wild)
  "turn": "p1", "dir": 1,                 // 1 or -1 after «Разворот»
  "drawn": null,                          // the card the player on turn just drew and may still play
  "stuck": 0, "over": false, "winner": null, "places": [], "seq": 41,
  "last": { "by": "p2", "kind": "play", "card": "RD", "hit": { "id": "p1", "drew": 2 }, "called": true }
}
```

The Realtime Database drops empty arrays and nulls: treat missing `hands[id]`, `deck`, `pile`,
`places`, `drawn`, `winner` as empty (`normalize()` does this).

## Moves

```jsonc
{ "kind": "play", "card": "R7" }                       // matches colour, value, or is wild
{ "kind": "play", "card": "WW", "color": "G" }         // wild: name the colour
{ "kind": "play", "card": "R7", "call": true }         // «Очо!»: called with the move that leaves one card
{ "kind": "draw" }                                     // take one card
{ "kind": "pass" }                                     // only after a draw, keeping the drawn card
```

## Rules the referee applies

- A card fits if it has the colour in play or the top card's value; `WW` always fits; `W4` fits only
  when the player holds no card of the colour in play.
- After `draw`: if the drawn card fits, `drawn` is set and the same player may play exactly that
  card or `pass`; otherwise the turn moves on. An empty deck is refilled from the pile under its top
  card; if three draws in a row find nothing, the game ends on card count.
- `S`: the next player misses the turn. `V`: direction flips (with two players it acts as `S`).
  `D` / `W4`: the next player draws 2 / 4 at once and misses the turn (no stacking).
- A play that leaves one card without `call: true` draws 2 penalty cards (`last.called = false`).
- No cards left: game over, `winner` = that player, `places` = winner then the rest by fewest cards.

## Who does what

As for «Дурак» (docs/durak-protocol.md): the host's device (or the server for ad tables) is the
referee; players only write `moves/`. The host moves for bots (after 0.8–1.6 s), for players who
left, and for anyone idle **20 s** after `changedAt`; such a forced move always calls «Очо!». Bots
forget to call about one time in eight. The host sets `status: "closed"` on disconnect.

## Ad tables

`/?play=ocho`: the server (`server/table-host.ts ocho`) publishes its open table at
`Games/ocho_eternal` (`{ code, at }`, refreshed every 5 s). If the pointer is missing or older than
15 s, the visitor's browser hosts its own table with 3 bots and deals at once.
