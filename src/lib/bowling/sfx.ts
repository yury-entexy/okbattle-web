'use client';

// Synthesised lane sounds: the ball's rumble and the pins' crash. Made with Web Audio noise, so
// there are no extra files to download for an ad visitor.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let lastCrash = 0;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a tap so later sounds are allowed. */
export function unlockLane() {
  audio();
}

export function startRumble() {
  const c = audio();
  if (!c || !noise || rumble) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.35, c.currentTime, 0.15);
  src.connect(lp).connect(gain).connect(c.destination);
  src.start();
  rumble = { src, gain };
}

export function stopRumble() {
  if (!rumble || !ctx) return;
  const { src, gain } = rumble;
  rumble = null;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  src.stop(ctx.currentTime + 0.5);
}

/** Pins clattering; `strength` is how many collisions happened in this frame. */
export function crash(strength: number) {
  const c = audio();
  if (!c || !noise) return;
  const now = c.currentTime;
  if (now - lastCrash < 0.04) return;
  lastCrash = now;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 + Math.random() * 1600;
  bp.Q.value = 1.2;
  const gain = c.createGain();
  const v = Math.min(0.9, 0.2 + strength * 0.12);
  gain.gain.setValueAtTime(v, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18 + Math.random() * 0.1);
  src.connect(bp).connect(gain).connect(c.destination);
  src.start(now, Math.random());
  src.stop(now + 0.35);
}
