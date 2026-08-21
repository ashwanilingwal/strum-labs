/**
 * Turning detected onsets into a verdict per slot.
 *
 * The scorer holds the expectations for the current loop and matches each
 * incoming onset to the nearest one. Two details do most of the work:
 *
 * - **Latency.** An onset's timestamp is when the sound reached the worklet,
 *   which is after the microphone, the driver and the browser have each taken
 *   their cut. The metronome click has its own output latency going the other
 *   way. Both are constant, so they are one number: `offsetMs`. It is seeded
 *   from the AudioContext's reported latencies and can be nudged, and the
 *   scorer reports the *mean* error separately so a consistent bias is visible
 *   rather than being blamed on the player.
 *
 * - **Missing beats count.** Only scoring what you did hear flatters everyone.
 *   Slots whose window has closed with nothing matched are recorded as misses.
 */

import { chordAtSlot, isAudible, slotSeconds, type Pattern } from "../music/pattern";
import type { Onset } from "./detector";

export type Grade = "tight" | "close" | "loose" | "missed" | "extra";

export const TIGHT_MS = 30;
export const CLOSE_MS = 70;

/** How close to the app's own note an onset must be to be suspected bleed. */
const BLEED_WINDOW_S = 0.022;
/** How far above the quiet floor an onset must sit to be believed. */
const BLEED_MARGIN_DB = 5;
/** Onset levels kept for estimating that floor. */
const LEVEL_HISTORY = 24;

export interface SlotVerdict {
  slot: number;
  cycle: number;
  grade: Grade;
  /** Positive = late. Milliseconds. */
  errorMs: number;
  /** Did the direction match what the pattern asked for? null = not confident. */
  strokeOk: boolean | null;
  /** Did the chord match the bar's chord? null = not confident. */
  chordOk: boolean | null;
  heardChord: string | null;
}

export interface Expectation {
  slot: number;
  cycle: number;
  time: number;
  wantStroke: "down" | "up" | "mute";
  wantChord: string;
  matched: boolean;
}

export interface SessionStats {
  hits: number;
  missed: number;
  extra: number;
  tight: number;
  /** Mean signed error in ms across matched hits. A steady bias shows up here. */
  meanErrorMs: number;
  /** Spread of the errors. This is the number that actually improves. */
  spreadMs: number;
  accuracy: number;
  chordChecked: number;
  chordRight: number;
  strokeChecked: number;
  strokeRight: number;
}

