'use client';

import { useEffect, useState } from 'react';
import { play, preload, sfx, stop } from '@/lib/audio';
import { ME } from '@/lib/game/engine';
import { REVEAL_MS, useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';

function useFrame(): number {
  const tick = useGame((s) => s.tick);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      tick(t);
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF sleeps in background tabs; a slow interval keeps the game moving there.
    const bg = setInterval(() => document.hidden && tick(performance.now()), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(bg);
    };
  }, [tick]);
  return now;
}

export function Play() {
  const now = useFrame();
  const { phase, phaseAt, index, rounds, players, answers, settings, answer, goHome } = useGame();
  const round = rounds[index];
  const q = round.question;
  const roundMs = (settings?.roundSeconds ?? 30) * 1000;
  const mine = answers[index]?.[ME];

  useEffect(() => {
    if (phase === 'question' && q.kind === 'music') {
      void play(q.audio);
      const next = rounds[index + 1]?.question;
      if (next?.kind === 'music') void preload(next.audio);
    }
    if (phase === 'countdown') stop();
  }, [phase, q, rounds, index]);

  useEffect(() => () => stop(), []);

  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((3000 - (now - phaseAt)) / 1000));
    return (
      <div className="countdown" aria-live="polite">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          <p>Раунд {index + 1} из {rounds.length}</p>
          <b key={left}>{left}</b>
        </div>
      </div>
    );
  }

  const elapsed = now - phaseAt;
  const remaining = phase === 'question' ? Math.max(0, roundMs - elapsed) : 0;
  const fraction = remaining / roundMs;
  const revealed = phase === 'reveal';
  const correctIndex = round.options.findIndex((o) => o.correct);
  const whoPicked = (i: number) => players.filter((p) => answers[index]?.[p.id]?.option === i);

  return (
    <>
      <header className="status">
        <button className="icon-btn" onClick={goHome} aria-label="Выйти из игры">✕</button>
        <span className="round">Раунд {index + 1}/{rounds.length}</span>
        <div className="opponents" aria-label="Соперники">
          {players.filter((p) => p.bot).map((p) => (
            <div key={p.id} className="opponent" title={p.name}>
              <Avatar name={p.avatar} size={32} />
              {answers[index]?.[p.id] && <span className="done" aria-label="ответил" />}
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
            {revealed ? (
              <p className="prompt">{q.author} — {q.title}</p>
            ) : (
              <p className="prompt">{round.prompt}</p>
            )}
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
      {phase === 'question' && mine && <p className="reveal-line" style={{ color: '#fff' }}>Ответ принят. Ждём остальных…</p>}
    </>
  );
}
