import type { GameType } from '@/lib/types';

/**
 * The mobile app's room format. A game is a Firestore `OKGames` doc (settings and question ids)
 * plus a live Realtime Database node `Games/{id}` that the host drives. The web speaks exactly
 * this format, so web and mobile players share rooms.
 */
export interface GameDoc {
  code: string;
  gameType: GameType | 'movie';
  /** `Users` doc id of the host. */
  admin: string;
  members: string[];
  /** Question doc ids; round `i` asks `questions[i]`. */
  questions: string[];
  categories: Array<{ id: string; subcategories: string[] }>;
  difficulty: number[];
  answerType: 'choose' | 'enter' | 'mixed';
  questionsType: 'songAuthorOnly' | 'songTitleOnly' | 'mixed';
  winnerDeterminationType?: 'automatically' | 'manually';
  roundTime: number;
  takeIntoAnswerTime: boolean;
  isAdminPlayer: boolean;
  everyoneHasSound: boolean;
  antiShazam: boolean;
  punishmentType: string;
  backgroundMusicType: string;
  locale: string;
  isPrivate: boolean;
  gamesAmount: number;
  videoEnabled: boolean;
  demonstratedCategoryIndex: number;
  demonstratedSubcategoryIndex: number;
}

export interface LiveAnswer {
  /** The chosen or typed text; empty for the placeholder the host adds before each round. */
  value: string;
  /** Microseconds from the end of the pre-round countdown. */
  time: number;
  isCorrect: boolean;
  /** Index in the shown option order; -1 or missing for typed answers. */
  numberInOrder?: number;
}

export interface LiveMember {
  name: string;
  imageUrl: string;
  /** Must stay a dense array: the app drops a member whose answers are not a list. */
  answers?: LiveAnswer[];
  winsAmount?: number;
  connectedSince?: number;
  lastInGamePosition?: number;
  userChangedAnswer?: boolean;
  score?: number;
  /** Video games only: Agora uid, whether the player asked to go live, and their camera state. */
  videoUid?: number;
  isLiveAllowed?: boolean;
  isCameraDisabled?: boolean;
}

export interface LiveGame {
  /** `waiting`, a question event (JSON, see QuestionEvent), `answers`, `results`, `final_results`, `master_left`… */
  currentEvent: string;
  currentRound: number;
  /** Host clock, ms. The round itself starts PRE_ROUND_MS later. */
  roundStartTime?: number;
  lastRoundEvent?: string;
  members?: Record<string, LiveMember>;
  /** Round winner ids picked by the host (manual winner mode); '' for none. */
  selectedUser?: string[];
  bannedUsers?: string[];
  /** Players the host put on air: member id → their Agora uid once they joined (0 before). */
  invitedUsers?: Record<string, number>;
  finalResultsUsersOrder?: Record<string, number>;
}

export interface QuestionEvent {
  event: 'question_title' | 'question_author';
  /** Four digits: shown option k is the question's answer number digit[k] (answer 1 is correct). */
  answersOrder: string;
  answerType: 'choose' | 'enter';
}

export const PRE_ROUND_MS = 4000;

export interface Backend {
  /** False for the offline demo, where rooms live in this tab only. */
  shared: boolean;
  findGame(code: string): Promise<{ id: string; doc: GameDoc } | null>;
  createGame(doc: GameDoc): Promise<string>;
  deleteGame(id: string): Promise<void>;
  /** Creates or refreshes the `Users` doc the app reads for every player it shows. */
  saveUser(id: string, user: { name: string; avatarUrl: string; isBot?: boolean; isGuest?: boolean; utm?: Record<string, string | undefined> }): Promise<void>;

  /** Live node calls; paths are relative to `Games/{id}`. */
  watch(id: string, onChange: (game: LiveGame | null) => void): () => void;
  read(id: string): Promise<LiveGame | null>;
  /** Multi-path update, e.g. `{ 'members/abc/answers/2': {...}, currentEvent: 'results' }`. */
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  remove(id: string, path?: string): Promise<void>;
  /** What to write when this tab disconnects; `null` removes the path. */
  onDisconnect(id: string, path: string, value: unknown): void;
  cancelOnDisconnect(id: string, path: string): void;
  /** Server-corrected clock, ms. */
  now(): number;
}
