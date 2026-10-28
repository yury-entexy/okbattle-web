'use client';

import { useEffect, useRef, useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { MAX_PLAYERS, TURN_MS, useDurak, type DurakRoom } from '@/lib/durak/store';
import {
  allBeaten, beats, canTransfer, legal, rank, suit, throwers, waitingOn,
  type Card, type DurakState, type Mode,
} from '@/lib/durak/rules';
import { Avatar } from './Avatar';
import { ActionButton, AppBar, BlueScreen, CloseIcon, RoundButton } from './ui';

export const MODE_NAMES: Record<Mode, string> = { classic: 'Обычный', throwin: 'Подкидной', transfer: 'Переводной' };
const MODE_HINTS: Record<Mode, string> = {
  classic: 'Подкидывают по очереди: сначала тот, кто ходит, потом остальные по кругу.',
  throwin: 'Подкидывать может любой игрок, кроме отбивающегося.',
  transfer: 'Как подкидной, но отбивающийся может перевести ход картой того же достоинства.',
};
const SUIT_SIGNS: Record<string, string> = { S: '♠', C: '♣', D: '♦', H: '♥' };
const RANK_NAMES: Record<string, string> = { T: '10', J: 'В', Q: 'Д', K: 'К', A: 'Т' };

function CardFace({ card, small, state, onClick }: { card: Card; small?: boolean; state?: 'playable' | 'selected' | 'target' | 'dim'; onClick?: () => void }) {
  const red = card[1] === 'H' || card[1] === 'D';
  const label = `${RANK_NAMES[card[0]] ?? card[0]}${SUIT_SIGNS[card[1]]}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`pcard ${small ? 'small' : ''} ${red ? 'red' : ''} ${state ?? ''}`} onClick={onClick} aria-label={label}>
      <span className="pcard-corner">{RANK_NAMES[card[0]] ?? card[0]}<br />{SUIT_SIGNS[card[1]]}</span>
      <span className="pcard-suit">{SUIT_SIGNS[card[1]]}</span>
    </Tag>
  );
}

function CardBack({ small }: { small?: boolean }) {
  return <div className={`pcard back ${small ? 'small' : ''}`} aria-hidden><img src="ui/logo.png" alt="" /></div>;
}

/** Trumps last, then by suit and rank, as players hold them. */
function sortHand(hand: Card[], trump: string) {
  const order = (c: Card) => (suit(c) === trump ? 100 : 'SCDH'.indexOf(suit(c)) * 10) + rank(c);
  return [...hand].sort((a, b) => order(a) - order(b));
}

function role(s: DurakState, id: string): string {
  if (s.out.includes(id)) return 'Вышел';
  if (s.over) return s.fool === id ? 'Дурак' : '';
  if (id === s.defender) return s.taking ? 'Берёт' : 'Отбивается';
  if (id === s.attacker) return 'Ходит';
  if (s.passed.includes(id)) return 'Пас';
  return '';
}

function useTurnTimer(room: DurakRoom, now: () => number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, TURN_MS - (now() - (room.changedAt ?? now())));
}

function Lobby({ room, host }: { room: DurakRoom; host: boolean }) {
  const { start, setOptions } = useDurak();
  const [copied, setCopied] = useState(false);
  const humans = Object.entries(room.members).filter(([, m]) => !m.bot).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const bots = Math.min(room.bots, MAX_PLAYERS - humans.length);
  const total = humans.length + bots;
  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';
  const share = () => {
    const text = `Сыграем в «Дурака» в OK Battle: код комнаты ${room.code}`;
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
          <div className="field">
            <h3>Вид игры</h3>
            <div className="chips">
              {(Object.keys(MODE_NAMES) as Mode[]).map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={room.mode === m} disabled={!host} onClick={() => setOptions({ mode: m })}>
                  {MODE_NAMES[m]}
                </button>
              ))}
            </div>
            <small className="hint">{MODE_HINTS[room.mode]} Колода 36 карт.</small>
          </div>
          {host && (
            <div className="field">
              <h3>Боты</h3>
              <div className="chips">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" className="chip" aria-pressed={room.bots === n} onClick={() => setOptions({ bots: n })}>{n}</button>
                ))}
              </div>
              <small className="hint">Боты занимают свободные места, всего за столом до 5 игроков.</small>
            </div>
          )}
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
          <p className="wait-text">Ждём, когда создатель начнёт игру…</p>
        )}
      </div>
    </>
  );
}

function Table({ room, me }: { room: DurakRoom; me: string }) {
  const { move } = useDurak();
  const now = useGame((s) => s.now);
  const s = room.state!;
  const [selected, setSelected] = useState<Card | null>(null);
  const left = useTurnTimer(room, now);
  const trump = suit(s.trump);
  const hand = sortHand(s.hands[me] ?? [], trump);
  const playing = s.seats.includes(me);
  const defending = me === s.defender && !s.taking && s.table.some((p) => !p.d);
  const waiting = waitingOn(s);
  const myTurn = waiting.includes(me);

  // A sound when the table waits on this player.
  const was = useRef(false);
  useEffect(() => {
    if (myTurn && !was.current) click('suggestion');
    was.current = myTurn;
  }, [myTurn]);
  const lastSeq = useRef(s.seq);
  useEffect(() => {
    if (s.seq === lastSeq.current) return;
    lastSeq.current = s.seq;
    if (s.last?.kind === 'take') click('wrongAnswer');
    else if (s.last?.kind === 'pass') click('next');
    else if (s.last) click('submitAnswer');
  }, [s.seq, s.last]);
  useEffect(() => setSelected(null), [s.seq]);

  const others = s.seats.filter((id) => id !== me);
  // Opponents in seating order starting from this player's left.
  const start = s.seats.indexOf(me);
  const around = start < 0 ? others : [...s.seats.slice(start + 1), ...s.seats.slice(0, start)];

  const open = s.table.map((p, i) => (!p.d ? i : -1)).filter((i) => i >= 0);
  const targets = selected ? open.filter((i) => beats(selected, s.table[i].a, trump)) : [];

  function tap(card: Card) {
    if (defending) {
      const can = open.filter((i) => beats(card, s.table[i].a, trump));
      const transfer = canTransfer(s, me, card);
      // One thing this card can do: do it at once.
      if (can.length === 1 && open.length === 1 && !transfer) return move({ kind: 'defend', card, target: can[0] });
      if (!can.length && transfer) return move({ kind: 'transfer', card });
      setSelected(selected === card ? null : card);
      return;
    }
    if (legal(s, me, { kind: 'attack', card })) move({ kind: 'attack', card });
  }

  const playable = (card: Card): boolean => {
    if (defending) return open.some((i) => beats(card, s.table[i].a, trump)) || canTransfer(s, me, card);
    return legal(s, me, { kind: 'attack', card });
  };

  let status = '';
  if (!playing) status = 'Вы смотрите игру';
  else if (s.out.includes(me)) status = 'Вы вышли из игры без карт!';
  else if (!s.table.length) status = me === s.attacker ? 'Ваш ход: выложите карту' : `Ходит ${room.members[s.attacker]?.name ?? ''}`;
  else if (defending) status = selected ? (targets.length ? 'Нажмите карту на столе, которую бьёте' : 'Этой картой не побить') : 'Отбивайтесь или берите';
  else if (me === s.defender && s.taking) status = 'Вы берёте карты';
  else if (throwers(s).includes(me)) status = s.taking ? 'Можно подкинуть вдогонку' : 'Можно подкинуть';
  else if (myTurn && (s.taking || allBeaten(s))) status = 'Нечего подкинуть? Нажмите «Бито»';
  else status = `Отбивается ${room.members[s.defender]?.name ?? ''}`;

  const canPass = legal(s, me, { kind: 'pass' });
  const overlap = hand.length > 6 ? Math.min(46, Math.round((320 - 64) / (hand.length - 1))) : 46;

  return (
    <div className="durak-table">
      <div className="opponents">
        {around.map((id) => {
          const m = room.members[id];
          const r = role(s, id);
          const turn = waiting.includes(id);
          return (
            <div key={id} className={`opp ${turn ? 'turn' : ''} ${s.out.includes(id) ? 'out' : ''}`}>
              <div className="opp-avatar">
                <Avatar name={m?.avatar ?? ''} size={44} />
                {turn && <svg className="opp-timer" viewBox="0 0 48 48" aria-hidden><circle cx="24" cy="24" r="22" style={{ strokeDashoffset: 138 * (1 - left / TURN_MS) }} /></svg>}
              </div>
              <span className="opp-name">{m?.name ?? 'Игрок'}{m?.left ? ' (вышел)' : ''}</span>
              <span className="opp-cards">
                <span className="mini-back" aria-hidden />{s.hands[id]?.length ?? 0}
              </span>
              {r && <span className={`opp-role ${r === 'Отбивается' || r === 'Берёт' ? 'def' : ''}`}>{r}</span>}
            </div>
          );
        })}
      </div>

      <div className="felt">
        <div className="deck" aria-label={`В колоде ${s.deck.length}, козырь ${SUIT_SIGNS[trump]}`}>
          {s.deck.length > 0 ? (
            <>
              <div className="deck-trump"><CardFace card={s.trump} small /></div>
              {s.deck.length > 1 && <CardBack small />}
              <span className="deck-count">{s.deck.length}</span>
            </>
          ) : (
            <span className={`deck-suit ${trump === 'H' || trump === 'D' ? 'red' : ''}`}>{SUIT_SIGNS[trump]}</span>
          )}
        </div>
        <div className="table-cards">
          {s.table.map((p, i) => (
            <div key={i} className={`pair ${targets.includes(i) ? 'target' : ''}`} onClick={() => selected && targets.includes(i) && move({ kind: 'defend', card: selected, target: i })}>
              <CardFace card={p.a} small />
              {p.d && <div className="pair-d"><CardFace card={p.d} small /></div>}
            </div>
          ))}
          {!s.table.length && <p className="table-empty">{s.discarded ? `Бито: ${s.discarded}` : 'Козырь — ' + SUIT_SIGNS[trump]}</p>}
        </div>
      </div>

      <p className={`durak-status ${myTurn ? 'mine' : ''}`}>{status}{myTurn && !s.over && <small> · {Math.ceil(left / 1000)} с</small>}</p>

      {playing && (
        <div className="hand" style={{ ['--overlap' as string]: `${overlap}px` }}>
          {hand.map((c) => (
            <CardFace
              key={c}
              card={c}
              state={selected === c ? 'selected' : playable(c) ? 'playable' : myTurn ? 'dim' : undefined}
              onClick={() => tap(c)}
            />
          ))}
        </div>
      )}

      {playing && (
        <div className="durak-actions">
          {defending && selected && canTransfer(s, me, selected) && (
            <ActionButton onClick={() => move({ kind: 'transfer', card: selected })}>Перевести</ActionButton>
          )}
          {legal(s, me, { kind: 'take' }) && <ActionButton onClick={() => move({ kind: 'take' })}>Беру</ActionButton>}
          {canPass && <ActionButton primary onClick={() => move({ kind: 'pass' })}>{s.taking ? 'Пас' : 'Бито'}</ActionButton>}
        </div>
      )}
    </div>
  );
}

function Over({ room, host }: { room: DurakRoom; host: boolean }) {
  const { start, leave } = useDurak();
  const s = room.state!;
  useEffect(() => click('results'), []);
  const name = (id: string) => room.members[id]?.name ?? 'Игрок';
  return (
    <div className="durak-over">
      <img src="ui/logo.png" width={72} height={72} alt="" />
      <h2>{s.fool ? `${name(s.fool)} — дурак!` : 'Ничья!'}</h2>
      <div className="await-list">
        {s.out.map((id, i) => (
          <div key={id} className="await-item">
            <span>{i + 1}. {name(id)}</span>
            <small>{i === 0 ? 'первым вышел' : 'вышел'}</small>
          </div>
        ))}
        {s.fool && <div className="await-item fool"><span>{name(s.fool)}</span><small>остался с картами</small></div>}
      </div>
      {host && <ActionButton primary onClick={() => { click('startGame'); start(); }}>Ещё партию</ActionButton>}
      <ActionButton onClick={leave}>Выйти</ActionButton>
    </div>
  );
}

/** «Дурак»: lobby, table and result for one room. */
export function Durak() {
  const { room, leave, drive } = useDurak();
  const me = useGame((s) => s.me.id);
  const host = !!room && room.hostId === me;

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
        title={`Дурак · ${MODE_NAMES[room.mode]}`}
      />
      {room.status === 'lobby' && <Lobby room={room} host={host} />}
      {room.status === 'playing' && room.state && <Table room={room} me={me} />}
      {room.status === 'over' && room.state && <Over room={room} host={host} />}
    </BlueScreen>
  );
}