export function estimateOffsetMs(ctx: AudioContext | null): number {
  if (!ctx) return 0;
  const base = (ctx.baseLatency ?? 0) * 1000;
  const out = ((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000;
  return Math.round(base + out);
}

export class Scorer {
  private expectations: Expectation[] = [];
  private errors: number[] = [];
  private verdicts: SlotVerdict[] = [];
  private stats: SessionStats = emptyStats();

  /** Recent onset levels, used to estimate what the bleed floor sounds like. */
  private levels: number[] = [];
  /** Set by the caller: is the app's own guitar actually audible right now? */
  public guitarAudible = false;
  public duckMode: "mute" | "subtract" | "off" = "mute";

  constructor(
    private pattern: Pattern,
    private bpm: number,
    /** Milliseconds to subtract from every onset before comparing. */
    public offsetMs: number,
    private onVerdict: (v: SlotVerdict, stats: SessionStats) => void,
  ) {}

  /**
   * Is this onset probably the app hearing its own playback?
   *
   * Only asked in "subtract" mode. Two conditions must both hold: the onset
   * lands almost exactly where the app played a note, and it is no louder than
   * the quiet end of what we have been hearing. Bleed through a speaker is
   * consistent and quiet; a guitar in the room is markedly louder.
   *
   * This cannot be perfect. A quiet, perfectly-timed strum looks exactly like
   * bleed, and will occasionally be dropped — which is why muting is the
   * default and this is opt-in.
   */
  private looksLikeBleed(onset: Onset, t: number): boolean {
    if (this.duckMode !== "subtract" || !this.guitarAudible) return false;

    const coincides = this.expectations.some((e) => Math.abs(t - e.time) <= BLEED_WINDOW_S);
    if (!coincides) return false;

    this.levels.push(onset.levelDb);
    if (this.levels.length > LEVEL_HISTORY) this.levels.shift();
    if (this.levels.length < 6) return false;

    // The 25th percentile approximates "the quiet ones", i.e. the bleed.
    const sorted = [...this.levels].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.25)];
    return onset.levelDb < floor + BLEED_MARGIN_DB;
  }

  get tolerance(): number {
    // Never let the match window exceed half a slot, or a strum can be
    // credited to the wrong slot entirely at fast tempos.
    return Math.min(0.14, (slotSeconds(this.pattern, this.bpm) / 2) * 0.95);
  }

  update(pattern: Pattern, bpm: number) {
    this.pattern = pattern;
    this.bpm = bpm;
  }

  reset() {
    this.expectations = [];
    this.levels = [];
    this.errors = [];
    this.verdicts = [];
    this.stats = emptyStats();
  }

  get results(): SlotVerdict[] {
    return this.verdicts;
  }

  get summary(): SessionStats {
    return this.stats;
  }

  /** Called by the transport for every slot it schedules. */
  expect(slot: number, cycle: number, time: number) {
    const stroke = this.pattern.strokes[slot];
    if (!isAudible(stroke)) return;
    this.expectations.push({
      slot,
      cycle,
      time,
      wantStroke: stroke === "X" ? "mute" : stroke === "D" ? "down" : "up",
      wantChord: chordAtSlot(this.pattern, slot),
      matched: false,
    });
  }

  /** Called for every detected attack. */
  hear(onset: Onset) {
    const t = onset.time - this.offsetMs / 1000;

    // Dropped silently: it is neither a hit nor an extra, because we do not
    // believe the player made it. The slot stays open and can still be missed.
    if (this.looksLikeBleed(onset, t)) return;

    let best: Expectation | null = null;
    let bestErr = Infinity;
    for (const e of this.expectations) {
      if (e.matched) continue;
      const err = t - e.time;
      if (Math.abs(err) < Math.abs(bestErr) && Math.abs(err) <= this.tolerance) {
        best = e;
        bestErr = err;
      }
    }

    if (!best) {
      this.stats.extra += 1;
      this.emit({
        slot: -1, cycle: -1, grade: "extra", errorMs: 0,
        strokeOk: null, chordOk: null, heardChord: onset.chordGuess,
      });
      return;
    }

    best.matched = true;
    const errorMs = bestErr * 1000;
    const abs = Math.abs(errorMs);
    const grade: Grade = abs <= TIGHT_MS ? "tight" : abs <= CLOSE_MS ? "close" : "loose";

    // A muted chuck has no pitch worth matching, and direction on a chuck is
    // not meaningful either — so those checks are skipped rather than failed.
    const chordOk =
      best.wantStroke === "mute" || onset.chordConfidence < 0.45
        ? null
        : onset.chordGuess === best.wantChord;
    const strokeOk =
      best.wantStroke === "mute" || onset.strokeConfidence < 0.4
        ? null
        : onset.stroke === best.wantStroke;

    this.errors.push(errorMs);
    this.stats.hits += 1;
    if (grade === "tight") this.stats.tight += 1;
    if (chordOk !== null) {
      this.stats.chordChecked += 1;
      if (chordOk) this.stats.chordRight += 1;
    }
    if (strokeOk !== null) {
      this.stats.strokeChecked += 1;
      if (strokeOk) this.stats.strokeRight += 1;
    }
    this.recompute();

    this.emit({
      slot: best.slot, cycle: best.cycle, grade, errorMs,
      strokeOk, chordOk, heardChord: onset.chordGuess,
    });
  }

  /**
   * Close out expectations whose window has passed. Driven from the animation
   * loop with the current audio time.
   */
  sweep(now: number) {
    const cutoff = now - this.tolerance;
    const remaining: Expectation[] = [];
    for (const e of this.expectations) {
      if (e.time >= cutoff) {
        remaining.push(e);
        continue;
      }
      if (!e.matched) {
        this.stats.missed += 1;
        this.recompute();
        this.emit({
          slot: e.slot, cycle: e.cycle, grade: "missed", errorMs: 0,
          strokeOk: null, chordOk: null, heardChord: null,
        });
      }
    }
    this.expectations = remaining;
  }

  private recompute() {
    const n = this.errors.length;
    const mean = n ? this.errors.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n ? this.errors.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
    this.stats.meanErrorMs = mean;
    this.stats.spreadMs = Math.sqrt(variance);
    const attempted = this.stats.hits + this.stats.missed;
    this.stats.accuracy = attempted ? this.stats.tight / attempted : 0;
  }

  private emit(v: SlotVerdict) {
    this.verdicts.push(v);
    if (this.verdicts.length > 256) this.verdicts.shift();
    this.onVerdict(v, { ...this.stats });
  }
}

export function emptyStats(): SessionStats {
  return {
    hits: 0, missed: 0, extra: 0, tight: 0,
    meanErrorMs: 0, spreadMs: 0, accuracy: 0,
    chordChecked: 0, chordRight: 0, strokeChecked: 0, strokeRight: 0,
  };
}

export function gradeLabel(g: Grade): string {
  return { tight: "Tight", close: "Close", loose: "Loose", missed: "Missed", extra: "Extra" }[g];
}
