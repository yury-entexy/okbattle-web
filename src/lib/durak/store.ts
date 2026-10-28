'use client';

import { create } from 'zustand';
import { backend } from '@/lib/net';
import type { Backend } from '@/lib/net/types';
import { AVATARS } from '@/lib/game/engine';
import { avatarUrl, useGame } from '@/lib/game/store';
import { botMove } from './bot';
import { boutOver, deal, legal, normalize, play, settle, waitingOn, type DurakState, type Mode, type Move } from './rules';

/**
 * Online «Дурак» rooms. A room lives in the Realtime Database at `Games/durak_{code}` (see
 * docs/durak-protocol.md); the mobile app never reads ids with this prefix. The host's device is the
 * referee: players post their moves under `moves/`, and the host checks each one, applies it to
 * `state` and plays for the bots.
 */
export interface DurakMember {
  name: string;
  avatar: string;
  bot?: boolean;
  joinedAt: number;
  /** The player closed the page; the bot logic plays their turns. */
  left?: boolean;
}

export interface DurakRoom {
  kind: 'durak';
  code: string;
  hostId: string;
  mode: Mode;
  bots: number;
  status: 'lobby' | 'playing' | 'over' | 'closed';
  members: Record<string, DurakMember>;
  state?: DurakState;
  moves?: Record<string, { by: string; move: Move; at: number }>;
  /** Server time of the last state change, for the bots' pace and the turn timer. */
  changedAt?: number;
  createdAt: number;
}

export const MAX_PLAYERS = 5;
/** A player who doesn't move in this time is moved for: they take, lead their lowest card or pass. */
export const TURN_MS = 30_000;
const BOT_MS = [700, 1500];
const SETTLE_MS = 1100;

const nodeId = (code: string) => `durak_${code}`;
const BOT_NAMES = ['Бот Миша', 'Бот Катя', 'Бот Олег', 'Бот Аня', 'Бот Дима', 'Бот Лена'];

interface DurakStore {
  room: DurakRoom | null;
  notice: string;
  create(mode: Mode, bots: number): Promise<void>;
  /** 'none' if no «Дурак» room has this code; 'refused' with a notice if it can't be joined now. */
  join(code: string): Promise<'ok' | 'refused' | 'none'>;
  setOptions(patch: { mode?: Mode; bots?: number }): void;
  start(): void;
  move(move: Move): void;
  leave(): void;
  /** Host only: referee and bots; called on a timer. */
  drive(): void;
}

let be: Backend | null = null;
let unwatch: (() => void) | null = null;
let botDue = new Map<string, number>();

const me = () => useGame.getState().me;
const isHostOf = (room: DurakRoom | null) => !!room && room.hostId === me().id;

function view(raw: DurakRoom): DurakRoom {
  return { ...raw, members: raw.members ?? {}, state: raw.state ? normalize(raw.state) : undefined };
}

