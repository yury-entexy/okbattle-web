import type { GameSettings } from '@/lib/types';
import { AVATARS } from './engine';

/**
 * Always-on rooms for ad traffic: a server host runs one per game type under a fixed code, and
 * `/?play=<type>` drops a visitor straight into it. Each game is an ordinary OKGames game, so app
 * players can join with the same code.
 */
export type EternalType = 'music' | 'quiz';
export const ETERNAL_CODES: Record<EternalType, string> = { music: '700001', quiz: '700002' };
export const isEternalType = (t: string | null): t is EternalType => t === 'music' || t === 'quiz';

/** How long the final results stay up before the players move on to the game already running. */
export const ETERNAL_FINAL_MS = 10_000;

export function eternalSettings(type: EternalType, categories: GameSettings['categories']): GameSettings {
  return {
    type,
    categories,
    rounds: 10,
    difficulty: [1, 2],
    roundSeconds: type === 'quiz' ? 20 : 25,
    answerType: 'choose',
    questionsType: 'mixed',
    winnerDetermination: 'automatically',
    takeIntoAnswerTime: true,
    everyoneHasSound: true,
    // The server only drives the game; it is not a player.
    isAdminPlayer: false,
    backgroundMusic: 'medium',
    punishment: 'nonePunishment',
    locale: 'ru',
    antiShazam: false,
    isPrivate: false,
    videoEnabled: false,
    bots: 4,
  };
}

/** A visitor from an ad plays under a random name until they sign up. */
export function guestIdentity(): { name: string; avatar: string } {
  return {
    name: `Гость ${Math.floor(1000 + Math.random() * 9000)}`,
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  };
}
