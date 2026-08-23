/**
 * Onset detection and note-attack fingerprinting.
 *
 * Pipeline, per 256-sample hop (~5.8 ms at 44.1 kHz):
 *   windowed FFT -> magnitude spectrum -> flux, centroid, treble ratio, chroma
 *
 * Onsets are peak-picked from spectral flux against an *adaptive* threshold
 * built from the running median of recent flux plus the room's measured noise
 * floor. A fixed threshold is the obvious approach and fails immediately: it is
 * either deaf in a loud room or hallucinating in a quiet one.
 *
 * Detection runs a few frames behind the newest audio, because confirming a
 * local maximum requires seeing what comes after it, and because the features
 * that identify the chord live in the 30 ms *following* the attack. The
 * reported timestamp is still the true onset time, so nothing is lost but
 * screen latency.
 */

import { FFT, hannWindow } from "./fft";
import {
  chroma, cosineSimilarity, dbfs, median, MAX_HZ, MIN_HZ,
  rms, spectralCentroid, spectralFlux, trebleRatio,
} from "./dsp";
import { CHORDS, chordTemplate, type Chord } from "../music/chords";

const FFT_SIZE = 1024;
const HOP = 256;
/** Frames held back before a frame is eligible to be called an onset. */
const LAG = 5;
/** Frames of flux history the adaptive threshold looks at (~0.5 s). */
const HISTORY = 86;
/** A guitarist cannot physically strum twice inside this. */
const MIN_GAP_S = 0.055;
/** Where a "down" strum's energy sits versus an "up" strum's. */
const TREBLE_SPLIT_HZ = 500;

export interface RoomProfile {
  /** Ambient level in dBFS. */
  noiseDb: number;
  /** Typical spectral flux with nobody playing. */
  fluxFloor: number;
  quality: "quiet" | "usable" | "noisy";
  message: string;
}

export interface Onset {
  /** AudioContext time of the attack. */
  time: number;
  /** How far above threshold the flux peaked. 1 = at threshold. */
  strength: number;
  /** Peak level of the attack, dBFS. */
  levelDb: number;
  /** 12-bin pitch-class profile averaged over the attack. */
  chroma: Float32Array;
  /** Best-matching chord id, and how confident that match is (0..1). */
  chordGuess: string | null;
  chordConfidence: number;
  /** "down" | "up" and how confident, from how the brightness evolves. */
  stroke: "down" | "up";
  strokeConfidence: number;
}

interface Frame {
  time: number;
  flux: number;
  rms: number;
  treble: number;
  centroid: number;
  chroma: Float32Array;
}

const TEMPLATES: { chord: Chord; template: Float32Array }[] = CHORDS.map((chord) => ({
  chord,
  template: chordTemplate(chord),
}));

/**
 * How hard to punish template mass the signal does not support.
 *
 * Cosine similarity alone cannot separate a chord from its own superset:
 * Cmaj7 contains every note of C plus one, so a plain C scores against Cmaj7
 * almost as well as against itself — measured at 0.96 vs 0.95, which no
 * confidence threshold can use. Subtracting the template energy that has no
 * counterpart in the chroma targets exactly that asymmetry.
 *
 * Swept over synthetic chords: 0 gives 59% correct, 0.15 and 0.3 give 69%,
 * 0.5 gives 72%, 0.8 drops back to 69%.
 */
const UNSUPPORTED_PENALTY = 0.5;

/** Similarity, less whatever the template expects and the signal lacks. */
function matchScore(observed: Float32Array, template: Float32Array): number {
  let unsupported = 0;
  for (let i = 0; i < 12; i++) unsupported += Math.max(0, template[i] - observed[i]);
  return cosineSimilarity(observed, template) - UNSUPPORTED_PENALTY * unsupported;
}

export class OnsetDetector {
  private fft = new FFT(FFT_SIZE);
  private window = hannWindow(FFT_SIZE);
  private ring = new Float32Array(FFT_SIZE);
  private ringFill = 0;
  private pending = new Float32Array(0);
  private pendingTime = 0;
  private hasPending = false;

  private mag = new Float32Array(FFT_SIZE / 2);
  private prevMag = new Float32Array(FFT_SIZE / 2);
  /**
   * Flux is a difference against the previous spectrum, and `prevMag` starts
   * empty — so the first analysed window measures itself against silence and
   * reports the entire spectrum as a rise. That is a phantom strum at the exact
   * moment listening begins, and worse, its refractory period then swallows the
   * first real one. The first window only primes the comparison.
   */
  private primed = false;
  private scratch = new Float32Array(FFT_SIZE);
  private frames: Frame[] = [];
  private fluxHistory: number[] = [];
  private lastOnsetTime = -1;

