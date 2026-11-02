'use client';

import { useEffect, useRef, useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { track } from '@/lib/analytics';
import { MAX_PLAYERS, TURN_MS, useOcho, type OchoRoom } from '@/lib/ocho/store';
import { bestColor } from '@/lib/ocho/bot';
import { COLORS, colorOf, isWild, legal, playable, top, valueOf, type Card, type Color, type OchoState } from '@/lib/ocho/rules';
import { Avatar } from './Avatar';
import { ActionButton, AppBar, BlueScreen, CloseIcon, Dialog, RoundButton } from './ui';

export const COLOR_NAMES: Record<Color, string> = { R: 'красный', Y: 'жёлтый', G: 'зелёный', B: 'синий' };
const VALUE_NAMES: Record<string, string> = { S: 'пропуск', V: 'разворот', D: '+2', W: 'смена цвета', '4': '+4, смена цвета' };

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" />
    </svg>
  );
}
function ReverseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9h13l-3.5-3.5" /><path d="M20 15H7l3.5 3.5" />
    </svg>
  );
}

/** What the middle of a card shows, and the short mark in its corners. */
function face(card: Card): { big: React.ReactNode; corner: React.ReactNode } {
  const v = valueOf(card);
  if (v === 'S') return { big: <SkipIcon />, corner: <SkipIcon /> };
  if (v === 'V') return { big: <ReverseIcon />, corner: <ReverseIcon /> };
  if (v === 'D') return { big: '+2', corner: '+2' };
  if (v === '4' && isWild(card)) return { big: '+4', corner: '+4' };
  if (v === 'W') return { big: null, corner: '★' };
  // 6 and 9 are underlined, so an upside-down corner can't be mistaken for the other.
  const digit = v === '6' || v === '9' ? <span className="u">{v}</span> : v;
  return { big: digit, corner: digit };
}

