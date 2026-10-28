# OK Battle (SoundGuess) — Next.js

Web port of the Flutter app. It reads the mobile app's Firebase project, so categories, songs and quiz questions are the same.

## What works now

- Music mode: a snippet plays, you pick the artist or the title from 4 options.
- Quiz mode: general-knowledge questions (with images where they exist).
- A room with a code, 1–5 bot opponents (same accuracy rules as the mobile bots), 5 or 10 rounds of 15 or 30 seconds.
- Scoring as in the app: the most correct answers wins, ties go to the faster total answer time.

Rooms use the mobile app's own format (Firestore `OKGames` + Realtime Database `Games/{id}`), so web and mobile players join each other's games by the same 6-digit code. Each web player gets a guest `Users` doc. Not yet: movie games, sign-in, video broadcast (Agora), chat, voting, reactions, kicking players, scheduled games, background music, subscription and ads.

Local testing against emulators: set `NEXT_PUBLIC_FIRESTORE_EMULATOR=127.0.0.1:8085` and `NEXT_PUBLIC_RTDB_EMULATOR=127.0.0.1:9000`.

## Run

```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_FIREBASE_API_KEY (and the web app id once it exists)
npm run dev
```

`NEXT_PUBLIC_DATA_SOURCE=firebase` reads live data from Firestore with `firebase/firestore/lite`
(no realtime listeners, a much smaller bundle). The SDK only loads when the setup screen asks for categories.

## Always-on rooms for ads

`/?play=music` and `/?play=quiz` drop a visitor straight into a running game under a random guest
name (`Гость 1234`), no sign-up. Each link's room keeps a fixed code (music `700001`, quiz `700002`),
so app players can join it too. When a game ends, its players see the results for 10 s and then
move on to the next game, which is already running.

The rooms are driven by a server host that never leaves, one process per game type:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=... npx tsx server/eternal-host.ts music
NEXT_PUBLIC_FIREBASE_API_KEY=... npx tsx server/eternal-host.ts quiz
```

It uses the web app's own game store, so rules, bots and timing match the browsers. For local
tests add the emulator variables above and `ETERNAL_ROUNDS=2` for short games.

## Ad analytics

UTM tags and click ids (`fbclid`, `gclid`, `yclid`) from the landing URL are kept per visitor and
saved on their `Users` doc as `utm`. Counters load only when their ids are set on Vercel:
`NEXT_PUBLIC_FB_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_YM_ID`.
Goals sent to all of them: `game_join`, `game_start`, `game_finish`, `sign_up` (Facebook gets
`GameJoin`, `GameStart`, `GameFinish` and the standard `CompleteRegistration`).

## Sign-in

Google and Apple sign-in work as in the app: the player's `Users/{uid}` doc is keyed by the Firebase
Auth uid, so one account is one player on the phone and on the web. A player who already has a
profile from the app keeps its name and avatar. A first sign-in fires the `sign_up` goal.

To turn it on in the Firebase console (project sound-guess-95889):

1. Authentication → Settings → Authorized domains: add `okbattle-web.vercel.app` (and any custom domain).
2. Authentication → Sign-in method → Apple: add a Services ID for the web, with the return URL
   `https://sound-guess-95889.firebaseapp.com/__/auth/handler` registered for it in the Apple developer account.

`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` overrides the default auth domain; `NEXT_PUBLIC_AUTH_EMULATOR`
points sign-in at the Auth emulator for tests.

## Static demo build

`public/data/` holds a snapshot of the catalog (`catalog.json` + `media/`), made by the export script
in the project files. `npm run build:demo` builds a static site in `out/` that works from any folder,
with no server and no Firebase.

## Performance choices

- One static page; the Firebase SDK and the game screens load only when needed.
- Snippets are fetched and decoded with the Web Audio API one round ahead, so sound starts on the first frame.
- Round timers come from timestamps (`performance.now()`), not from intervals, so a background tab catches up instead of drifting.
- Evolventa is self-hosted through `next/font` and does not block rendering.

Refresh the demo snapshot: `FIREBASE_API_KEY=... python3 scripts/snapshot/export.py public/data` (needs ffmpeg;
the subcategory list is at the top of the script).
