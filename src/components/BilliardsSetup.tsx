'use client';

import { useState } from 'react';
import { click, unlockAudio } from '@/lib/audio';
import { usePool } from '@/lib/pool/store';
import { ActionButton } from './ui';

/** «Бильярд» on the create-game page: a quick game with the bot, or a room for a friend. */
export function BilliardsSetup() {
  const { playBot, create } = usePool();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <p className="section-title">Настройки игры</p>
      <div className="panel">
        <div className="field">
          <h3>Пул «восьмёрка»</h3>
          <small className="hint">
            Двое игроков. После разбоя первый забитый шар решает, чьи сплошные (1–7), а чьи полосатые (9–15).
            Забейте все свои, затем восьмёрку. Восьмёрка раньше времени или биток в лузе вместе с ней — поражение.
            После фола соперник ставит биток куда угодно.
          </small>
        </div>
      </div>
      {error && <p className="notice" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      <div className="sticky-bottom" style={{ display: 'grid', gap: 10 }}>
        <ActionButton
          primary
          disabled={busy}
          onClick={() => {
            unlockAudio();
            click('startGame');
            void playBot();
          }}
        >
          Играть с ботом
        </ActionButton>
        <ActionButton
          disabled={busy}
          onClick={async () => {
            unlockAudio();
            setBusy(true);
            setError('');
            try {
              await create();
            } catch {
              setError('Не получилось создать комнату. Попробуйте ещё раз.');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Создаём комнату…' : 'Играть с другом по коду'}
        </ActionButton>
      </div>
    </>
  );
}
