/**
 * The note-game matcher: "play this note, at your own pace".
 *
 * No timer anywhere — this is the untimed half of practice. The player sounds
 * the target note; when the pitch detector reads it steadily for a few frames,
 * the target counts as hit and the game advances after a short cooldown (so
 * the still-ringing string cannot instantly claim the next target).
 *
 * Pure and synchronous by design: it consumes (hz, timestamp) frames and
 * returns what happened, so the whole game logic can be verified with
 * synthetic frames — no microphone, no React, no clock of its own.
 */

export interface NoteMatcher {
  targetMidi: number;
  /** Consecutive matching frames seen so far. */
  streak: number;
  /** Ignore everything before this time (ms). */
  cooldownUntil: number;
}

/** Frames of steady pitch required. At ~50ms a frame this is ~200ms of note. */
export const FRAMES_TO_HIT = 4;
/** How far off the reading may sit and still count. Generous on purpose:
 *  beginners' strings are rarely freshly tuned, and this is a finding game,
 *  not a tuning game. */
export const TOLERANCE_CENTS = 60;
/** Post-hit deafness, so the ringing string cannot claim the next target. */
export const COOLDOWN_MS = 700;

export function createMatcher(targetMidi: number, now = 0): NoteMatcher {
  return { targetMidi, streak: 0, cooldownUntil: now + COOLDOWN_MS };
}

export function centsOff(hz: number, targetMidi: number): number {
  const targetHz = 440 * Math.pow(2, (targetMidi - 69) / 12);
  return 1200 * Math.log2(hz / targetHz);
}

export interface FeedResult {
  hit: boolean;
  /** 0..1 progress toward the hit, for the UI's fill. */
  progress: number;
  /** What was heard, for "that was a D, we want an E" feedback. */
  heardMidi: number | null;
}

export function feed(m: NoteMatcher, hz: number | null, now: number): FeedResult {
  if (now < m.cooldownUntil || hz === null) {
    if (hz === null) m.streak = 0;
    return { hit: false, progress: m.streak / FRAMES_TO_HIT, heardMidi: null };
  }

  const off = centsOff(hz, m.targetMidi);
  const heardMidi = Math.round(m.targetMidi + off / 100);

  if (Math.abs(off) <= TOLERANCE_CENTS) {
    m.streak += 1;
    if (m.streak >= FRAMES_TO_HIT) {
      m.streak = 0;
      m.cooldownUntil = now + COOLDOWN_MS;
      return { hit: true, progress: 1, heardMidi };
    }
  } else {
    m.streak = 0;
  }
  return { hit: false, progress: m.streak / FRAMES_TO_HIT, heardMidi };
}
