'use client';

import { useEffect, useState } from 'react';
import { preload, unlockAudio } from '@/lib/audio';
import { isHost, useGame } from '@/lib/game/store';
import { backend } from '@/lib/net';
import { Avatar } from './Avatar';
import { OnAirButton } from './OnAirButton';
import { ActionButton, AppBar, BackIcon, BlueScreen, GameCode, Header, RoundButton } from './ui';

const ANSWER_TYPES = { choose: 'выбор из 4 вариантов', enter: 'ответ вводится текстом', mixed: 'выбор и ввод вперемешку' };

/** The app's start-game page: the host's room code and members, or the player's waiting list. */
export function Lobby() {
  const { room, me, start, goHome } = useGame();
  const host = useGame(isHost);
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);
  const players = Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);

  useEffect(() => {
    void backend().then((b) => setShared(b.shared));
  }, []);
  // Everyone downloads the first snippet while they wait.
  const first = room?.questions[0];
  useEffect(() => {
    if (first?.kind === 'music') void preload(first.audio);
  }, [first]);

  if (!room) return null;
  const { doc } = room;
  const members = players.filter((p) => p.id !== room.hostId || doc.isAdminPlayer);
  const ready = players.length >= (doc.isAdminPlayer ? 2 : 1) && members.length > 0;
  const back = <RoundButton label="Выйти" onClick={goHome}><BackIcon /></RoundButton>;
  const tag = (id: string, bot?: boolean) => (id === room.hostId ? 'ведущий' : bot ? 'бот' : id === me.id ? 'вы' : '');

  if (!host) {
    return (
      <BlueScreen>
        <AppBar leading={back} />
        <GameCode code={room.code} />
        <p className="wait-text">Ожидайте, пока присоединятся остальные игроки</p>
        <p className="wait-count">Участники: {players.length}</p>
        <div className="await-list">
          {players.map((p) => (
            <div key={p.id} className="await-item">
              <Avatar name={p.avatar} size={40} />
              <span>{p.name}</span>
              {p.id === room.hostId && <img src="ui/verified.svg" width={18} height={18} alt="ведущий" />}
              <small>{tag(p.id, p.bot)}</small>
            </div>
          ))}
        </div>
      </BlueScreen>
    );
  }

  const link = typeof location !== 'undefined' ? `${location.origin}${location.pathname}#${room.code}` : '';
  const share = () => {
    const text = `Присоединяйтесь к игре OK Battle: код комнаты ${room.code}`;
    if (navigator.share) {
      void navigator.share({ title: 'OK Battle', text, url: link }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
  };

  return (
    <div className="screen">
      <div className="scroll">
        <Header deco={['leftTop', 'centerTop', 'rightSide', 'bottomLeft']}>
          <AppBar leading={back} />
          <p className="code-label">Код комнаты:</p>
          <div className="code-box">
            <div>
              {room.code}
              {shared && (
                <button type="button" aria-label="Поделиться ссылкой" onClick={share}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#284D79" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M13 11.0008L21.2 2.80078" />
                    <path d="M21.9992 6.8V2H17.1992" />
                    <path d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {copied && <p className="copied">Ссылка скопирована</p>}
          {shared && <p className="copied">Тот же код вводят в приложении: «Войти в игру как игрок»</p>}
          <div className="members" data-open={open}>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
              <span>Участники: {players.length}</span>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="#fff" /></svg>
            </button>
            {open && (
              <div className="member-list">
                {players.map((p, i) => (
                  <div key={p.id} className="member-row">
                    <span>{i + 1}. {p.name}</span>
                    {p.id === room.hostId && <img src="ui/verified.svg" width={18} height={18} alt="" />}
                    <small>{tag(p.id, p.bot)}</small>
                    <OnAirButton player={p} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Header>

        <div className="lobby-actions">
          <ActionButton
            disabled={!ready}
            onClick={() => {
              unlockAudio();
              start();
            }}
          >
            {ready ? 'Начать игру' : 'Ждём игроков…'}
          </ActionButton>
          <p className="lobby-note">
            {room.total} вопросов, {doc.roundTime} сек на ответ, {ANSWER_TYPES[doc.answerType]}.
            {!doc.isAdminPlayer && ' Вы ведёте игру и не отвечаете на вопросы.'}
            {doc.gameType === 'music' && !doc.everyoneHasSound && ' Музыка звучит только у ведущего.'}
            {!shared && ' В демо-версии комната видна только на этом устройстве.'}
          </p>
        </div>
      </div>
    </div>
  );
}
