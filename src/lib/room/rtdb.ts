import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { firebaseApp } from '@/lib/firebase-app';
import type { Room, RoomTransport } from './types';

// Web rooms live under their own node so they never collide with the mobile app's `Games`.
const ROOT = 'WebRooms';
const db = getDatabase(firebaseApp());
const emulator = process.env.NEXT_PUBLIC_RTDB_EMULATOR;
if (emulator) {
  const [host, port] = emulator.split(':');
  connectDatabaseEmulator(db, host, Number(port));
}

let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
  offset = Number(snap.val()) || 0;
});

// The Realtime Database rejects `undefined` anywhere in a write.
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const roomRef = (code: string, path = '') => ref(db, `${ROOT}/${code}${path ? `/${path}` : ''}`);

export const rtdbTransport: RoomTransport = {
  shared: true,
  async exists(code) {
    return (await get(roomRef(code, 'hostId'))).exists();
  },
  async create(room) {
    await set(roomRef(room.code), clean(room));
  },
  subscribe(code, onChange) {
    return onValue(roomRef(code), (snap) => onChange(snap.exists() ? (snap.val() as Room) : null));
  },
  async update(code, patch) {
    await update(roomRef(code), clean(patch));
  },
  leaveOnDisconnect(code, playerId, isHost) {
    void onDisconnect(isHost ? roomRef(code) : roomRef(code, `players/${playerId}`)).remove();
  },
  async remove(code, path) {
    await remove(roomRef(code, path));
  },
  serverNow: () => Date.now() + offset,
};
