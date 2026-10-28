import type { GameSettings, Question } from '@/lib/types';
import { PRE_ROUND_MS, type GameDoc, type LiveAnswer, type LiveGame, type QuestionEvent } from '@/lib/net/types';

export interface Player {
  id: string;
  name: string;
  /** A web avatar name (`wolf`) or an image URL from the mobile app; empty for none. */
  avatar: string;
  bot?: boolean;
  joinedAt: number;
}

export interface Option {
  text: string;
  correct: boolean;
}

export interface Round {
  question: Question;
  /** For music rounds: which half of the track is asked about. */
  ask: 'author' | 'title' | 'quiz';
  mode: 'choose' | 'enter';
  prompt: string;
  /** In the order every player sees them (the event's `answersOrder`). */
  options: Option[];
  /** The correct answer text, used to check typed answers. */
  answer: string;
}

export interface Answer {
  option: number | null;
  text: string;
  /** Milliseconds from round start; equals the round length on timeout. */
  ms: number;
  correct: boolean;
}

/** `question` covers the pre-round countdown too: the round itself begins at `startsAt`. */
export type Stage = 'lobby' | 'question' | 'answers' | 'results' | 'final';

/** What the screens render: one game as seen from this device. */
export interface Room {
  id: string;
  code: string;
  hostId: string;
  doc: GameDoc;
  players: Record<string, Player>;
  stage: Stage;
  index: number;
  total: number;
  /** When the current round's answering time begins (ms, host clock). */
  startsAt: number;
  /** When this device saw the current stage begin (ms, shared clock). */
  stageAt: number;
  roundMs: number;
  round: Round | null;
  /** The game's questions by round, for preloading; null where one could not be loaded. */
  questions: Array<Question | null>;
  /** Real answers per round; the host's empty placeholders are left out. */
  answers: Array<Record<string, Answer>>;
  /** Round winners the host picked by hand. */
  selected: string[];
}

export interface Standing {
  player: Player;
  correct: number;
  /** Sum of answer times over correct answers: the tiebreak, as in the mobile app. */
  correctMs: number;
}

const BOT_NAMES = ['Алина', 'Макс', 'Dj Vova', 'Соня', 'Артём', 'Kira', 'Лёша', 'Mia'];
export const AVATARS = [
  'wolf', 'bat', 'boar', 'bull', 'cow', 'elephant', 'gorilla', 'horse', 'monkey', 'pig',
  'pigeon', 'rabbit', 'ram', 'rooster', 'sheep', 'woman1', 'man1', 'woman2', 'man2', 'woman3',
];

export function shuffle<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** Question text language for a game locale key (ru, uk, AmE, BrE, es…). */
export const textLocale = (locale: string) => (locale === 'ru' || locale === 'uk' ? 'ru' : 'en');

export function parseEvent(currentEvent: string | undefined): QuestionEvent | null {
  if (!currentEvent?.startsWith('{')) return null;
  try {
    return JSON.parse(currentEvent) as QuestionEvent;
  } catch {
    return null;
  }
}

/** The next question event, drawn the way the mobile host draws it. */
export function nextEvent(settings: Pick<GameDoc, 'questionsType' | 'answerType'>): string {
  const event: QuestionEvent = {
    event:
      settings.questionsType === 'songAuthorOnly'
        ? 'question_author'
        : settings.questionsType === 'songTitleOnly'
          ? 'question_title'
          : pick(['question_title', 'question_author'] as const),
    answersOrder: shuffle(['1', '2', '3', '4']).join(''),
    answerType: settings.answerType === 'mixed' ? pick(['choose', 'enter'] as const) : settings.answerType,
  };
  return JSON.stringify(event);
}

