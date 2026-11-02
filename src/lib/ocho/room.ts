import { AVATARS } from '@/lib/game/engine';
import { botMove } from './bot';
import { deal, legal, MAX_PLAYERS, normalize, play, type Move, type OchoState } from './rules';

/**
 * An «Очо» room as stored at `Games/ocho_{code}` (docs/ocho-protocol.md), and the referee's work
 * on it as pure functions, so a browser host and the server host run the same code.
 */
export interface OchoMember {
  name: string;
  avatar: string;
  bot?: boolean;
  joinedAt: number;
  /** The player closed the page; the bot logic plays their turns. */
  left?: boolean;
}

export interface OchoRoom {
  kind: 'ocho';
  code: string;
  hostId: string;
  bots: number;
  status: 'lobby' | 'playing' | 'over' | 'closed';
  members: Record<string, OchoMember>;
  state?: OchoState;
  moves?: Record<string, { by: string; move: Move; at: number }>;
  /** Server time of the last state change, for the bots' pace and the turn timer. */
  changedAt?: number;
  createdAt: number;
  /** An always-on ad table: the server host deals again on its own after `nextAt`. */
  eternal?: boolean;
  nextAt?: number;
}

export { MAX_PLAYERS };
/** A player who doesn't move in this time is moved for: they play what fits or draw. */
export const TURN_MS = 20_000;
const BOT_MS = [800, 1600];
const BOT_NAMES = ['Бот Миша', 'Бот Катя', 'Бот Олег', 'Бот Аня', 'Бот Дима', 'Бот Лена'];

export const nodeId = (code: string) => `ocho_${code}`;

export function view(raw: OchoRoom): OchoRoom {
  return { ...raw, members: raw.members ?? {}, state: raw.state ? normalize(raw.state) : undefined };
}

export const humans = (room: OchoRoom) =>
  Object.entries(room.members)
    .filter(([, m]) => !m.bot && !m.left)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

/** A new open ad table, as the server host creates it. */
export function eternalRoom(code: string, hostId: string, now: number, bots = 3): OchoRoom {
  return { kind: 'ocho', code, hostId, bots, status: 'lobby', members: {}, createdAt: now, eternal: true };
}

/** The write that deals a game: the people in joining order with the bots spread between them. */
export function startPatch(room: OchoRoom, now: number, avatarUrl: (a: string) => string): Record<string, unknown> | null {
  const people = humans(room).slice(0, MAX_PLAYERS);
  const botCount = Math.min(room.bots, MAX_PLAYERS - people.length);
  if (!people.length || people.length + botCount < 2) return null;
  const members: Record<string, OchoMember> = Object.fromEntries(people);
  const used = new Set(people.map(([, m]) => m.avatar));
  for (let i = 0; i < botCount; i++) {
    const avatar = AVATARS.find((a) => !used.has(avatarUrl(a))) ?? AVATARS[i % AVATARS.length];
    used.add(avatarUrl(avatar));
    members[`bot${i}_${room.code}`] = { name: BOT_NAMES[i], avatar: avatarUrl(avatar), bot: true, joinedAt: now + i };
  }
  const bots = Object.keys(members).filter((id) => members[id].bot);
  const seats = people.flatMap(([id], i) => [id, ...bots.filter((_, k) => k % people.length === i)]);
  return { members, moves: null, status: 'playing', state: deal(seats), changedAt: now, nextAt: null };
}

/**
 * One referee tick: applies queued moves, or plays for a bot, a player who left, or one whose time
 * ran out. Returns the write to make, or null if nothing is due. `due` remembers when each bot is
 * to move, across ticks.
 */
export function refereeStep(room: OchoRoom, now: number, due: Map<string, number>): Record<string, unknown> | null {
  if (room.status !== 'playing' || !room.state) return null;
  let state = room.state;
  const result = (next: OchoState, extra: Record<string, unknown> = {}) => ({
    ...extra,
    state: next,
    changedAt: now,
    ...(next.over ? { status: 'over' } : {}),
  });

  // Players' moves, oldest first; anything stale or illegal is dropped.
  const queued = Object.entries(room.moves ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  if (queued.length) {
    for (const [, m] of queued) if (legal(state, m.by, m.move)) state = play(state, m.by, m.move);
    const clear = Object.fromEntries(queued.map(([key]) => [`moves/${key}`, null]));
    return state !== room.state ? result(state, clear) : clear;
  }

  const id = state.turn;
  const member = room.members[id];
  const away = !member || member.left;
  const since = now - (room.changedAt ?? now);
  if (member?.bot || away) {
    const key = `${room.code}:${state.seq}:${id}`;
    if (!due.has(key)) due.set(key, now + (away ? 400 : BOT_MS[0] + Math.random() * (BOT_MS[1] - BOT_MS[0])));
    if (now < due.get(key)!) return null;
    due.delete(key);
  } else if (since < TURN_MS) {
    return null;
  }
  // A bot's turn, or a person who ran out of time: the bot logic moves for them.
  // Only real bots ever forget to call «Очо!»; a person who left or timed out is not penalised for it.
  const m = botMove(state, id, member?.bot ? Math.random : () => 1);
  return m && legal(state, id, m) ? result(play(state, id, m)) : null;
}
