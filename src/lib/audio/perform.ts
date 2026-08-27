/**
 * What a single slot sounds like.
 *
 * Pulled out of the transport hook deliberately: "change what happens when a
 * slot fires" is one of the most likely future edits (fingerpicking, per-string
 * plucks, drum sounds, a bass note on the beat), and it should be a change to
 * this one function rather than surgery on the scheduling loop.
 *
 * It is a plain function, not a hook — it takes the absolute audio time it is
 * given and never reads the clock, so the caller keeps full control of timing.
 */

import { chordById, chordMidiNotes, soundingStrings } from "../music/chords";
import { chordAtSlot, isAudible, type Pattern } from "../music/pattern";
import type { AudioEngine } from "./engine";

export interface PerformOptions {
  /** Play the guitar part. */
  guitar: boolean;
  /** Play the metronome click. */
  click: boolean;
  /** Play the synthesised drum groove under the pattern. */
  backing?: boolean;
}

/** True when this slot falls on a beat, i.e. where the metronome ticks. */
export function isBeatSlot(pattern: Pattern, slot: number): boolean {
  const perBeat = pattern.slotsPerBar / pattern.beatsPerBar;
  return slot % perBeat === 0;
}

/** True when this slot starts a bar, i.e. the accented click. */
export function isBarStart(pattern: Pattern, slot: number): boolean {
  return slot % pattern.slotsPerBar === 0;
}

/**
 * Schedule everything one slot should produce at `time`.
 * Returns nothing — it is pure side effect against the audio graph.
 */
export function performSlot(
  engine: AudioEngine,
  pattern: Pattern,
  slot: number,
  time: number,
  opts: PerformOptions,
): void {
  if (opts.click && isBeatSlot(pattern, slot)) {
    engine.click(time, isBarStart(pattern, slot));
  }

  if (opts.backing) {
    // The eternal rock beat: kick on the odd-numbered beats, snare answering
    // on the even ones, hats on the eighths — enough groove to place the
    // pattern against without competing with it. Works at any slotsPerBar.
    const slotsPerBeat = pattern.slotsPerBar / pattern.beatsPerBar;
    const inBar = slot % pattern.slotsPerBar;
    if (inBar % slotsPerBeat === 0) {
      engine.drum(time, Math.floor(inBar / slotsPerBeat) % 2 === 0 ? "kick" : "snare");
    }
    const eighth = Math.max(1, Math.floor(slotsPerBeat / 2));
    if (inBar % eighth === 0) engine.drum(time, "hat");
  }

  const stroke = pattern.strokes[slot];
  if (!opts.guitar || !isAudible(stroke)) return;

  const chord = chordById(chordAtSlot(pattern, slot));
  if (!chord) return;

  engine.strum(chordMidiNotes(chord), stroke === "U" ? "up" : "down", {
    at: time,
    gain: pattern.accents.includes(slot) ? 0.85 : 0.62,
    muted: stroke === "X",
    // Which physical string each note is on, so re-striking damps the last one.
    voices: soundingStrings(chord),
  });
}