  private loBin: number;
  private hiBin: number;
  private room: RoomProfile | null = null;
  private calibrating = false;
  private calibrationFrames: Frame[] = [];

  constructor(
    private sampleRate: number,
    private onOnset: (o: Onset) => void,
  ) {
    this.loBin = Math.max(1, Math.floor((MIN_HZ * FFT_SIZE) / sampleRate));
    this.hiBin = Math.min(FFT_SIZE / 2, Math.ceil((MAX_HZ * FFT_SIZE) / sampleRate));
  }

  get roomProfile(): RoomProfile | null {
    return this.room;
  }

  /** Live input level in dBFS, for the meter. */
  get levelDb(): number {
    const last = this.frames[this.frames.length - 1];
    return last ? dbfs(last.rms) : -90;
  }

  beginCalibration() {
    this.calibrating = true;
    this.calibrationFrames = [];
  }

  /**
   * Turn the quiet frames into a room profile.
   *
   * The verdict is deliberately blunt, because the useful action is blunt:
   * a fan or an open window is worth turning off, and being told so beats
   * silently unreliable scoring.
   */
  endCalibration(): RoomProfile {
    this.calibrating = false;
    const frames = this.calibrationFrames;
    const noiseDb = frames.length ? dbfs(median(frames.map((f) => f.rms))) : -90;
    const fluxFloor = frames.length ? median(frames.map((f) => f.flux)) : 0;
    const peakDb = frames.length ? dbfs(Math.max(...frames.map((f) => f.rms))) : -90;

    let quality: RoomProfile["quality"];
    let message: string;
    if (noiseDb < -55) {
      quality = "quiet";
      message = "Nice and quiet. Timing should read accurately.";
    } else if (noiseDb < -42) {
      quality = "usable";
      message = "A little background noise, but workable. Timing will be fine; chord guesses may wobble.";
    } else {
      quality = "noisy";
      message = "It's noisy in here — a fan, traffic or a nearby speaker. Quieten the room or move the mic closer to the guitar, or the scoring will invent strums you didn't play.";
    }
    if (peakDb > -12) {
      message += " Something loud spiked during calibration, so try that again if the scoring looks wrong.";
    }

    this.room = { noiseDb, fluxFloor, quality, message };
    this.calibrationFrames = [];
    return this.room;
  }

  reset() {
    this.frames = [];
    this.fluxHistory = [];
    this.lastOnsetTime = -1;
    this.prevMag.fill(0);
    this.primed = false;
  }

  /** Feed one block from the mic. Blocks need not be hop-aligned. */
  push(time: number, samples: Float32Array) {
    // Splice the new block onto anything left over from last time so hops stay
    // exactly HOP apart no matter how the browser sizes its callbacks.
    let data = samples;
    let dataTime = time;
    if (this.hasPending) {
      const merged = new Float32Array(this.pending.length + samples.length);
      merged.set(this.pending, 0);
      merged.set(samples, this.pending.length);
      data = merged;
      dataTime = this.pendingTime;
      this.hasPending = false;
    }

    let offset = 0;
    while (offset + HOP <= data.length) {
      this.consumeHop(dataTime + offset / this.sampleRate, data.subarray(offset, offset + HOP));
      offset += HOP;
    }
    const rest = data.length - offset;
    if (rest > 0) {
      this.pending = data.slice(offset);
      this.pendingTime = dataTime + offset / this.sampleRate;
      this.hasPending = true;
    }
  }

