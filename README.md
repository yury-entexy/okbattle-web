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

`/?play=durak` seats the visitor at the server's open «Дурак» table (its code is published at
`Games/durak_eternal`). The table deals 4 s after the first person sits down, with bots in the empty
seats, and a new open table takes its place; after a game the same table deals again in 10 s for
whoever stayed.

One server runs all three: `server/main.ts` starts `eternal-host.ts music`, `eternal-host.ts quiz`
and `durak-host.ts` as child processes, restarts any that stops, and answers health checks on
`$PORT`. The hosts use the web app's own game code, so rules, bots and timing match the browsers.

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=... node --import tsx server/main.ts   # ROOMS=durak to run some only
```

For local tests add the emulator variables above and `ETERNAL_ROUNDS=2` for short games.

It deploys to Cloud Run (service `okbattle-ad-rooms`, europe-west1, one always-on instance) from
the `Dockerfile` by `.github/workflows/deploy-server.yml` on every push to `main` that touches the
server or the game code. The workflow needs the repository secrets `GCP_SA_KEY` (a service account
key with Cloud Run Admin, Artifact Registry Admin and Service Account User) and `FIREBASE_API_KEY`,
and the Cloud Run and Artifact Registry APIs enabled in the project.

## Ad analytics

UTM tags and click ids (`fbclid`, `gclid`, `yclid`) from the landing URL are kept per visitor and
saved on their `Users` doc as `utm`. Counters load only when their ids are set on Vercel:
`NEXT_PUBLIC_FB_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_YM_ID`.
Goals sent to all of them: `game_join`, `game_start`, `game_finish`, `sign_up` (Facebook gets
`GameJoin`, `GameStart`, `GameFinish` and the standard `CompleteRegistration`).

## «Дурак»

Create game → «Дурак»: обычный, подкидной or переводной, 36 cards, 2–5 players, people and bots
mixed. Friends join with the room code like any other game. The rules are pure functions in
`src/lib/durak/rules.ts` (with the bots in `bot.ts`); the room format, written so the mobile app can
join the same tables later, is in [docs/durak-protocol.md](docs/durak-protocol.md).

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
