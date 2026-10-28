/**
 * Server host for the always-on ad rooms: runs one game type's room forever, game after game,
 * with the same code. It drives the room with the web app's own game store, so the rules, bots
 * and timing are the ones the browsers and the mobile app already follow.
 *
 *   npx tsx server/eternal-host.ts music     # or quiz
 *
 * Env: NEXT_PUBLIC_FIREBASE_API_KEY (as on Vercel); for local tests NEXT_PUBLIC_FIRESTORE_EMULATOR
 * and NEXT_PUBLIC_RTDB_EMULATOR; SITE_URL for bot avatars.
 */
import { ETERNAL_CODES, ETERNAL_FINAL_MS, eternalSettings, isEternalType, type EternalType } from '../src/lib/game/eternal';

const type = process.argv[2] ?? '';
if (!isEternalType(type)) {
  console.error('usage: eternal-host.ts music|quiz');
  process.exit(2);
}

// The store keeps the player id in localStorage; give the host a fixed one per room.
const memory = new Map<string, string>([['sg.uid', `webhost${type}`], ['sg.name', 'OK Battle']]);
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString(), type, ...a);

async function pickQuestions(t: EternalType) {
  const { dataSource, pickRandom } = await import('../src/lib/data/source');
  const src = await dataSource();
  const cats = await src.categories(t);
  // A mix of the catalog: random subcategories across all categories, as a broad audience needs.
  const subs = pickRandom(cats.flatMap((c) => c.subcategories.map((s) => ({ cat: c.id, sub: s.id }))), 8);
  const categories = [...new Set(subs.map((s) => s.cat))].map((id) => ({ id, subcategories: subs.filter((s) => s.cat === id).map((s) => s.sub) }));
  const settings = eternalSettings(t, categories);
  // Short games for local testing.
  if (process.env.ETERNAL_ROUNDS) settings.rounds = Number(process.env.ETERNAL_ROUNDS);
  const questions = await src.questions(t, subs.map((s) => s.sub), settings.rounds, settings.difficulty);
  return { settings: { ...settings, rounds: questions.length }, questions };
}

async function main(t: EternalType) {
  const { useGame } = await import('../src/lib/game/store');
  const { backend } = await import('../src/lib/net');
  const be = await backend();
  const store = useGame;
  store.getState().setName('OK Battle');
  store.getState().setAvatar('');

  // The host advances the game the same way a browser host does, on a short tick.
  setInterval(() => store.getState().drive(), 100);

  // On shutdown (a new version deploying), end the game the way a host leaving does; the players
  // then look for the room again and find the next server's game.
  let stopping = false;
  process.on('SIGTERM', () => {
    stopping = true;
    const id = store.getState().room?.id;
    if (!id) process.exit(0);
    void be.update(id, { currentEvent: 'master_left' }).then(() => be.deleteGame(id)).finally(() => setTimeout(() => process.exit(0), 500));
  });

  let previous: string | null = null;
  while (!stopping) {
    let made: Awaited<ReturnType<typeof pickQuestions>> | null = null;
    try {
      made = await pickQuestions(t);
      if (!made.questions.length) throw new Error('no questions');
      await store.getState().createRoom(made.settings, made.questions, ETERNAL_CODES[t]);
      // The room shows up once its live node has been read back.
      for (let i = 0; i < 100 && store.getState().room?.stage !== 'lobby'; i++) await sleep(50);
      store.getState().start();
      log('game', store.getState().room?.id, 'code', ETERNAL_CODES[t], 'rounds', made.questions.length);
    } catch (e) {
      log('could not start a game:', e);
      await sleep(5000);
      continue;
    }

    // The players of the last game see its results, then the game ends and they move here.
    if (previous) {
      const old = previous;
      setTimeout(() => {
        void be.update(old, { currentEvent: 'master_left' }).then(async () => {
          await be.deleteGame(old);
          setTimeout(() => void be.remove(old), 3000);
        });
      }, ETERNAL_FINAL_MS);
    }

    // Wait for this game's final results; the next game starts at once so ad visitors never wait.
    for (;;) {
      await sleep(500);
      const room = store.getState().room;
      if (!room || stopping) break;
      if (room.stage === 'final') break;
    }
    previous = store.getState().room?.id ?? null;
    log('final', previous);
  }
}

void main(type);