/** One card: a colour field with a white rim; wild cards are dark with the four colours in a ring. */
export function OchoCard({ card, small, color, state, onClick }: {
  card: Card;
  small?: boolean;
  /** For a wild card on the pile: the colour that was named. */
  color?: Color;
  state?: 'playable' | 'dim';
  onClick?: () => void;
}) {
  const v = valueOf(card);
  const c = colorOf(card);
  const what = isWild(card) ? VALUE_NAMES[v] : `${COLOR_NAMES[c!]} ${VALUE_NAMES[v] ?? v}`;
  const name = `${what}${color ? `, цвет ${COLOR_NAMES[color]}` : ''}`;
  const { big, corner } = face(card);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ocard ${isWild(card) ? 'wild' : `c-${c}`} ${/[SVD]/.test(v) ? 'action' : ''} ${small ? 'small' : ''} ${state ?? ''}`}
      onClick={onClick}
      aria-label={name}
      data-card={card}
    >
      <span className="ocard-corner">{corner}</span>
      <span className="ocard-face">
        {isWild(card) && <i className={`ocard-ring ${color ? `named c-${color}` : ''}`} aria-hidden />}
        {big !== null && <b>{big}</b>}
      </span>
      <span className="ocard-corner end">{corner}</span>
    </Tag>
  );
}

function CardBack({ small }: { small?: boolean }) {
  return (
    <div className={`ocard back ${small ? 'small' : ''}`} aria-hidden>
      <span className="ocard-face"><i className="ocard-ring" /><b className="logo">Очо</b></span>
    </div>
  );
}

/** By colour, numbers then actions, wild cards last, as players hold them. */
function sortHand(hand: Card[]) {
  const order = (c: Card) => (isWild(c) ? 100 : COLORS.indexOf(colorOf(c)!) * 20) + '0123456789SVDW4'.indexOf(valueOf(c));
  return [...hand].sort((a, b) => order(a) - order(b));
}

function useTicker(ms = 500) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Ad tables: the server deals at `at`; until it sets a time, players are still being seated. */
function NextIn({ at, label }: { at?: number; label: string }) {
  const now = useGame((s) => s.now);
  useTicker();
  if (!at) return <>Собираем игроков за стол…</>;
  return <>{label} {Math.max(1, Math.ceil((at - now()) / 1000))} сек</>;
}

export function OchoRules() {
  return (
    <div className="ocho-rules">
      <p>Кладите карту того же <b>цвета</b>, с тем же <b>числом</b> или тем же значком, что сверху. Первый, кто избавится от всех карт, побеждает.</p>
      <ul>
        <li><OchoCard card="GS" small /> <span><b>Пропуск</b>: следующий игрок пропускает ход.</span></li>
        <li><OchoCard card="BV" small /> <span><b>Разворот</b>: игра идёт в другую сторону.</span></li>
        <li><OchoCard card="RD" small /> <span><b>+2</b>: следующий берёт две карты и пропускает ход.</span></li>
        <li><OchoCard card="WW" small /> <span><b>Смена цвета</b>: кладётся на любую карту, вы выбираете цвет.</span></li>
        <li><OchoCard card="W4" small /> <span><b>+4</b>: вы выбираете цвет, следующий берёт четыре и пропускает ход. Можно, только если нет карт нужного цвета.</span></li>
      </ul>
      <p>Нечего положить? Возьмите карту: если подходит, её можно сразу сыграть.</p>
      <p>Остаётся одна карта? Нажмите <b>«Очо!»</b> перед ходом, иначе возьмёте две карты штрафа.</p>
    </div>
  );
}

function Lobby({ room, host }: { room: OchoRoom; host: boolean }) {
  const { start, setBots } = useOcho();
  const [copied, setCopied] = useState(false);
  const humans = Object.entries(room.members).filter(([, m]) => !m.bot).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const bots = Math.min(room.bots, MAX_PLAYERS - humans.length);
  const total = humans.length + bots;
  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';
  const share = () => {
    const text = `Сыграем в «Очо» в OK Battle: код комнаты ${room.code}`;
    if (navigator.share) return void navigator.share({ title: 'OK Battle', text, url: link }).catch(() => {});
    navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
  };
  return (
    <>
      <p className="code-label">Код комнаты:</p>
      <div className="code-box">
        <div>
          {room.code}
          <button type="button" aria-label="Поделиться ссылкой" onClick={share}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#284D79" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13 11.0008L21.2 2.80078" /><path d="M21.9992 6.8V2H17.1992" />
              <path d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13" />
            </svg>
          </button>
        </div>
      </div>
      {copied && <p className="copied">Ссылка скопирована</p>}

      <div className="durak-lobby">
        <div className="panel">
          {host && (
            <div className="field">
              <h3>Боты</h3>
              <div className="chips">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="chip" aria-pressed={room.bots === n} onClick={() => setBots(n)}>{n}</button>
                ))}
              </div>
              <small className="hint">Боты занимают свободные места, всего за столом до {MAX_PLAYERS} игроков.</small>
            </div>
          )}
          <div className="field">
            <h3>Как играть</h3>
            <OchoRules />
          </div>
        </div>
        <p className="section-title">За столом: {total} из {MAX_PLAYERS}</p>
        <div className="await-list">
          {humans.map(([id, m]) => (
            <div key={id} className="await-item">
              <Avatar name={m.avatar} size={36} />
              <span>{m.name}</span>
              <small>{id === room.hostId ? 'создатель' : ''}</small>
            </div>
          ))}
          {bots > 0 && <div className="await-item"><span>+ ботов: {bots}</span></div>}
        </div>
        {host ? (
          <ActionButton primary disabled={total < 2} onClick={() => { unlockAudio(); click('startGame'); start(); }}>
            {total < 2 ? 'Нужен ещё игрок или бот' : 'Начать игру'}
          </ActionButton>
        ) : (
          <p className="wait-text">{room.eternal ? <NextIn at={room.nextAt} label="Раздаём через" /> : 'Ждём, когда создатель начнёт игру…'}</p>
        )}
      </div>
    </>
  );
}

/** A line about the last move, so players see what the others did. */
function lastLine(s: OchoState, name: (id: string) => string): string {
  const l = s.last;
  if (!l) return '';
  if (l.kind === 'pass') return `${name(l.by)}: пас`;
  if (l.kind === 'draw') return l.drew ? `${name(l.by)}: берёт карту` : `${name(l.by)}: карт в колоде не осталось`;
  const parts: string[] = [];
  if (l.called) parts.push(`${name(l.by)}: Очо!`);
  if (l.called === false) parts.push(`${name(l.by)}: не сказали «Очо!», штраф +${l.drew}`);
  if (isWild(l.card)) parts.push(`Цвет — ${COLOR_NAMES[l.color!]}`);
  if (l.hit) parts.push(l.hit.drew ? `${name(l.hit.id)} берёт ${l.hit.drew} и пропускает ход` : `${name(l.hit.id)} пропускает ход`);
  else if (valueOf(l.card) === 'V') parts.push('Разворот!');
  return parts.join(' · ');
}

function Table({ room, me }: { room: OchoRoom; me: string }) {
  const { move } = useOcho();
  const now = useGame((s) => s.now);
  useTicker();
  const s = room.state!;
  const [wildCard, setWildCard] = useState<Card | null>(null);
  const [armed, setArmed] = useState(false);
  const handRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(0);
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const measure = () => setHandWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const left = Math.max(0, TURN_MS - (now() - (room.changedAt ?? now())));
  const hand = sortHand(s.hands[me] ?? []);
  const playingHere = s.seats.includes(me);
  const myTurn = s.turn === me && !s.over;
  const can = new Set(playable(s, me));
  const name = (id: string) => (id === me ? 'Вы' : room.members[id]?.name ?? 'Игрок');

  // A sound when the turn comes to this player, and one for each move.
  const was = useRef(false);
  useEffect(() => {
    if (myTurn && !was.current) click('suggestion');
    was.current = myTurn;
  }, [myTurn]);
  const lastSeq = useRef(s.seq);
  useEffect(() => {
    if (s.seq === lastSeq.current) return;
    lastSeq.current = s.seq;
    const l = s.last;
    if (l?.kind === 'draw' || l?.kind === 'pass') click('next');
    else if (l?.called === false || l?.hit?.drew) click('wrongAnswer');
    else if (l?.called) click('rightAnswer');
    else if (l) click('submitAnswer');
  }, [s.seq, s.last, s.hands]);
  useEffect(() => {
    setWildCard(null);
    setArmed(false);
  }, [s.seq]);

  // Opponents in seating order starting from this player's left.
  const at = s.seats.indexOf(me);
  const around = at < 0 ? s.seats : [...s.seats.slice(at + 1), ...s.seats.slice(0, at)];

  function tap(card: Card) {
    if (!can.has(card)) return;
    if (isWild(card)) return setWildCard(card);
    move({ kind: 'play', card, ...(armed ? { call: true } : {}) });
  }

  // «Очо!» is called before the move that leaves one card.
  const callable = myTurn && hand.length === 2 && can.size > 0;
  let status = '';
  if (!playingHere) status = `Ходит ${name(s.turn)}`;
  else if (!myTurn) status = `Ходит ${name(s.turn)}`;
  else if (s.drawn) status = 'Сыграйте взятую карту или пас';
  else if (callable && !armed) status = 'Последняя карта? Не забудьте «Очо!»';
  else status = can.size ? 'Ваш ход: положите карту' : 'Подходящих карт нет: возьмите карту';

  const t = top(s);
  // Fit the hand to its row; past ~14 cards on a phone it scrolls sideways.
  const fitWidth = handWidth || 320;
  const overlap = hand.length > 1 ? Math.max(20, Math.min(52, Math.floor((fitWidth - 64) / (hand.length - 1)))) : 52;

  return (
    <div className="durak-table ocho-table">
      <div className="opponents">
        {around.filter((id) => id !== me).map((id) => {
          const m = room.members[id];
          const turn = s.turn === id;
          const count = s.hands[id]?.length ?? 0;
          return (
            <div key={id} className={`opp ${turn ? 'turn' : ''}`} data-seat={id}>
              <div className="opp-avatar">
                <Avatar name={m?.avatar ?? ''} size={44} />
                {turn && <svg className="opp-timer" viewBox="0 0 48 48" aria-hidden><circle cx="24" cy="24" r="22" style={{ strokeDashoffset: 138 * (1 - left / TURN_MS) }} /></svg>}
              </div>
              <span className="opp-name">{m?.name ?? 'Игрок'}{m?.left ? ' (вышел)' : ''}</span>
              <span className="opp-cards"><span className="mini-back ocho" aria-hidden />{count}</span>
              {count === 1 && <span className="opp-role ocho-call">Очо!</span>}
            </div>
          );
        })}
      </div>

      <div className="felt ocho-felt">
        <div className={`ocho-dir ${s.dir === -1 ? 'ccw' : ''}`} aria-label={s.dir === 1 ? 'По часовой' : 'Против часовой'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
          </svg>
        </div>
        <div className="ocho-deck">
          <CardBack />
          <span className="deck-count">{s.deck.length}</span>
        </div>
        <div className="ocho-pile" aria-live="polite">
          {s.pile.length > 1 && <div className="ocho-under"><OchoCard card={s.pile[s.pile.length - 2]} /></div>}
          <div key={s.pile.length} className="ocho-top"><OchoCard card={t} color={isWild(t) ? s.color : undefined} /></div>
        </div>
        <div className={`ocho-color c-${s.color}`} aria-label={`Цвет: ${COLOR_NAMES[s.color]}`}>
          <i />{COLOR_NAMES[s.color]}
        </div>
      </div>

      <p className="ocho-last">{lastLine(s, name)}</p>
      <p className={`durak-status ${myTurn ? 'mine' : ''}`}>
        {status}{myTurn && <small> · {Math.ceil(left / 1000)} с</small>}
      </p>

      {playingHere && (
        <div ref={handRef} className="hand ocho-hand" style={{ ['--overlap' as string]: `${overlap}px` }}>
          {hand.map((c, i) => (
            <OchoCard
              key={`${c}${i}`}
              card={c}
              state={myTurn ? (can.has(c) && (!s.drawn || c === s.drawn) ? 'playable' : 'dim') : undefined}
              onClick={() => tap(c)}
            />
          ))}
        </div>
      )}

      {playingHere && (
        <div className="durak-actions">
          {myTurn && legal(s, me, { kind: 'draw' }) && (
            <ActionButton primary={!can.size} onClick={() => move({ kind: 'draw' })}>
              Взять карту
            </ActionButton>
          )}
          {legal(s, me, { kind: 'pass' }) && <ActionButton primary onClick={() => move({ kind: 'pass' })}>Пас</ActionButton>}
          {callable && (
            <button type="button" className={`ocho-call-btn ${armed ? 'armed' : ''}`} aria-pressed={armed} onClick={() => { click('suggestion'); setArmed(!armed); }}>
              Очо!
            </button>
          )}
        </div>
      )}

      {wildCard && (
        <Dialog title="Какой цвет дальше?" onClose={() => setWildCard(null)}>
          <div className="ocho-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ocho-color-btn c-${c} ${bestColor(s.hands[me] ?? [], wildCard) === c ? 'best' : ''}`}
                onClick={() => { setWildCard(null); move({ kind: 'play', card: wildCard, color: c, ...(armed ? { call: true } : {}) }); }}
              >
                {COLOR_NAMES[c]}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Over({ room, host, me }: { room: OchoRoom; host: boolean; me: string }) {
  const { start, leave } = useOcho();
  const s = room.state!;
  useEffect(() => click('results'), []);
  const name = (id: string) => room.members[id]?.name ?? 'Игрок';
  return (
    <div className="durak-over">
      <OchoCard card="WW" />
      <h2>{s.winner === me ? 'Вы победили!' : `Победа: ${name(s.winner!)}`}</h2>
      <div className="await-list">
        {s.places.map((id, i) => (
          <div key={id} className={`await-item ${i === 0 ? 'win' : ''}`}>
            <Avatar name={room.members[id]?.avatar ?? ''} size={32} />
            <span>{i + 1}. {name(id)}{id === me ? ' (вы)' : ''}</span>
            <small>{s.hands[id].length ? `карт: ${s.hands[id].length}` : 'без карт'}</small>
          </div>
        ))}
      </div>
      {room.eternal && <p className="notice"><NextIn at={room.nextAt} label="Следующая партия через" /></p>}
      {host && <ActionButton primary onClick={() => { click('startGame'); start(); }}>Ещё партию</ActionButton>}
      <ActionButton onClick={leave}>Выйти</ActionButton>
    </div>
  );
}

