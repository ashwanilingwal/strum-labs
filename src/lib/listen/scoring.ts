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

import { chordById, chordIsSubset } from "../music/chords";
import { chordAtSlot, isAudible, slotSeconds, type Pattern } from "../music/pattern";
import type { Onset } from "./detector";

export type Grade = "tight" | "close" | "loose" | "missed" | "extra";

/**
 * Widened 30/70 → 45/100 (2026-08-27). ±30 ms is session-drummer territory
 * and read as "way stricter" than it should for the beginners this app is
 * for; ±45 ms is still audibly together, and "close" now reaches 100 ms
 * before a strum is called properly out.
 */
export const TIGHT_MS = 45;
export const CLOSE_MS = 100;

/**
 * How long an expectation stays open past its match window. Onsets reach the
 * scorer ~180 ms after the attack — the detector holds each one until every
 * string of the strum is sounding before describing it (FINGERPRINT_LAG) —
 * so closing a slot at the window's edge would call the hit "missed" and the
 * late-arriving onset "extra". The only cost is missed-verdicts appearing a
 * beat later.
 */
const MATCH_GRACE_S = 0.22;

/**
 * How near a click an onset must land to be judged against it, and how much
 * body it must then have to be believed.
 *
 * The metronome plays through the speakers while the mic judges, lands
 * exactly on the beat, and therefore scores as PERFECT timing whenever it
 * gets through — the worst possible failure, because it rewards not playing.
 * The detector's spectral gate rejects most clicks, but the margin measured
 * against a synthetic click was thin (its low-band share reached 0.07
 * against a 0.08 gate), and a real speaker in a real room is not obliged to
 * stay on the safe side of that.
 *
 * So the app stops guessing about a sound it played itself: every click is
 * logged with its exact audio time, and an onset landing on one has to clear
 * a much higher bar for body than the general gate asks. A genuine strum on
 * the beat sails through — a strum's low-band share is several times this —
 * while the click cannot, no matter how it is coloured on the way back in.
 * The window is generous because the latency offset is only ever approximate.
 */
const CLICK_WINDOW_S = 0.05;
const CLICK_BODY_RISE = 1.12;
/**
 * The drums get the same treatment as the click — logged by the engine,
 * judged by what they cannot fake — and need two witnesses where the click
 * needed one. A drum cannot still be sounding 150 ms later: snares and hats
 * read 0.1–0.2 on Onset.sustain, a lone kick (whose mid band is noise over
 * noise) wanders up to 0.59, and real strums sit at 0.79+. But a kick landing
 * over a chord that is still ringing inherits the ring's sustain, so it must
 * ALSO add body the way a fresh strum does (bodyRise, the click's own test —
 * such a kick measured 0.82–0.91 against strums at 1.2+). Any onset on a
 * logged hit that fails either is the drum. Measured on the synthetic kit:
 * 0 phantoms with the player silent, 12/12 with the player strumming on the
 * beats over the whole kit (scripts/timing-eval.ts). A mid-band rise was
 * tried as a witness and dropped: over a quiet gap it is a ratio against the
 * noise floor and reads 1.4–3.9 for a lone kick.
 */
const DRUM_WINDOW_S = 0.05;
const DRUM_SUSTAIN = 0.7;

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
  /** Hits that landed ahead of the beat, past TIGHT_MS. */
  early: number;
  /** Hits that landed behind the beat, past TIGHT_MS. */
  late: number;
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

function heardWithin(heard: string | null, wanted: string): boolean {
  const h = heard ? chordById(heard) : undefined;
  const w = chordById(wanted);
  return !!h && !!w && chordIsSubset(h, w);
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
  /**
   * Audio times of clicks the app has played, newest last. Injected as a
   * plain array rather than an engine reference so this module stays free of
   * Web Audio and testable with synthetic input.
   */
  public clickTimes: readonly number[] = [];
  /** Audio times of drum hits the app has played, newest last. */
  public drumTimes: readonly number[] = [];

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

  /**
   * Is this onset the app's own metronome coming back through the mic?
   * See CLICK_WINDOW_S — a click we scheduled, and no guitar body in it.
   */
  private looksLikeClick(onset: Onset, t: number): boolean {
    if (onset.bodyRise >= CLICK_BODY_RISE) return false;
    for (const c of this.clickTimes) {
      if (Math.abs(t - c) <= CLICK_WINDOW_S) return true;
    }
    return false;
  }

  /** Is this onset the app's own drums? See DRUM_WINDOW_S. */
  private looksLikeDrum(onset: Onset, t: number): boolean {
    if (onset.sustain >= DRUM_SUSTAIN && onset.bodyRise >= CLICK_BODY_RISE) return false;
    for (const d of this.drumTimes) {
      if (Math.abs(t - d) <= DRUM_WINDOW_S) return true;
    }
    return false;
  }

  /** Called for every detected attack. */
  hear(onset: Onset) {
    const t = onset.time - this.offsetMs / 1000;

    // Dropped silently: it is neither a hit nor an extra, because we do not
    // believe the player made it. The slot stays open and can still be missed.
    if (this.looksLikeBleed(onset, t)) return;
    if (this.looksLikeClick(onset, t)) return;
    if (this.looksLikeDrum(onset, t)) return;

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
    // The gate sits where the synthetic sweeps put it: at 0.55 no clean-strum
    // misidentification got through while ~80% of correct guesses did
    // (scripts/chord-match-eval.ts). Below it, silence beats accusation.
    // A heard chord whose notes all belong to the wanted one (D5 for D, G5
    // for G) is the wanted chord with a weak or muted third, not a wrong
    // chord — that is what a real strum with a soft third reads as.
    const chordOk =
      best.wantStroke === "mute" || onset.chordConfidence < 0.55
        ? null
        : onset.chordGuess === best.wantChord || heardWithin(onset.chordGuess, best.wantChord);
    const strokeOk =
      best.wantStroke === "mute" || onset.strokeConfidence < 0.4
        ? null
        : onset.stroke === best.wantStroke;

    this.errors.push(errorMs);
    this.stats.hits += 1;
    if (grade === "tight") this.stats.tight += 1;
    else if (errorMs < 0) this.stats.early += 1;
    else this.stats.late += 1;
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
    const cutoff = now - this.tolerance - MATCH_GRACE_S;
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
    hits: 0, missed: 0, extra: 0, tight: 0, early: 0, late: 0,
    meanErrorMs: 0, spreadMs: 0, accuracy: 0,
    chordChecked: 0, chordRight: 0, strokeChecked: 0, strokeRight: 0,
  };
}

export function gradeLabel(g: Grade): string {
  return { tight: "Tight", close: "Close", loose: "Loose", missed: "Missed", extra: "Extra" }[g];
}
