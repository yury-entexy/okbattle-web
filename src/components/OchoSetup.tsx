'use client';

import { useState } from 'react';
import { unlockAudio } from '@/lib/audio';
import { MAX_PLAYERS, useOcho } from '@/lib/ocho/store';
import { OchoRules } from './Ocho';
import { ActionButton } from './ui';

/** «Очо» options on the create-game page: how many bots fill the table. */
export function OchoSetup() {
  const create = useOcho((s) => s.create);
  const [bots, setBots] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <p className="section-title">Настройки игры</p>
      <div className="panel">
        <div className="field">
          <h3>Боты</h3>
          <div className="chips">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>
            ))}
          </div>
          <small className="hint">Колода 108 карт, за столом от 2 до {MAX_PLAYERS} игроков. Боты занимают места, которые не заняли друзья.</small>
        </div>
        <div className="field">
          <h3>Как играть</h3>
          <OchoRules />
        </div>
      </div>
      {error && <p className="notice" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      <div className="sticky-bottom">
        <ActionButton
          disabled={busy}
          onClick={async () => {
            unlockAudio();
            setBusy(true);
            setError('');
            try {
              await create(bots);
            } catch {
              setError('Не получилось создать комнату. Попробуйте ещё раз.');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Создаём комнату…' : 'Создать игру'}
        </ActionButton>
      </div>
    </>
  );
}
