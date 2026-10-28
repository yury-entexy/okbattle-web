import type { Category, GameType, Localized, Question } from '@/lib/types';
import { pickByLevel, type DataSource } from './source';

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

  async questions(type, subcategoryIds, count, levels) {
    const subs = (await load())[type].flatMap((c) => c.subcategories).filter((s) => subcategoryIds.includes(s.id));
    return pickByLevel(subs.flatMap((s) => s.questions.map((q) => toQuestion(type, q))), count, levels);
  },

  async byIds(type, ids) {
    const all = new Map(
      (await load())[type].flatMap((c) => c.subcategories.flatMap((s) => s.questions)).map((q) => [q.id as string, q]),
    );
    return ids.map((id) => (all.has(id) ? toQuestion(type, all.get(id)!) : null));
  },
};

function toQuestion(type: GameType, q: Record<string, unknown>): Question {
  return type === 'music'
    ? ({ ...q, kind: 'music', audio: media(q.audio)!, photo: media(q.photo) } as Question)
    : ({ ...q, kind: 'quiz', image: media(q.image) } as Question);
}
