import type { Room, RoomTransport } from './types';

// In-memory rooms for the offline demo build: same API, but only this tab can see them.
const rooms = new Map<string, Room>();
const listeners = new Map<string, Set<(room: Room | null) => void>>();

function emit(code: string) {
  const room = rooms.get(code) ?? null;
  const snapshot = room ? structuredClone(room) : null;
  listeners.get(code)?.forEach((fn) => fn(snapshot));
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('/');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    node[key] ??= {};
    node = node[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === null) delete node[last];
  else node[last] = value;
}

export const localTransport: RoomTransport = {
  shared: false,
  async exists(code) {
    return rooms.has(code);
  },
  async create(room) {
    rooms.set(room.code, structuredClone(room));
    emit(room.code);
  },
  subscribe(code, onChange) {
    const set = listeners.get(code) ?? new Set();
    set.add(onChange);
    listeners.set(code, set);
    queueMicrotask(() => onChange(rooms.has(code) ? structuredClone(rooms.get(code)!) : null));
    return () => set.delete(onChange);
  },
  async update(code, patch) {
    const room = rooms.get(code);
    if (!room) return;
    for (const [path, value] of Object.entries(patch)) setPath(room as unknown as Record<string, unknown>, path, value);
    emit(code);
  },
  leaveOnDisconnect() {},
  async remove(code, path) {
    if (path) await this.update(code, { [path]: null });
    else {
      rooms.delete(code);
      emit(code);
    }
  },
  serverNow: () => Date.now(),
};
