// The static demo has no server, so route handlers (the Agora token proxy) are moved aside while it builds.
import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const api = 'src/app/api';
const parked = '.api-parked';
if (existsSync(api)) renameSync(api, parked);
try {
  execSync('next build', { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_DATA_SOURCE: 'snapshot', DEMO_EXPORT: '1' } });
} finally {
  if (existsSync(parked)) renameSync(parked, api);
}
