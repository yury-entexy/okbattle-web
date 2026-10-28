'use client';

import { useEffect, useState } from 'react';
import { preload, sfx, unlockAudio } from '@/lib/audio';
import { isHost, useGame } from '@/lib/game/store';
import { backend } from '@/lib/net';
import { Avatar } from './Avatar';
import { OnAirButton } from './OnAirButton';

const ANSWER_TYPES = { choose: 'выбор из 4 вариантов', enter: 'ответ вводится текстом', mixed: 'выбор и ввод вперемешку' };

export function Lobby() {
  const { room, me, start, goHome } = useGame();
  const host = useGame(isHost);
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const players = Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const count = players.length;

  useEffect(() => {
    void backend().then((b) => setShared(b.shared));
  }, []);
  useEffect(() => {
    if (count > 1) sfx('click3', 0.25);
  }, [count]);
  // Everyone downloads the first snippet while they wait.
  const first = room?.questions[0];
  useEffect(() => {
    if (first?.kind === 'music') void preload(first.audio);
  }, [first]);

  if (!room) return null;
  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';
  const { doc } = room;
  const ready = count >= (doc.isAdminPlayer ? 2 : 1);

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
          <>
            <p className="muted">Этот же код вводят в мобильном приложении OK Battle: «Войти в игру как игрок».</p>
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
          </>
        ) : (
          <p className="muted">В демо-версии комната видна только на этом устройстве.</p>
        )}
        <p className="muted">
          {room.total} вопросов, {doc.roundTime} с на ответ, {ANSWER_TYPES[doc.answerType]}.{' '}
          {doc.takeIntoAnswerTime
            ? 'Побеждает тот, у кого больше верных ответов; при равенстве выигрывает тот, кто отвечал быстрее.'
            : 'Побеждает тот, у кого больше верных ответов.'}
          {doc.gameType === 'music' && !doc.everyoneHasSound && ' Музыка звучит только у ведущего.'}
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
              <OnAirButton player={p} />
            </div>
          ))}
        </div>
        {!doc.isAdminPlayer && host && <p className="muted">Вы ведёте игру и не отвечаете на вопросы.</p>}
      </section>

      {host ? (
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
      ) : (
        <p className="notice">Вы в комнате. Игра начнётся, когда ведущий нажмёт «Начать».</p>
      )}
    </>
  );
}
