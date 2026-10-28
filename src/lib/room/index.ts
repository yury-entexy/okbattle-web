import type { RoomTransport } from './types';

let current: Promise<RoomTransport> | null = null;

/** The offline demo keeps rooms in memory; the real build shares them through the Realtime Database. */
export function roomTransport(): Promise<RoomTransport> {
  current ??=
    process.env.NEXT_PUBLIC_DATA_SOURCE === 'snapshot'
      ? import('./local').then((m) => m.localTransport)
      : import('./rtdb').then((m) => m.rtdbTransport);
  return current;
}
