import type { Category, GameType, Question } from '@/lib/types';

export interface DataSource {
  categories(type: GameType): Promise<Category[]>;
  /** Up to `count` random questions from one subcategory. */
  questions(type: GameType, subcategoryId: string, count: number): Promise<Question[]>;
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
