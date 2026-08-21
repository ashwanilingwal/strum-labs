/**
 * Note / pitch primitives. Pure functions, no audio, no React.
 *
 * MIDI numbers are the common currency: 60 = middle C, 69 = A440. Frequencies
 * are only produced at the very edge (the synth) and consumed at the other
 * edge (pitch detection), so everything in between stays integer arithmetic.
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** 0 = C, 1 = C#, ... 11 = B. */
export type PitchClass = number;

/** Open-string MIDI notes, low E first. E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;

export const A4_HZ = 440;

export function midiToFreq(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ);
}

export function pitchClassOf(midi: number): PitchClass {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function noteName(midi: number): string {
  return NOTE_NAMES[pitchClassOf(midi)];
}

/** MIDI note for a fret on a string index (0 = low E). */
export function midiForFret(stringIndex: number, fret: number): number {
  return STANDARD_TUNING[stringIndex] + fret;
}

/** Parse a note name like "C#" or "Bb" into a pitch class. */
export function pitchClassOfName(name: string): PitchClass {
  const base = "C D EF G A B".indexOf(name[0].toUpperCase());
  if (base < 0) return 0;
  let pc = base;
  for (const ch of name.slice(1)) {
    if (ch === "#") pc += 1;
    if (ch === "b") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}
