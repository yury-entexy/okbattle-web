import type { Category, GameType, Localized, Question } from '@/lib/types';
import { pickRandom, type DataSource } from './source';

// Shape of public/data/catalog.json, produced by the snapshot export script.
interface SnapshotSub {
  id: string;
  name: Localized;
  questions: Array<Record<string, unknown>>;
}
interface SnapshotCategory {
  id: string;
  name: Localized;
  image?: string;
  subcategories: SnapshotSub[];
}
type Snapshot = Record<GameType, SnapshotCategory[]>;

const BASE = 'data/';
let catalog: Promise<Snapshot> | null = null;

function load(): Promise<Snapshot> {
  catalog ??= fetch(`${BASE}catalog.json`).then((r) => {
    if (!r.ok) throw new Error(`catalog.json: ${r.status}`);
    return r.json() as Promise<Snapshot>;
  });
  return catalog;
}

const media = (path?: unknown) => (typeof path === 'string' ? BASE + path : undefined);

export const snapshotSource: DataSource = {
  async categories(type) {
    const data = await load();
    return data[type].map<Category>((c) => ({
      id: c.id,
      name: c.name,
      image: media(c.image),
      subcategories: c.subcategories
        .filter((s) => s.questions.length > 0)
        .map((s) => ({ id: s.id, name: s.name, size: s.questions.length })),
    }));
  },

  async questions(type, subcategoryId, count) {
    const data = await load();
    const sub = data[type].flatMap((c) => c.subcategories).find((s) => s.id === subcategoryId);
    if (!sub) return [];
    return pickRandom(sub.questions, count).map((q) =>
      type === 'music'
        ? ({ ...q, kind: 'music', audio: media(q.audio)!, photo: media(q.photo) } as Question)
        : ({ ...q, kind: 'quiz', image: media(q.image) } as Question),
    );
  },
};
