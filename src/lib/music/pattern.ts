/**
 * The strumming pattern — the core data model.
 *
 * A pattern is a flat array of slots. Each bar contributes `slotsPerBar` slots,
 * so slot index and (bar, position) are interchangeable. Chords are stored one
 * per bar, which is what the editor exposes today; storing them as an array
 * rather than a single value is deliberate, so a future per-slot chord track is
 * a widening of the type rather than a migration.
 *
 * `slotsPerBar` is a field, not a constant, for the same reason: the editor
 * only offers 8 today, but sixteenths and triplets drop in without touching
 * the scheduler, the mic scorer or the storage layer.
 */

export type Stroke = "D" | "U" | "X" | "-";

export const STROKES: { id: Stroke; label: string; hint: string }[] = [
  { id: "D", label: "Down", hint: "Down-strum, rings out" },
  { id: "U", label: "Up", hint: "Up-strum, rings out" },
  { id: "X", label: "Mute", hint: "Percussive chuck, no pitch" },
  { id: "-", label: "Skip", hint: "Hand keeps moving, strings untouched" },
];

export interface Pattern {
  id: string;
  name: string;
  /** 1..4 */
  bars: number;
  /** 8 = eighth notes. 4, 12 and 16 are supported by everything downstream. */
  slotsPerBar: 4 | 8 | 12 | 16;
  beatsPerBar: number;
  /** Length is always bars * slotsPerBar. */
  strokes: Stroke[];
  /** Slot indices played harder. */
  accents: number[];
  /** One chord id per bar. Length is always `bars`. */
  chords: string[];
  bpm: number;
}

export const MIN_BPM = 40;
export const MAX_BPM = 220;
export const MAX_BARS = 4;

/** Count labels for one bar, e.g. 1 & 2 & 3 & 4 &. */
export function countLabels(slotsPerBar: number, beatsPerBar: number): string[] {
  const per = slotsPerBar / beatsPerBar;
  const out: string[] = [];
  for (let i = 0; i < slotsPerBar; i++) {
    const beat = Math.floor(i / per);
    const sub = i % per;
    if (sub === 0) out.push(String(beat + 1));
    else if (per === 2) out.push("&");
    else if (per === 3) out.push(sub === 1 ? "&" : "a");
    else out.push(["", "e", "&", "a"][sub] || "");
  }
  return out;
}

/**
 * The direction the hand is travelling at each slot, regardless of whether it
 * touches the strings. Downs land on the numbers, ups on the offbeats — this
 * is what makes the "keep the hand moving" guidance visualisable.
 */
export function handDirection(slotsPerBar: number, beatsPerBar: number, index: number): "down" | "up" {
  const per = slotsPerBar / beatsPerBar;
  if (per <= 1) return "down";
  if (per === 3) return index % 3 === 0 ? "down" : "up";
  return index % 2 === 0 ? "down" : "up";
}

/** Seconds each slot occupies at a given tempo. */
export function slotSeconds(p: Pattern, bpm: number): number {
  return (60 / bpm) * (p.beatsPerBar / p.slotsPerBar);
}

/** Seconds for the whole loop. */
export function loopSeconds(p: Pattern, bpm: number): number {
  return slotSeconds(p, bpm) * p.strokes.length;
}

/** Slot indices that land on a beat — where the metronome clicks. */
export function beatSlots(p: Pattern): number[] {
  const per = p.slotsPerBar / p.beatsPerBar;
  const out: number[] = [];
  for (let i = 0; i < p.strokes.length; i++) if (i % per === 0) out.push(i);
  return out;
}

export function barOfSlot(p: Pattern, slot: number): number {
  return Math.floor(slot / p.slotsPerBar) % p.bars;
}

export function chordAtSlot(p: Pattern, slot: number): string {
  return p.chords[barOfSlot(p, slot)] ?? p.chords[0];
}

/** Does this slot make a sound the microphone could hear? */
export function isAudible(stroke: Stroke): boolean {
  return stroke === "D" || stroke === "U" || stroke === "X";
}

/**
 * Force a pattern into a self-consistent state: stroke and chord arrays sized
 * to `bars`, bpm clamped, accents in range. Every mutation in the editor goes
 * through this, so no other code has to defend against a ragged pattern.
 */
export function normalise(p: Pattern): Pattern {
  const bars = Math.max(1, Math.min(MAX_BARS, Math.round(p.bars)));
  const total = bars * p.slotsPerBar;
  const strokes: Stroke[] = Array.from({ length: total }, (_, i) => p.strokes[i] ?? "-");
  const chords = Array.from({ length: bars }, (_, i) => p.chords[i] ?? p.chords[p.chords.length - 1] ?? "G");
  return {
    ...p,
    bars,
    strokes,
    chords,
    accents: p.accents.filter((a) => a >= 0 && a < total),
    bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(p.bpm))),
  };
}

export function emptyPattern(): Pattern {
  return normalise({
    id: newPatternId(),
    name: "Untitled pattern",
    bars: 1,
    slotsPerBar: 8,
    beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [0, 4],
    chords: ["G"],
    bpm: 80,
  });
}

export function newPatternId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Compact human-readable summary, e.g. "D - D U - U D U". */
export function strokeString(p: Pattern): string {
  return p.strokes.join(" ");
}

const PRESET_SOURCE: Pattern[] = [
  {
    id: "preset-downs",
    name: "All downs",
    bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "-", "D", "-", "D", "-"],
    accents: [0], chords: ["Em"], bpm: 70,
  },
  {
    id: "preset-eighths",
    name: "Straight eighths",
    bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "U", "D", "U", "D", "U", "D", "U"],
    accents: [0, 4], chords: ["G"], bpm: 80,
  },
  {
    id: "preset-folk",
    name: "The one pattern",
    bars: 2, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U", "D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [0, 4, 8, 12], chords: ["G", "C"], bpm: 78,
  },
  {
    id: "preset-chuck",
    name: "Backbeat chuck",
    bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "U", "X", "U", "D", "U", "X", "U"],
    accents: [2, 6], chords: ["Am"], bpm: 88,
  },
  {
    id: "preset-fourchord",
    name: "Four chords",
    bars: 4, slotsPerBar: 8, beatsPerBar: 4,
    strokes: [
      "D", "-", "D", "U", "-", "U", "D", "U",
      "D", "-", "D", "U", "-", "U", "D", "U",
      "D", "-", "D", "U", "-", "U", "D", "U",
      "D", "-", "D", "U", "-", "U", "D", "U",
    ],
    accents: [0, 8, 16, 24], chords: ["G", "D", "Em", "C"], bpm: 74,
  },
];

export const PRESETS: Pattern[] = PRESET_SOURCE.map(normalise);
