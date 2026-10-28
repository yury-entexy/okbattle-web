/**
 * Server host for the «Дурак» ad tables (`/?play=durak`). It keeps one open table and publishes its
 * code at `Games/durak_eternal`; visitors sit down there. A table deals 4 s after the first person
 * sits down (at once when it is full) with bots filling the empty seats, and a new open table takes
 * its place. After a game the same table deals again in 10 s for whoever stayed, and closes once
 * everyone has left. The referee is the same code a browser host runs (src/lib/durak/room.ts).
 *
 *   npx tsx server/durak-host.ts
 *
 * Env as for eternal-host.ts; DURAK_MODE (classic | throwin | transfer, default throwin) and
 * DURAK_BOTS (default 3).
 */
import type { Backend } from '../src/lib/net/types';
import type { Mode } from '../src/lib/durak/rules';

const HOST = 'webhostdurak';
const POINTER = 'durak_eternal';
const SEAT_MS = 4000;
const AGAIN_MS = 10_000;
const MODE = (process.env.DURAK_MODE as Mode) || 'throwin';
const BOTS = Number(process.env.DURAK_BOTS ?? 3);

const log = (...a: unknown[]) => console.log(new Date().toISOString(), 'durak', ...a);

async function main() {
  const { backend } = await import('../src/lib/net');
  const room = await import('../src/lib/durak/room');
  const { avatarUrl } = await import('../src/lib/game/store');
  const be: Backend = await backend();

  type Table = { room: import('../src/lib/durak/room').DurakRoom | null; unwatch: () => void };
  const tables = new Map<string, Table>();
  const due = new Map<string, number>();
  let open = '';

  async function newCode() {
    for (;;) {
      const c = String(Math.floor(100000 + Math.random() * 900000));
      if (!(await be.read(room.nodeId(c))) && !(await be.findGame(c))) return c;
    }
  }

  async function openTable() {
    const code = await newCode();
    const fresh = {
      kind: 'durak', code, hostId: HOST, mode: MODE, bots: BOTS, status: 'lobby', members: {}, createdAt: be.now(), eternal: true,
    };
    await be.update(room.nodeId(code), fresh);
    const table: Table = { room: null, unwatch: () => {} };
    table.unwatch = be.watch(room.nodeId(code), (raw) => {
      table.room = raw ? room.view(raw as unknown as import('../src/lib/durak/room').DurakRoom) : null;
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
    t.room = room.view(next);
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
      const people = room.humans(r).length;
      if (r.status === 'lobby') {
        if (!people) {
          if (r.nextAt) write(code, { nextAt: null });
          continue;
        }
        if (!r.nextAt) write(code, { nextAt: now + SEAT_MS });
        else if (now >= r.nextAt || people >= room.MAX_PLAYERS) {
          const patch = room.startPatch(r, now, avatarUrl);
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
          const patch = room.refereeStep(r, now, due);
          if (patch) write(code, patch.state && (patch.state as { over?: boolean }).over ? { ...patch, nextAt: now + AGAIN_MS } : patch);
        }
      } else if (r.status === 'over') {
        if (!r.nextAt) write(code, { nextAt: now + AGAIN_MS });
        else if (now >= r.nextAt) {
          const patch = people ? room.startPatch(r, now, avatarUrl) : null;
          if (patch) write(code, patch);
          else close(code);
        }
      }
    }
  }

  await openTable();
  setInterval(tick, 150);

  // On shutdown (a new version deploying), close the tables so players go to the next server's table.
  process.on('SIGTERM', async () => {
    for (const code of [...tables.keys()]) close(code);
    await be.update(POINTER, { code: null });
    setTimeout(() => process.exit(0), 1500);
  });
}

void main();
