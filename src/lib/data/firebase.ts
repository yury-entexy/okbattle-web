import {
  collection,
  doc,
  getDoc,
  getDocs,
  connectFirestoreEmulator,
  getFirestore,
  limit,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore/lite';
import type { Category, GameType, Locale, Localized, Question } from '@/lib/types';
import { firebaseApp } from '@/lib/firebase-app';
import { pickByLevel, type DataSource } from './source';

export const db = getFirestore(firebaseApp());
const emulator = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR;
if (emulator) {
  const [host, port] = emulator.split(':');
  connectFirestoreEmulator(db, host, Number(port));
}

const CATEGORIES: Record<GameType, string> = { music: 'Categories', quiz: 'CommonQuestionCategories' };
const QUESTIONS: Record<GameType, string> = { music: 'Sounds', quiz: 'CommonQuestions' };
// Enough to randomise over without pulling whole subcategories (some hold 300+ songs).
const POOL = 120;

function localized(value: unknown): Localized {
  if (typeof value === 'string') return { ru: value, en: value };
  const map = (value ?? {}) as Partial<Localized>;
  const fallback = map.en ?? map.ru ?? Object.values(map)[0] ?? '';
  return { ru: map.ru ?? fallback, en: map.en ?? fallback };
}

const options = (card: DocumentData | undefined) =>
  [1, 2, 3, 4].map((i) => String(card?.[`answer${i}`] ?? ''));

function toQuestion(type: GameType, id: string, d: DocumentData): Question | null {
  if (type === 'music') {
    if (!d.url || !d.authorAnswers || !d.titleAnswers) return null;
    return {
      kind: 'music',
      id,
      level: d.level ?? 1,
      audio: d.url,
      photo: d.photo || undefined,
      author: d.author,
      title: d.title,
      authorOptions: options(d.authorAnswers),
      titleOptions: options(d.titleAnswers),
    };
  }
  const card = d.questionCard ?? {};
  const ru = card.ru ?? card.en;
  if (!ru?.question) return null;
  const en = card.en ?? ru;
  const content = d.content;

  return {
    kind: 'quiz',
    id,
    level: d.level ?? 1,
    image: content?.type === 'image' ? content.data?.[0]?.url : undefined,
    video: content?.type === 'video' ? content.data?.[0]?.url : undefined,
    question: { ru: ru.question, en: en.question },
    options: { ru: options(ru), en: options(en) } as Record<Locale, string[]>,
  };
}

export const firebaseSource: DataSource = {
  async categories(type) {
    const snap = await getDocs(collection(db, CATEGORIES[type]));
    const valid = snap.docs.filter((d) => d.data().isValid);
    return Promise.all(
      valid.map(async (doc): Promise<Category> => {
        const subs = await getDocs(collection(db, CATEGORIES[type], doc.id, 'Subcategories'));
        return {
          id: doc.id,
          name: localized(doc.data().name),
          image: doc.data().photo || undefined,
          subcategories: subs.docs
            .filter((s) => s.data().isValid)
            .map((s) => ({ id: s.id, name: localized(s.data().name), size: s.data().structure?.total ?? 0 })),
        };
      }),
    );
  },

  async questions(type, subcategoryIds, count, levels) {
    const pools = await Promise.all(
      subcategoryIds.map(async (id) => {
        const snap = await getDocs(query(collection(db, QUESTIONS[type]), where('subCatID', '==', id), limit(POOL)));
        return snap.docs.map((d) => toQuestion(type, d.id, d.data())).filter((q): q is Question => q !== null);
      }),
    );
    return pickByLevel(pools.flat(), count, levels);
  },

  async byIds(type, ids) {
    return Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, QUESTIONS[type], id));
        return snap.exists() ? toQuestion(type, id, snap.data()) : null;
      }),
    );
  },
};
