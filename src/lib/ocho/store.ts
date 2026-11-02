'use client';

import { create } from 'zustand';
import { backend } from '@/lib/net';
import type { Backend } from '@/lib/net/types';
import { avatarUrl, useGame } from '@/lib/game/store';
import { guestIdentity } from '@/lib/game/eternal';
import { legal, play, type Move, type OchoState } from './rules';
import { MAX_PLAYERS, nodeId, refereeStep, startPatch, view, type OchoMember, type OchoRoom } from './room';

export { MAX_PLAYERS, TURN_MS, type OchoMember, type OchoRoom } from './room';

/**
 * Online «Очо» rooms. A room lives in the Realtime Database at `Games/ocho_{code}` (see
 * docs/ocho-protocol.md). The host is the referee: players post their moves under `moves/`, and
 * the host checks each one, applies it to `state` and plays for the bots. The host is a player's
 * browser, or the server for ad tables. Same shape as the «Дурак» rooms (src/lib/durak/store.ts).
 */

/** Where the server publishes the open ad table: `{ code, at }`. */
export const ETERNAL_POINTER = 'ocho_eternal';
/** The server refreshes the pointer every 5 s; an older one means the server is down. */
const POINTER_FRESH_MS = 15_000;

interface OchoStore {
  room: OchoRoom | null;
  create(bots: number): Promise<void>;
  /** 'none' if no «Очо» room has this code; 'refused' with a notice if it can't be joined now. */
  join(code: string): Promise<'ok' | 'refused' | 'none'>;
  /** Ad link: sit down at the server's open table, under a random name for new visitors. */
  playEternal(): Promise<void>;
  setBots(bots: number): void;
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
const isHostOf = (room: OchoRoom | null) => !!room && room.hostId === me().id;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useOcho = create<OchoStore>((set, get) => {
  function watch(code: string) {
    unwatch?.();
    unwatch = be!.watch(nodeId(code), (raw) => {
      const room = raw as unknown as OchoRoom | null;
      if (!room || room.status === 'closed') {
        const was = get().room;
        stop();
        if (was?.eternal) void get().playEternal();
        else if (was && !isHostOf(was)) useGame.setState({ screen: 'home', notice: 'Ведущий завершил игру.' });
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

  function self(): OchoMember {
    const { name, avatar } = me();
    return { name, avatar: avatarUrl(avatar), joinedAt: be!.now() };
  }

  /** Writes a referee change and applies it here at once, so the next tick doesn't act on the old state. */
  function apply(patch: Record<string, unknown>) {
    const state = patch.state as OchoState | undefined;
    write(state?.over ? { ...patch, status: 'over' } : patch);
    set((s) => {
      if (!s.room) return s;
      const moves = { ...s.room.moves };
      for (const key of Object.keys(patch)) if (key.startsWith('moves/')) delete moves[key.slice(6)];
      return {
        room: {
          ...s.room,
          moves,
          ...(state ? { state, changedAt: patch.changedAt as number, status: state.over ? 'over' : s.room.status } : {}),
        },
      };
    });
  }

  return {
    room: null,

    async create(bots) {
      be ??= await backend();
      const id = me().id;
      // Codes are shared with the quiz and «Дурак» rooms' six digits; skip one that is taken.
      let code = '';
      for (let i = 0; i < 10 && !code; i++) {
        const c = String(Math.floor(100000 + Math.random() * 900000));
        if (!(await be.read(nodeId(c))) && !(await be.read(`durak_${c}`)) && !(await be.findGame(c))) code = c;
      }
      const room: OchoRoom = { kind: 'ocho', code, hostId: id, bots, status: 'lobby', members: { [id]: self() }, createdAt: be.now() };
      await be.update(nodeId(code), room as unknown as Record<string, unknown>);
      // As in the quiz rooms: if the host's tab goes away, the room closes for everyone.
      be.onDisconnect(nodeId(code), 'status', 'closed');
      watch(code);
      useGame.setState({ screen: 'ocho', notice: '' });
    },

    async join(code) {
      be ??= await backend();
      const raw = (await be.read(nodeId(code))) as unknown as OchoRoom | null;
      if (!raw || raw.kind !== 'ocho' || raw.status === 'closed') return 'none';
      const id = me().id;
      const room = view(raw);
      if (!room.members[id]) {
        if (room.status !== 'lobby') {
          useGame.setState({ notice: 'Партия в «Очо» уже идёт. Дождитесь следующей.' });
          return 'refused';
        }
        if (Object.values(room.members).filter((m) => !m.bot).length >= MAX_PLAYERS) {
          useGame.setState({ notice: `В комнате уже ${MAX_PLAYERS} игроков.` });
          return 'refused';
        }
        await be.update(nodeId(code), { [`members/${id}`]: self() });
      } else if (room.members[id].left) {
        await be.update(nodeId(code), { [`members/${id}/left`]: null });
      }
      be.onDisconnect(nodeId(code), `members/${id}/left`, true);
      watch(code);
      useGame.setState({ screen: 'ocho', notice: '' });
      return 'ok';
    },

    async playEternal() {
      be ??= await backend();
      const game = useGame.getState();
      // As in the other ad rooms: a returning visitor keeps their name, a new one plays as a guest.
      if (!localStorage.getItem('sg.name')) {
        const guest = guestIdentity();
        localStorage.setItem('sg.name', guest.name);
        localStorage.setItem('sg.avatar', guest.avatar);
        game.setAvatar(guest.avatar);
        game.setName(guest.name);
      } else {
        game.setName(localStorage.getItem('sg.name')!);
      }
      useGame.setState({ eternal: 'ocho', screen: 'eternal', notice: '' });
      // The server's open table, if the ad-room server is up (it refreshes the pointer every few seconds).
      const pointer = (await be.read(ETERNAL_POINTER)) as unknown as { code?: string; at?: number } | null;
      const live = pointer?.code && be.now() - (pointer.at ?? 0) < POINTER_FRESH_MS;
      if (live && (await get().join(pointer.code!)) === 'ok') return;
      if (useGame.getState().eternal !== 'ocho') return;
      // No server table: the visitor's own browser hosts a table with bots and deals at once.
      await get().create(3);
      for (let i = 0; i < 100 && !get().room; i++) await sleep(50);
      get().start();
    },

    setBots(bots) {
      if (!isHostOf(get().room)) return;
      write({ bots });
    },

    start() {
      const room = get().room;
      if (!room || !isHostOf(room) || room.status === 'playing') return;
      const patch = startPatch(room, be!.now(), avatarUrl);
      if (!patch) return;
      botDue = new Map();
      write(patch);
    },

    move(move) {
      const room = get().room;
      if (!room?.state) return;
      const id = me().id;
      if (!legal(room.state, id, move)) return;
      if (isHostOf(room)) {
        apply({ state: play(room.state, id, move), changedAt: be!.now() });
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
      useGame.setState({ screen: 'home', eternal: null });
    },

    drive() {
      const room = get().room;
      if (!room || !be || !isHostOf(room)) return;
      const patch = refereeStep(room, be.now(), botDue);
      if (patch) apply(patch);
    },
  };
});
