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
