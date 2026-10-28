export type GameType = 'music' | 'quiz';
export type Locale = 'ru' | 'en';
export type Localized = Record<Locale, string>;

/** Music question: a snippet plus two 4-option sets; option 0 is always the correct one (as in Firestore). */
export interface SoundQuestion {
  kind: 'music';
  id: string;
  level: number;
  audio: string;
  photo?: string;
  author: string;
  title: string;
  authorOptions: string[];
  titleOptions: string[];
}

/** General-knowledge question; options[0] is the correct answer. */
export interface QuizQuestion {
  kind: 'quiz';
  id: string;
  level: number;
  image?: string;
  question: Localized;
  options: Record<Locale, string[]>;
}

export type Question = SoundQuestion | QuizQuestion;

export interface Subcategory {
  id: string;
  name: Localized;
  size: number;
}

export interface Category {
  id: string;
  name: Localized;
  image?: string;
  subcategories: Subcategory[];
}

export type MusicAsk = 'author' | 'title' | 'mixed';

export interface GameSettings {
  type: GameType;
  categoryId: string;
  subcategoryId: string;
  rounds: number;
  roundSeconds: number;
  ask: MusicAsk;
  bots: number;
}
