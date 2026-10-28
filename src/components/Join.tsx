'use client';

import { useState } from 'react';
import { unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';

export function Join() {
  const { goHome, joinRoom, notice } = useGame();
  const [code, setCode] = useState(() => {
    if (typeof location === 'undefined') return '';
    return /^#\d{6}$/.test(location.hash) ? location.hash.slice(1) : '';
  });
  const [busy, setBusy] = useState(false);

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Назад">←</button>
        <h1>Войти по коду</h1>
      </header>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          // The tap that joins also unlocks sound for the rounds that follow.
          unlockAudio();
          setBusy(true);
          const ok = await joinRoom(code);
          if (!ok) setBusy(false);
        }}
      >
        <div className="field">
          <label className="label" htmlFor="room-code">Код игры от ведущего</label>
          <input
            id="room-code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
          />
        </div>
        {notice && <p className="muted" role="alert">{notice}</p>}
        <button className="btn block" type="submit" disabled={code.length !== 6 || busy}>
          {busy ? 'Входим…' : 'Войти в комнату'}
        </button>
      </form>
    </>
  );
}
