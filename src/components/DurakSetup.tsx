'use client';

import { useState } from 'react';
import { unlockAudio } from '@/lib/audio';
import { useDurak } from '@/lib/durak/store';
import { MODES, type Mode } from '@/lib/durak/rules';
import { ActionButton } from './ui';
import { MODE_NAMES } from './Durak';

/** «Дурак» options on the create-game page: the mode and how many bots fill the table. */
export function DurakSetup() {
  const create = useDurak((s) => s.create);
  const [mode, setMode] = useState<Mode>('throwin');
  const [bots, setBots] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <p className="section-title">Настройки игры</p>
      <div className="panel">
        <div className="field">
          <h3>Вид игры</h3>
          <div className="chips">
            {MODES.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_NAMES[m]}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <h3>Боты</h3>
          <div className="chips">
            {[0, 1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>
            ))}
          </div>
          <small className="hint">Колода 36 карт, за столом от 2 до 5 игроков. Боты занимают места, которые не заняли друзья.</small>
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
              await create(mode, bots);
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
