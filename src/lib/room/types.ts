import type { Answer, Player, Round } from '@/lib/game/engine';
import type { GameSettings } from '@/lib/types';

export type Stage = 'lobby' | 'countdown' | 'question' | 'reveal' | 'final';

/**
 * One game room, shared by everyone in it. The host's device drives the stages; all timing is
 * derived from `stageAt` (server milliseconds), so every screen shows the same countdown.
 */
export interface Room {
  code: string;
  hostId: string;
  settings: GameSettings;
  rounds: Round[];
  players: Record<string, Player & { joinedAt: number }>;
  stage: Stage;
  index: number;
  stageAt: number;
  /** Keyed `r0`, `r1`… (not array indexes, which the Realtime Database would turn into arrays). */
  answers?: Record<string, Record<string, Answer>>;
}

export const roundKey = (index: number) => `r${index}`;

export interface RoomTransport {
  exists(code: string): Promise<boolean>;
  create(room: Room): Promise<void>;
  /** Calls back with every change; `null` once the room is gone. Returns an unsubscribe function. */
  subscribe(code: string, onChange: (room: Room | null) => void): () => void;
  /** Multi-path update relative to the room, e.g. `{ 'players/abc': {...}, stage: 'question' }`. */
  update(code: string, patch: Record<string, unknown>): Promise<void>;
  /** Removes the player (or the whole room, for the host) when this tab disconnects. */
  leaveOnDisconnect(code: string, playerId: string, isHost: boolean): void;
  remove(code: string, path?: string): Promise<void>;
  serverNow(): number;
  /** Whether other devices can join (false for the offline demo). */
  shared: boolean;
}
