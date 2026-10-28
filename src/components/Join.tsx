'use client';

import { useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { useDurak } from '@/lib/durak/store';
import { ActionButton, AppBar, BackIcon, BlueScreen, Loader, RoundButton } from './ui';

/** The app's join page: six-digit room code, then «Играть». */
export function Join() {
  const { goHome, joinRoom, notice } = useGame();
  const [code, setCode] = useState(() => {
    if (typeof location === 'undefined') return '';
    return /^#\d{6}$/.test(location.hash) ? location.hash.slice(1) : '';
  });
  const [busy, setBusy] = useState(false);

  return (
    <BlueScreen>
      <AppBar leading={<RoundButton label="Назад" onClick={goHome}><BackIcon /></RoundButton>} title="Присоединяйтесь!" />
      {busy ? (
        <Loader />
      ) : (
        <form
          className="grow"
          style={{ display: 'flex', flexDirection: 'column' }}
          onSubmit={async (e) => {
            e.preventDefault();
            // The tap that joins also unlocks sound for the rounds that follow.
            unlockAudio();
            click('next');
            setBusy(true);
            // «Дурак» rooms first, then the quiz rooms shared with the app.
            const durak = await useDurak.getState().join(code);
            const ok = durak === 'ok' || (durak === 'none' && (await joinRoom(code)));
            if (!ok) setBusy(false);
          }}
        >
          <label className="join-title" htmlFor="room-code">Введите код комнаты</label>
          <input
            id="room-code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
          />
          {notice && <p className="notice" role="alert" style={{ marginTop: 16 }}>{notice}</p>}
          <div className="grow" />
          <ActionButton primary type="submit" disabled={code.length !== 6}>Играть</ActionButton>
          <div style={{ height: 26 }} />
        </form>
      )}
    </BlueScreen>
  );
}
