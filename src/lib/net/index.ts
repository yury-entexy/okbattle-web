import type { Backend } from './types';

let current: Promise<Backend> | null = null;

/** The offline demo keeps games in memory; the real build shares them with the mobile app. */
export function backend(): Promise<Backend> {
  current ??=
    process.env.NEXT_PUBLIC_DATA_SOURCE === 'snapshot'
      ? import('./local').then((m) => m.localBackend)
      : import('./firebase').then((m) => m.firebaseBackend);
  return current;
}
