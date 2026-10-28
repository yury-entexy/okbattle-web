'use client';

import { useEffect, useState } from 'react';
import { click, countdownSound, play, preload, stop } from '@/lib/audio';
import { isHost, useGame } from '@/lib/game/store';
import { Avatar } from './Avatar';
import { ResultCard, rows } from './Standings';
import {
  ActionButton, AppBar, BlueScreen, CloseIcon, CongratsSnack, ControlBlock, Countdown, GameCode, Header,
  PlayersCounter, RoundButton, ScoreCounter, TimeBar, TrafficLight, Vinyl,
} from './ui';

/** Re-renders every frame with the shared (server) clock; the host also advances the game here. */
function useFrame(): number {
  const { drive, now } = useGame();
  const [t, setT] = useState(now);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      drive();
      setT(now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF sleeps in background tabs; a slow interval keeps the host's game moving there.
    const bg = setInterval(() => document.hidden && drive(), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(bg);
    };
  }, [drive, now]);
  return t;
}

export function Play() {
  const now = useFrame();
  const { room, me, answer, pickWinner, next, goHome } = useGame();
  const host = useGame(isHost);
  const [draft, setDraft] = useState('');
  const stage = room?.stage;
  const index = room?.index ?? 0;
  const q = room?.round?.question;
  const counting = stage === 'question' && !!room && now < room.startsAt;
  const phase = counting ? 'countdown' : stage;
  const hears = !!room && (room.doc.everyoneHasSound || host);

  useEffect(() => {
    if (!room) return;
    // The app plays timer.mp3 over the countdown wherever the round's sound plays.
    countdownSound(phase === 'countdown' && hears);
    if (!q) return;
    if (phase === 'countdown') {
      stop();
      if (q.kind === 'music') void preload(q.audio);
    } else if (phase === 'question') {
      if (q.kind === 'music' && hears) void play(q.audio);
      const upcoming = room.questions[index + 1];
      if (upcoming?.kind === 'music') void preload(upcoming.audio);
    } else if (phase === 'results') {
      stop(800);
    }
    // Only the phase change matters here, not every room update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, q]);

  useEffect(() => setDraft(''), [index]);
  useEffect(() => () => {
    stop();
    countdownSound(false);
  }, []);

  const roundMs = room?.roundMs ?? 1;
  const remaining = phase === 'question' && room ? Math.max(0, roundMs - (now - room.startsAt)) : 0;
  const mine = room?.answers[index]?.[me.id];
  const playing = !!room?.players[me.id];
  // The round is over for this screen when time is up or every player has answered.
  const everyone = !!room && Object.keys(room.players).every((id) => room.answers[index]?.[id]);
  const roundEnded = phase !== 'question' || remaining === 0 || everyone;
  const chooseRound = room?.round?.mode === 'choose';

  // The app's reveal click for players: right or wrong answer (none chosen counts as wrong).
  useEffect(() => {
    if (phase === 'question' && roundEnded && chooseRound && playing && !host) click(mine?.correct ? 'rightAnswer' : 'wrongAnswer');
    // Once per round, when it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundEnded, index]);

  // As in the app: whatever was typed is sent when the time runs out.
  useEffect(() => {
    if (phase === 'question' && remaining === 0 && draft.trim() && !mine) answer(draft);
  }, [phase, remaining, draft, mine, answer]);

  if (!room) return null;
  const round = room.round;
  const players = Object.values(room.players);
  const exit = <RoundButton label="Выйти из игры" onClick={goHome}><CloseIcon /></RoundButton>;
  const leading = <>{exit}<PlayersCounter count={players.length} /></>;

  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((room.startsAt - now) / 1000));
    return (
      <BlueScreen>
        <AppBar leading={<PlayersCounter count={players.length} />} title="Приготовьтесь!" />
        <div className="countdown-screen" aria-live="polite">
          <Countdown size={276}><span key={left}>{left}</span></Countdown>
        </div>
      </BlueScreen>
    );
  }

  const byTime = room.doc.takeIntoAnswerTime;
  // As the app's calculateUserScore: correct answers before the current round.
  const score = room.answers.slice(0, index).filter((r) => r[me.id]?.correct).length;
  const appBar = <AppBar leading={leading} action={playing && <ScoreCounter score={score} />} />;
  const counter = <small> Вопрос {index + 1} из {room.total}</small>;

  if (phase === 'results') {
    const table = rows(room, index);
    return (
      <div className="screen">
        <Header deco={['leftTop', 'centerTop']}>
          {appBar}
          <GameCode code={room.code} />
          <div style={{ height: 15 }} />
        </Header>
        <div className="scroll">
          <div className="results-body">
            <p className="results-head">Текущие результаты{counter}</p>
            {table.map((r, i) => <ResultCard key={r.player.id} row={r} me={r.player.id === me.id} byTime={byTime} index={i} />)}
          </div>
        </div>
        {host && (
          <ControlBlock>
            <ActionButton primary onClick={next}>Следующий вопрос</ActionButton>
          </ControlBlock>
        )}
      </div>
    );
  }

  if (!round || !q) {
    return (
      <div className="screen">
        <Header>{appBar}<GameCode code={room.code} /><div style={{ height: 30 }} /></Header>
        <div className="answer-body"><p className="q-title">Этот вопрос не удалось загрузить на вебе. Ждём следующий раунд…</p></div>
      </div>
    );
  }

  const shown = room.answers[index] ?? {};
  // As the app's CongratsSnackBar: once the chosen answer is revealed, kept across the round's screens.
  const snack = roundEnded && round.mode === 'choose' && mine ? <CongratsSnack key={index} correct={mine.correct} /> : null;
  const ask = round.ask === 'title' ? 'название' : 'исполнителя';
  const manual = round.mode === 'enter' && room.doc.winnerDeterminationType === 'manually';

  // The round's answers (PlayersAnswersPage): the right answer up top, each player's answer below.
  if (phase === 'answers') {
    const winner = room.selected[index];
    const answered = rows(room, index)
      .filter((r) => shown[r.player.id])
      .sort((a, b) => Number(!!shown[b.player.id].correct) - Number(!!shown[a.player.id].correct) || shown[a.player.id].ms - shown[b.player.id].ms);
    return (
      <>
        <div className="screen">
          <Header>
            {appBar}
            <GameCode code={room.code} />
            <div className="round-answer">
              {q.kind === 'music' ? (
                <>
                  {q.photo && <img className="cover" src={q.photo} width={120} height={120} alt="" />}
                  <p className="ra-ask">{round.mode === 'enter' ? 'Укажите' : 'Выберите'} <u>{ask}</u> песни</p>
                  <p className={round.ask === 'author' ? 'ra-line hit' : 'ra-line'}>Исполнитель: {q.author}</p>
                  <p className={round.ask === 'title' ? 'ra-line hit' : 'ra-line'}>Название песни: {q.title}</p>
                </>
              ) : (
                <>
                  {q.image && <img className="qmedia" src={q.image} alt="" />}
                  <p className="ra-ask">{round.prompt}</p>
                  <p className="ra-line hit">Ответ: {round.answer}</p>
                </>
              )}
            </div>
          </Header>
          <div className="scroll">
            <div className="results-body">
              <p className="results-head">{host && manual ? 'Выберите победителя' : 'Результаты раунда'}{counter}</p>
              {answered.length === 0 && <p className="sent">Никто не успел ответить.</p>}
              {answered.map((r, i) => {
                const a = shown[r.player.id];
                const right = winner ? winner === r.player.id : a.correct;
                return (
                  <div
                    key={r.player.id}
                    className={`ritem answer-item ${right ? 'right' : 'wrong'} ${winner === r.player.id ? 'selected' : ''} ${r.player.id === me.id ? 'me' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  >
                    <span className="ritem-num">{i + 1}</span>
                    <div className="ritem-top">
                      <Avatar name={r.player.avatar} size={54} />
                      <div className="ritem-info">
                        <div className="ritem-name"><span>{r.player.name}</span></div>
                        <div className="ritem-stats">
                          <span><img src="ui/coin.svg" width={15} height={15} alt="Очки" />{r.score}</span>
                          <span><img src="ui/time.svg" width={16} height={16} alt="Время" />{(a.ms / 1000).toFixed(2)} сек</span>
                        </div>
                      </div>
                      {host && manual && (
                        <button type="button" className="pick" aria-pressed={winner === r.player.id} onClick={() => { click('suggestion'); pickWinner(r.player.id); }}>
                          Победитель
                        </button>
                      )}
                    </div>
                    {a.text && <p className={`ritem-answer ${right ? 'ok' : 'bad'}`}>{a.text}</p>}
                    <TrafficLight stats={r.stats} />
                  </div>
                );
              })}
            </div>
          </div>
          {host && (
            <ControlBlock>
              <ActionButton primary onClick={() => { click('next'); next(); }}>Далее</ActionButton>
            </ControlBlock>
          )}
        </div>
        {snack}
      </>
    );
  }

  // Answering (AnswerPage).
  const secondsLeft = Math.ceil(remaining / 1000);
  const progress = 1 - remaining / roundMs;
  const counts = round.options.map((_, i) => Object.values(shown).filter((a) => a.option === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const tileState = (i: number) => {
    if (roundEnded) {
      if (round.options[i].correct) return 'correct';
      if (mine?.option === i) return 'incorrect';
      return 'empty';
    }
    return mine?.option === i ? 'pressed' : 'empty';
  };

  return (
    <>
      <div className="screen">
        <Header>
          {appBar}
          <GameCode code={room.code} />
          {q.kind === 'music' ? (
            <Vinyl size={host && !playing ? 160 : 225} secondsLeft={secondsLeft} progress={progress} />
          ) : (
            <>
              {q.image && <img className="qmedia" src={q.image} alt="" />}
              {q.video && <video className="qmedia" src={q.video} autoPlay playsInline controls />}
              <TimeBar secondsLeft={secondsLeft} progress={progress} />
            </>
          )}
        </Header>

        <div className="scroll">
          <div className={`answer-body ${host ? 'host' : ''}`}>
            {q.kind === 'music' ? (
              <p className="q-head">{round.mode === 'enter' ? 'Укажите' : 'Выберите'} <u>{ask}</u>{counter}</p>
            ) : (
              <p className="q-sub">Вопрос {index + 1} из {room.total}</p>
            )}
            {mine && round.mode === 'choose' && mine.option !== null && (
              <p className="q-sub">Мой выбор №{mine.option + 1} ({(mine.ms / 1000).toFixed(2)} сек)</p>
            )}
            {q.kind !== 'music' && <p className="q-title">{round.prompt}</p>}
            {!hears && q.kind === 'music' && <p className="q-sub">Музыка звучит у ведущего</p>}

            {round.mode === 'choose' ? (
              round.options.map((o, i) => {
                const st = tileState(i);
                return (
                  <button
                    key={i}
                    className={`tile ${st}`}
                    disabled={st !== 'empty' || roundEnded || !!mine || !playing}
                    onClick={() => {
                      click('submitAnswer');
                      answer(i);
                    }}
                  >
                    <span className="t">{i + 1}. {o.text}</span>
                    {(roundEnded || (host && !playing)) && (
                      <span className="stat">
                        {total ? ((counts[i] * 100) / total).toFixed(2) : '0.00'}%
                        <small>{counts[i]}</small>
                      </span>
                    )}
                    <span className={`radio ${st === 'pressed' ? 'pressed' : st === 'empty' ? '' : 'mark'}`}>
                      {st === 'correct' && <img src="ui/checkmark.svg" alt="" />}
                      {st === 'incorrect' && <img src="ui/incorrect_cross.svg" alt="" />}
                    </span>
                  </button>
                );
              })
            ) : playing ? (
              <form
                className="enter-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim() || mine) return;
                  click('submitAnswer');
                  answer(draft);
                }}
              >
                <input
                  className="input"
                  aria-label="Ваш ответ"
                  placeholder="Введите ответ"
                  value={mine ? mine.text : draft}
                  disabled={!!mine || roundEnded}
                  autoFocus
                  autoComplete="off"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <ActionButton primary type="submit" disabled={!!mine || !draft.trim() || roundEnded}>
                  {mine ? 'Ответ отправлен' : 'Ответить'}
                </ActionButton>
                {roundEnded && mine && (
                  <p className={`ritem-answer ${mine.correct ? 'ok' : 'bad'}`}>Правильный ответ: {round.answer}</p>
                )}
              </form>
            ) : (
              <p className="sent">Игроки вводят ответы: {Object.keys(shown).length} из {players.length}</p>
            )}
            {mine && !roundEnded && <p className="sent">Ответ принят. Ждём остальных…</p>}
          </div>
        </div>

        {host && (
          <ControlBlock>
            <ActionButton primary disabled={!roundEnded} onClick={() => { click('next'); next(); }}>Далее</ActionButton>
          </ControlBlock>
        )}
      </div>
      {snack}
    </>
  );
}
