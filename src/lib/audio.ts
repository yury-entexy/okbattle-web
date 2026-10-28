'use client';

// Web Audio playback: snippets are fetched and decoded ahead of their round, so a round starts
// with sound on the first frame instead of waiting on an <audio> element to buffer.
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
// Fallback for hosts without CORS headers (the app's Storage bucket has none): a plain <audio>
// element can play cross-origin files that fetch() is not allowed to read.
const elements = new Map<string, HTMLAudioElement>();
let playing: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let playingElement: HTMLAudioElement | null = null;
// A snippet the browser refused to start before the first tap; the tap starts it.
let blocked: HTMLAudioElement | null = null;

function element(url: string): HTMLAudioElement {
  let el = elements.get(url);
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.src = url;
    elements.set(url, el);
  }
  return el;
}

function context(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Must be called from a click/tap: browsers only start audio after a user gesture. */
export function unlockAudio(): void {
  const c = context();
  if (c.state === 'suspended') void c.resume();
  if (blocked && blocked === playingElement) void blocked.play().catch(() => {});
  blocked = null;
}

/** False until the page may play sound (the browser wants a tap first). */
export function audioUnlocked(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function preload(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => context().decodeAudioData(data))
      .catch(() => {
        element(url);
        return null;
      });
    buffers.set(url, p);
  }
  return p;
}

export async function play(url: string, volume = 1): Promise<void> {
  stop();
  const buffer = await preload(url);
  if (!buffer) {
    const el = element(url);
    el.volume = volume;
    el.currentTime = 0;
    playingElement = el;
    await el.play().catch(() => {
      blocked = el;
    });
    return;
  }
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
  if (playingElement) {
    playingElement.pause();
    playingElement = null;
  }
  if (!playing || !ctx) return;
  const { source, gain } = playing;
  playing = null;
  gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 4000);
  source.stop(ctx.currentTime + fadeMs / 1000);
}

// The app's ClickType → click sound (lib/presentation/utils/enum/click_type_enum.dart).
const CLICKS = {
  suggestion: 'click1',
  next: 'click2',
  wrongAnswer: 'click3',
  rightAnswer: 'click4',
  submitAnswer: 'click5',
  startGame: 'click6',
  results: 'click7',
  nextQuestion: 'click8',
} as const;
export type Click = keyof typeof CLICKS;

const sounds = new Map<string, HTMLAudioElement>();
let clicking: HTMLAudioElement | null = null;
let counting: HTMLAudioElement | null = null;

function sound(name: string): HTMLAudioElement {
  let el = sounds.get(name);
  if (!el) {
    el = new Audio(`sfx/${name}.mp3`);
    el.preload = 'auto';
    sounds.set(name, el);
  }
  return el;
}

/** Like the app's ClickPlayer: one player, a new click cuts the previous one. */
export function click(type: Click): void {
  try {
    clicking?.pause();
    const el = sound(CLICKS[type]);
    el.currentTime = 0;
    clicking = el;
    void el.play().catch(() => {});
  } catch {}
}

/** The pre-round countdown sound (timer.mp3), stopped when the round starts. */
export function countdownSound(on: boolean): void {
  try {
    if (!on) {
      counting?.pause();
      counting = null;
      return;
    }
    if (counting) return;
    const el = sound('timer');
    el.currentTime = 0;
    counting = el;
    void el.play().catch(() => {});
  } catch {}
}

/** Fetches the game sounds ahead, so the first click is not late. */
export function preloadSounds(): void {
  for (const name of [...Object.values(CLICKS), 'timer']) sound(name);
}
