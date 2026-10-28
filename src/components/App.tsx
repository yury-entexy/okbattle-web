'use client';

import { useEffect, useRef } from 'react';
import { click } from '@/lib/audio';
import { useGame } from '@/lib/game/store';
import { Home } from './Home';
import { Setup } from './Setup';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Play } from './Play';
import { Final } from './Final';
import { VideoPanel } from './VideoPanel';

/** The app's transition clicks: the game starting, and each next question after the standings. */
function useStageSounds(stage: string | undefined, index: number) {
  const prev = useRef(stage);
  useEffect(() => {
    if (stage === 'question' && prev.current === 'lobby') click('startGame');
    if (stage === 'question' && prev.current === 'results') click('nextQuestion');
    prev.current = stage;
  }, [stage, index]);
}

export function App() {
  const screen = useGame((s) => s.screen);
  const stage = useGame((s) => s.room?.stage);
  const index = useGame((s) => s.room?.index ?? 0);
  const video = useGame((s) => s.room?.doc.videoEnabled);
  useStageSounds(screen === 'room' ? stage : undefined, index);
  return (
    <main className="shell">
      {screen === 'home' && <Home />}
      {screen === 'setup' && <Setup />}
      {screen === 'join' && <Join />}
      {screen === 'room' && video && <VideoPanel />}
      {screen === 'room' && stage === 'lobby' && <Lobby />}
      {screen === 'room' && (stage === 'question' || stage === 'answers' || stage === 'results') && <Play />}
      {screen === 'room' && stage === 'final' && <Final />}
    </main>
  );
}
