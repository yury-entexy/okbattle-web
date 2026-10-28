'use client';

import { create } from 'zustand';
import type { GameSettings, Locale, Question } from '@/lib/types';
import { buildRounds, gameCode, makeBots, ME, planBotAnswer, type Answer, type Player, type Round } from './engine';

export type Phase = 'home' | 'setup' | 'lobby' | 'countdown' | 'question' | 'reveal' | 'final';

interface GameState {
  phase: Phase;
  locale: Locale;
  me: Player;
  settings: GameSettings | null;
  code: string;
  players: Player[];
  rounds: Round[];
  index: number;
  /** performance.now() at which the current phase started. */
  phaseAt: number;
  answers: Array<Record<string, Answer>>;
  /** Bot answers for the current round, revealed as their time comes. */
  pending: Record<string, Answer>;

  setName(name: string): void;
  setAvatar(avatar: string): void;
  goSetup(): void;
  goHome(): void;
  openLobby(settings: GameSettings, questions: Question[]): void;
  start(): void;
  answer(option: number): void;
  tick(now: number): void;
  next(): void;
  replay(): void;
}

const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 4500;

function readName(): string {
  try {
    return localStorage.getItem('sg.name') || 'Игрок';
  } catch {
    return 'Игрок';
  }
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'home',
  locale: 'ru',
  me: { id: ME, name: 'Игрок', avatar: 'wolf' },
  settings: null,
  code: '',
  players: [],
  rounds: [],
  index: 0,
  phaseAt: 0,
  answers: [],
  pending: {},

  setName(name) {
    try {
      localStorage.setItem('sg.name', name);
    } catch {}
    set((s) => ({ me: { ...s.me, name } }));
  },
  setAvatar(avatar) {
    set((s) => ({ me: { ...s.me, avatar } }));
  },
  goSetup() {
    set((s) => ({ phase: 'setup', me: s.me.name === 'Игрок' ? { ...s.me, name: readName() } : s.me }));
  },
  goHome() {
    set({ phase: 'home', rounds: [], answers: [], pending: {} });
  },

  openLobby(settings, questions) {
    const { me, locale } = get();
    set({
      phase: 'lobby',
      settings,
      code: gameCode(),
      players: [me, ...makeBots(settings.bots)],
      rounds: buildRounds(questions, settings, locale),
      index: 0,
      answers: [],
      pending: {},
    });
  },

  start() {
    set({ phase: 'countdown', phaseAt: performance.now(), index: 0, answers: [] });
  },

  answer(option) {
    const { phase, rounds, index, answers, phaseAt } = get();
    if (phase !== 'question' || answers[index]?.[ME]) return;
    const ms = Math.round(performance.now() - phaseAt);
    const correct = rounds[index].options[option]?.correct ?? false;
    set({ answers: withAnswer(answers, index, ME, { option, ms, correct }) });
  },

  // Driven by requestAnimationFrame from the round screen; everything is derived from timestamps,
  // so a throttled background tab catches up instead of drifting.
  tick(now) {
    const s = get();
    if (!s.settings) return;
    const roundMs = s.settings.roundSeconds * 1000;
    const elapsed = now - s.phaseAt;

    if (s.phase === 'countdown' && elapsed >= COUNTDOWN_MS) {
      set({ phase: 'question', phaseAt: now, pending: planBots(s, roundMs) });
      return;
    }
    if (s.phase === 'question') {
      let answers = s.answers;
      for (const [id, a] of Object.entries(s.pending)) {
        if (a.ms <= elapsed && !answers[s.index]?.[id]) answers = withAnswer(answers, s.index, id, a);
      }
      const everyone = s.players.every((p) => answers[s.index]?.[p.id]);
      if (everyone || elapsed >= roundMs) {
        for (const p of s.players) {
          if (!answers[s.index]?.[p.id]) {
            answers = withAnswer(answers, s.index, p.id, { option: null, ms: roundMs, correct: false });
          }
        }
        set({ answers, phase: 'reveal', phaseAt: now });
      } else if (answers !== s.answers) {
        set({ answers });
      }
      return;
    }
    if (s.phase === 'reveal' && elapsed >= REVEAL_MS) get().next();
  },

  next() {
    const { index, rounds } = get();
    if (index + 1 >= rounds.length) set({ phase: 'final', phaseAt: performance.now() });
    else set({ phase: 'countdown', index: index + 1, phaseAt: performance.now() });
  },

  replay() {
    set({ phase: 'setup', rounds: [], answers: [], pending: {} });
  },
}));

function withAnswer(answers: Array<Record<string, Answer>>, index: number, id: string, a: Answer) {
  const copy = answers.slice();
  copy[index] = { ...copy[index], [id]: a };
  return copy;
}

function planBots(s: GameState, roundMs: number): Record<string, Answer> {
  const plan: Record<string, Answer> = {};
  for (const p of s.players) {
    if (!p.bot) continue;
    const history = s.answers.slice(0, s.index).map((r) => r[p.id]).filter(Boolean);
    plan[p.id] = planBotAnswer(p, s.rounds[s.index], history, s.rounds.length, roundMs);
  }
  return plan;
}
