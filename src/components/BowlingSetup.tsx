'use client';

import { useState } from 'react';
import { unlockAudio } from '@/lib/audio';
import { LEVELS, useBowling, type Level } from '@/lib/bowling/store';
import { ActionButton } from './ui';

/** «Боулинг» options on the create-game page: how many bots and how well they bowl. */
export function BowlingSetup() {
  const start = useBowling((s) => s.start);
  const [bots, setBots] = useState(1);
  const [level, setLevel] = useState<Level>('mid');
  return (
    <>
      <p className="section-title">Настройки игры</p>
      <div className="panel">
        <div className="field">
          <h3>Соперники-боты</h3>
          <div className="chips">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={bots === n} onClick={() => setBots(n)}>
                {n === 0 ? 'Без ботов' : n}
              </button>
            ))}
          </div>
          <small className="hint">10 фреймов, классический подсчёт очков. Без ботов можно потренироваться в одиночку.</small>
        </div>
        {bots > 0 && (
          <div className="field">
            <h3>Уровень ботов</h3>
            <div className="chips">
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <button key={l} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
                  {LEVELS[l].name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="sticky-bottom">
        <ActionButton onClick={() => { unlockAudio(); start({ bots, level, ad: false }); }}>Начать игру</ActionButton>
      </div>
    </>
  );
}
