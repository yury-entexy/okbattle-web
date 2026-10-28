'use client';

import { useGame } from '@/lib/game/store';
import { Home } from './Home';
import { Setup } from './Setup';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Play } from './Play';
import { Final } from './Final';
import { VideoPanel } from './VideoPanel';

export function App() {
  const screen = useGame((s) => s.screen);
  const stage = useGame((s) => s.room?.stage);
  const video = useGame((s) => s.room?.doc.videoEnabled);
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
