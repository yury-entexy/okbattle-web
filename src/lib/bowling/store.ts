'use client';

import { create } from 'zustand';
import { useGame } from '@/lib/game/store';
import { AVATARS } from '@/lib/game/engine';
import { guestIdentity } from '@/lib/game/eternal';
import { track } from '@/lib/analytics';
import type { Bowler } from './game';

export type Level = 'easy' | 'mid' | 'hard';
export const LEVELS: Record<Level, { name: string; skill: [number, number] }> = {
  easy: { name: 'Новички', skill: [0.05, 0.3] }, // about 95–115 points
  mid: { name: 'Любители', skill: [0.45, 0.65] }, // about 135–150
  hard: { name: 'Профи', skill: [0.8, 0.9] }, // about 180–220
};
const BOT_NAMES = ['Бот Миша', 'Бот Катя', 'Бот Олег', 'Бот Аня', 'Бот Дима', 'Бот Лена'];

export interface BowlingConfig {
  bots: number;
  level: Level;
  /** Came from the ad link `?play=bowling`. */
  ad: boolean;
}

interface BowlingStore {
  config: BowlingConfig | null;
  /** The line-up; a new array starts a new game. */
  lineup: Array<Omit<Bowler, 'frames'>>;
  start(config: BowlingConfig): void;
  /** Same players, new game. */
  again(): void;
  /** Ad link: straight into a game against one bot, under a guest name for new visitors. */
  playAd(): void;
  leave(): void;
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

function lineup(config: BowlingConfig): Array<Omit<Bowler, 'frames'>> {
  const { me } = useGame.getState();
  const [lo, hi] = LEVELS[config.level].skill;
  const names = shuffle(BOT_NAMES);
  const faces = shuffle(AVATARS.filter((a) => a !== me.avatar));
  return [
    { id: me.id || 'me', name: me.name || 'Игрок', avatar: me.avatar, bot: false, skill: 0 },
    ...Array.from({ length: config.bots }, (_, i) => ({
      id: `bot${i}`, name: names[i], avatar: faces[i] ?? pick(AVATARS), bot: true, skill: lo + Math.random() * (hi - lo),
    })),
  ];
}

export const useBowling = create<BowlingStore>((set, get) => ({
  config: null,
  lineup: [],

  start(config) {
    set({ config, lineup: lineup(config) });
    useGame.setState({ screen: 'bowling', notice: '' });
    track('game_start', { game: 'bowling', room: config.ad ? 'ad' : 'private' });
  },

  again() {
    const { config, lineup: players } = get();
    if (!config) return;
    set({ lineup: players.map((p) => ({ ...p })) });
    track('game_start', { game: 'bowling', room: config.ad ? 'ad' : 'private' });
  },

  playAd() {
    const game = useGame.getState();
    try {
      // As in the other ad rooms: a returning visitor keeps their name, a new one plays as a guest.
      const saved = localStorage.getItem('sg.name');
      if (!saved) {
        const guest = guestIdentity();
        localStorage.setItem('sg.name', guest.name);
        localStorage.setItem('sg.avatar', guest.avatar);
        game.setAvatar(guest.avatar);
        game.setName(guest.name);
      } else {
        game.setName(saved);
        const face = localStorage.getItem('sg.avatar');
        if (face) game.setAvatar(face);
      }
    } catch {}
    track('game_join', { game: 'bowling', room: 'ad' });
    get().start({ bots: 1, level: 'easy', ad: true });
  },

  leave() {
    set({ config: null, lineup: [] });
    useGame.setState({ screen: 'home' });
    // Leaving an ad game must not drop the visitor straight back into it on reload.
    if (typeof location !== 'undefined' && location.search.includes('play=')) {
      history.replaceState(null, '', location.pathname);
    }
  },
}));
