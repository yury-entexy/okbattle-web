/**
 * Ten-pin scoring. A player's game is a list of frames, each the pins knocked down by each roll.
 * Frames 1–9 have one roll for a strike, otherwise two; the 10th has a third roll after a strike
 * or a spare.
 */

export const FRAMES = 10;
export const PINS = 10;

export type Frame = number[];

const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);

/** True when this frame takes no more rolls. */
export function frameDone(frame: Frame, index: number): boolean {
  if (index < FRAMES - 1) return frame[0] === PINS || frame.length === 2;
  if (frame.length < 2) return false;
  if (frame.length === 3) return true;
  return frame[0] + frame[1] < PINS;
}

/** Pins standing at the start of the next roll of this frame (all ten after a strike or spare in the 10th). */
export function pinsReset(frame: Frame, index: number): boolean {
  if (!frame.length) return true;
  if (index < FRAMES - 1) return false;
  if (frame.length === 1) return frame[0] === PINS;
  if (frame.length === 2) return frame[0] === PINS ? frame[1] === PINS : frame[0] + frame[1] === PINS;
  return false;
}

/** Running totals per frame; null where a bonus roll has not been thrown yet. */
export function totals(frames: Frame[]): Array<number | null> {
  const rolls = frames.flat();
  const out: Array<number | null> = [];
  let pos = 0;
  let total = 0;
  for (let i = 0; i < FRAMES; i++) {
    const f = frames[i];
    if (!f || !f.length) {
      out.push(null);
      continue;
    }
    let value: number | null;
    if (i === FRAMES - 1) {
      value = frameDone(f, i) ? sum(f) : null;
    } else if (f[0] === PINS) {
      value = rolls.length > pos + 2 ? PINS + rolls[pos + 1] + rolls[pos + 2] : null;
    } else if (f.length === 2 && f[0] + f[1] === PINS) {
      value = rolls.length > pos + 2 ? PINS + rolls[pos + 2] : null;
    } else {
      value = f.length === 2 ? f[0] + f[1] : null;
    }
    pos += f.length;
    if (value === null || (out.length && out[out.length - 1] === null)) {
      out.push(null);
      continue;
    }
    total += value;
    out.push(total);
  }
  return out;
}

/** The final or current score: the last known running total. */
export function score(frames: Frame[]): number {
  const t = totals(frames).filter((x): x is number => x !== null);
  return t.length ? t[t.length - 1] : 0;
}

/** Score-sheet marks for a frame: X strike, / spare, − miss, digits otherwise. */
export function marks(frame: Frame, index: number): string[] {
  const out: string[] = [];
  let standing = PINS;
  let fresh = true;
  for (const n of frame) {
    if (fresh && n === PINS) out.push('X');
    else if (!fresh && n === standing) out.push('/');
    else out.push(n === 0 ? '−' : String(n));
    standing -= n;
    fresh = false;
    if (standing === 0 && index === FRAMES - 1) {
      standing = PINS;
      fresh = true;
    }
  }
  return out;
}
