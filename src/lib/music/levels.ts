/**
 * The game: a ladder of levels, each one a chord set, a strum and a tempo.
 *
 * Levels are ordered by what a beginner's hands can do, not by song: one
 * chord and downstrums first, then a change, then ups, then the four-chord
 * progression and the one strumming pattern that plays half of pop. Add a
 * level where it belongs on that ladder, not at the end.
 *
 * Passing is deliberately forgiving — 60% of strums on the beat and 30% of
 * them recognised as the right chord — because a level is a reward loop, not
 * an exam. Stars stretch the ceiling for players who want it.
 */

import { normalise, type Pattern, type Stroke } from "./pattern";

export interface GameLevel {
  /** 1-based, and the order on the map. */
  n: number;
  title: string;
  emoji: string;
  blurb: string;
  /** One chord per bar. */
  chords: string[];
  /** One bar of strokes (eight slots), tiled across the chords. */
  bar: Stroke[];
  bpm: number;
  /** Times the whole progression loops before the level ends. */
  loops: number;
}

const DOWNS: Stroke[] = ["D", "-", "D", "-", "D", "-", "D", "-"];
const DOWN_UPS: Stroke[] = ["D", "U", "D", "U", "D", "U", "D", "U"];
const THE_ONE: Stroke[] = ["D", "-", "D", "U", "-", "U", "D", "U"];

export const GAME_LEVELS: GameLevel[] = [
  { n: 1, title: "First strums", emoji: "🌱", blurb: "One chord, all downstrums. Land them on the drums.", chords: ["G"], bar: DOWNS, bpm: 70, loops: 4 },
  { n: 2, title: "Two chords", emoji: "🌙", blurb: "G to D and back — change on the bar line.", chords: ["G", "D"], bar: DOWNS, bpm: 72, loops: 3 },
  { n: 3, title: "Down and up", emoji: "⭐", blurb: "Every eighth now: down, up, down, up.", chords: ["G"], bar: DOWN_UPS, bpm: 76, loops: 4 },
  { n: 4, title: "The switch", emoji: "🚀", blurb: "Down-ups across a chord change.", chords: ["G", "C"], bar: DOWN_UPS, bpm: 80, loops: 3 },
  { n: 5, title: "Four chords", emoji: "🪐", blurb: "The progression behind a thousand songs.", chords: ["G", "D", "Em", "C"], bar: DOWNS, bpm: 84, loops: 2 },
  { n: 6, title: "The one pattern", emoji: "☄️", blurb: "D · D U · U D U — the strum that plays everything.", chords: ["G", "D", "Em", "C"], bar: THE_ONE, bpm: 88, loops: 2 },
  { n: 7, title: "Minor mood", emoji: "🌌", blurb: "Am, C, G, Em — a sadder sky, same strum.", chords: ["Am", "C", "G", "Em"], bar: THE_ONE, bpm: 92, loops: 2 },
  { n: 8, title: "Boss level", emoji: "👑", blurb: "E, A, D at speed, with chucks. Everything you have.", chords: ["E", "A", "D", "A"], bar: ["D", "X", "D", "U", "X", "U", "D", "U"], bpm: 100, loops: 2 },
];

/** The reserved pattern id the game plays through. Never a saved pattern. */
export const LEVEL_PATTERN_ID = "game-level";

export function levelByNumber(n: number): GameLevel {
  return GAME_LEVELS.find((l) => l.n === n) ?? GAME_LEVELS[0];
}

export function levelPattern(level: GameLevel): Pattern {
  return normalise({
    id: LEVEL_PATTERN_ID,
    name: `Level ${level.n} · ${level.title}`,
    bars: level.chords.length,
    slotsPerBar: 8,
    beatsPerBar: 4,
    strokes: level.chords.flatMap(() => level.bar),
    accents: [0],
    chords: [...level.chords],
    bpm: level.bpm,
  });
}

/** Strums the level asks for, start to finish. */
export function levelExpectedStrums(level: GameLevel): number {
  const perBar = level.bar.filter((s) => s === "D" || s === "U" || s === "X").length;
  return level.loops * level.chords.length * perBar;
}

export const PASS_TIMING = 0.6;
export const PASS_CHORDS = 0.3;

export interface LevelResult {
  passed: boolean;
  /** Share of the level's strums that landed on the beat (tight). */
  timing: number;
  /** Share of the strums played that were heard as the right chord. */
  chords: number;
  stars: 0 | 1 | 2 | 3;
}

/**
 * Timing is judged against what the level ASKED for (a strum you never
 * played cannot be on time); chords against what you actually played (the
 * matcher only speaks when sure, and silence is not a wrong chord).
 */
export function scoreLevel(
  level: GameLevel,
  stats: { tight: number; hits: number; chordRight: number },
): LevelResult {
  const expected = levelExpectedStrums(level);
  const timing = expected ? Math.min(1, stats.tight / expected) : 0;
  const chords = stats.hits ? stats.chordRight / stats.hits : 0;
  const passed = timing >= PASS_TIMING && chords >= PASS_CHORDS;
  const stars: LevelResult["stars"] = !passed ? 0
    : timing >= 0.9 && chords >= 0.6 ? 3
    : timing >= 0.75 ? 2
    : 1;
  return { passed, timing, chords, stars };
}

/** The highest level a player may attempt: one past the last one passed. */
export function unlockedUpTo(results: Record<number, LevelResult>): number {
  let top = 1;
  for (const l of GAME_LEVELS) {
    if (results[l.n]?.passed) top = Math.max(top, Math.min(GAME_LEVELS.length, l.n + 1));
  }
  return top;
}