export const useDurak = create<DurakStore>((set, get) => {
  function watch(code: string) {
    unwatch?.();
    unwatch = be!.watch(nodeId(code), (raw) => {
      const room = raw as unknown as DurakRoom | null;
      if (!room || room.status === 'closed') {
        const was = get().room;
        stop();
        if (was && !isHostOf(was)) useGame.setState({ screen: 'home', notice: 'Ведущий завершил игру.' });
        return;
      }
      set({ room: view(room) });
    });
  }

  function stop() {
    unwatch?.();
    unwatch = null;
    botDue = new Map();
    set({ room: null });
  }

  function write(patch: Record<string, unknown>) {
    const room = get().room;
    if (room) void be!.update(nodeId(room.code), patch);
  }

  function commit(state: DurakState) {
    write({ state, changedAt: be!.now(), ...(state.over ? { status: 'over' } : {}) });
    // Apply locally at once so the next tick doesn't act on the old state.
    set((s) => (s.room ? { room: { ...s.room, state, changedAt: be!.now(), status: state.over ? 'over' : s.room.status } } : s));
  }

  function self(): DurakMember {
    const { name, avatar } = me();
    return { name, avatar: avatarUrl(avatar), joinedAt: be!.now() };
  }

  return {
    room: null,
    notice: '',

    async create(mode, bots) {
      be ??= await backend();
      const id = me().id;
      // Codes are shared with the quiz rooms' six digits; skip one that is taken.
      let code = '';
      for (let i = 0; i < 10 && !code; i++) {
        const c = String(Math.floor(100000 + Math.random() * 900000));
        if (!(await be.read(nodeId(c))) && !(await be.findGame(c))) code = c;
      }
      const room: DurakRoom = { kind: 'durak', code, hostId: id, mode, bots, status: 'lobby', members: { [id]: self() }, createdAt: be.now() };
      await be.update(nodeId(code), room as unknown as Record<string, unknown>);
      // As in the quiz rooms: if the host's tab goes away, the room closes for everyone.
      be.onDisconnect(nodeId(code), 'status', 'closed');
      watch(code);
      useGame.setState({ screen: 'durak', notice: '' });
    },

    async join(code) {
      be ??= await backend();
      const raw = (await be.read(nodeId(code))) as unknown as DurakRoom | null;
      if (!raw || raw.kind !== 'durak' || raw.status === 'closed') return 'none';
      const id = me().id;
      const room = view(raw);
      if (!room.members[id]) {
        if (room.status !== 'lobby') {
          useGame.setState({ notice: 'Игра в «Дурака» уже идёт. Дождитесь следующей.' });
          return 'refused';
        }
        const humans = Object.values(room.members).filter((m) => !m.bot).length;
        if (humans >= MAX_PLAYERS) {
          useGame.setState({ notice: 'В комнате уже 5 игроков.' });
          return 'refused';
        }
        await be.update(nodeId(code), { [`members/${id}`]: self() });
      } else if (room.members[id].left) {
        await be.update(nodeId(code), { [`members/${id}/left`]: null });
      }
      be.onDisconnect(nodeId(code), `members/${id}/left`, true);
      watch(code);
      useGame.setState({ screen: 'durak', notice: '' });
      return 'ok';
    },

    setOptions(patch) {
      if (!isHostOf(get().room)) return;
      write(patch);
    },

    start() {
      const room = get().room;
      if (!room || !isHostOf(room) || room.status === 'playing') return;
      const humans = Object.entries(room.members)
        .filter(([, m]) => !m.bot && !m.left)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
        .slice(0, MAX_PLAYERS);
      const botCount = Math.min(room.bots, MAX_PLAYERS - humans.length);
      if (humans.length + botCount < 2) return;
      const members: Record<string, DurakMember> = Object.fromEntries(humans);
      const used = new Set(humans.map(([, m]) => m.avatar));
      for (let i = 0; i < botCount; i++) {
        const avatar = AVATARS.find((a) => !used.has(avatarUrl(a))) ?? AVATARS[i];
        used.add(avatarUrl(avatar));
        members[`bot${i}_${room.code}`] = { name: BOT_NAMES[i], avatar: avatarUrl(avatar), bot: true, joinedAt: be!.now() + i };
      }
      // Seats in joining order, with the bots spread between the people.
      const bots = Object.keys(members).filter((id) => members[id].bot);
      const seats = humans.flatMap(([id], i) => [id, ...bots.filter((_, k) => k % humans.length === i)]);
      const state = deal(seats, room.mode);
      botDue = new Map();
      write({ members, moves: null, status: 'playing', state, changedAt: be!.now() });
    },

    move(move) {
      const room = get().room;
      if (!room?.state) return;
      const id = me().id;
      if (!legal(room.state, id, move)) return;
      if (isHostOf(room)) {
        commit(play(room.state, id, move));
        return;
      }
      write({ [`moves/${be!.now()}_${id}`]: { by: id, move, at: be!.now() } });
    },

    leave() {
      const room = get().room;
      if (room && be) {
        const id = nodeId(room.code);
        if (isHostOf(room)) {
          void be.update(id, { status: 'closed' }).then(() => setTimeout(() => void be!.remove(id), 3000));
        } else {
          be.cancelOnDisconnect(id, `members/${me().id}/left`);
          if (room.status === 'lobby') void be.remove(id, `members/${me().id}`);
          else void be.update(id, { [`members/${me().id}/left`]: true });
        }
      }
      stop();
      useGame.setState({ screen: 'home' });
    },

    drive() {
      const room = get().room;
      if (!room || !be || !isHostOf(room) || room.status !== 'playing' || !room.state) return;
      let state = room.state;
      const now = be.now();

      // Players' moves, oldest first; anything stale or illegal is dropped.
      const queued = Object.entries(room.moves ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
      if (queued.length) {
        for (const [, m] of queued) if (legal(state, m.by, m.move)) state = play(state, m.by, m.move);
        write(Object.fromEntries(queued.map(([key]) => [`moves/${key}`, null])));
        set((s) => (s.room ? { room: { ...s.room, moves: undefined } } : s));
        if (state !== room.state) return commit(state);
      }

      const since = now - (room.changedAt ?? now);
      if (boutOver(state)) {
        if (since >= SETTLE_MS) commit(settle(state));
        return;
      }

      for (const id of waitingOn(state)) {
        const member = room.members[id];
        const away = !member || member.left;
        if (member?.bot || away) {
          const key = `${state.seq}:${id}`;
          if (!botDue.has(key)) botDue.set(key, now + (away ? 400 : BOT_MS[0] + Math.random() * (BOT_MS[1] - BOT_MS[0])));
          if (now < botDue.get(key)!) continue;
        } else if (since < TURN_MS) {
          continue;
        }
        // A bot's turn, or a person who ran out of time: the bot logic moves for them.
        const m = botMove(state, id);
        if (m && legal(state, id, m)) return commit(play(state, id, m));
      }
    },
  };
});
