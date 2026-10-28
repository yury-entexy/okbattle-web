import type { GameSettings, Locale, Question } from '@/lib/types';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  bot?: { accuracy: number };
}

export interface Option {
  text: string;
  correct: boolean;
}

export interface Round {
  question: Question;
  /** For music rounds: which half of the track is asked about. */
  ask: 'author' | 'title' | 'quiz';
  prompt: string;
  options: Option[];
}

export interface Answer {
  option: number | null;
  /** Milliseconds from round start; equals the round length on timeout. */
  ms: number;
  correct: boolean;
}

export interface Standing {
  player: Player;
  correct: number;
  /** Sum of answer times over correct answers: the tiebreak, as in the mobile app. */
  correctMs: number;
}

export const ME = 'me';

const BOT_NAMES = ['Алина', 'Макс', 'Dj Vova', 'Соня', 'Артём', 'Kira', 'Лёша', 'Mia'];
export const AVATARS = [
  'wolf', 'bat', 'boar', 'bull', 'cow', 'elephant', 'gorilla', 'horse', 'monkey', 'pig',
  'pigeon', 'rabbit', 'ram', 'rooster', 'sheep', 'woman1', 'man1', 'woman2', 'man2', 'woman3',
];

function shuffle<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const asOptions = (texts: string[]) =>
  shuffle(texts.filter(Boolean).map((text, i) => ({ text, correct: i === 0 })));

export function buildRounds(questions: Question[], settings: GameSettings, locale: Locale): Round[] {
  return questions.map((question, i) => {
    if (question.kind === 'quiz') {
      return { question, ask: 'quiz', prompt: question.question[locale], options: asOptions(question.options[locale]) };
    }
    const ask =
      settings.ask === 'mixed' ? (i % 2 === 0 ? 'author' : 'title') : settings.ask;
    return {
      question,
      ask,
      prompt: ask === 'author' ? 'Кто исполняет эту песню?' : 'Как называется эта песня?',
      options: asOptions(ask === 'author' ? question.authorOptions : question.titleOptions),
    };
  });
}

export function makeBots(count: number): Player[] {
  const names = shuffle(BOT_NAMES);
  const faces = shuffle(AVATARS.slice(1));
  return Array.from({ length: count }, (_, i) => ({
    id: `bot${i}`,
    name: names[i % names.length],
    avatar: faces[i % faces.length],
    bot: { accuracy: 0.35 + Math.random() * 0.45 },
  }));
}

/**
 * A bot's planned answer for one round. Mirrors the mobile bots: accuracy caps the share of
 * correct answers over the game, and answers land in the later part of the round.
 */
export function planBotAnswer(
  bot: Player,
  round: Round,
  history: Answer[],
  totalRounds: number,
  roundMs: number,
): Answer {
  const maxCorrect = Math.floor((bot.bot?.accuracy ?? 0.5) * totalRounds);
  const correctSoFar = history.filter((a) => a.correct).length;
  const wrongSoFar = history.length - correctSoFar;
  const correct =
    correctSoFar + 1 > maxCorrect ? false : wrongSoFar + 1 > totalRounds - maxCorrect ? true : Math.random() < 0.5;
  const indexes = round.options.map((o, i) => ({ o, i })).filter(({ o }) => o.correct === correct);
  const option = indexes.length ? indexes[Math.floor(Math.random() * indexes.length)].i : 0;
  const ms = Math.round(roundMs * (0.25 + Math.random() * 0.7));
  return { option, ms, correct: round.options[option]?.correct ?? false };
}

export function standings(players: Player[], answers: Array<Record<string, Answer>>): Standing[] {
  return players
    .map((player) => {
      const mine = answers.map((r) => r[player.id]).filter(Boolean);
      const right = mine.filter((a) => a.correct);
      return { player, correct: right.length, correctMs: right.reduce((s, a) => s + a.ms, 0) };
    })
    .sort((a, b) => b.correct - a.correct || a.correctMs - b.correctMs);
}

export function gameCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
