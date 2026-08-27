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

/**
 * Base labels, used where no single timing error applies — aggregate stats and
 * legends. Per-strum feedback uses `verdictVisual`, which knows the direction.
 */
export const GRADE_VISUALS: Record<Grade, GradeVisual> = {
  tight: {
    label: "On time", glyph: "\u2713", color: "var(--tight)", className: "verdict-tight",
    coaching: "Right on the beat.",
  },
  close: {
    label: "Nearly", glyph: "\u2022", color: "var(--close)", className: "verdict-close",
    coaching: "You're a little off \u2014 ease onto the click.",
  },
  loose: {
    label: "Out", glyph: "!", color: "var(--loose)", className: "verdict-loose",
    coaching: "Well off the beat \u2014 drop the tempo and groove with the click.",
  },
  missed: {
    label: "Missed", glyph: "\u2715", color: "var(--fg-dim)", className: "verdict-missed",
    coaching: "Nothing heard there. Keep the hand moving through it.",
  },
  extra: {
    label: "Extra", glyph: "+", color: "var(--extra)", className: "verdict-extra",
    coaching: "A strum the pattern didn't ask for.",
  },
};

/**
 * Per-strum feedback, in plain words.
 *
 * The grade alone cannot say which way to correct — direction lives in the
 * sign of the error — so the label is derived from both. The coaching says
 * "go slower / go faster" rather than the trade terms (rushing, dragging):
 * a beginner should not need a glossary to act on a verdict (asked for
 * explicitly, 2026-08-27).
 */
export function verdictVisual(grade: Grade, errorMs: number): GradeVisual {
  const base = GRADE_VISUALS[grade];
  if (grade !== "close" && grade !== "loose") return base;

  const early = errorMs < 0;
  return {
    ...base,
    glyph: early ? "\u00ab" : "\u00bb",
    label: grade === "close"
      ? (early ? "A touch early" : "A touch late")
      : (early ? "Too early" : "Too late"),
    coaching: grade === "close"
      ? (early
          ? "You're a little off — go a touch slower and let the click lead."
          : "You're a little off — go a touch faster to meet the click.")
      : (early
          ? "You're ahead of the beat — go slower and wait for the click."
          : "You're behind the beat — go faster, it has already landed."),
  };
}

export function gradeVisual(grade: Grade): GradeVisual {
  return GRADE_VISUALS[grade];
}

/**
 * The visual for a whole verdict, chord check included.
 *
 * A confidently wrong chord OUTRANKS good timing: a green tick used to mean
 * only "on the beat", and hitting the beat with the wrong chord still read
 * as success (called out explicitly, 2026-08-27). When the chord checker
 * abstains — below its confidence gate, or a muted chuck — the timing grade
 * stands alone, which is honest: silence, not a guess, in both directions.
 */
export function verdictVisualFor(v: SlotVerdict): GradeVisual {
  if (v.chordOk === false && v.grade !== "missed" && v.grade !== "extra") {
    return {
      label: "Wrong chord",
      glyph: "≠",
      color: "var(--extra)",
      className: "verdict-extra",
      coaching: "The timing landed, but that isn't the bar's chord — check your shape.",
    };
  }
  return verdictVisual(v.grade, v.errorMs);
}

/** "12 ms early" / "bang on" / "40 ms late". */
export function timingPhrase(errorMs: number): string {
  const rounded = Math.round(errorMs);
  if (Math.abs(rounded) <= 8) return "bang on";
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
  if (v.grade === "extra") return "A strum the pattern didn't ask for";
  if (v.grade === "missed") return "Nothing heard there";
  if (v.chordOk === false && v.heardChord && wantChord) return `Heard ${v.heardChord}, wanted ${wantChord}`;
  if (v.strokeOk === false) return "Wrong way — check up vs down";
  return timingPhrase(v.errorMs);
}
