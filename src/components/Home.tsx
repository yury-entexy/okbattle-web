'use client';

import { useEffect, useState } from 'react';
import { click, preloadSounds, unlockAudio } from '@/lib/audio';
import { AVATARS } from '@/lib/game/engine';
import { useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';
import { ActionButton, AppBar, Header } from './ui';

/** The app's main page: logo header, «Войти в игру как игрок» and «Создать игру как ведущий». */
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
    preloadSounds();
    // A shared link carries the room code in the hash: go straight to joining.
    if (/^#\d{6}$/.test(location.hash)) goJoin();
  }, [goJoin, setAvatar]);

  const go = (next: () => void) => {
    unlockAudio();
    setName(name.trim() || 'Игрок');
    next();
  };

  return (
    <div className="screen scroll">
      <Header deco={['leftTop', 'centerTop', 'rightSide', 'leftSide']}>
        <AppBar title={<span />} />
        <div className="home-hero">
          <img src="ui/logo.png" width={100} height={100} alt="" />
          <h2>OK Battle</h2>
        </div>
      </Header>

      <div>
        <div className="home-body">
          <div className="field">
            <label className="field-label" htmlFor="player-name">Ваше имя в игре</label>
            <input
              id="player-name"
              className="input"
              value={name}
              maxLength={20}
              onChange={(e) => setLocalName(e.target.value)}
              autoComplete="nickname"
            />
          </div>
          <div className="avatars" role="group" aria-label="Аватар">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                className="avatar-pick"
                aria-pressed={me.avatar === a}
                aria-label={a}
                onClick={() => setAvatar(a)}
              >
                <Avatar name={a} size={48} />
              </button>
            ))}
          </div>
          {notice && <p className="notice" role="alert">{notice}</p>}
          <ActionButton onClick={() => go(() => { click('next'); goJoin(); })}>Войти в игру как игрок</ActionButton>
          <ActionButton primary onClick={() => go(goSetup)}>Создать игру как ведущий</ActionButton>
        </div>
      </div>
    </div>
  );
}
