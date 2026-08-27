/**
 * Synthetic check of the chord matcher.
 *
 * Renders a strummed chord for every shape in the library — staggered
 * harmonic-series plucks with pick-transient noise, decay, slight detune and
 * a room-noise floor — runs the real OnsetDetector over the audio, and
 * reports how often the first detected onset names the right chord, plus the
 * confidence distributions the scorer's gate has to separate.
 *
 * Run with: npx tsx scripts/chord-match-eval.ts
 *
 * This is the harness behind every measured number in detector.ts. Re-run it
 * before and after touching the matcher; a change that cannot show itself
 * here is a guess.
 */

import { OnsetDetector, type Onset } from "../src/lib/listen/detector";
import { CHORDS } from "../src/lib/music/chords";
import { chordMidiNotes } from "../src/lib/music/chords";
import { midiToFreq } from "../src/lib/music/theory";

const SR = 44100;
const LEAD_SILENCE_S = 0.25;
const CHUNK = 512;

/** Deterministic PRNG so runs are comparable. */
function makeRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface SynthOptions {
  /** Max per-note detune, cents (uniform ±). */
  detuneCents: number;
  /** Seconds between successive strings of the strum. */
  stagger: number;
  seed: number;
}

/** A strummed chord: staggered plucks, each a decaying harmonic series. */
function synthChord(midis: number[], opts: SynthOptions): Float32Array {
  const rand = makeRand(opts.seed);
  const seconds = LEAD_SILENCE_S + 1.1;
  const n = Math.ceil(SR * seconds);
  const out = new Float32Array(n);

  midis.forEach((midi, v) => {
    const start = Math.floor((LEAD_SILENCE_S + v * opts.stagger) * SR);
    const detune = (rand() * 2 - 1) * opts.detuneCents;
    const f0 = midiToFreq(midi) * Math.pow(2, detune / 1200);

    // Pick transient: a short broadband scrape before the note speaks.
    const scrape = Math.floor(SR * 0.012);
    for (let i = 0; i < scrape && start + i < n; i++) {
      out[start + i] += (rand() * 2 - 1) * 0.1 * Math.exp(-i / (SR * 0.003));
    }

    for (let h = 1; h <= 8; h++) {
      const fh = f0 * h;
      if (fh > SR * 0.45) break;
      const amp = 0.5 / Math.pow(h, 1.1);
      const tau = 0.9 / Math.sqrt(h);
      const phase = rand() * Math.PI * 2;
      const w = 2 * Math.PI * fh;
      for (let i = start; i < n; i++) {
        const t = (i - start) / SR;
        out[i] += amp * Math.exp(-t / tau) * Math.sin(w * t + phase);
      }
    }
  });

  // Room floor at roughly -65 dBFS, plus peak normalisation to -6 dBFS.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.5 / peak : 1;
  for (let i = 0; i < n; i++) out[i] = out[i] * g + (rand() * 2 - 1) * 0.0005;
  return out;
}

function firstOnset(audio: Float32Array): Onset | null {
  const onsets: Onset[] = [];
  const detector = new OnsetDetector(SR, (o) => onsets.push(o));
  for (let i = 0; i + CHUNK <= audio.length; i += CHUNK) {
    detector.push(i / SR, audio.subarray(i, i + CHUNK));
  }
  return onsets[0] ?? null;
}

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(0)}%` : "—";
}

function run(label: string, opts: Omit<SynthOptions, "seed">) {
  let right = 0;
  let none = 0;
  const wrong: string[] = [];
  const confRight: number[] = [];
  const confWrong: number[] = [];
  const scoreRight: number[] = [];
  const scoreWrong: number[] = [];
  const marginRight: number[] = [];
  const marginWrong: number[] = [];

  CHORDS.forEach((chord, i) => {
    const audio = synthChord(chordMidiNotes(chord), { ...opts, seed: 1000 + i });
    const o = firstOnset(audio);
    if (!o) {
      none += 1;
      wrong.push(`${chord.id}: NO ONSET`);
      return;
    }
    if (o.chordGuess === chord.id) {
      right += 1;
      confRight.push(o.chordConfidence);
      scoreRight.push(o.matchScore);
      marginRight.push(o.matchMargin);
    } else {
      confWrong.push(o.chordConfidence);
      scoreWrong.push(o.matchScore);
      marginWrong.push(o.matchMargin);
      wrong.push(`${chord.id}→${o.chordGuess ?? "?"} (conf ${o.chordConfidence.toFixed(2)})`);
    }
  });

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(`\n== ${label} ==`);
  const q = (xs: number[], p: number) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  console.log(
    `raw score right: p10 ${q(scoreRight, 0.1).toFixed(3)} p50 ${q(scoreRight, 0.5).toFixed(3)}; ` +
    `wrong: p50 ${q(scoreWrong, 0.5).toFixed(3)} p90 ${q(scoreWrong, 0.9).toFixed(3)}`,
  );
  console.log(
    `margin right: p10 ${q(marginRight, 0.1).toFixed(3)} p50 ${q(marginRight, 0.5).toFixed(3)}; ` +
    `wrong: p50 ${q(marginWrong, 0.5).toFixed(3)} p90 ${q(marginWrong, 0.9).toFixed(3)}`,
  );
  console.log(`right ${right}/${CHORDS.length} (${pct(right, CHORDS.length)}), no onset: ${none}`);
  console.log(`confidence: correct mean ${mean(confRight).toFixed(2)}, wrong mean ${mean(confWrong).toFixed(2)}`);
  const gated = (t: number) =>
    `gate ${t}: keeps ${pct(confRight.filter((c) => c >= t).length, confRight.length)} of right, ` +
    `${pct(confWrong.filter((c) => c >= t).length, confWrong.length)} of wrong`;
  console.log(gated(0.45));
  console.log(gated(0.55));
  if (wrong.length) console.log(`misses: ${wrong.join(", ")}`);
}

run("in tune, tidy strum", { detuneCents: 3, stagger: 0.011 });
run("slightly out (±10 cents), tidy strum", { detuneCents: 10, stagger: 0.011 });
run("in tune, lazy strum (25 ms/string)", { detuneCents: 3, stagger: 0.025 });
