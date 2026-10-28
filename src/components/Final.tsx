'use client';

import { useEffect, useState } from 'react';
import { click, stop } from '@/lib/audio';
import { ETERNAL_FINAL_MS } from '@/lib/game/eternal';
import { isHost, losers, useGame } from '@/lib/game/store';
import { punishmentText } from '@/lib/punishments';
import { SignIn } from './SignIn';
import { ResultCard, rows, type Row } from './Standings';
import { ActionButton, AppBar, CloseIcon, ControlBlock, Dialog, GameCode, Header, Lottie, PlayersCounter, RoundButton, ScoreCounter } from './ui';

const PODIUMS = [
  { cls: 'first', crown: 'ui/crown.svg', height: 155, top: '#e1ebf5', base: 'linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0))' },
  { cls: 'second', crown: 'ui/silver_crown.svg', height: 135, top: '#bad1e8', base: 'linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0))' },
  { cls: 'third', crown: 'ui/copper_crown.svg', height: 125, top: '#a7c4e2', base: 'linear-gradient(rgba(255,255,255,0.3), rgba(255,255,255,0))' },
];

function Podium({ row, place }: { row?: Row; place: 0 | 1 | 2 }) {
  if (!row) return <div />;
  const p = PODIUMS[place];
  return (
    <div className={p.cls}>
      <img className="crown" src={p.crown} alt="" />
      <span className="pname">{row.player.name}</span>
      <div className="podium" style={{ height: p.height }}>
        <div className="podium-base" style={{ background: p.base }}>
          <b>{place + 1}</b>
          <small>{row.score} очк.</small>
        </div>
        <div className="podium-top" style={{ background: p.top }} />
      </div>
    </div>
  );
}

/** The app's final results: pedestal in the header, fireworks, standings and the punishment. */
export function Final() {
  const { room, me, goSetup, goHome, eternal, now } = useGame();
  const host = useGame(isHost);
  const [dialog, setDialog] = useState(false);
  const [fireworks, setFireworks] = useState(true);
  const [, tick] = useState(0);
  // Always-on rooms: a countdown to the next game, which the players join on their own.
  useEffect(() => {
    if (!eternal) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [eternal]);

  useEffect(() => {
    stop(1200);
    click('results');
    const t = setTimeout(() => setFireworks(false), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!room) return null;

  const byTime = room.doc.takeIntoAnswerTime;
  const table = rows(room, room.total - 1);
  const punishment = punishmentText(room.doc.punishmentType);
  const punished = punishment ? losers(room) : [];
  const playing = !!room.players[me.id];
  const score = table.find((r) => r.player.id === me.id)?.score ?? 0;

  return (
    <div className="screen">
      <div className="scroll">
        <Header deco={['leftTop', 'centerTop']}>
          <AppBar
            leading={<><RoundButton label="Выйти" onClick={goHome}><CloseIcon /></RoundButton><PlayersCounter count={table.length} /></>}
            action={playing && <ScoreCounter score={score} />}
          />
          <GameCode code={room.code} />
          <div className="pedestal" aria-label="Пьедестал">
            <Podium row={table[1]} place={1} />
            <Podium row={table[0]} place={0} />
            <Podium row={table[2]} place={2} />
          </div>
        </Header>
        <div className="results-body">
          {eternal && (
            <p className="notice">Следующая игра через {Math.max(1, Math.ceil((room.stageAt + ETERNAL_FINAL_MS - now()) / 1000))} сек</p>
          )}
          {eternal && <SignIn title="Войдите, чтобы сохранить результаты и играть под своим именем" />}
          <p className="results-head">Итоговые результаты<small> Вопрос {room.total} из {room.total}</small></p>
          {table.map((r, i) => <ResultCard key={r.player.id} row={r} me={r.player.id === me.id} byTime={byTime} index={i} />)}
        </div>
      </div>

      <ControlBlock>
        {punished.length > 0 && (
          <ActionButton onClick={() => { click('wrongAnswer'); setDialog(true); }}>Наказание игроков</ActionButton>
        )}
        {host && (
          <ActionButton onClick={() => { goHome(); goSetup(); }}>Новая игра</ActionButton>
        )}
        <ActionButton primary onClick={goHome}>Завершить</ActionButton>
      </ControlBlock>

      {fireworks && <Lottie className="fireworks" src="lottie/fireworks_lottie.json" loop={false} />}

      {dialog && (
        <Dialog title="Наказание" onClose={() => setDialog(false)}>
          <Lottie src="lottie/punishment_lottie.json" />
          <p className="who">
            {punished.length > 1 ? 'Наказание для игроков: ' : 'Наказание для игрока '}
            {punished.map((p, i) => <span key={p.id}>{i > 0 && ', '}<b>{p.name}</b></span>)}
          </p>
          <p>{punishment}</p>
        </Dialog>
      )}
    </div>
  );
}
