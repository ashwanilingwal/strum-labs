/**
 * One-shot previews for the Learn page: hear a chord or a whole pattern
 * without standing up the transport. Everything is scheduled against the
 * audio clock in a single pass — for a bounded preview, booking every strum
 * up front is simpler and just as accurate as a lookahead loop.
 */

import { getEngine } from "./engine";
import { isInstrument } from "./samples";
import { chordById, chordMidiNotes } from "../music/chords";
import { isAudible, slotSeconds, type Pattern } from "../music/pattern";
import { appStore } from "../storage/settings";

async function ready() {
  const engine = getEngine();
  await engine.init();
  const tone = appStore.get().audio.tone;
  engine.setTone(tone);
  if (isInstrument(tone)) void engine.loadSamples();
  // A preview replaces whatever was previewing — two overlapping patterns is
  // never what a tap meant.
  engine.silence();
  return engine;
}

export async function previewChord(chordId: string) {
  const chord = chordById(chordId);
  if (!chord) return;
  const engine = await ready();
  engine.strum(chordMidiNotes(chord), "down", { gain: 0.75 });
}

/** Play the pattern through once, no click. */
export async function previewPattern(pattern: Pattern) {
  const engine = await ready();
  const step = slotSeconds(pattern, pattern.bpm);
  const t0 = engine.currentTime + 0.1;
  pattern.strokes.forEach((stroke, i) => {
    if (!isAudible(stroke)) return;
    const chord = chordById(pattern.chords[Math.floor(i / pattern.slotsPerBar)] ?? pattern.chords[0]);
    if (!chord) return;
    engine.strum(chordMidiNotes(chord), stroke === "U" ? "up" : "down", {
      at: t0 + i * step,
      gain: pattern.accents.includes(i) ? 0.85 : 0.62,
      muted: stroke === "X",
    });
  });
}

/**
 * Play a sequence of single notes at a gentle, even pace — the "hear it"
 * demo for exercise games. Same-string repeats steal their voice, exactly as
 * fingers would.
 */
export async function previewNotes(
  notes: { midi: number; voice?: number }[],
  stepS = 0.55,
) {
  const engine = await ready();
  const t0 = engine.currentTime + 0.08;
  notes.forEach((note, i) => {
    engine.pluck(note.midi, { at: t0 + i * stepS, gain: 0.55, voice: note.voice });
  });
}

export function stopPreview() {
  getEngine().silence();
}
