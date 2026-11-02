'use client';

import { create } from 'zustand';
import { backend } from '@/lib/net';
import { localBackend } from '@/lib/net/local';
import type { Backend } from '@/lib/net/types';
import { avatarUrl, useGame } from '@/lib/game/store';
import { guestIdentity } from '@/lib/game/eternal';
import { AVATARS } from '@/lib/game/engine';
import { track } from '@/lib/analytics';
import { botShot } from './bot';
import type { Shot, Vec } from './physics';
import { forfeit, newGame, normalizeState, playShot, timeOut, type PoolState } from './rules';

/**
 * «Бильярд» rooms (8-ball pool for two). An online room lives in the Realtime Database at
 * `Games/pool_{code}` (docs/billiards-protocol.md); a game against the bot uses the same code on an
 * in-memory backend, so it needs no network and starts at once.
 *
 * A shot is written by the player who takes it, together with the table after it: every client
 * replays the shot from the previous table (the physics is deterministic) and then shows the
 * written table. The host plays for the bot and for a player who left, and calls time-outs.
 */

export interface PoolMember {
  name: string;
  avatar: string;
  bot?: boolean;
  joinedAt: number;
  left?: boolean;
}

export interface ShotRecord extends Shot {
  /** The state seq this shot was played on. */
  seq: number;
  by: string;
  place?: Vec | null;
  /** How long the shot runs, ms, so the next shooter waits for everyone's playback. */
  dur: number;
}

export interface PoolRoom {
  kind: 'pool';
  code: string;
  hostId: string;
  vsBot: boolean;
  status: 'lobby' | 'playing' | 'over' | 'closed';
  members: Record<string, PoolMember>;
  state?: PoolState;
  shot?: ShotRecord;
  /** Server time when the current shot's playback started (or the game was dealt). */
  changedAt?: number;
  createdAt: number;
  /** Games won per player id in this room. */
  wins?: Record<string, number>;
}

/** Time to take a shot, after the previous one has rolled out. */
export const SHOT_MS = 60_000;
const BOT_THINK_MS = [900, 1800];

export const nodeId = (code: string) => `pool_${code}`;

interface PoolStore {
  room: PoolRoom | null;
  /** Against the bot: a room on this device only. `ad` marks a visitor from an ad link. */
  playBot(ad?: boolean): Promise<void>;
  /** Online room for two; friends join by its code. */
  create(): Promise<void>;
  join(code: string): Promise<'ok' | 'refused' | 'none'>;
  start(): void;
  shoot(shot: Shot, place: Vec | null): void;
  leave(): void;
  /** Host only: bot shots and time-outs; called on a timer. */
  drive(): void;
}

let be: Backend | null = null;
let unwatch: (() => void) | null = null;
let botBusy = false;
/** When the bot takes the shot on state `seq`: it "thinks" a moment after the balls stop. */
let botDue = { seq: -1, at: 0 };

const me = () => useGame.getState().me;
const isHostOf = (room: PoolRoom | null) => !!room && room.hostId === me().id;

/** The room's clock (server-corrected online), ms. */
export const poolNow = () => (be ? be.now() : Date.now());

function view(raw: PoolRoom): PoolRoom {
  return { ...raw, members: raw.members ?? {}, state: raw.state ? normalizeState(raw.state) : undefined };
}

/** Whose turn it is, as a member id. */
export const shooter = (room: PoolRoom) => (room.state ? room.state.players[room.state.turn] : '');

/** When the current shooter's time runs out. */
export const deadline = (room: PoolRoom) => (room.changedAt ?? 0) + (room.shot?.dur ?? 0) + SHOT_MS;

