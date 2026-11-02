# «Бильярд» room protocol

8-ball pool for two players. A game against the bot runs on the player's device only; a game with a
friend lives in the Realtime Database of the app's Firebase project, so a second client (the mobile
app) can join it. The reference implementation is `src/lib/pool/physics.ts` (table and physics),
`src/lib/pool/rules.ts` (rules, pure functions), `src/lib/pool/bot.ts` and `src/lib/pool/store.ts`
(room flow). `npm run test:pool` checks physics, rules and bot games.

## Where a room lives

`Games/pool_{code}`, where `code` is the six-digit room code. As with `durak_{code}`, the prefix
keeps these rooms apart from the quiz rooms. The join screen tries `durak_{code}`, then
`pool_{code}`, then the quiz rooms.

```jsonc
{
  "kind": "pool",
  "code": "512438",
  "hostId": "<player id of the creator>",
  "vsBot": false,
  "status": "lobby | playing | over | closed",
  "createdAt": 1761650000000,
  "changedAt": 1761650012345,          // when the last shot (or the deal) was written
  "members": {
    "<player id>": { "name": "Аня", "avatar": "https://…", "joinedAt": 1761650001000, "left": true }
  },
  "state": { /* PoolState, see below */ },
  "shot": { /* the shot that led to `state`, see below */ },
  "wins": { "<player id>": 2 }         // games won in this room
}
```

## Table

Millimetres, portrait: `x` across 0…1000, `y` along 0…2000, ball radius 28.6. Pockets sit at the
four corners and the middle of the long rails (`x = 0` and `x = 1000`, `y = 1000`). The rack's apex is
on the foot spot (500, 500); the cue ball starts at (500, 1600); the breaker plays from the `y`
end above 1500.

## State

```jsonc
{
  "balls": [{ "n": 0, "x": 500, "y": 1600, "down": false }, …],   // 0 cue, 1–7 solids, 8, 9–15 stripes
  "players": ["<id>", "<id>"],     // seat 0 breaks
  "turn": 0,                        // seat to shoot
  "groups": [null, null],           // "solid" | "stripe" per seat once decided
  "ballInHand": false,              // the shooter places the cue ball anywhere first
  "breakShot": true,
  "seq": 0,                         // shots played
  "over": false,
  "winner": null,                   // seat
  "last": { "by": 0, "pocketed": [3], "foul": "биток в лузе", "note": "…" }
}
```

RTDB drops `null` entries and empty arrays, so a reader puts them back (`normalizeState`).

## A shot

The player whose turn it is writes, in one update:

```jsonc
{
  "shot": { "seq": 7, "by": "<id>", "dx": 0.6, "dy": -0.8, "power": 0.55, "place": { "x": 300, "y": 900 }, "dur": 4120 },
  "state": { /* the table after the shot, seq 8 */ },
  "changedAt": 1761650099000
}
```

`dx, dy` is the aim as a unit vector, `power` is 0…1 of 6400 mm/s, `place` is where the cue ball
was put when it was in hand, `dur` is how long the shot rolls (ms). Every client replays the shot
from the table it shows (state `seq` 7) and then shows the written state. The physics uses only
+ − × ÷ and `sqrt` with a fixed 1 ms step, so the replay ends exactly on the written table on any
device; a client that missed a shot just jumps to the written state.

## Rules (simplified WPA 8-ball)

- Table open after the break; the first ball pocketed on a legal shot decides the groups.
- The shooter keeps the turn while they pocket their own balls without a foul (on the break: any ball).
- Fouls: cue ball pocketed, no ball hit, the wrong ball hit first (on an open table the 8 is wrong),
  no ball pocketed and no cushion touched after the first contact, or the shot clock ran out.
  After a foul the opponent has the cue ball in hand anywhere.
- The 8 on the break goes back to the foot spot. Later, pocketing it after clearing the group
  wins; pocketing it earlier, or with a foul, loses. Pockets are not called.

## Host duties

The creator's browser is the host. It plays for a player who left (`left: true`, set on disconnect)
with the bot logic, and when the shooter has not shot within 60 s after the balls stopped
(`changedAt + shot.dur + 60000`) it writes the time-out foul (`state` only, `shot: null`). If the host
leaves, the room's `status` becomes `closed`. A player who leaves mid-game with the exit button
gives the game away. Rematches alternate who breaks.
