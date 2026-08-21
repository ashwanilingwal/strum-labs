/**
 * How a scoring result should look on screen.
 *
 * This is the single seam between "what the microphone decided" and "what the
 * player sees". Colours, glyphs and wording for every verdict live here and
 * nowhere else, so restyling the feedback — or translating it, or swapping the
 * glyph set — never means touching the detector, the scorer or the lane.
 *
 * Pure data and pure functions: no React, no CSS imports.
 */

import { CLOSE_MS, TIGHT_MS, type Grade, type SlotVerdict } from "../listen/scoring";

export interface GradeVisual {
  label: string;
  /** Single character shown on the slot itself. */
  glyph: string;
  /** A CSS custom property reference, usable directly in inline styles. */
  color: string;
  /** Class from globals.css that draws the slot's ring and glow. */
  className: string;
  /** One short line explaining what the player should do about it. */
  coaching: string;
}

export const GRADE_VISUALS: Record<Grade, GradeVisual> = {
  tight: {
    label: "Tight", glyph: "✓", color: "var(--tight)", className: "verdict-tight",
    coaching: "Right on the grid.",
  },
  close: {
    label: "Close", glyph: "•", color: "var(--close)", className: "verdict-close",
    coaching: "Nearly — keep the hand swinging evenly.",
  },
  loose: {
    label: "Loose", glyph: "!", color: "var(--loose)", className: "verdict-loose",
    coaching: "Well off the beat. Try it slower.",
  },
  missed: {
    label: "Missed", glyph: "✕", color: "var(--accent-deep)", className: "verdict-missed",
    coaching: "Nothing heard there. Keep the hand moving through it.",
  },
  extra: {
    label: "Extra", glyph: "+", color: "var(--extra)", className: "verdict-extra",
    coaching: "A strum the pattern didn't ask for.",
  },
};

export function gradeVisual(grade: Grade): GradeVisual {
  return GRADE_VISUALS[grade];
}

/** "12 ms early" / "on it" / "40 ms late". */
export function timingPhrase(errorMs: number): string {
  const rounded = Math.round(errorMs);
  if (Math.abs(rounded) <= 8) return "on it";
  return `${Math.abs(rounded)} ms ${rounded < 0 ? "early" : "late"}`;
}

/** Signed readout for compact displays: "+40", "-12", "0". */
export function signedMs(errorMs: number): string {
  const rounded = Math.round(errorMs);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/** Half-width of the timing meter, in ms. Errors beyond this pin to the edge. */
export const METER_RANGE_MS = 120;

/** Map a timing error onto 0..1 across the meter. 0.5 is dead on the beat. */
export function meterPosition(errorMs: number): number {
  const clamped = Math.max(-METER_RANGE_MS, Math.min(METER_RANGE_MS, errorMs));
  return (clamped / METER_RANGE_MS + 1) / 2;
}

/** Where the tight and close bands sit on the meter, as 0..1 fractions. */
export const METER_BANDS = {
  tight: { from: meterPosition(-TIGHT_MS), to: meterPosition(TIGHT_MS) },
  close: { from: meterPosition(-CLOSE_MS), to: meterPosition(CLOSE_MS) },
};

/**
 * The one-line summary shown under the big verdict. Chord and stroke mistakes
 * are worth more than a timing number when they happen, so they win.
 */
export function verdictHeadline(v: SlotVerdict, wantChord: string | null): string {
  if (v.grade === "extra") return "Extra strum";
  if (v.grade === "missed") return "Nothing heard";
  if (v.chordOk === false && v.heardChord && wantChord) return `Heard ${v.heardChord}, wanted ${wantChord}`;
  if (v.strokeOk === false) return "Wrong way — check up vs down";
  return timingPhrase(v.errorMs);
}
