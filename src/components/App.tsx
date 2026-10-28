'use client';

import { useEffect, useRef, useState } from 'react';
import { audioUnlocked, click, unlockAudio } from '@/lib/audio';
import { initAnalytics, track } from '@/lib/analytics';
import { useGame } from '@/lib/game/store';
import { Home } from './Home';
import { Setup } from './Setup';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Play } from './Play';
import { Final } from './Final';
import { VideoPanel } from './VideoPanel';
import { BlueScreen, Loader, Snack } from './ui';

/** The app's transition clicks: the game starting, and each next question after the standings. */
function useStageSounds(stage: string | undefined, index: number) {
  const prev = useRef(stage);
  useEffect(() => {
    if (stage === 'question' && prev.current === 'lobby') click('startGame');
    if (stage === 'question' && prev.current === 'results') click('nextQuestion');
    prev.current = stage;
  }, [stage, index]);
}

/** Ad visitors arrive without a tap, and browsers keep sound off until one: ask for it once. */
function SoundPrompt() {
  const [locked, setLocked] = useState(() => !audioUnlocked());
  useEffect(() => {
    if (!locked) return;
    const on = () => {
      unlockAudio();
      setLocked(false);
    };
    addEventListener('pointerdown', on, { once: true });
    addEventListener('keydown', on, { once: true });
    return () => {
      removeEventListener('pointerdown', on);
      removeEventListener('keydown', on);
    };
  }, [locked]);
  if (!locked) return null;
  return <Snack>🔊 Нажмите на экран, чтобы включить звук</Snack>;
}

function Connecting() {
  const notice = useGame((s) => s.notice);
  return (
    <BlueScreen>
      <Loader />
      <p className="wait-text">{notice || 'Подключаемся к игре…'}</p>
    </BlueScreen>
  );
}

/** Conversion events: joined a game, played its first round, reached the final results. */
function useGoals() {
  const id = useGame((s) => s.room?.id);
  const stage = useGame((s) => s.room?.stage);
  const type = useGame((s) => s.room?.doc.gameType ?? '');
  const eternal = useGame((s) => !!s.eternal);
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!id) return;
    const once = (goal: 'game_join' | 'game_start' | 'game_finish') => {
      const key = `${goal}:${id}`;
      if (sent.current.has(key)) return;
      sent.current.add(key);
      track(goal, { game: type, room: eternal ? 'ad' : 'private' });
    };
    once('game_join');
    if (stage && stage !== 'lobby') once('game_start');
    if (stage === 'final') once('game_finish');
  }, [id, stage, type, eternal]);
}

export function App() {
  const screen = useGame((s) => s.screen);
  const stage = useGame((s) => s.room?.stage);
  const index = useGame((s) => s.room?.index ?? 0);
  const video = useGame((s) => s.room?.doc.videoEnabled);
  const eternal = useGame((s) => s.eternal);
  useStageSounds(screen === 'room' ? stage : undefined, index);
  useGoals();
  useEffect(() => initAnalytics(), []);
  return (
    <main className="shell">
      {screen === 'home' && <Home />}
      {screen === 'setup' && <Setup />}
      {screen === 'join' && <Join />}
      {screen === 'eternal' && <Connecting />}
      {eternal && <SoundPrompt />}
      {screen === 'room' && video && <VideoPanel />}
      {screen === 'room' && stage === 'lobby' && <Lobby />}
      {screen === 'room' && (stage === 'question' || stage === 'answers' || stage === 'results') && <Play />}
      {screen === 'room' && stage === 'final' && <Final />}
    </main>
  );
}
