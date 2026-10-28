'use client';

import { useEffect, useState } from 'react';
import { AVATARS } from '@/lib/game/engine';
import { useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';

export function Home() {
  const { me, setName, setAvatar, goSetup, goJoin, notice } = useGame();
  const [name, setLocalName] = useState(me.name);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sg.name');
      if (saved) setLocalName(saved);
      const face = localStorage.getItem('sg.avatar');
      if (face && AVATARS.includes(face)) setAvatar(face);
    } catch {}
    // A shared link carries the room code in the hash: go straight to joining.
    if (/^#\d{6}$/.test(location.hash)) goJoin();
  }, [goJoin, setAvatar]);

  return (
    <>
      <section className="hero">
        <img className="logo" src="icon.png" width={72} height={72} alt="" />
        <h1>OK Battle</h1>
        <p>Угадай песню по первым секундам или ответь на вопрос быстрее соперников. Играйте с друзьями с веба и из мобильного приложения в одной комнате.</p>
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
        <div className="row">
          <button className="btn" style={{ flex: 1 }} type="submit">Создать игру</button>
          <button
            className="btn secondary"
            style={{ flex: 1 }}
            type="button"
            onClick={() => {
              setName(name.trim() || 'Игрок');
              goJoin();
            }}
          >
            Войти по коду
          </button>
        </div>
      </form>

      {notice && <p className="notice" role="alert">{notice}</p>}
    </>
  );
}