/** Conversion goals, as for the quiz rooms: joined a table, played, finished a game. */
const sentGoals = new Set<string>();
function useGoals(room: OchoRoom | null) {
  const code = room?.code;
  const status = room?.status;
  const eternal = !!room?.eternal;
  const seq = room?.state?.over ? room.changedAt : 0;
  useEffect(() => {
    if (!code) return;
    const once = (goal: 'game_join' | 'game_start' | 'game_finish', key = code) => {
      if (sentGoals.has(`${goal}:${key}`)) return;
      sentGoals.add(`${goal}:${key}`);
      track(goal, { game: 'ocho', room: eternal ? 'ad' : 'private' });
    };
    once('game_join');
    if (status === 'playing' || status === 'over') once('game_start');
    if (status === 'over') once('game_finish', `${code}:${seq}`);
  }, [code, status, eternal, seq]);
}

/** «Очо»: lobby, table and result for one room. */
export function Ocho() {
  const { room, leave, drive } = useOcho();
  const me = useGame((s) => s.me.id);
  const host = !!room && room.hostId === me;
  const [rules, setRules] = useState(false);
  useGoals(room);

  // The host's device referees the game and plays for the bots.
  useEffect(() => {
    if (!host) return;
    const t = setInterval(drive, 150);
    return () => clearInterval(t);
  }, [host, drive]);

  if (!room) {
    return <BlueScreen><p className="wait-text">Подключаемся…</p></BlueScreen>;
  }

  return (
    <BlueScreen className="durak-screen">
      <AppBar
        leading={<RoundButton label="Выйти" onClick={leave}><CloseIcon /></RoundButton>}
        title="Очо"
        action={room.status === 'playing' ? <RoundButton label="Правила" onClick={() => setRules(true)}><span className="rules-q">?</span></RoundButton> : undefined}
      />
      {room.status === 'lobby' && <Lobby room={room} host={host} />}
      {room.status === 'playing' && room.state && <Table room={room} me={me} />}
      {room.status === 'over' && room.state && <Over room={room} host={host} me={me} />}
      {rules && <Dialog title="Правила «Очо»" onClose={() => setRules(false)}><OchoRules /></Dialog>}
    </BlueScreen>
  );
}
