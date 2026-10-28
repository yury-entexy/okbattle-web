'use client';

import { useEffect, useState } from 'react';
import { sfx, unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';

export function Lobby() {
  const { code, players, rounds, settings, start, replay } = useGame();
  // Bots "join" one by one, like players entering the code on their phones.
  const [joined, setJoined] = useState(1);

  useEffect(() => {
    if (joined >= players.length) return;
    const t = setTimeout(() => {
      setJoined((n) => n + 1);
      sfx('click3', 0.25);
    }, 500 + Math.random() * 700);
    return () => clearTimeout(t);
  }, [joined, players.length]);

  const ready = joined >= players.length;

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={replay} aria-label="Назад">←</button>
        <h1>Комната</h1>
      </header>

      <section className="card">
        <div className="code">
          <span className="muted">Код игры</span>
          <b>{code}</b>
        </div>
        <p className="muted">
          {rounds.length} раундов по {settings?.roundSeconds} секунд. Побеждает тот, у кого больше верных ответов; при
          равенстве выигрывает тот, кто отвечал быстрее.
        </p>
      </section>

      <section className="card">
        <p className="label">Игроки · {joined}/{players.length}</p>
        <div className="players">
          {players.slice(0, joined).map((p) => (
            <div key={p.id} className="player pop">
              <Avatar name={p.avatar} size={64} />
              <span>{p.name}</span>
              <span className="tag">{p.bot ? 'бот' : 'вы · ведущий'}</span>
            </div>
          ))}
        </div>
      </section>

      <button
        className="btn block"
        disabled={!ready}
        onClick={() => {
          unlockAudio();
          start();
        }}
      >
        {ready ? 'Начать игру' : 'Ждём игроков…'}
      </button>
    </>
  );
}
