/**
 * Tunings, and how far off a note is.
 *
 * Cents rather than hertz throughout: a hertz is a different amount of "out of
 * tune" at each end of the instrument — 1 Hz is 21 cents at low E and 2 cents
 * at the top string — so a needle calibrated in hertz would be far more
 * forgiving on the bass strings, exactly where tuning errors are most audible.
 */

import { midiToFreq, noteName } from "./theory";

export interface TuningString {
  /** 0 = lowest string. */
  index: number;
  label: string;
  midi: number;
  hz: number;
}

export interface Tuning {
  id: string;
  name: string;
  /** Low to high. */
  midi: number[];
  hint: string;
}

export const TUNINGS: Tuning[] = [
  { id: "standard", name: "Standard", midi: [40, 45, 50, 55, 59, 64], hint: "E A D G B E" },
  { id: "drop-d", name: "Drop D", midi: [38, 45, 50, 55, 59, 64], hint: "D A D G B E" },
  { id: "half-down", name: "Half step down", midi: [39, 44, 49, 54, 58, 63], hint: "Eb Ab Db Gb Bb Eb" },
  { id: "open-g", name: "Open G", midi: [38, 43, 50, 55, 59, 62], hint: "D G D G B D" },
  { id: "dadgad", name: "DADGAD", midi: [38, 45, 50, 55, 57, 62], hint: "D A D G A D" },
];

export function stringsOf(tuning: Tuning): TuningString[] {
  return tuning.midi.map((midi, index) => ({
    index,
    label: noteName(midi),
    midi,
    hz: midiToFreq(midi),
  }));
}

/** How far `hz` sits from `targetHz`, in cents. Positive is sharp. */
export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/**
 * Which string is being played, and by how much it is out.
 *
 * Nearest in cents rather than in hertz, so a badly flat top string cannot be
 * mistaken for a well-tuned lower one purely because the numbers are closer.
 * Anything more than 400 cents (a third) from every string is rejected — at
 * that distance a guess is meaningless and a wrong string label is worse than
 * none.
 */
export function nearestString(
  hz: number,
  tuning: Tuning,
): { string: TuningString; cents: number } | null {
  const strings = stringsOf(tuning);
  let best: { string: TuningString; cents: number } | null = null;
  for (const s of strings) {
    const cents = centsBetween(hz, s.hz);
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { string: s, cents };
  }
  if (!best || Math.abs(best.cents) > 400) return null;
  return best;
}

/** In tune to within this many cents. Beyond ~5 a guitar sounds sour in chords. */
export const IN_TUNE_CENTS = 5;

export function tuningVerdict(cents: number): "flat" | "in-tune" | "sharp" {
  if (cents < -IN_TUNE_CENTS) return "flat";
  if (cents > IN_TUNE_CENTS) return "sharp";
  return "in-tune";
}
