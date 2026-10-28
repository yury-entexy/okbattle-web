'use client';

// Web Audio playback: snippets are fetched and decoded ahead of their round, so a round starts
// with sound on the first frame instead of waiting on an <audio> element to buffer.
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let playing: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Must be called from a click/tap: browsers only start audio after a user gesture. */
export function unlockAudio(): void {
  const c = context();
  if (c.state === 'suspended') void c.resume();
}

export function preload(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => context().decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

export async function play(url: string, volume = 1): Promise<void> {
  stop();
  const buffer = await preload(url);
  if (!buffer) return;
  const c = context();
  const gain = c.createGain();
  gain.gain.value = volume;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain).connect(c.destination);
  source.start();
  playing = { source, gain };
}

export function stop(fadeMs = 250): void {
  if (!playing || !ctx) return;
  const { source, gain } = playing;
  playing = null;
  gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 4000);
  source.stop(ctx.currentTime + fadeMs / 1000);
}

const clicks = new Map<string, HTMLAudioElement>();
/** Short UI sounds from the app (click1..8, timer). */
export function sfx(name: string, volume = 0.5): void {
  try {
    let el = clicks.get(name);
    if (!el) {
      el = new Audio(`sfx/${name}.mp3`);
      clicks.set(name, el);
    }
    el.volume = volume;
    el.currentTime = 0;
    void el.play().catch(() => {});
  } catch {}
}
