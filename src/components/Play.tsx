'use client';

import { useEffect, useState } from 'react';
import { play, preload, sfx, stop } from '@/lib/audio';
import { COUNTDOWN_MS, REVEAL_MS, isHost, useGame, visibleAnswers } from '@/lib/game/store';
import { roundKey } from '@/lib/room/types';
import { Avatar } from './Avatar';

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
  const { room, me, answer, goHome } = useGame();
  const host = useGame(isHost);
  const stage = room?.stage;
  const index = room?.index ?? 0;
  const q = room?.rounds[index]?.question;

  useEffect(() => {
    if (!room || !q) return;
    if (stage === 'question' && q.kind === 'music') {
      void play(q.audio);
      const next = room.rounds[index + 1]?.question;
      if (next?.kind === 'music') void preload(next.audio);
    }
    if (stage === 'countdown') {
      stop();
      if (q.kind === 'music') void preload(q.audio);
    }
    // Only the stage change matters here, not every room update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index]);

  useEffect(() => () => stop(), []);

  if (!room || !q) return null;
  const round = room.rounds[index];
  const elapsed = now - room.stageAt;

  if (stage === 'countdown') {
    const left = Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000));
    return (
      <div className="countdown" aria-live="polite">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          <p>Раунд {index + 1} из {room.rounds.length}</p>
          <b key={left}>{left}</b>
        </div>
      </div>
    );
  }

  const roundMs = room.settings.roundSeconds * 1000;
  const remaining = stage === 'question' ? Math.max(0, roundMs - elapsed) : 0;
  const fraction = remaining / roundMs;
  const revealed = stage === 'reveal';
  const shown = visibleAnswers(room, now);
  const mine = room.answers?.[roundKey(index)]?.[me.id];
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const others = players.filter((p) => p.id !== me.id);
  const correctIndex = round.options.findIndex((o) => o.correct);
  const whoPicked = (i: number) => players.filter((p) => shown[p.id]?.option === i);

  return (
    <>
      <header className="status">
        <button className="icon-btn" onClick={goHome} aria-label="Выйти из игры">✕</button>
        <span className="round">Раунд {index + 1}/{room.rounds.length}</span>
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

      <section className="card qcard">
        {q.kind === 'music' ? (
          <>
            <div className={`disc ${!revealed ? 'spin' : ''}`}>
              {revealed && q.photo ? <img src={q.photo} alt="" /> : <div className="bars" aria-hidden><i /><i /><i /><i /></div>}
            </div>
            <p className="prompt">{revealed ? `${q.author} — ${q.title}` : round.prompt}</p>
          </>
        ) : (
          <>
            {q.image && <img className="qimage" src={q.image} alt="" />}
            <p className="prompt">{round.prompt}</p>
          </>
        )}
      </section>

      <div className="answers">
        {round.options.map((o, i) => {
          const cls = revealed ? (o.correct ? 'correct' : mine?.option === i ? 'wrong' : '') : '';
          return (
            <button
              key={i}
              className={`answer ${cls}`}
              aria-pressed={!revealed && mine?.option === i}
              disabled={revealed || !!mine}
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

      {revealed && (
        <p className="reveal-line" style={{ color: '#fff' }} aria-live="polite">
          {mine?.correct
            ? `Верно! ${(mine.ms / 1000).toFixed(1)} с`
            : mine?.option == null
              ? `Время вышло. Ответ: ${round.options[correctIndex]?.text}`
              : `Мимо. Ответ: ${round.options[correctIndex]?.text}`}
          {' · '}
          <span style={{ opacity: 0.8 }}>дальше через {Math.max(0, Math.ceil((REVEAL_MS - elapsed) / 1000))}</span>
        </p>
      )}
      {stage === 'question' && mine && <p className="reveal-line" style={{ color: '#fff' }}>Ответ принят. Ждём остальных…</p>}
      {!host && stage === 'question' && !mine && remaining === 0 && (
        <p className="reveal-line" style={{ color: '#fff' }}>Ждём ведущего…</p>
      )}
    </>
  );
}
