/**
 * The two things a practice pattern is made of, kept apart.
 *
 * A strum style is a rhythm — one bar of strokes, no chords. A progression is a
 * chord sequence — no rhythm. `buildPattern` multiplies them together.
 *
 * Splitting them is what lets the app offer "pick a chord" and "pick a
 * progression" as two ways into the same practice screen without duplicating a
 * single stroke grid, and it means adding one strum style gives every
 * progression a new feel for free.
 */

import {
  newPatternId, normalise, type Pattern, type Stroke,
} from "./pattern";

export interface StrumStyle {
  id: string;
  name: string;
  slotsPerBar: 4 | 8 | 12 | 16;
  beatsPerBar: number;
  /** Exactly one bar. Repeated across however many chords it is given. */
  strokes: Stroke[];
  accents: number[];
  /** A sensible starting tempo for this feel. */
  bpm: number;
  hint: string;
}

export const STRUM_STYLES: StrumStyle[] = [
  {
    id: "downs", name: "All downs", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "-", "D", "-", "D", "-"], accents: [0], bpm: 70,
    hint: "One stroke a beat. Where everyone starts.",
  },
  {
    id: "eighths", name: "Straight eighths", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "U", "D", "U", "D", "U", "D", "U"], accents: [0, 4], bpm: 80,
    hint: "Down on the numbers, up on the ands. Never stop moving.",
  },
  {
    id: "folk", name: "The one pattern", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"], accents: [0, 4], bpm: 78,
    hint: "D · DU · UDU. If you only learn one, learn this.",
  },
  {
    id: "ddu", name: "Down down up", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "D", "-", "D", "U"], accents: [0, 4], bpm: 76,
    hint: "Half the folk pattern, twice a bar. Good stepping stone.",
  },
  {
    id: "chuck", name: "Backbeat chuck", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "U", "X", "U", "D", "U", "X", "U"], accents: [2, 6], bpm: 88,
    hint: "Muted chuck on 2 and 4. Instant groove.",
  },
  {
    id: "offbeat", name: "Offbeat skank", slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["-", "U", "-", "U", "-", "U", "-", "U"], accents: [], bpm: 92,
    hint: "Only the ands. Reggae and ska live here.",
  },
];

export interface Progression {
  id: string;
  name: string;
  /** One chord per bar. */
  chords: string[];
  hint: string;
}

/**
 * Four bars maximum, because that is what the pattern model holds. A 12-bar
 * blues needs `MAX_BARS` raised before it can go in here.
 */
export const PROGRESSIONS: Progression[] = [
  { id: "four-chords", name: "Four chords", chords: ["G", "D", "Em", "C"], hint: "I-V-vi-IV. Half the songs you know." },
  { id: "sad-four", name: "Sad four chords", chords: ["Em", "C", "G", "D"], hint: "Same chords starting on the minor. Sounds like a different song." },
  { id: "fifties", name: "Fifties", chords: ["C", "Am", "F", "G"], hint: "Doo-wop. Stand By Me." },
  { id: "pop-punk", name: "Pop punk", chords: ["C", "G", "Am", "F"], hint: "I-V-vi-IV in C. Play it fast." },
  { id: "andalusian", name: "Andalusian", chords: ["Am", "G", "F", "E"], hint: "Descending and Spanish. Ends wanting to start again." },
  { id: "two-five-one", name: "Two five one", chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"], hint: "The jazz cadence. Worth the barre practice." },
  { id: "folk-two", name: "Two chord folk", chords: ["G", "C"], hint: "Two bars, endless songs. Good for getting the change clean." },
  { id: "minor-swap", name: "Minor swap", chords: ["Am", "F"], hint: "Two bars, moody. Easy fingering, hard to make groove." },
];

/**
 * Combine a rhythm with a chord sequence.
 *
 * The stroke grid is one bar and tiles across however many chords arrive, which
 * is how a six-item strum list and an eight-item progression list produce
 * forty-eight patterns without storing any of them.
 */
export function buildPattern(
  style: StrumStyle,
  chords: string[],
  name?: string,
): Pattern {
  const bars = Math.max(1, chords.length);
  const strokes: Stroke[] = [];
  const accents: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    strokes.push(...style.strokes);
    accents.push(...style.accents.map((a) => a + bar * style.slotsPerBar));
  }
  return normalise({
    id: newPatternId(),
    name: name ?? `${chords.join(" ")} · ${style.name}`,
    bars,
    slotsPerBar: style.slotsPerBar,
    beatsPerBar: style.beatsPerBar,
    strokes,
    accents,
    chords: [...chords],
    bpm: style.bpm,
  });
}

/** One chord, drilled against a rhythm. */
export function buildChordDrill(style: StrumStyle, chordId: string): Pattern {
  return buildPattern(style, [chordId], `${chordId} · ${style.name}`);
}

export function strumStyleById(id: string): StrumStyle | undefined {
  return STRUM_STYLES.find((s) => s.id === id);
}
