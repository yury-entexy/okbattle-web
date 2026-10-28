import type { Backend, GameDoc, LiveGame } from './types';

// In-memory backend for the offline demo build: same API, but only this tab can see the games.
const docs = new Map<string, GameDoc>();
const games = new Map<string, Record<string, unknown>>();
const listeners = new Map<string, Set<(game: LiveGame | null) => void>>();
let nextId = 1;

const snapshot = (id: string) => (games.has(id) ? (structuredClone(games.get(id)) as unknown as LiveGame) : null);

function emit(id: string) {
  const game = snapshot(id);
  listeners.get(id)?.forEach((fn) => fn(game));
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
  else node[last] = structuredClone(value);
}

export const localBackend: Backend = {
  shared: false,
  async findGame(code) {
    for (const [id, doc] of docs) if (doc.code === code && games.has(id)) return { id, doc };
    return null;
  },
  async createGame(doc) {
    const id = `local${nextId++}`;
    docs.set(id, structuredClone(doc));
    return id;
  },
  async deleteGame(id) {
    docs.delete(id);
  },
  async saveUser() {},
  watch(id, onChange) {
    const set = listeners.get(id) ?? new Set();
    set.add(onChange);
    listeners.set(id, set);
    queueMicrotask(() => onChange(snapshot(id)));
    return () => set.delete(onChange);
  },
  async read(id) {
    return snapshot(id);
  },
  async update(id, patch) {
    const game = games.get(id) ?? {};
    for (const [path, value] of Object.entries(patch)) setPath(game, path, value);
    games.set(id, game);
    emit(id);
  },
  async remove(id, path) {
    if (path) return this.update(id, { [path]: null });
    games.delete(id);
    emit(id);
  },
  onDisconnect() {},
  cancelOnDisconnect() {},
  now: () => Date.now(),
};
