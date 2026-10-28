'use client';

import { useEffect, useState } from 'react';
import { AVATARS } from '@/lib/game/engine';
import { useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';

export function Home() {
  const { me, setName, setAvatar, goSetup } = useGame();
  const [name, setLocalName] = useState(me.name);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sg.name');
      if (saved) setLocalName(saved);
    } catch {}
  }, []);

  return (
    <>
      <section className="hero">
        <img className="logo" src="icon.png" width={72} height={72} alt="" />
        <h1>OK Battle</h1>
        <p>Угадай песню по первым секундам или ответь на вопрос быстрее соперников. 30 секунд на раунд.</p>
      </section>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setName(name.trim() || 'Игрок');
          goSetup();
        }}
      >
        <div className="field">
          <label className="label" htmlFor="player-name">Ваше имя в игре</label>
          <input
            id="player-name"
            className="input"
            value={name}
            maxLength={20}
            onChange={(e) => setLocalName(e.target.value)}
            autoComplete="nickname"
          />
        </div>
        <div className="field">
          <span className="label">Аватар</span>
          <div className="avatars">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                className="avatar-pick"
                aria-pressed={me.avatar === a}
                aria-label={a}
                onClick={() => setAvatar(a)}
              >
                <Avatar name={a} size={52} />
              </button>
            ))}
          </div>
        </div>
        <button className="btn block" type="submit">Создать игру</button>
      </form>

      <p className="notice">
        Веб-версия: игра против ботов на вопросах и треках из базы приложения. Вход по коду с телефона
        подключим следующим этапом.
      </p>
    </>
  );
}
