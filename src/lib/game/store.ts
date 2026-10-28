'use client';

import { create } from 'zustand';
import { newVideoUid } from '@/lib/video';
import { dataSource } from '@/lib/data/source';
import { backend } from '@/lib/net';
import { PRE_ROUND_MS, type Backend, type GameDoc, type LiveAnswer, type LiveGame, type LiveMember } from '@/lib/net/types';
import type { GameSettings, Question } from '@/lib/types';
import {
  gameCode,
  gameDoc,
  makeBots,
  nextEvent,
  placeholder,
  roundStart,
  planBotAnswer,
  sameAnswer,
  standings,
  view,
  type Answer,
  type Room,
} from './engine';

export type Screen = 'home' | 'setup' | 'join' | 'room';

interface Me {
  id: string;
  name: string;
  avatar: string;
}

interface GameState {
  screen: Screen;
  me: Me;
  room: Room | null;
  /** Set when the game ended under a guest (host left) or a join failed. */
  notice: string;

  setName(name: string): void;
  setAvatar(avatar: string): void;
  goSetup(): void;
  goJoin(): void;
  goHome(): void;
  createRoom(settings: GameSettings, questions: Question[]): Promise<void>;
  joinRoom(code: string): Promise<boolean>;
  start(): void;
  /** A tapped option index, or typed text in `enter` rounds. */
  answer(choice: number | string): void;
  /** Host only, typed-answer rounds with manual judging: the round winner, or null for none. */
  pickWinner(playerId: string | null): void;
  /** Host only: end the round early, or skip the rest of the answers or results screen. */
  next(): void;
  /** Host only: advances the game; called every frame. */
  drive(): void;
  /** Video games: a player asks to go on air (or withdraws). */
  setWantsLive(on: boolean): void;
  /** Host only: put a player on air or take them off (at most 4 at once, as in the app). */
  setOnAir(playerId: string, on: boolean): void;
  /** A player who went on air reports their Agora uid, as the app's onPlayerJoinedStream does. */
  reportOnAir(videoUid: number): void;
  now(): number;
}

/** How long the host's device shows the answers and the standings before moving on. */
export const ANSWERS_MS = 6000;
export const RESULTS_MS = 5000;
// Grace after the timer: phones start their round a little later (they time it from receiving the
// event after loading the question), so their last answers still land.
const ROUND_GRACE_MS = 2000;
// When everyone has answered early, players first see the right answer on the answer screen, as
// they would when the time runs out.
const REVEAL_MS = 2500;
let everyoneAt = { round: '', at: 0 };

let be: Backend | null = null;
let unwatch: (() => void) | null = null;
let current: { id: string; doc: GameDoc; live: LiveGame; questions: Array<Question | null>; eventKey: string; eventAt: number; startsAt: number } | null = null;
// Host-only memory: which transitions were already sent, and each bot's plan for the game.
let issued = '';
let bots = new Map<string, number>();
const planned = new Map<string, Answer>();
const botWrites = new Set<string>();

