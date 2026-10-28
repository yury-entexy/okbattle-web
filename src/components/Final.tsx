'use client';

import { useEffect } from 'react';
import { stop } from '@/lib/audio';
import { standings } from '@/lib/game/engine';
import { answersByRound, isHost, useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';

export function Final() {
  const { room, me, goSetup, goHome } = useGame();
  const host = useGame(isHost);

  useEffect(() => stop(1200), []);
  if (!room) return null;

  const players = Object.values(room.players);
  const table = standings(players, answersByRound(room));
  const top = table.slice(0, 3);
  const myPlace = table.findIndex((s) => s.player.id === me.id) + 1;
  // Podium order: 2nd, 1st, 3rd.
  const podium = [top[1], top[0], top[2]];
  const heights = [84, 112, 64];

  return (
    <>
      <header className="topbar">
        <h1>{myPlace === 1 ? 'Победа! Вам достаётся нота' : myPlace ? `Вы на ${myPlace}-м месте` : 'Итоги игры'}</h1>
      </header>

      <section className="podium" aria-label="Пьедестал">
        {podium.map((s, i) =>
          s ? (
            <div key={s.player.id} className={`place ${i === 1 ? 'first' : ''}`}>
              {i === 1 && <img src="icons/crown.svg" width={36} height={36} alt="" />}
              <Avatar name={s.player.avatar} size={i === 1 ? 72 : 56} />
              <span className="name">{s.player.name}</span>
              <div className="step" style={{ height: heights[i] }}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
            </div>
          ) : (
            <div key={i} />
          ),
        )}
      </section>

      <section className="card">
        <p className="label">Итоги · {room.rounds.length} раундов</p>
        <div className="table">
          {table.map((s, i) => (
            <div key={s.player.id} className={`line ${s.player.id === me.id ? 'me' : ''}`}>
              <span className="pos">{i + 1}</span>
              <Avatar name={s.player.avatar} size={36} />
              <span className="n">{s.player.name}</span>
              <span className="score">
                <img src="icons/coin.svg" width={18} height={18} alt="" />
                {s.correct}
                <small>· {(s.correctMs / 1000).toFixed(1)} с</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="row">
        {host && (
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => {
              goHome();
              goSetup();
            }}
          >
            Новая игра
          </button>
        )}
        <button className="btn secondary" style={{ flex: 1 }} onClick={goHome}>В меню</button>
      </div>
    </>
  );
}
