'use client';

import { create } from 'zustand';
import { roomTransport } from '@/lib/room';
import { roundKey, type Room, type RoomTransport } from '@/lib/room/types';
import type { GameSettings, Locale, Question } from '@/lib/types';
import { buildRounds, gameCode, makeBots, planBotAnswer, type Answer, type Player } from './engine';

export type Screen = 'home' | 'setup' | 'join' | 'room';

interface GameState {
  screen: Screen;
  locale: Locale;
  me: Player;
  room: Room | null;
  /** Set when the room disappeared under a guest (host left) or a join failed. */
  notice: string;

  setName(name: string): void;
  setAvatar(avatar: string): void;
  goSetup(): void;
  goJoin(): void;
  goHome(): void;
  createRoom(settings: GameSettings, questions: Question[]): Promise<void>;
  joinRoom(code: string): Promise<boolean>;
  start(): void;
  answer(option: number): void;
  /** Host only: advances stages; called every frame. */
  drive(): void;
  now(): number;
}

export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 4500;

let transport: RoomTransport | null = null;
let unsubscribe: (() => void) | null = null;
// The last stage transition this host issued, so a frame loop does not send it twice.
let issued = '';

function playerId(): string {
  // Per tab, so two tabs in one browser are two players.
  try {
    let id = sessionStorage.getItem('sg.uid');
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      sessionStorage.setItem('sg.uid', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

function savedName(): string {
  try {
    return localStorage.getItem('sg.name') || 'Игрок';
  } catch {
    return 'Игрок';
  }
}

export const isHost = (s: Pick<GameState, 'room' | 'me'>) => s.room?.hostId === s.me.id;

/** Answers of one round that are already visible: bot answers appear only once their time comes. */
export function visibleAnswers(room: Room, now: number): Record<string, Answer> {
  const all = room.answers?.[roundKey(room.index)] ?? {};
  if (room.stage !== 'question') return all;
  const elapsed = now - room.stageAt;
  return Object.fromEntries(Object.entries(all).filter(([, a]) => a.ms <= elapsed));
}

export function answersByRound(room: Room): Array<Record<string, Answer>> {
  return room.rounds.map((_, i) => room.answers?.[roundKey(i)] ?? {});
}

export const useGame = create<GameState>((set, get) => {
  async function attach(code: string) {
    transport ??= await roomTransport();
    unsubscribe?.();
    unsubscribe = transport.subscribe(code, (room) => {
      if (!room) {
        const wasGuest = get().room && !isHost(get());
        unsubscribe?.();
        unsubscribe = null;
        set({ room: null, screen: 'home', notice: wasGuest ? 'Ведущий закрыл комнату.' : '' });
        return;
      }
      set({ room, screen: 'room' });
    });
  }

  function detach() {
    const { room, me } = get();
    unsubscribe?.();
    unsubscribe = null;
    if (room && transport) void transport.remove(room.code, isHost(get()) ? undefined : `players/${me.id}`);
    set({ room: null });
  }

  return {
    screen: 'home',
    locale: 'ru',
    me: { id: '', name: 'Игрок', avatar: 'wolf' },
    room: null,
    notice: '',

    setName(name) {
      try {
        localStorage.setItem('sg.name', name);
      } catch {}
      set((s) => ({ me: { ...s.me, name, id: s.me.id || playerId() } }));
    },
    setAvatar(avatar) {
      set((s) => ({ me: { ...s.me, avatar } }));
    },
    goSetup() {
      set((s) => ({ screen: 'setup', notice: '', me: { ...s.me, id: s.me.id || playerId(), name: s.me.name === 'Игрок' ? savedName() : s.me.name } }));
    },
    goJoin() {
      set((s) => ({ screen: 'join', notice: '', me: { ...s.me, id: s.me.id || playerId() } }));
    },
    goHome() {
      detach();
      set({ screen: 'home' });
    },

    async createRoom(settings, questions) {
      transport ??= await roomTransport();
      const { me, locale } = get();
      let code = gameCode();
      for (let i = 0; i < 5 && (await transport.exists(code)); i++) code = gameCode();
      const now = transport.serverNow();
      const players: Room['players'] = { [me.id]: { ...me, joinedAt: now } };
      makeBots(settings.bots).forEach((b, i) => (players[b.id] = { ...b, joinedAt: now + i }));
      const room: Room = {
        code,
        hostId: me.id,
        settings,
        rounds: buildRounds(questions, settings, locale),
        players,
        stage: 'lobby',
        index: 0,
        stageAt: now,
      };
      issued = '';
      await transport.create(room);
      transport.leaveOnDisconnect(code, me.id, true);
      await attach(code);
    },

    async joinRoom(code) {
      transport ??= await roomTransport();
      const { me } = get();
      if (!(await transport.exists(code))) {
        set({ notice: 'Комната с таким кодом не найдена. Проверьте код у ведущего.' });
        return false;
      }
      await transport.update(code, { [`players/${me.id}`]: { ...me, joinedAt: transport.serverNow() } });
      transport.leaveOnDisconnect(code, me.id, false);
      // Drop the code from the address so leaving the room does not re-open the join screen.
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {}
      await attach(code);
      return true;
    },

    start() {
      const { room } = get();
      if (!room || !transport || !isHost(get())) return;
      issued = '';
      void transport.update(room.code, { stage: 'countdown', index: 0, stageAt: transport.serverNow(), answers: null });
    },

    answer(option) {
      const { room, me } = get();
      if (!room || !transport || room.stage !== 'question') return;
      const key = roundKey(room.index);
      if (room.answers?.[key]?.[me.id]) return;
      const ms = Math.max(0, Math.round(transport.serverNow() - room.stageAt));
      const correct = room.rounds[room.index].options[option]?.correct ?? false;
      void transport.update(room.code, { [`answers/${key}/${me.id}`]: { option, ms, correct } });
    },

    now() {
      return transport ? transport.serverNow() : Date.now();
    },

    // Everything is derived from timestamps, so a throttled background tab catches up instead of drifting.
    drive() {
      const { room } = get();
      if (!room || !transport || !isHost(get())) return;
      const now = transport.serverNow();
      const elapsed = now - room.stageAt;
      const roundMs = room.settings.roundSeconds * 1000;
      const go = (tag: string, patch: Record<string, unknown>) => {
        if (issued === tag) return;
        issued = tag;
        void transport!.update(room.code, patch);
      };

      if (room.stage === 'countdown' && elapsed >= COUNTDOWN_MS) {
        const patch: Record<string, unknown> = { stage: 'question', stageAt: now };
        const all = answersByRound(room);
        for (const p of Object.values(room.players)) {
          if (!p.bot) continue;
          const history = all.slice(0, room.index).map((r) => r[p.id]).filter(Boolean);
          patch[`answers/${roundKey(room.index)}/${p.id}`] = planBotAnswer(
            p,
            room.rounds[room.index],
            history,
            room.rounds.length,
            roundMs,
          );
        }
        go(`q${room.index}`, patch);
      } else if (room.stage === 'question') {
        const shown = visibleAnswers(room, now);
        const everyone = Object.keys(room.players).every((id) => shown[id]);
        if (everyone || elapsed >= roundMs) go(`r${room.index}`, { stage: 'reveal', stageAt: now });
      } else if (room.stage === 'reveal' && elapsed >= REVEAL_MS) {
        const last = room.index + 1 >= room.rounds.length;
        go(
          last ? 'final' : `c${room.index + 1}`,
          last ? { stage: 'final', stageAt: now } : { stage: 'countdown', index: room.index + 1, stageAt: now },
        );
      }
    },
  };
});