function storage(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/** One id per browser: it names this player's `Users` doc, which the app reads. */
function playerId(): string {
  const store = storage('local');
  let id = store?.getItem('sg.uid');
  if (!id || !id.startsWith('web')) {
    id = `web${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    store?.setItem('sg.uid', id);
  }
  return id;
}

const savedName = () => storage('local')?.getItem('sg.name') || 'Игрок';

/** Absolute, so phones can load web avatars too. */
export function avatarUrl(avatar: string): string {
  if (!avatar || /^https?:/.test(avatar)) return avatar;
  return new URL(`avatars/${avatar}.webp`, location.href).href;
}

export const isHost = (s: Pick<GameState, 'room' | 'me'>) => !!s.room && s.room.hostId === s.me.id;

function member(name: string, imageUrl: string, answers: LiveAnswer[], now: number, video = false): LiveMember {
  const base = { name, imageUrl, answers, winsAmount: 0, connectedSince: now, lastInGamePosition: -2, userChangedAnswer: false };
  // As the app's addUserToGame: video games give each member an Agora uid and start them off air.
  return video ? { ...base, videoUid: newVideoUid(), isLiveAllowed: false } : base;
}

function liveAnswer(a: Answer): LiveAnswer {
  return { value: a.text, time: Math.round(a.ms * 1000), isCorrect: a.correct, numberInOrder: a.option ?? -1 };
}

/** Places for the app's final screen: by position with the time tiebreak, otherwise shared places by score. */
function places(room: Room): Record<string, number> {
  const table = standings(Object.values(room.players), room.answers, room.doc.takeIntoAnswerTime);
  const out: Record<string, number> = {};
  let place = 0;
  table.forEach((s, i) => {
    place = room.doc.takeIntoAnswerTime || i === 0 || s.correct < table[i - 1].correct ? i + 1 : place;
    out[s.player.id] = room.doc.takeIntoAnswerTime ? i + 1 : place;
  });
  return out;
}

/** The app's rule: the last one loses with up to 5 players, the last two up to 10, else the last three. */
export function losers(room: Room) {
  const table = standings(Object.values(room.players), room.answers, room.doc.takeIntoAnswerTime);
  const n = table.length;
  const count = n <= 1 ? 0 : n <= 5 ? 1 : n <= 10 ? 2 : 3;
  return table.slice(n - count).map((s) => s.player);
}

export const useGame = create<GameState>((set, get) => {
  function render() {
    if (!current) return;
    const { id, doc, live, questions, eventAt, startsAt } = current;
    set({ room: view(id, doc, live, questions, eventAt, startsAt), screen: 'room' });
  }

  function leave(notice = '') {
    unwatch?.();
    unwatch = null;
    current = null;
    set({ room: null, screen: 'home', notice });
  }

  async function attach(id: string, doc: GameDoc) {
    be ??= await backend();
    if (doc.gameType !== 'music' && doc.gameType !== 'quiz') throw new Error('unsupported');
    const questions = await (await dataSource()).byIds(doc.gameType, doc.questions);
    unwatch?.();
    current = { id, doc, live: { currentEvent: 'waiting', currentRound: 0 }, questions, eventKey: '', eventAt: be.now(), startsAt: 0 };
    unwatch = be.watch(id, (live) => {
      if (!current) return;
      if (!live || live.currentEvent === 'master_left') {
        leave(isHost(get()) ? '' : 'Ведущий завершил игру.');
        return;
      }
      const key = `${live.currentEvent}#${live.currentRound}`;
      if (key !== current.eventKey) {
        current.eventKey = key;
        current.eventAt = be!.now();
        // Fixed once per event, like the app's answer screen, so later updates do not move it.
        current.startsAt = roundStart(doc, live.roundStartTime, current.eventAt);
      }
      current.live = live;
      render();
    });
  }

  /** Host: placeholders for the round, so every member's answers stay a dense list the app can read. */
  function roundPatch(room: Room, index: number): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const pid of Object.keys(room.players)) patch[`members/${pid}/answers/${index}`] = placeholder(room.doc.roundTime);
    const event = nextEvent(room.doc);
    return { ...patch, currentRound: index, roundStartTime: be!.now(), currentEvent: event, lastRoundEvent: event };
  }

  function finishRound(room: Room, winner: string | null) {
    const last = room.index + 1 >= room.total;
    const patch: Record<string, unknown> = {
      [`selectedUser/${room.index}`]: winner ?? '',
      currentEvent: last ? 'final_results' : 'results',
    };
    if (winner) {
      patch[`members/${winner}/answers/${room.index}/isCorrect`] = true;
      const answers = room.answers.slice();
      answers[room.index] = { ...answers[room.index], [winner]: { ...answers[room.index][winner], correct: true } };
      room = { ...room, answers };
    }
    if (last) {
      patch.finalResultsUsersOrder = places(room);
      if (room.doc.punishmentType !== 'nonePunishment') patch.finalResultsPunishedUsers = losers(room).map((p) => p.name);
    }
    void be!.update(room.id, patch);
  }

  function nextRound(room: Room) {
    const patch = roundPatch(room, room.index + 1);
    for (const [pid, place] of Object.entries(places(room))) patch[`members/${pid}/lastInGamePosition`] = place;
    void be!.update(room.id, patch);
  }

  return {
    screen: 'home',
    me: { id: '', name: 'Игрок', avatar: 'wolf' },
    room: null,
    notice: '',

    setName(name) {
      storage('local')?.setItem('sg.name', name);
      set((s) => ({ me: { ...s.me, name, id: s.me.id || playerId() } }));
    },
    setAvatar(avatar) {
      storage('local')?.setItem('sg.avatar', avatar);
      set((s) => ({ me: { ...s.me, avatar } }));
    },
    goSetup() {
      set((s) => ({ screen: 'setup', notice: '', me: { ...s.me, id: s.me.id || playerId(), name: s.me.name === 'Игрок' ? savedName() : s.me.name } }));
    },
    goJoin() {
      set((s) => ({ screen: 'join', notice: '', me: { ...s.me, id: s.me.id || playerId() } }));
    },
    goHome() {
      const { room, me } = get();
      if (room && be) {
        if (isHost(get())) {
          // As the app's host does: announce the end, then delete the game.
          const { id } = room;
          void be.update(id, { currentEvent: 'master_left' }).then(() => {
            void be!.deleteGame(id);
            setTimeout(() => void be!.remove(id), 3000);
          });
        } else {
          void be.remove(room.id, `members/${me.id}`);
          be.cancelOnDisconnect(room.id, `members/${me.id}`);
        }
      }
      leave();
      set({ screen: 'home' });
    },

    async createRoom(settings, questions) {
      be ??= await backend();
      const { me } = get();
      let code = gameCode();
      for (let i = 0; i < 5 && (await be.findGame(code)); i++) code = gameCode();
      const now = be.now();
      const crew = settings.isPrivate ? [] : makeBots(settings.bots);
      await Promise.all([
        be.saveUser(me.id, { name: me.name, avatarUrl: avatarUrl(me.avatar) }),
        ...crew.map((b) => be!.saveUser(b.id, { name: b.name, avatarUrl: avatarUrl(b.avatar), isBot: true })),
      ]);
      const doc = gameDoc(settings, me.id, code, questions.map((q) => q.id));
      const id = await be.createGame(doc);
      const members: Record<string, LiveMember> = {};
      if (settings.isAdminPlayer) members[me.id] = member(me.name, avatarUrl(me.avatar), [], now, settings.videoEnabled);
      crew.forEach((b, i) => (members[b.id] = member(b.name, avatarUrl(b.avatar), [], now + i + 1)));
      bots = new Map(crew.map((b) => [b.id, b.accuracy]));
      botWrites.clear();
      planned.clear();
      issued = '';
      await be.update(id, {
        currentEvent: 'waiting',
        currentRound: 0,
        isBackgroundMusicPlaying: false,
        backgroundMusicVolume: 5,
        currentMusicVolume: 5,
        adminInteractions: 'none',
        members,
      });
      // If this tab goes away, players see the game end instead of waiting forever.
      be.onDisconnect(id, 'currentEvent', 'master_left');
      await attach(id, doc);
    },

    async joinRoom(code) {
      be ??= await backend();
      const { me } = get();
      try {
        const found = await be.findGame(code);
        const live = found && (await be.read(found.id));
        if (!found || !live) {
          set({ notice: 'Комната с таким кодом не найдена. Проверьте код у ведущего.' });
          return false;
        }
        if (live.bannedUsers?.includes(me.id)) {
          set({ notice: 'Ведущий не пускает вас в эту комнату.' });
          return false;
        }
        await be.saveUser(me.id, { name: me.name, avatarUrl: avatarUrl(me.avatar) });
        const started = live.currentEvent !== 'waiting' && live.currentEvent !== 'repeat_game_waiting';
        const existing = live.members?.[me.id]?.answers ?? [];
        // Rounds already played count as missed, like a late joiner in the app.
        const answers = Array.isArray(existing) ? existing.slice() : [];
        for (let i = answers.length; i < (live.currentRound ?? 0) + (started ? 1 : 0); i++) answers.push(placeholder(found.doc.roundTime));
        const mine = member(me.name, avatarUrl(me.avatar), answers, be.now(), found.doc.videoEnabled);
        // A returning player keeps their Agora uid, so an invitation still matches.
        const before = live.members?.[me.id];
        if (before?.videoUid) Object.assign(mine, { videoUid: before.videoUid, isLiveAllowed: before.isLiveAllowed ?? false });
        await be.update(found.id, { [`members/${me.id}`]: mine });
        be.onDisconnect(found.id, `members/${me.id}`, null);
        // Drop the code from the address so leaving the room does not re-open the join screen.
        try {
          history.replaceState(null, '', location.pathname + location.search);
        } catch {}
        await attach(found.id, found.doc);
        return true;
      } catch {
        set({ notice: 'Не получилось войти. Если это игра про кино, на вебе её пока нет; иначе попробуйте ещё раз.' });
        return false;
      }
    },

    start() {
      const { room } = get();
      if (!room || !be || !isHost(get()) || room.stage !== 'lobby') return;
      issued = '';
      botWrites.clear();
      void be.update(room.id, roundPatch(room, 0));
    },

    answer(choice) {
      const { room, me } = get();
      if (!room?.round || !be || room.stage !== 'question' || !room.players[me.id]) return;
      if (room.answers[room.index][me.id]) return;
      if (be.now() < room.startsAt) return;
      // Answer time is measured as the app measures it: from the host's roundStartTime plus the countdown.
      const anchor = (current?.live.roundStartTime ?? room.startsAt - PRE_ROUND_MS) + PRE_ROUND_MS;
      const ms = Math.max(0, Math.min(room.roundMs, Math.round(be.now() - anchor)));
      const round = room.round;
      const a: Answer =
        typeof choice === 'number'
          ? { option: choice, text: round.options[choice]?.text ?? '', ms, correct: round.options[choice]?.correct ?? false }
          : { option: null, text: choice.trim(), ms, correct: sameAnswer(choice, round.answer) };
      if (!a.text) return;
      void be.update(room.id, { [`members/${me.id}/answers/${room.index}`]: liveAnswer(a) });
    },

    pickWinner(playerId) {
      const { room } = get();
      if (!room || !be || !isHost(get()) || room.stage !== 'answers') return;
      if (issued === `w${room.index}`) return;
      issued = `w${room.index}`;
      finishRound(room, playerId);
    },

    next() {
      const { room } = get();
      if (!room || !be || !isHost(get())) return;
      // «Далее» during a round ends it early, as the app's adminHandleNext does.
      if (room.stage === 'question' && room.round && be.now() > room.startsAt && issued !== `e${room.index}`) {
        issued = `e${room.index}`;
        if (room.doc.takeIntoAnswerTime) void be.update(room.id, { currentEvent: 'answers' });
        else finishRound(room, null);
      } else if (room.stage === 'answers') get().pickWinner(null);
      else if (room.stage === 'results' && issued !== `n${room.index}`) {
        issued = `n${room.index}`;
        nextRound(room);
      }
    },

    now() {
      return be ? be.now() : Date.now();
    },

    setWantsLive(on) {
      const { room, me } = get();
      if (!room || !be || !room.players[me.id]) return;
      const patch: Record<string, unknown> = { [`members/${me.id}/isLiveAllowed`]: on };
      if (!on && me.id in room.invited) patch[`invitedUsers/${me.id}`] = null;
      void be.update(room.id, patch);
    },

    setOnAir(playerId, on) {
      const { room } = get();
      if (!room || !be || !isHost(get())) return;
      if (on && Object.keys(room.invited).length >= 4) return;
      void be.update(room.id, { [`invitedUsers/${playerId}`]: on ? 0 : null });
    },

    reportOnAir(videoUid) {
      const { room, me } = get();
      if (!room || !be || !(me.id in room.invited)) return;
      void be.update(room.id, { [`invitedUsers/${me.id}`]: videoUid });
    },

    // Everything is derived from timestamps, so a throttled background tab catches up instead of drifting.
    drive() {
      const { room } = get();
      if (!room || !be || !isHost(get())) return;
      const now = be.now();
      const go = (tag: string, run: () => void) => {
        if (issued === tag) return;
        issued = tag;
        run();
      };

      if (room.stage === 'question' && room.round) {
        const elapsed = now - room.startsAt;
        const answered = room.answers[room.index];
        const patch: Record<string, unknown> = {};
        for (const [botId, accuracy] of bots) {
          if (!room.players[botId] || answered[botId]) continue;
          const key = `${room.index}/${botId}`;
          if (botWrites.has(key)) continue;
          // Plan once per round; write when its moment comes.
          if (!planned.has(key)) {
            const history = room.answers.slice(0, room.index).map((r) => r[botId]).filter(Boolean);
            planned.set(key, planBotAnswer(accuracy, room.round, history, room.total, room.roundMs));
          }
          const p = planned.get(key)!;
          if (elapsed >= p.ms) {
            botWrites.add(key);
            patch[`members/${botId}/answers/${room.index}`] = liveAnswer(p);
          }
        }
        if (Object.keys(patch).length) void be.update(room.id, patch);
        const everyone = Object.keys(room.players).every((pid) => answered[pid] || patch[`members/${pid}/answers/${room.index}`]);
        if (everyone && everyoneAt.round !== `${room.id}/${room.index}`) everyoneAt = { round: `${room.id}/${room.index}`, at: now };
        const revealed = everyone && now - everyoneAt.at >= REVEAL_MS;
        if (elapsed > 0 && (revealed || elapsed >= room.roundMs + ROUND_GRACE_MS)) {
          go(`e${room.index}`, () => {
            if (room.doc.takeIntoAnswerTime) void be!.update(room.id, { currentEvent: 'answers' });
            else finishRound(room, null);
          });
        }
      } else if (room.stage === 'answers') {
        const manual = room.round?.mode === 'enter' && room.doc.winnerDeterminationType === 'manually';
        if (!manual && now - room.stageAt >= ANSWERS_MS) get().pickWinner(null);
      } else if (room.stage === 'results' && now - room.stageAt >= RESULTS_MS) {
        get().next();
      }
    },
  };
});
