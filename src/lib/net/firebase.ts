import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore/lite';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  update,
} from 'firebase/database';
import { firebaseApp } from '@/lib/firebase-app';
import { db as firestore } from '@/lib/data/firebase';
import type { Backend, GameDoc, LiveGame } from './types';

const rtdb = getDatabase(firebaseApp());
const emulator = process.env.NEXT_PUBLIC_RTDB_EMULATOR;
if (emulator) {
  const [host, port] = emulator.split(':');
  connectDatabaseEmulator(rtdb, host, Number(port));
}

let offset = 0;
onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
  offset = Number(snap.val()) || 0;
});

// The Realtime Database rejects `undefined` anywhere in a write.
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const live = (id: string, path = '') => ref(rtdb, `Games/${id}${path ? `/${path}` : ''}`);

export const firebaseBackend: Backend = {
  shared: true,

  async findGame(code) {
    const snap = await getDocs(query(collection(firestore, 'OKGames'), where('code', '==', code)));
    // Old docs can linger with the same code until the cleanup function runs: take a running one.
    const docs = snap.docs.sort(
      (a, b) => (b.data().creationTime?.toMillis?.() ?? 0) - (a.data().creationTime?.toMillis?.() ?? 0),
    );
    for (const d of docs) {
      const event = (await get(live(d.id, 'currentEvent'))).val();
      if (event && event !== 'master_left') return { id: d.id, doc: d.data() as GameDoc };
    }
    return null;
  },

  async createGame(game) {
    const now = Timestamp.now();
    const created = await addDoc(collection(firestore, 'OKGames'), { ...game, startTime: now, creationTime: now });
    return created.id;
  },

  async deleteGame(id) {
    await deleteDoc(doc(firestore, 'OKGames', id));
  },

  async saveUser(id, user) {
    await setDoc(doc(firestore, 'Users', id), { isGuest: true, source: 'web', ...user }, { merge: true });
  },

  watch(id, onChange) {
    return onValue(live(id), (snap) => onChange(snap.exists() ? (snap.val() as LiveGame) : null));
  },
  async read(id) {
    const snap = await get(live(id));
    return snap.exists() ? (snap.val() as LiveGame) : null;
  },
  async update(id, patch) {
    await update(live(id), clean(patch));
  },
  async remove(id, path) {
    await remove(live(id, path));
  },
  onDisconnect(id, path, value) {
    const target = onDisconnect(live(id, path));
    void (value === null ? target.remove() : target.set(clean(value)));
  },
  cancelOnDisconnect(id, path) {
    void onDisconnect(live(id, path)).cancel();
  },
  now: () => Date.now() + offset,
};
