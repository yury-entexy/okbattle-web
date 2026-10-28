'use client';

import { useEffect, useState } from 'react';
import { preload, sfx, unlockAudio } from '@/lib/audio';
import { isHost, useGame } from '@/lib/game/store';
import { roomTransport } from '@/lib/room';
import { Avatar } from './Avatar';

export function Lobby() {
  const { room, me, start, goHome } = useGame();
  const host = useGame(isHost);
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const players = Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const count = players.length;

  useEffect(() => {
    void roomTransport().then((t) => setShared(t.shared));
  }, []);
  useEffect(() => {
    if (count > 1) sfx('click3', 0.25);
  }, [count]);
  // Guests download the first snippet while they wait.
  const first = room?.rounds[0]?.question;
  useEffect(() => {
    if (first?.kind === 'music') void preload(first.audio);
  }, [first]);

  if (!room) return null;
  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Выйти">←</button>
        <h1>Комната</h1>
      </header>

      <section className="card">
        <div className="code">
          <span className="muted">Код игры</span>
          <b>{room.code}</b>
        </div>
        {shared ? (
          <div className="row">
            <input className="input" style={{ flex: 1, fontSize: 13 }} readOnly value={link} aria-label="Ссылка на комнату" onFocus={(e) => e.target.select()} />
            <button
              className="btn secondary"
              onClick={() => {
                navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        ) : (
          <p className="muted">В демо-версии комната видна только на этом устройстве.</p>
        )}
        <p className="muted">
          {room.rounds.length} раундов по {room.settings.roundSeconds} секунд. Побеждает тот, у кого больше верных ответов;
          при равенстве выигрывает тот, кто отвечал быстрее.
        </p>
      </section>

      <section className="card">
        <p className="label">Игроки · {count}</p>
        <div className="players">
          {players.map((p) => (
            <div key={p.id} className="player pop">
              <Avatar name={p.avatar} size={64} />
              <span>{p.name}</span>
              <span className="tag">
                {p.id === room.hostId ? 'ведущий' : p.bot ? 'бот' : p.id === me.id ? 'вы' : 'игрок'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {host ? (
        <button
          className="btn block"
          disabled={count < 2}
          onClick={() => {
            unlockAudio();
            start();
          }}
        >
          {count < 2 ? 'Ждём игроков…' : 'Начать игру'}
        </button>
      ) : (
        <p className="notice">Вы в комнате. Игра начнётся, когда ведущий нажмёт «Начать».</p>
      )}
    </>
  );
}