  private consumeHop(time: number, hop: Float32Array) {
    // Slide the analysis window along by one hop.
    this.ring.copyWithin(0, HOP);
    this.ring.set(hop, FFT_SIZE - HOP);
    this.ringFill = Math.min(FFT_SIZE, this.ringFill + HOP);
    if (this.ringFill < FFT_SIZE) return;

    for (let i = 0; i < FFT_SIZE; i++) this.scratch[i] = this.ring[i] * this.window[i];
    this.fft.magnitudes(this.scratch, this.mag);

    if (!this.primed) {
      this.prevMag.set(this.mag);
      this.primed = true;
      return;
    }

    const flux = spectralFlux(this.mag, this.prevMag, this.loBin, this.hiBin);
    const frame: Frame = {
      // The window is centred on audio that is FFT_SIZE/2 samples old; report
      // the time of the window's centre so onsets aren't stamped half a window
      // late.
      time: time + HOP / this.sampleRate - FFT_SIZE / 2 / this.sampleRate,
      flux,
      rms: rms(hop),
      treble: trebleRatio(this.mag, this.sampleRate, FFT_SIZE, TREBLE_SPLIT_HZ, this.loBin, this.hiBin),
      centroid: spectralCentroid(this.mag, this.sampleRate, FFT_SIZE, this.loBin, this.hiBin),
      chroma: chroma(this.mag, this.sampleRate, FFT_SIZE, new Float32Array(12)),
    };
    this.prevMag.set(this.mag);

    if (this.calibrating) {
      this.calibrationFrames.push(frame);
      if (this.calibrationFrames.length > 400) this.calibrationFrames.shift();
      return;
    }

    this.frames.push(frame);
    if (this.frames.length > HISTORY + LAG + 8) this.frames.shift();
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > HISTORY) this.fluxHistory.shift();

    this.detect();
  }

  private detect() {
    const idx = this.frames.length - 1 - LAG;
    if (idx < 1) return;
    const f = this.frames[idx];

    const med = median(this.fluxHistory);
    // Threshold = a multiple of the running median, floored by what the room
    // itself produces when nobody is playing.
    const floor = (this.room?.fluxFloor ?? 0) * 3;
    const threshold = Math.max(med * 2.4, floor, 1e-4);
    if (f.flux < threshold) return;

    // Must be the local peak, or one strum registers three times.
    for (let k = idx - 2; k <= idx + 2; k++) {
      if (k < 0 || k >= this.frames.length || k === idx) continue;
      if (this.frames[k].flux > f.flux) return;
    }
    if (this.lastOnsetTime > 0 && f.time - this.lastOnsetTime < MIN_GAP_S) return;
    // Reject attacks that never rise above the room. Without this, a noisy
    // room's own fluctuations get scored as playing.
    if (this.room && dbfs(f.rms) < this.room.noiseDb + 8) return;

    this.lastOnsetTime = f.time;
    this.onOnset(this.fingerprint(idx, f, threshold));
  }

  /** Describe the attack: what chord it looks like, and which way the hand went. */
  private fingerprint(idx: number, f: Frame, threshold: number): Onset {
    const window = this.frames.slice(idx, Math.min(this.frames.length, idx + LAG));

    // Average chroma across the attack — a single frame is too noisy, and by
    // ~30 ms in, all the strings of the chord are sounding.
    const avg = new Float32Array(12);
    for (const fr of window) for (let i = 0; i < 12; i++) avg[i] += fr.chroma[i];
    let norm = 0;
    for (const v of avg) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 12; i++) avg[i] /= norm;

    let best: { id: string; score: number } | null = null;
    let runnerUp = -Infinity;
    for (const { chord, template } of TEMPLATES) {
      const score = matchScore(avg, template);
      if (!best || score > best.score) {
        runnerUp = best?.score ?? 0;
        best = { id: chord.id, score };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
    // Confidence is the *margin* over the next-best chord, not the raw match.
    // Chords share notes, so an absolute score of 0.9 means very little on its
    // own — C and Am both score high on almost any C-major-ish strum.
    const margin = best ? Math.max(0, best.score - runnerUp) : 0;
    // The floor moved down with the penalty, which shifts every score. Still a
    // guess until it has heard a real guitar, like every other threshold here.
    const chordConfidence = best ? Math.max(0, Math.min(1, (best.score - 0.45) / 0.35)) * Math.min(1, margin / 0.08) : 0;

    // Stroke direction from how brightness evolves across the attack. A down
    // strum starts at the bass strings and the treble arrives a few
    // milliseconds later; an up strum does the reverse. The slope of the
    // treble ratio captures that better than any single snapshot.
    let slope = 0;
    if (window.length >= 3) {
      const first = (window[0].treble + window[1].treble) / 2;
      const last = (window[window.length - 1].treble + window[window.length - 2].treble) / 2;
      slope = last - first;
    }
    const stroke: "down" | "up" = slope > 0 ? "down" : "up";
    const strokeConfidence = Math.min(1, Math.abs(slope) / 0.06);

    return {
      time: f.time,
      strength: f.flux / threshold,
      levelDb: dbfs(f.rms),
      chroma: avg,
      chordGuess: best?.id ?? null,
      chordConfidence,
      stroke,
      strokeConfidence,
    };
  }
}
