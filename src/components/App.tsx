'use client';

import { useGame } from '@/lib/game/store';
import { Home } from './Home';
import { Setup } from './Setup';
import { Lobby } from './Lobby';
import { Play } from './Play';
import { Final } from './Final';

export function App() {
  const phase = useGame((s) => s.phase);
  return (
    <main className="shell">
      {phase === 'home' && <Home />}
      {phase === 'setup' && <Setup />}
      {phase === 'lobby' && <Lobby />}
      {(phase === 'countdown' || phase === 'question' || phase === 'reveal') && <Play />}
      {phase === 'final' && <Final />}
    </main>
  );
}
