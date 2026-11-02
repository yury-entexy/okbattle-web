'use client';

/**
 * Table sounds made with Web Audio (the app has no pool sounds to copy): a click for balls
 * touching, a thud for cushions, a drop for pockets and a tap for the cue.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function tone(freq: number, decay: number, volume: number, type: OscillatorType = 'sine', noiseMix = 0) {
  const c = context();
  if (!c || c.state !== 'running' || volume <= 0.01) return;
  const t = c.currentTime;
  const gain = c.createGain();
  gain.gain.setValueAtTime(Math.min(1, volume), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  gain.connect(c.destination);
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + decay + 0.02);
  if (noiseMix > 0) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq * 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(1, volume * noiseMix), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.6);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + decay);
  }
}

/** Call from the tap that shoots, so the browser lets sound play. */
export function wakeSound() {
  context();
}

export const poolSound = {
  cue: (power: number) => tone(900, 0.05, 0.25 + power * 0.4, 'triangle', 1.2),
  ball: (speed: number) => tone(2300 + Math.random() * 400, 0.045, Math.min(0.7, speed / 5000), 'sine', 0.8),
  rail: (speed: number) => tone(150, 0.09, Math.min(0.5, speed / 6000), 'sine', 0.4),
  pocket: () => {
    tone(110, 0.22, 0.5, 'sine', 0.6);
    setTimeout(() => tone(260, 0.08, 0.25, 'triangle', 0.5), 90);
  },
};