export function buildRound(question: Question, event: QuestionEvent, locale: string): Round {
  const order = event.answersOrder.split('').map((d) => Number(d) - 1);
  const arrange = (texts: string[]) => order.filter((i) => texts[i]).map((i) => ({ text: texts[i], correct: i === 0 }));
  const mode = event.answerType === 'enter' ? 'enter' : 'choose';
  if (question.kind === 'quiz') {
    const lang = textLocale(locale);
    const texts = question.options[lang];
    return { question, ask: 'quiz', mode, prompt: question.question[lang], options: arrange(texts), answer: texts[0] };
  }
  const ask = event.event === 'question_author' ? 'author' : 'title';
  const texts = ask === 'author' ? question.authorOptions : question.titleOptions;
  return {
    question,
    ask,
    mode,
    prompt: ask === 'author' ? 'Кто исполняет эту песню?' : 'Как называется эта песня?',
    options: arrange(texts),
    answer: ask === 'author' ? question.author : question.title,
  };
}

/** Typed-answer check, same normalisation as the app: ё→е, no punctuation or spaces, any case. */
export function sameAnswer(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/[ёЁ]/g, 'е')
      .replace(/[ ‘“‚„.,:;«»*—\-()/\\!?'"]/g, '')
      .toUpperCase()
      .trim();
  return norm(a) === norm(b);
}

export function placeholder(roundSeconds: number): LiveAnswer {
  return { value: '', time: roundSeconds * 1_000_000, isCorrect: false };
}

function toAnswer(a: LiveAnswer | undefined, roundMs: number): Answer | undefined {
  if (!a || (!a.value && !a.isCorrect)) return undefined;
  const option = typeof a.numberInOrder === 'number' && a.numberInOrder >= 0 ? a.numberInOrder : null;
  return { option, text: a.value, ms: Math.min(roundMs, Math.round((a.time ?? 0) / 1000)), correct: !!a.isCorrect };
}

const asList = <T,>(value: T[] | Record<string, T> | undefined): T[] =>
  Array.isArray(value) ? value : value ? Object.entries(value).reduce<T[]>((l, [k, v]) => ((l[Number(k)] = v), l), []) : [];

/** Turns the shared game into what this device shows; `eventAt` is when this device saw the event change. */
export function view(
  id: string,
  doc: GameDoc,
  live: LiveGame,
  questions: Array<Question | null>,
  eventAt: number,
): Room {
  const roundMs = doc.roundTime * 1000;
  const players: Record<string, Player> = {};
  const answers: Array<Record<string, Answer>> = doc.questions.map(() => ({}));
  for (const [pid, m] of Object.entries(live.members ?? {})) {
    players[pid] = {
      id: pid,
      name: m.name || (pid === doc.admin ? 'Ведущий' : 'Игрок'),
      avatar: m.imageUrl ?? '',
      bot: pid.includes('bot_'),
      joinedAt: m.connectedSince ?? 0,
    };
    asList(m.answers).forEach((a, i) => {
      const answer = toAnswer(a, roundMs);
      if (answer && answers[i]) answers[i][pid] = answer;
    });
  }

  const ev = parseEvent(live.currentEvent);
  // After the round the event is plain `answers`/`results`; the round's draw stays in lastRoundEvent.
  const drawn = ev ?? parseEvent(live.lastRoundEvent);
  const index = live.currentRound ?? 0;
  const question = questions[index];
  let stage: Stage;
  if (ev) stage = 'question';
  else if (live.currentEvent === 'answers') stage = 'answers';
  else if (live.currentEvent === 'results') stage = 'results';
  else if (live.currentEvent === 'final_results') stage = 'final';
  else stage = 'lobby';

  return {
    id,
    code: doc.code,
    hostId: doc.admin,
    doc,
    players,
    stage,
    index,
    total: doc.questions.length,
    startsAt: (live.roundStartTime ?? eventAt) + PRE_ROUND_MS,
    stageAt: eventAt,
    roundMs,
    round: drawn && question ? buildRound(question, drawn, doc.locale) : null,
    questions,
    answers,
    selected: asList(live.selectedUser),
  };
}

export function standings(players: Player[], answers: Array<Record<string, Answer>>, byTime = true): Standing[] {
  return players
    .map((player) => {
      const right = answers.map((r) => r[player.id]).filter((a) => a?.correct);
      return { player, correct: right.length, correctMs: right.reduce((s, a) => s + a.ms, 0) };
    })
    .sort((a, b) => b.correct - a.correct || (byTime ? a.correctMs - b.correctMs : 0) || a.player.name.localeCompare(b.player.name));
}

export function makeBots(count: number): Array<{ id: string; name: string; avatar: string; accuracy: number }> {
  const names = shuffle(BOT_NAMES);
  const faces = shuffle(AVATARS.slice(1));
  // A fixed id pool, so repeated games reuse the same `Users` docs instead of piling up new ones.
  return Array.from({ length: count }, (_, i) => ({
    id: `bot_web_${i + 1}`,
    name: names[i % names.length],
    avatar: faces[i % faces.length],
    // As in the app: bots get 20–30% plus some spread so the table is not flat.
    accuracy: 0.3 + Math.random() * 0.45,
  }));
}

/**
 * A bot's answer for one round. Mirrors the mobile bots: accuracy caps the share of correct
 * answers over the game, and answers land in the later part of the round.
 */
export function planBotAnswer(
  accuracy: number,
  round: Round,
  history: Answer[],
  totalRounds: number,
  roundMs: number,
): Answer {
  const maxCorrect = Math.floor(accuracy * totalRounds);
  const correctSoFar = history.filter((a) => a.correct).length;
  const wrongSoFar = history.length - correctSoFar;
  const correct =
    correctSoFar + 1 > maxCorrect ? false : wrongSoFar + 1 > totalRounds - maxCorrect ? true : Math.random() < 0.5;
  const indexes = round.options.map((o, i) => ({ o, i })).filter(({ o }) => o.correct === correct);
  const option = indexes.length ? pick(indexes).i : 0;
  const ms = Math.round(roundMs * (0.25 + Math.random() * 0.65));
  const text = round.options[option]?.text ?? '';
  return { option: round.mode === 'choose' ? option : null, text, ms, correct: round.options[option]?.correct ?? false };
}

export function gameCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** The `OKGames` doc for settings made on the web. */
export function gameDoc(settings: GameSettings, admin: string, code: string, questionIds: string[]): GameDoc {
  const category = Math.floor(Math.random() * settings.categories.length);
  return {
    code,
    gameType: settings.type,
    admin,
    members: [],
    questions: questionIds,
    categories: settings.categories,
    difficulty: settings.difficulty,
    answerType: settings.answerType,
    questionsType: settings.type === 'music' ? settings.questionsType : 'mixed',
    ...(settings.answerType === 'enter' ? { winnerDeterminationType: settings.winnerDetermination } : {}),
    roundTime: settings.roundSeconds,
    takeIntoAnswerTime: settings.takeIntoAnswerTime,
    isAdminPlayer: settings.isAdminPlayer,
    everyoneHasSound: settings.everyoneHasSound,
    antiShazam: settings.antiShazam,
    punishmentType: settings.punishment === 'nonePunishment' ? settings.punishment : `${settings.punishment}${punishmentIndex(settings.punishment)}`,
    backgroundMusicType: settings.backgroundMusic,
    locale: settings.locale,
    isPrivate: settings.isPrivate,
    gamesAmount: 1,
    videoEnabled: false,
    demonstratedCategoryIndex: category,
    demonstratedSubcategoryIndex: Math.floor(Math.random() * (settings.categories[category]?.subcategories.length || 1)),
  };
}

// How many punishments of each kind the app has (PunishmentType.punishmentsAmount).
const PUNISHMENTS = { verbalPunishment: 12, physicalPunishment: 12, socialPunishment: 7 } as const;
function punishmentIndex(kind: keyof typeof PUNISHMENTS) {
  return Math.floor(Math.random() * PUNISHMENTS[kind]);
}
