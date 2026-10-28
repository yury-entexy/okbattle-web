import type { Category, GameType, Question } from '@/lib/types';

export interface DataSource {
  categories(type: GameType): Promise<Category[]>;
  /** Up to `count` random questions from the given subcategories, preferring the given levels. */
  questions(type: GameType, subcategoryIds: string[], count: number, levels: number[]): Promise<Question[]>;
  /** Questions by document id, in order; `null` where a question is missing or unsupported. */
  byIds(type: GameType, ids: string[]): Promise<Array<Question | null>>;
}

let current: Promise<DataSource> | null = null;

/** Picks the source once; the Firebase SDK is only downloaded when it is actually used. */
export function dataSource(): Promise<DataSource> {
  current ??=
    process.env.NEXT_PUBLIC_DATA_SOURCE === 'snapshot'
      ? import('./snapshot').then((m) => m.snapshotSource)
      : import('./firebase').then((m) => m.firebaseSource);
  return current;
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/** Random picks that keep to `levels` when there are enough such questions, as the mobile app does. */
export function pickByLevel(pool: Question[], count: number, levels: number[]): Question[] {
  const unique = [...new Map(pool.map((q) => [q.id, q])).values()];
  const preferred = levels.length ? unique.filter((q) => levels.includes(q.level)) : unique;
  const picked = pickRandom(preferred, count);
  if (picked.length >= count) return picked;
  const taken = new Set(picked.map((q) => q.id));
  return [...picked, ...pickRandom(unique.filter((q) => !taken.has(q.id)), count - picked.length)];
}
