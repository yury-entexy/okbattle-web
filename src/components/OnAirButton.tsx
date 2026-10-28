'use client';

import { isHost, useGame } from '@/lib/game/store';
import type { Player } from '@/lib/game/engine';

/** Host's control on a player card in video games: put a player who asked for it on air, or take them off. */
export function OnAirButton({ player }: { player: Player }) {
  const { room, setOnAir } = useGame();
  const host = useGame(isHost);
  if (!room?.doc.videoEnabled || !host || player.id === room.hostId || player.bot) return null;
  const onAir = player.id in room.invited;
  if (!onAir && !player.wantsLive) return null;
  const full = Object.keys(room.invited).length >= 4;
  return (
    <button
      type="button"
      className="tag onair"
      disabled={!onAir && full}
      onClick={(e) => {
        e.stopPropagation();
        setOnAir(player.id, !onAir);
      }}
    >
      {onAir ? 'убрать из эфира' : full ? 'эфир заполнен' : 'в эфир'}
    </button>
  );
}
