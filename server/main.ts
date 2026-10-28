/**
 * The ad-room server: runs the always-on rooms (music, quiz, «Дурак») as child processes, restarts
 * any that stops, and answers health checks on $PORT, as Cloud Run expects of a container.
 *
 *   npx tsx server/main.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';

const ROOMS: Record<string, string[]> = {
  music: ['server/eternal-host.ts', 'music'],
  quiz: ['server/eternal-host.ts', 'quiz'],
  durak: ['server/durak-host.ts'],
};
const only = process.env.ROOMS?.split(',').filter((r) => r in ROOMS);

const children = new Map<string, { child: ChildProcess; since: number; restarts: number }>();
let stopping = false;

function run(name: string, restarts = 0) {
  const child = spawn(process.execPath, ['--import', 'tsx', ...ROOMS[name]], { stdio: 'inherit', env: process.env });
  children.set(name, { child, since: Date.now(), restarts });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(new Date().toISOString(), name, 'stopped', code ?? signal, '- restarting');
    // Back off when a room keeps failing, up to a minute.
    setTimeout(() => run(name, restarts + 1), Math.min(60_000, 2000 * 2 ** Math.min(restarts, 5)));
  });
}

for (const name of only?.length ? only : Object.keys(ROOMS)) run(name);

createServer((req, res) => {
  const status = Object.fromEntries([...children].map(([name, c]) => [name, { up: c.child.exitCode === null, since: new Date(c.since).toISOString(), restarts: c.restarts }]));
  const ok = Object.values(status).every((s) => s.up);
  res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok, rooms: status }));
}).listen(Number(process.env.PORT ?? 8080));

process.on('SIGTERM', () => {
  stopping = true;
  for (const { child } of children.values()) child.kill('SIGTERM');
  // Cloud Run allows 10 s after SIGTERM; the rooms need about 2.
  setTimeout(() => process.exit(0), 5000);
});
