'use client';

import { useEffect, useState } from 'react';
import { play, preload, sfx, stop } from '@/lib/audio';
import { standings } from '@/lib/game/engine';
import { isHost, useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';
import { OnAirButton } from './OnAirButton';

/** Re-renders every frame with the shared (server) clock; the host also advances the game here. */
function useFrame(): number {
  const { drive, now } = useGame();
  const [t, setT] = useState(now);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      drive();
      setT(now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF sleeps in background tabs; a slow interval keeps the host's game moving there.
    const bg = setInterval(() => document.hidden && drive(), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(bg);
    };
  }, [drive, now]);
  return t;
}

export function Play() {
  const now = useFrame();
  const { room, me, answer, pickWinner, next, goHome } = useGame();
  const host = useGame(isHost);
  const [draft, setDraft] = useState('');
  const stage = room?.stage;
  const index = room?.index ?? 0;
  const q = room?.round?.question;
  const counting = stage === 'question' && !!room && now < room.startsAt;
  const phase = counting ? 'countdown' : stage;
  const hears = !!room && (room.doc.everyoneHasSound || host);

  useEffect(() => {
    if (!room || !q) return;
    if (phase === 'countdown') {
      stop();
      if (q.kind === 'music') void preload(q.audio);
    } else if (phase === 'question') {
      if (q.kind === 'music' && hears) void play(q.audio);
      const upcoming = room.questions[index + 1];
      if (upcoming?.kind === 'music') void preload(upcoming.audio);
    } else if (phase === 'results') {
      stop(800);
    }
    // Only the phase change matters here, not every room update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, q]);

  useEffect(() => setDraft(''), [index]);
  useEffect(() => () => stop(), []);

  const roundMs = room?.roundMs ?? 1;
  const remaining = phase === 'question' && room ? Math.max(0, roundMs - (now - room.startsAt)) : 0;
  const mine = room?.answers[index]?.[me.id];
  const playing = !!room?.players[me.id];

  // As in the app: whatever was typed is sent when the time runs out.
  useEffect(() => {
    if (phase === 'question' && remaining === 0 && draft.trim() && !mine) answer(draft);
  }, [phase, remaining, draft, mine, answer]);

  if (!room) return null;
  const round = room.round;

  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((room.startsAt - now) / 1000));
    return (
      <div className="countdown" aria-live="polite">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          <p>Раунд {index + 1} из {room.total}</p>
          <b key={left}>{left}</b>
        </div>
      </div>
    );
  }

  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const others = players.filter((p) => p.id !== me.id);
  const shown = room.answers[index] ?? {};
  const revealed = phase !== 'question';
  const fraction = remaining / roundMs;
  const correctText = round ? round.options.find((o) => o.correct)?.text ?? round.answer : '';
  const manual = round?.mode === 'enter' && room.doc.winnerDeterminationType === 'manually';
  const winner = room.selected[index];

  const header = (
    <header className="status">
      <button className="icon-btn" onClick={goHome} aria-label="Выйти из игры">✕</button>
      <span className="round">Раунд {index + 1}/{room.total}</span>
      <div className="opponents" aria-label="Соперники">
        {others.slice(0, 5).map((p) => (
          <div key={p.id} className="opponent" title={p.name}>
            <Avatar name={p.avatar} size={32} />
            {shown[p.id] && <span className="done" aria-label="ответил" />}
          </div>
        ))}
      </div>
      <div className="timer" role="timer" aria-label={`Осталось ${Math.ceil(remaining / 1000)} секунд`}>
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
          <circle
            cx="28" cy="28" r="24" fill="none" stroke={fraction < 0.25 ? '#ff9083' : '#facd62'} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={150.8} strokeDashoffset={150.8 * (1 - fraction)}
          />
        </svg>
        <b>{Math.ceil(remaining / 1000)}</b>
      </div>
    </header>
  );

  const verdict = !playing
    ? `Ответ: ${correctText}`
    : mine?.correct
      ? `Верно! ${(mine.ms / 1000).toFixed(1)} с`
      : !mine
        ? `Время вышло. Ответ: ${correctText}`
        : `Мимо. Ответ: ${correctText}`;

  if (phase === 'results') {
    const table = standings(players, room.answers.slice(0, index + 1), room.doc.takeIntoAnswerTime);
    return (
      <>
        {header}
        <section className="card">
          <p className="label">После раунда {index + 1} из {room.total}</p>
          {!room.doc.takeIntoAnswerTime && round && <p className="prompt" style={{ margin: 0 }}>{verdict}</p>}
          <div className="table">
            {table.map((s, i) => {
              const got = shown[s.player.id];
              return (
                <div key={s.player.id} className={`line ${s.player.id === me.id ? 'me' : ''}`}>
                  <span className="pos">{i + 1}</span>
                  <Avatar name={s.player.avatar} size={36} />
                  <span className="n">{s.player.name}</span>
                  <OnAirButton player={s.player} />
                  <span className="score">
                    {got?.correct ? '✓ ' : ''}
                    <img src="icons/coin.svg" width={18} height={18} alt="" />
                    {s.correct}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        {host ? (
          <button className="btn block" onClick={next}>Следующий вопрос</button>
        ) : (
          <p className="reveal-line" style={{ color: '#fff' }}>Следующий вопрос — по команде ведущего.</p>
        )}
      </>
    );
  }

  if (!round || !q) {
    return (
      <>
        {header}
        <section className="card qcard">
          <p className="prompt">Этот вопрос не удалось загрузить на вебе. Ждём следующий раунд…</p>
        </section>
      </>
    );
  }

  const whoPicked = (i: number) => players.filter((p) => shown[p.id]?.option === i);
  const typed = players.filter((p) => shown[p.id]);

  return (
    <>
      {header}

      <section className="card qcard">
        {q.kind === 'music' ? (
          <>
            <div className={`disc ${!revealed ? 'spin' : ''}`}>
              {revealed && q.photo ? <img src={q.photo} alt="" /> : <div className="bars" aria-hidden><i /><i /><i /><i /></div>}
            </div>
            <p className="prompt">{revealed ? `${q.author} — ${q.title}` : round.prompt}</p>
            {!hears && !revealed && <p className="muted">Музыка звучит у ведущего</p>}
          </>
        ) : (
          <>
            {q.image && <img className="qimage" src={q.image} alt="" />}
            {q.video && <video className="qimage" src={q.video} autoPlay playsInline controls />}
            <p className="prompt">{round.prompt}</p>
          </>
        )}
      </section>

      {round.mode === 'choose' ? (
        <div className="answers">
          {round.options.map((o, i) => {
            const cls = revealed ? (o.correct ? 'correct' : mine?.option === i ? 'wrong' : '') : '';
            return (
              <button
                key={i}
                className={`answer ${cls}`}
                aria-pressed={!revealed && mine?.option === i}
                disabled={revealed || !!mine || !playing}
                onClick={() => {
                  sfx('click1', 0.4);
                  answer(i);
                }}
              >
                <span>{o.text}</span>
                {revealed && (
                  <span className="who">
                    {whoPicked(i).map((p) => <Avatar key={p.id} name={p.avatar} size={28} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : !revealed ? (
        playing && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              sfx('click1', 0.4);
              answer(draft);
            }}
          >
            <input
              className="input"
              aria-label="Ваш ответ"
              placeholder={q.kind === 'music' ? (round.ask === 'author' ? 'Исполнитель' : 'Название песни') : 'Ваш ответ'}
              value={mine ? mine.text : draft}
              disabled={!!mine}
              autoFocus
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn block" type="submit" disabled={!!mine || !draft.trim()}>
              {mine ? 'Ответ отправлен' : 'Ответить'}
            </button>
          </form>
        )
      ) : (
        <section className="card">
          <p className="label">Правильный ответ: {round.answer}</p>
          <div className="table">
            {typed.length === 0 && <p className="muted">Никто не успел ответить.</p>}
            {typed.map((p) => {
              const a = shown[p.id];
              const won = winner ? winner === p.id : a.correct;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`line ${p.id === me.id ? 'me' : ''}`}
                  disabled={!(host && manual)}
                  onClick={() => pickWinner(p.id)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  <Avatar name={p.avatar} size={32} />
                  <span className="n">{p.name}: «{a.text}»</span>
                  <span className="score">{won ? '✓' : '✗'}</span>
                </button>
              );
            })}
          </div>
          {host && manual && <p className="muted">Отметьте игрока, который ответил правильно.</p>}
        </section>
      )}

      {revealed && (
        <p className="reveal-line" style={{ color: '#fff' }} aria-live="polite">{verdict}</p>
      )}
      {phase === 'question' && mine && <p className="reveal-line" style={{ color: '#fff' }}>Ответ принят. Ждём остальных…</p>}
      {phase === 'question' && !playing && <p className="reveal-line" style={{ color: '#fff' }}>Вы ведёте игру: игроки отвечают.</p>}
      {host && phase === 'answers' && (
        <div className="row">
          {manual && <button className="btn secondary" style={{ flex: 1 }} onClick={() => pickWinner(null)}>Никто не угадал</button>}
          {!manual && <button className="btn" style={{ flex: 1 }} onClick={next}>Дальше</button>}
        </div>
      )}
    </>
  );
}
