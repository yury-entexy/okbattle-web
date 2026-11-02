/**
 * Server host for the card-game ad tables: `/?play=durak` and `/?play=ocho`. It keeps one open
 * table per game and publishes its code at `Games/{game}_eternal`; visitors sit down there. A table
 * deals 4 s after the first person sits down (at once when it is full) with bots filling the empty
 * seats, and a new open table takes its place. After a game the same table deals again in 10 s for
 * whoever stayed, and closes once everyone has left. The referee is the same code a browser host
 * runs (src/lib/{game}/room.ts).
 *
 *   npx tsx server/table-host.ts durak|ocho
 *
 * Env as for eternal-host.ts; DURAK_MODE (classic | throwin | transfer, default throwin),
 * DURAK_BOTS and OCHO_BOTS (default 3).
 */
import type { Backend } from '../src/lib/net/types';
import type { Mode } from '../src/lib/durak/rules';

type Game = 'durak' | 'ocho';
const GAME = process.argv[2] as Game;
if (GAME !== 'durak' && GAME !== 'ocho') throw new Error('usage: table-host.ts durak|ocho');
const HOST = `webhost${GAME}`;
const POINTER = `${GAME}_eternal`;
const SEAT_MS = 4000;
const AGAIN_MS = 10_000;
const MODE = (process.env.DURAK_MODE as Mode) || 'throwin';
const BOTS = Number((GAME === 'durak' ? process.env.DURAK_BOTS : process.env.OCHO_BOTS) ?? 3);

/** What the host needs from a game's room module; src/lib/durak/room.ts and src/lib/ocho/room.ts both fit. */
interface TableRoom {
  code: string;
  status: 'lobby' | 'playing' | 'over' | 'closed';
  nextAt?: number;
  moves?: Record<string, unknown>;
}
interface RoomModule {
  MAX_PLAYERS: number;
  nodeId(code: string): string;
  view(raw: never): TableRoom;
  humans(room: never): unknown[];
  eternalRoom(code: string, hostId: string, now: number, bots: number, mode?: Mode): TableRoom;
  startPatch(room: never, now: number, avatarUrl: (a: string) => string): Record<string, unknown> | null;
  refereeStep(room: never, now: number, due: Map<string, number>): Record<string, unknown> | null;
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), GAME, ...a);

async function main() {
  const { backend } = await import('../src/lib/net');
  const room = (GAME === 'durak' ? await import('../src/lib/durak/room') : await import('../src/lib/ocho/room')) as unknown as RoomModule;
  const { avatarUrl } = await import('../src/lib/game/store');
  const be: Backend = await backend();

  type Table = { room: TableRoom | null; unwatch: () => void };
  const tables = new Map<string, Table>();
  const due = new Map<string, number>();
  let open = '';

  async function newCode() {
    for (;;) {
      const c = String(Math.floor(100000 + Math.random() * 900000));
      if (!(await be.read(`durak_${c}`)) && !(await be.read(`ocho_${c}`)) && !(await be.findGame(c))) return c;
    }
  }

  async function openTable() {
    const code = await newCode();
    const fresh = room.eternalRoom(code, HOST, be.now(), BOTS, MODE);
    await be.update(room.nodeId(code), fresh as unknown as Record<string, unknown>);
    const table: Table = { room: null, unwatch: () => {} };
    table.unwatch = be.watch(room.nodeId(code), (raw) => {
      table.room = raw ? room.view(raw as never) : null;
    });
    tables.set(code, table);
    open = code;
    await be.update(POINTER, { code, at: be.now() });
    log('open table', code);
  }

  function write(code: string, patch: Record<string, unknown>) {
    void be.update(room.nodeId(code), patch);
    // Apply here at once, so the next tick acts on the new state.
    const t = tables.get(code);
    if (!t?.room) return;
    const next = { ...t.room, moves: { ...t.room.moves } } as typeof t.room & Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (k.startsWith('moves/')) delete next.moves![k.slice(6)];
      else if (!k.includes('/')) next[k] = v === null ? undefined : v;
    }
    t.room = room.view(next as never);
  }

  function close(code: string) {
    const t = tables.get(code);
    tables.delete(code);
    t?.unwatch();
    void be.update(room.nodeId(code), { status: 'closed' }).then(() => setTimeout(() => void be.remove(room.nodeId(code)), 5000));
    log('closed', code);
  }

  let opening = false;
  function tick() {
    const now = be.now();
    for (const [code, t] of tables) {
      const r = t.room;
      if (!r) continue;
      const people = room.humans(r as never).length;
      if (r.status === 'lobby') {
        if (!people) {
          if (r.nextAt) write(code, { nextAt: null });
          continue;
        }
        if (!r.nextAt) write(code, { nextAt: now + SEAT_MS });
        else if (now >= r.nextAt || people >= room.MAX_PLAYERS) {
          const patch = room.startPatch(r as never, now, avatarUrl);
          if (patch) {
            write(code, patch);
            log('dealt', code, 'people', people);
            if (code === open && !opening) {
              opening = true;
              void openTable().finally(() => (opening = false));
            }
          }
        }
      } else if (r.status === 'playing') {
        // Everyone left mid-game: nobody is watching the bots play.
        if (!people) close(code);
        else {
          const patch = room.refereeStep(r as never, now, due);
          if (patch) write(code, patch.state && (patch.state as { over?: boolean }).over ? { ...patch, nextAt: now + AGAIN_MS } : patch);
        }
      } else if (r.status === 'over') {
        if (!r.nextAt) write(code, { nextAt: now + AGAIN_MS });
        else if (now >= r.nextAt) {
          const patch = people ? room.startPatch(r as never, now, avatarUrl) : null;
          if (patch) write(code, patch);
          else close(code);
        }
      }
    }
  }

  await openTable();
  setInterval(tick, 150);
  // A heartbeat on the pointer: visitors only trust a table published by a server that is up.
  setInterval(() => open && void be.update(POINTER, { code: open, at: be.now() }), 5000);

  // On shutdown (a new version deploying), close the tables so players go to the next server's table.
  process.on('SIGTERM', async () => {
    open = '';
    for (const code of [...tables.keys()]) close(code);
    await be.update(POINTER, { code: null });
    setTimeout(() => process.exit(0), 1500);
  });
}

void main();