export const usePool = create<PoolStore>((set, get) => {
  function watch(code: string) {
    unwatch?.();
    unwatch = be!.watch(nodeId(code), (raw) => {
      const room = raw as unknown as PoolRoom | null;
      if (!room || room.status === 'closed') {
        const was = get().room;
        stop();
        if (was && !isHostOf(was)) useGame.setState({ screen: 'home', notice: 'Соперник вышел из игры.' });
        return;
      }
      const prev = get().room;
      const next = view(room);
      if (next.status === 'playing' && prev?.status !== 'playing') track('game_start', { game: 'billiards', room: next.vsBot ? 'bot' : 'private' });
      if (next.status === 'over' && prev?.status !== 'over') track('game_finish', { game: 'billiards', room: next.vsBot ? 'bot' : 'private' });
      set({ room: next });
    });
  }

  function stop() {
    unwatch?.();
    unwatch = null;
    botBusy = false;
    set({ room: null });
  }

  function write(patch: Record<string, unknown>) {
    const room = get().room;
    if (room) void be!.update(nodeId(room.code), patch);
  }

  function self(): PoolMember {
    const { name, avatar } = me();
    return { name, avatar: avatarUrl(avatar), joinedAt: be!.now() };
  }

  async function newCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const c = String(Math.floor(100000 + Math.random() * 900000));
      if (!be!.shared) return c;
      if (!(await be!.read(nodeId(c))) && !(await be!.read(`durak_${c}`)) && !(await be!.read(`ocho_${c}`)) && !(await be!.findGame(c))) return c;
    }
    throw new Error('no free code');
  }

  /** Writes a shot and the table after it. */
  function post(room: PoolRoom, by: string, shot: Shot, place: Vec | null) {
    const state = room.state!;
    const played = playShot(state, shot, place, true);
    const dur = Math.round(played.result.frames.length * played.result.frameDt * 1000);
    const next = played.next;
    const patch: Record<string, unknown> = {
      shot: { seq: state.seq, by, dx: shot.dx, dy: shot.dy, power: shot.power, place: played.placed, dur },
      state: next,
      changedAt: be!.now(),
    };
    if (next.over) {
      patch.status = 'over';
      const winner = next.players[next.winner!];
      patch[`wins/${winner}`] = (room.wins?.[winner] ?? 0) + 1;
    }
    write(patch);
  }

  return {
    room: null,

    async playBot(ad = false) {
      be = localBackend;
      const game = useGame.getState();
      if (ad) {
        // As in the other ad rooms: a returning visitor keeps their name, a new one plays as a guest.
        let saved: string | null = null;
        try {
          saved = localStorage.getItem('sg.name');
          if (!saved) {
            const guest = guestIdentity();
            localStorage.setItem('sg.name', guest.name);
            localStorage.setItem('sg.avatar', guest.avatar);
            game.setAvatar(guest.avatar);
            saved = guest.name;
          }
        } catch {}
        game.setName(saved ?? 'Игрок');
      }
      const id = me().id;
      const code = await newCode();
      const mine = avatarUrl(me().avatar);
      const botAvatar = avatarUrl(AVATARS.find((a) => avatarUrl(a) !== mine) ?? AVATARS[0]);
      const room: PoolRoom = {
        kind: 'pool', code, hostId: id, vsBot: true, status: 'lobby', createdAt: be.now(),
        members: { [id]: self(), [`bot_${code}`]: { name: 'Бот Миша', avatar: botAvatar, bot: true, joinedAt: be.now() + 1 } },
      };
      await be.update(nodeId(code), room as unknown as Record<string, unknown>);
      watch(code);
      useGame.setState({ screen: 'pool', notice: '', eternal: ad ? 'billiards' : null });
      track('game_join', { game: 'billiards', room: ad ? 'ad' : 'bot' });
      for (let i = 0; i < 40 && !get().room; i++) await new Promise((r) => setTimeout(r, 25));
      get().start();
    },

    async create() {
      be = await backend();
      const id = me().id;
      const code = await newCode();
      const room: PoolRoom = { kind: 'pool', code, hostId: id, vsBot: false, status: 'lobby', members: { [id]: self() }, createdAt: be.now() };
      await be.update(nodeId(code), room as unknown as Record<string, unknown>);
      // As in the other rooms: if the host's tab goes away, the room closes for everyone.
      be.onDisconnect(nodeId(code), 'status', 'closed');
      watch(code);
      useGame.setState({ screen: 'pool', notice: '' });
      track('game_join', { game: 'billiards', room: 'private' });
    },

    async join(code) {
      be = await backend();
      const raw = (await be.read(nodeId(code))) as unknown as PoolRoom | null;
      if (!raw || raw.kind !== 'pool' || raw.status === 'closed') return 'none';
      const id = me().id;
      const room = view(raw);
      if (!room.members[id]) {
        const people = Object.values(room.members).filter((m) => !m.bot);
        if (room.status !== 'lobby' || people.length >= 2) {
          useGame.setState({ notice: 'За этим бильярдным столом уже играют двое.' });
          return 'refused';
        }
        await be.update(nodeId(code), { [`members/${id}`]: self() });
      } else if (room.members[id].left) {
        await be.update(nodeId(code), { [`members/${id}/left`]: null });
      }
      be.onDisconnect(nodeId(code), `members/${id}/left`, true);
      watch(code);
      useGame.setState({ screen: 'pool', notice: '' });
      track('game_join', { game: 'billiards', room: 'private' });
      return 'ok';
    },

    start() {
      const room = get().room;
      if (!room || !isHostOf(room) || room.status === 'playing') return;
      const ids = Object.entries(room.members)
        .filter(([, m]) => !m.left)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
        .map(([id]) => id);
      if (ids.length < 2) return;
      // Breaks alternate: the first game is broken by the host, the next by the other player.
      const games = Object.values(room.wins ?? {}).reduce((a, b) => a + b, 0);
      const players: [string, string] = games % 2 ? [ids[1], ids[0]] : [ids[0], ids[1]];
      write({ status: 'playing', state: newGame(players), shot: null, changedAt: be!.now() });
    },

    shoot(shot, place) {
      const room = get().room;
      if (!room?.state || room.status !== 'playing' || room.state.over) return;
      const id = me().id;
      if (shooter(room) !== id) return;
      post(room, id, shot, place);
    },

    leave() {
      const room = get().room;
      if (room && be) {
        const id = nodeId(room.code);
        if (isHostOf(room)) {
          void be.update(id, { status: 'closed' }).then(() => setTimeout(() => void be?.remove(id), 3000));
        } else {
          be.cancelOnDisconnect(id, `members/${me().id}/left`);
          if (room.status === 'lobby') void be.remove(id, `members/${me().id}`);
          else if (room.status === 'playing' && room.state && !room.state.over) {
            // Leaving mid-game gives the game away.
            const seat = room.state.players.indexOf(me().id) as 0 | 1;
            const next = forfeit(room.state, seat);
            const winner = next.players[next.winner!];
            void be.update(id, { [`members/${me().id}/left`]: true, state: next, status: 'over', shot: null, changedAt: be.now(), [`wins/${winner}`]: (room.wins?.[winner] ?? 0) + 1 });
          } else void be.update(id, { [`members/${me().id}/left`]: true });
        }
      }
      stop();
      useGame.setState({ screen: 'home', eternal: null });
    },

    drive() {
      const room = get().room;
      if (!room || !be || !isHostOf(room) || room.status !== 'playing' || !room.state || room.state.over || botBusy) return;
      const now = be.now();
      const ready = (room.changedAt ?? 0) + (room.shot?.dur ?? 0);
      if (now < ready) return;
      const who = shooter(room);
      const member = room.members[who];
      if (member?.bot || member?.left || !member) {
        const seq = room.state.seq;
        if (botDue.seq !== seq) botDue = { seq, at: ready + BOT_THINK_MS[0] + Math.random() * (BOT_THINK_MS[1] - BOT_THINK_MS[0]) };
        if (now < botDue.at) return;
        botBusy = true;
        void botShot(room.state).then(
          (b) => {
            botBusy = false;
            const cur = get().room;
            if (cur?.state?.seq === seq && cur.status === 'playing') post(cur, who, b.shot, b.place);
          },
          () => {
            botBusy = false;
          },
        );
        return;
      }
      if (!room.vsBot && now > deadline(room)) {
        write({ state: timeOut(room.state), shot: null, changedAt: now });
      }
    },
  };
});
