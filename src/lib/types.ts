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
  video?: string;
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

export type AnswerMode = 'choose' | 'enter' | 'mixed';
/** What music rounds ask about; the names are the mobile app's `questionsType` values. */
export type QuestionsType = 'songAuthorOnly' | 'songTitleOnly' | 'mixed';
export type WinnerDetermination = 'automatically' | 'manually';
export type BackgroundMusic = 'fast' | 'medium' | 'slow';
export type Punishment = 'nonePunishment' | 'verbalPunishment' | 'physicalPunishment' | 'socialPunishment';

/** Game settings, mirroring the mobile app's create-game screen (stored in the `OKGames` doc). */
export interface GameSettings {
  type: GameType;
  categories: Array<{ id: string; subcategories: string[] }>;
  rounds: number;
  /** Question levels 1–3. */
  difficulty: number[];
  roundSeconds: number;
  answerType: AnswerMode;
  questionsType: QuestionsType;
  /** Only used with typed answers: whether the host picks the round winner by hand. */
  winnerDetermination: WinnerDetermination;
  /** Ties on correct answers go to the faster player, and an answers screen follows each round. */
  takeIntoAnswerTime: boolean;
  /** Music only: off means the snippet plays on the host's device alone, as at a party. */
  everyoneHasSound: boolean;
  isAdminPlayer: boolean;
  backgroundMusic: BackgroundMusic;
  punishment: Punishment;
  /** Game language key as in the mobile app: ru, AmE, BrE, es, de… */
  locale: string;
  antiShazam: boolean;
  /** Private games get no bots. */
  isPrivate: boolean;
  /** Live video: the host broadcasts, and can put up to 4 players on air. */
  videoEnabled: boolean;
  bots: number;
}
