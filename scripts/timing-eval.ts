/**
 * End-to-end check of strum TIMING: synthetic strums with known injected
 * errors, rendered as audio, run through the real OnsetDetector into the real
 * Scorer, verdict by verdict.
 *
 * What it verifies that chord-match-eval.ts cannot:
 *  - the detector's timestamps (systematic bias and spread, in ms),
 *  - that every strum produces exactly one onset in a *sequence* (no doubles
 *    from one strum, no strums swallowed by the same-strum merge),
 *  - that the scorer's matching, grace window, misses and extras all land on
 *    the right slots with the right grades,
 *  - chord identification while the previous chord still rings underneath.
 *
 * Run with: npx tsx scripts/timing-eval.ts
 */

import { OnsetDetector, type Onset } from "../src/lib/listen/detector";
import { Scorer, TIGHT_MS, CLOSE_MS, type SlotVerdict } from "../src/lib/listen/scoring";
import { chordMidiNotes, chordById } from "../src/lib/music/chords";
import { normalise, slotSeconds, isAudible, type Pattern } from "../src/lib/music/pattern";
import { midiToFreq } from "../src/lib/music/theory";

if (process.env.DEBUG_ONSETS) {
  (globalThis as { __ONSET_DEBUG?: boolean }).__ONSET_DEBUG = true;
}

const SR = 44100;
const CHUNK = 512;
/** How far ahead the real transport books slots (transport.ts LOOKAHEAD_S). */
const LOOKAHEAD_S = 0.3;

/** As useStrumEngine computes it: shortest gap between audible slots, wrapping. */
function minStrumGapOf(p: Pattern): number {
  const audible = p.strokes.map((st, i) => (isAudible(st) ? i : -1)).filter((i) => i >= 0);
  const slotS = slotSeconds(p, p.bpm);
  if (audible.length < 2) return slotS * p.strokes.length;
  let min = Infinity;
  for (let k = 0; k < audible.length; k++) {
    const next = audible[(k + 1) % audible.length];
    const gap = ((next - audible[k] + p.strokes.length) % p.strokes.length) || p.strokes.length;
    min = Math.min(min, gap);
  }
  return min * slotS;
}

function makeRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Mix one strummed chord into `out` starting at `startS`. */
function renderStrum(
  out: Float32Array,
  startS: number,
  midis: number[],
  rand: () => number,
  opts: { staggerS?: number; gain?: number; scrape?: number; attackS?: number } = {},
) {
  const staggerS = opts.staggerS ?? 0.011;
  const gain = opts.gain ?? 1;
  /** Pick-scrape noise amplitude. 0 = bare fingers. */
  const scrapeAmp = opts.scrape ?? 0.05;
  /** Per-note amplitude ramp — fingers ease in where a pick snaps. */
  const attackS = opts.attackS ?? 0;
  midis.forEach((midi, v) => {
    const start = Math.floor((startS + v * staggerS) * SR);
    const f0 = midiToFreq(midi) * Math.pow(2, ((rand() * 2 - 1) * 4) / 1200);

    const scrape = Math.floor(SR * 0.012);
    for (let i = 0; i < scrape && start + i < out.length; i++) {
      out[start + i] += (rand() * 2 - 1) * scrapeAmp * gain * Math.exp(-i / (SR * 0.003));
    }
    const ramp = Math.max(1, Math.floor(attackS * SR));
    for (let h = 1; h <= 8; h++) {
      const fh = f0 * h;
      if (fh > SR * 0.45) break;
      const amp = (0.25 * gain) / Math.pow(h, 1.1);
      const tau = 0.9 / Math.sqrt(h);
      const phase = rand() * Math.PI * 2;
      const w = 2 * Math.PI * fh;
      const end = Math.min(out.length, start + Math.floor(SR * 1.6));
      // Fade the tail rather than hard-cutting it: a truncation is a real
      // broadband click, and the detector (correctly) reported it as an
      // attack when this used to cut dead at 1.6 s.
      const fade = Math.floor(SR * 0.08);
      for (let i = start; i < end; i++) {
        const t = (i - start) / SR;
        let taper = end - i < fade ? (end - i) / fade : 1;
        if (i - start < ramp) taper *= (i - start) / ramp;
        out[i] += amp * Math.exp(-t / tau) * Math.sin(w * t + phase) * taper;
      }
    }
  });
}

/** A muted chuck: pick scratch over damped strings plus the palm thud. */
function renderChuck(out: Float32Array, startS: number, rand: () => number) {
  const start = Math.floor(startS * SR);
  for (let i = 0; i < SR * 0.07 && start + i < out.length; i++) {
    const t = i / SR;
    out[start + i] += (rand() * 2 - 1) * 0.35 * Math.exp(-t / 0.018);
  }
  const w = 2 * Math.PI * 140;
  for (let i = 0; i < SR * 0.05 && start + i < out.length; i++) {
    const t = i / SR;
    out[start + i] += 0.2 * Math.exp(-t / 0.02) * Math.sin(w * t);
  }
}

interface Strum {
  /** True attack time in the rendered audio. */
  timeS: number;
  chordId: string;
  /** The slot this strum aims at, or null for a deliberate extra. */
  slot: number | null;
  /** Injected error in ms (attack - slot time), for slot strums. */
  errorMs: number;
  /** How it is rendered. Downs: all strings low-to-high. Ups: top four
   *  strings high-to-low, quieter. Mutes: a chuck. Default down. */
  stroke?: "down" | "up" | "mute";
}

/**
 * Drive detector + scorer over rendered audio the way the app does: chunks in
 * arrival order, expectations booked LOOKAHEAD_S ahead, sweep on a 25 ms tick.
 */
function runSession(
  pattern: Pattern,
  loops: number,
  strums: Strum[],
  t0: number,
  opts: {
    offsetMs?: number; noiseAmp?: number; calibrate?: boolean;
    /** Render without pick scrape and with eased attacks — bare thumb. */
    fingerstyle?: boolean;
    /** Seconds between successive strings of each strum. */
    staggerS?: number;
  } = {},
): { verdicts: SlotVerdict[]; onsets: Onset[]; roomQuality: string | null } {
  const noiseAmp = opts.noiseAmp ?? 0.0005;
  const slotS = slotSeconds(pattern, pattern.bpm);
  const total = Math.ceil((t0 + loops * pattern.strokes.length * slotS + 1.2) * SR);
  const audio = new Float32Array(total);
  const rand = makeRand(42);
  for (const s of strums) {
    if (s.stroke === "mute") {
      renderChuck(audio, s.timeS, rand);
      continue;
    }
    const midis = chordMidiNotes(chordById(s.chordId)!);
    const render = {
      ...(opts.fingerstyle ? { scrape: 0.015, attackS: 0.006 } : {}),
      ...(opts.staggerS ? { staggerS: opts.staggerS } : {}),
    };
    if (s.stroke === "up") {
      renderStrum(audio, s.timeS, midis.slice(-4).reverse(), rand, { gain: 0.7, ...render });
    } else {
      renderStrum(audio, s.timeS, midis, rand, render);
    }
  }
  let peak = 0;
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  const g = 0.5 / peak;
  // Noise after normalisation, so its level is what the scenario asked for.
  for (let i = 0; i < total; i++) audio[i] = audio[i] * g + (rand() * 2 - 1) * noiseAmp;

  const verdicts: SlotVerdict[] = [];
  const onsets: Onset[] = [];
  const detector = new OnsetDetector(SR, (o) => {
    onsets.push(o);
    scorer.hear(o);
  });
  // Mirror useStrumEngine: the merge window follows the pattern's slot pace,
  // and a rake may be merged for up to 60% of the shortest real-strum gap.
  detector.maxStrumSpreadS = Math.min(0.11, Math.max(0.07, slotS * 0.5));
  detector.minStrumGapS = minStrumGapOf(pattern);
  const scorer = new Scorer(pattern, pattern.bpm, opts.offsetMs ?? 0, (v) => verdicts.push(v));

  // The app always measures the room before listening; scenarios that care
  // about the noise floor do the same.
  let roomQuality: string | null = null;
  if (opts.calibrate) {
    const calibLen = Math.ceil(SR * 2.2);
    const calib = new Float32Array(calibLen);
    for (let i = 0; i < calibLen; i++) calib[i] = (rand() * 2 - 1) * noiseAmp;
    detector.beginCalibration();
    for (let i = 0; i + CHUNK <= calibLen; i += CHUNK) {
      detector.push(i / SR - 3, calib.subarray(i, i + CHUNK));
    }
    roomQuality = detector.endCalibration().quality;
    detector.reset();
  }

  // Slot schedule for the whole session.
  const schedule: { slot: number; cycle: number; time: number }[] = [];
  for (let c = 0; c < loops; c++) {
    pattern.strokes.forEach((stroke, i) => {
      if (!isAudible(stroke)) return;
      schedule.push({ slot: i, cycle: c, time: t0 + (c * pattern.strokes.length + i) * slotS });
    });
  }

  let booked = 0;
  let lastSweep = 0;
  for (let i = 0; i + CHUNK <= total; i += CHUNK) {
    const now = i / SR;
    while (booked < schedule.length && schedule[booked].time <= now + LOOKAHEAD_S) {
      const e = schedule[booked];
      scorer.expect(e.slot, e.cycle, e.time);
      booked += 1;
    }
    detector.push(now, audio.subarray(i, i + CHUNK));
    if (now - lastSweep >= 0.025) {
      scorer.sweep(now);
      lastSweep = now;
    }
  }
  scorer.sweep(total / SR + 1);
  return { verdicts, onsets, roomQuality };
}

/** Hits / missed / extras from a verdict list. */
function tally(verdicts: SlotVerdict[]) {
  return {
    hits: verdicts.filter((v) => v.grade !== "missed" && v.grade !== "extra").length,
    missed: verdicts.filter((v) => v.grade === "missed").length,
    extras: verdicts.filter((v) => v.grade === "extra").length,
  };
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");

// ---------------------------------------------------------------------------
// Scenario 1: the classic eighths pattern at 90 bpm, scripted errors.
// ---------------------------------------------------------------------------

function scenarioTiming() {
  const pattern = normalise({
    id: "t", name: "t", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [], chords: ["G"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const audibleSlots = pattern.strokes
    .map((s, i) => (isAudible(s) ? i : -1))
    .filter((i) => i >= 0);
  const t0 = 1.0;

  // Loop 1: graded errors. Loop 2: clean, with one miss and one extra.
  const loop1: (number | null)[] = [0, -20, 25, 60, -85, 120];
  const loop2: (number | null)[] = [null, 0, 0, 30, -30, 0];
  const expectGrade = (e: number | null): string => {
    if (e === null) return "missed";
    const a = Math.abs(e);
    return a <= TIGHT_MS ? "tight" : a <= CLOSE_MS ? "close" : "loose";
  };

  const strums: Strum[] = [];
  [loop1, loop2].forEach((script, c) => {
    script.forEach((err, k) => {
      if (err === null) return;
      const slot = audibleSlots[k];
      strums.push({
        timeS: t0 + (c * 8 + slot) * slotS + err / 1000,
        chordId: "G", slot, errorMs: err,
      });
    });
  });
  // A deliberate extra, far from every audible slot.
  strums.push({ timeS: t0 + 0.3, chordId: "G", slot: null, errorMs: 0 });
  strums.sort((a, b) => a.timeS - b.timeS);

  const { verdicts, onsets } = runSession(pattern, 2, strums, t0);

  console.log("== timing: eighths pattern, 90 bpm, scripted errors ==");
  console.log(`strums rendered ${strums.length}, onsets detected ${onsets.length}`);
  if (process.env.DEBUG_ONSETS) {
    console.log("strums:", strums.map((s) => `${(s.timeS - t0).toFixed(3)}`).join(" "));
    console.log(
      "onsets:",
      onsets
        .map((o) => `${(o.time - t0).toFixed(3)}(x${o.strength.toFixed(1)},${o.levelDb.toFixed(0)}dB)`)
        .join(" "),
    );
  }

  const biases: number[] = [];
  let gradeRight = 0;
  let gradeTotal = 0;
  const rows: string[] = [];
  [loop1, loop2].forEach((script, c) => {
    script.forEach((err, k) => {
      const slot = audibleSlots[k];
      const v = verdicts.find((x) => x.slot === slot && x.cycle === c);
      const want = expectGrade(err);
      gradeTotal += 1;
      const ok = v?.grade === want;
      if (ok) gradeRight += 1;
      if (v && err !== null && v.grade !== "missed") biases.push(v.errorMs - err);
      rows.push(
        `  c${c} s${slot}: injected ${err === null ? "(silence)" : `${err}ms`} → ` +
        `${v ? `${v.grade} ${v.grade === "missed" ? "" : `${v.errorMs.toFixed(0)}ms`}` : "NO VERDICT"} ` +
        `${ok ? "" : `  EXPECTED ${want}`}`,
      );
    });
  });
  console.log(rows.join("\n"));
  const extras = verdicts.filter((v) => v.grade === "extra").length;
  console.log(`extras reported: ${extras} (1 injected)`);
  const mean = biases.reduce((a, b) => a + b, 0) / (biases.length || 1);
  const spread = Math.sqrt(
    biases.reduce((a, b) => a + (b - mean) ** 2, 0) / (biases.length || 1),
  );
  console.log(
    `grades right: ${gradeRight}/${gradeTotal}; ` +
    `detector timestamp bias mean ${mean.toFixed(1)}ms, spread ${spread.toFixed(1)}ms`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 2: on-time sixteenths at 140 bpm — the strum-merge stress case.
// ---------------------------------------------------------------------------

function scenarioFast() {
  const pattern = normalise({
    id: "f", name: "f", bars: 1, slotsPerBar: 16, beatsPerBar: 4,
    strokes: Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? "D" : "U")) as Pattern["strokes"],
    accents: [], chords: ["E"], bpm: 140,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let i = 0; i < 16; i++) {
    strums.push({ timeS: t0 + i * slotS, chordId: "E", slot: i, errorMs: 0 });
  }
  const { verdicts, onsets } = runSession(pattern, 1, strums, t0);
  const hits = verdicts.filter((v) => v.grade !== "missed" && v.grade !== "extra").length;
  const missed = verdicts.filter((v) => v.grade === "missed").length;
  const extras = verdicts.filter((v) => v.grade === "extra").length;
  console.log(`\n== timing: on-time 16ths at 140 bpm (${(slotS * 1000).toFixed(0)}ms apart) ==`);
  console.log(
    `strums 16, onsets ${onsets.length}, hits ${hits}, missed ${missed}, extras ${extras}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 3: chord changes with the previous chord still ringing.
// ---------------------------------------------------------------------------

function scenarioRingover() {
  const seq = ["G", "C", "D", "Em", "G", "Am", "C", "D", "E", "Em", "Am", "G"];
  const gapS = 0.6;
  const t0 = 1.0;
  const total = Math.ceil((t0 + seq.length * gapS + 1.5) * SR);
  const audio = new Float32Array(total);
  const rand = makeRand(7);
  for (let i = 0; i < total; i++) audio[i] = (rand() * 2 - 1) * 0.0005;
  seq.forEach((id, k) => renderStrum(audio, t0 + k * gapS, chordMidiNotes(chordById(id)!), rand));
  let peak = 0;
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < total; i++) audio[i] *= 0.5 / peak;

  const onsets: Onset[] = [];
  const detector = new OnsetDetector(SR, (o) => onsets.push(o));
  for (let i = 0; i + CHUNK <= total; i += CHUNK) {
    detector.push(i / SR, audio.subarray(i, i + CHUNK));
  }

  let right = 0;
  let confident = 0;
  let confidentRight = 0;
  const rows: string[] = [];
  seq.forEach((id, k) => {
    const t = t0 + k * gapS;
    const o = onsets.find((x) => Math.abs(x.time - t) < 0.1);
    const ok = o?.chordGuess === id;
    if (ok) right += 1;
    if (o && o.chordConfidence >= 0.55) {
      confident += 1;
      if (ok) confidentRight += 1;
    }
    rows.push(`  ${id.padEnd(3)} → ${o ? `${o.chordGuess} (conf ${o.chordConfidence.toFixed(2)})` : "NO ONSET"}${ok ? "" : "  WRONG"}`);
  });
  console.log(`\n== chords: 600ms changes, previous chord ringing over ==`);
  console.log(rows.join("\n"));
  console.log(
    `right ${right}/${seq.length} (${pct(right, seq.length)}); ` +
    `over the 0.55 gate: ${confident}, of which right ${confidentRight}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 4: down-up strumming — quieter, thinner, reversed ups, and the
// stroke-direction guess checked against how each strum was rendered.
// ---------------------------------------------------------------------------

function scenarioStrokes() {
  const pattern = normalise({
    id: "s", name: "s", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "U", "D", "U", "D", "U", "D", "U"],
    accents: [], chords: ["G"], bpm: 100,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < 8; i++) {
      strums.push({
        timeS: t0 + (c * 8 + i) * slotS,
        chordId: "G", slot: i, errorMs: 0,
        stroke: i % 2 === 0 ? "down" : "up",
      });
    }
  }
  const { verdicts, onsets } = runSession(pattern, 2, strums, t0);
  const t = tally(verdicts);

  let dirChecked = 0;
  let dirRight = 0;
  let abstained = 0;
  for (const s of strums) {
    const o = onsets.find((x) => Math.abs(x.time - s.timeS) < 0.06);
    if (!o) continue;
    // The scorer's own gate for the direction check.
    if (o.strokeConfidence < 0.4) {
      abstained += 1;
      continue;
    }
    dirChecked += 1;
    if (o.stroke === s.stroke) dirRight += 1;
  }
  console.log(`\n== strokes: alternating down/up eighths at 100 bpm ==`);
  console.log(
    `strums 16 (8 down, 8 quieter thin ups), onsets ${onsets.length}, ` +
    `hits ${t.hits}, missed ${t.missed}, extras ${t.extras}`,
  );
  console.log(
    `direction: checked ${dirChecked} (right ${dirRight}), abstained ${abstained}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 5: muted chucks between downs.
// ---------------------------------------------------------------------------

function scenarioChucks() {
  const pattern = normalise({
    id: "x", name: "x", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "X", "D", "X", "D", "X", "D", "X"],
    accents: [], chords: ["Am"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < 8; i++) {
      strums.push({
        timeS: t0 + (c * 8 + i) * slotS,
        chordId: "Am", slot: i, errorMs: 0,
        stroke: i % 2 === 0 ? "down" : "mute",
      });
    }
  }
  const { verdicts, onsets } = runSession(pattern, 2, strums, t0);
  const t = tally(verdicts);
  const chuckAccused = verdicts.filter(
    (v) => v.slot % 2 === 1 && v.chordOk !== null,
  ).length;
  console.log(`\n== chucks: D X D X at 90 bpm ==`);
  console.log(
    `strums 16 (8 down, 8 chucks), onsets ${onsets.length}, ` +
    `hits ${t.hits}, missed ${t.missed}, extras ${t.extras}; ` +
    `chord-checked chucks (must be 0): ${chuckAccused}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 6: a real room — calibration over noise, then clean playing.
// ---------------------------------------------------------------------------

function scenarioNoisy() {
  const pattern = normalise({
    id: "n", name: "n", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [], chords: ["C"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const audible = pattern.strokes.map((s, i) => (isAudible(s) ? i : -1)).filter((i) => i >= 0);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let c = 0; c < 2; c++) {
    for (const i of audible) {
      strums.push({ timeS: t0 + (c * 8 + i) * slotS, chordId: "C", slot: i, errorMs: 0 });
    }
  }
  const { verdicts, onsets, roomQuality } = runSession(pattern, 2, strums, t0, {
    noiseAmp: 0.006, calibrate: true,
  });
  const t = tally(verdicts);
  console.log(`\n== noisy room (calibrated ${roomQuality}): clean eighths at 90 bpm ==`);
  console.log(
    `strums ${strums.length}, onsets ${onsets.length}, ` +
    `hits ${t.hits}, missed ${t.missed}, extras ${t.extras}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 7: a constant capture latency, absorbed by the scorer's offset.
// ---------------------------------------------------------------------------

function scenarioOffset() {
  const pattern = normalise({
    id: "o", name: "o", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "-", "D", "-", "D", "-"],
    accents: [], chords: ["D"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let c = 0; c < 2; c++) {
    for (const i of [0, 2, 4, 6]) {
      // Every attack arrives 40 ms late, exactly like a mic chain would make it.
      strums.push({ timeS: t0 + (c * 8 + i) * slotS + 0.04, chordId: "D", slot: i, errorMs: 0 });
    }
  }
  const { verdicts } = runSession(pattern, 2, strums, t0, { offsetMs: 40 });
  const t = tally(verdicts);
  const errs = verdicts
    .filter((v) => v.grade !== "missed" && v.grade !== "extra")
    .map((v) => v.errorMs);
  const mean = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
  console.log(`\n== offset: everything 40 ms late, offsetMs=40 ==`);
  console.log(
    `hits ${t.hits}/8, missed ${t.missed}, extras ${t.extras}, ` +
    `mean error after offset ${mean.toFixed(1)}ms (want ~0)`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 8: tempo extremes, on-time downstrums.
// ---------------------------------------------------------------------------

function scenarioTempos() {
  for (const bpm of [60, 200]) {
    const pattern = normalise({
      id: `b${bpm}`, name: "b", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
      strokes: ["D", "U", "D", "U", "D", "U", "D", "U"],
      accents: [], chords: ["G"], bpm,
    });
    const slotS = slotSeconds(pattern, pattern.bpm);
    const t0 = 1.0;
    const strums: Strum[] = [];
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 8; i++) {
        strums.push({ timeS: t0 + (c * 8 + i) * slotS, chordId: "G", slot: i, errorMs: 0 });
      }
    }
    const { verdicts, onsets } = runSession(pattern, 2, strums, t0);
    const t = tally(verdicts);
    console.log(
      `\n== tempo ${bpm} bpm eighths (${(slotS * 1000).toFixed(0)}ms apart): ` +
      `strums 16, onsets ${onsets.length}, hits ${t.hits}, missed ${t.missed}, extras ${t.extras} ==`,
    );
  }
}

// ---------------------------------------------------------------------------
// Scenario 10: the app's own metronome heard through the speakers, with the
// player not playing at all. Every hit scored here is a lie: the click lands
// exactly on the beat, so if it registers, it registers as a perfect strum.
// The engine's click is a square blip at 1100/1650 Hz through a 600 Hz
// highpass — modelled here as its odd harmonics with the same envelope.
// ---------------------------------------------------------------------------

function renderClick(out: Float32Array, startS: number, accent: boolean, gain: number) {
  const start = Math.floor(startS * SR);
  const f = accent ? 1650 : 1100;
  const dur = Math.floor(SR * 0.05);
  for (let h = 1; h <= 5; h += 2) {
    const w = 2 * Math.PI * f * h;
    if (f * h > SR * 0.45) break;
    for (let i = 0; i < dur && start + i < out.length; i++) {
      const t = i / SR;
      const env = t < 0.001 ? t / 0.001 : Math.exp(-(t - 0.001) / 0.006);
      out[start + i] += (gain / h) * env * Math.sin(w * t);
    }
  }
}


/** RBJ biquad, run over a whole buffer in place. Enough filter for a drum kit. */
function biquad(buf: Float32Array, kind: "bandpass" | "highpass", f0: number, q: number) {
  const w0 = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw = Math.cos(w0);
  let b0: number, b1: number, b2: number;
  if (kind === "bandpass") {
    b0 = alpha; b1 = 0; b2 = -alpha;
  } else {
    b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
  }
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    buf[i] = y0;
  }
}

/**
 * One hit of the app's backing kit, synthesised the way engine.drum() does it:
 * a 140→48 Hz sine kick, band-passed noise over a 190 Hz tone for the snare,
 * high-passed noise for the hat. Levels are the engine's, through its 0.5 bus.
 */
function renderDrum(out: Float32Array, startS: number, kind: "kick" | "snare" | "hat", rand: () => number) {
  const start = Math.floor(startS * SR);
  const bus = 0.5;
  if (kind === "kick") {
    const n = Math.floor(SR * 0.2);
    let phase = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / SR;
      const f = 48 + (140 - 48) * Math.exp(-t / 0.035);
      phase += (2 * Math.PI * f) / SR;
      const env = t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.028);
      out[start + i] += bus * 0.85 * env * Math.sin(phase);
    }
    return;
  }
  const n = Math.floor(SR * 0.15);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rand() * 2 - 1;
  if (kind === "snare") {
    biquad(noise, "bandpass", 1800, 0.8);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / SR;
      const env = t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / 0.02);
      const tone = t < 0.08 ? 0.35 * Math.exp(-t / 0.014) * (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * 190 * t)) : 0;
      out[start + i] += bus * (0.5 * env * noise[i] + tone);
    }
  } else {
    biquad(noise, "highpass", 6500, 0.7);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / SR;
      const env = t < 0.001 ? t / 0.001 : Math.exp(-(t - 0.001) / 0.007);
      out[start + i] += bus * 0.18 * env * noise[i];
    }
  }
}

/**
 * The calibration's latency probe: three clicks scheduled at known times come
 * back through the "mic" a fixed round trip later. endCalibration must read
 * that round trip off them, and must not let them pollute the room floor.
 */
function scenarioLoopback() {
  const rand = makeRand(5);
  for (const trueMs of [18, 37, 64]) {
    const len = Math.ceil(SR * 2.2);
    const audio = new Float32Array(len);
    for (let i = 0; i < len; i++) audio[i] = (rand() * 2 - 1) * 0.002;
    const probes = [0.65, 1.0, 1.35];
    for (const p of probes) renderClick(audio, p + trueMs / 1000, false, 0.12);
    const detector = new OnsetDetector(SR, () => {});
    detector.beginCalibration();
    for (let i = 0; i + CHUNK <= len; i += CHUNK) detector.push(i / SR, audio.subarray(i, i + CHUNK));
    const room = detector.endCalibration(probes);
    const ok = room.loopbackMs !== null && Math.abs(room.loopbackMs - trueMs) <= 8;
    console.log(
      `\n== loopback probe: true ${trueMs} ms → measured ${room.loopbackMs ?? "null"} ms, ` +
      `room read as ${room.quality} ${ok ? "PASS" : "FAIL"} ==`,
    );
  }
  // Headphones: the clicks never come back. Must say so, not invent a number.
  const len = Math.ceil(SR * 2.2);
  const quiet = new Float32Array(len);
  for (let i = 0; i < len; i++) quiet[i] = (rand() * 2 - 1) * 0.002;
  const d2 = new OnsetDetector(SR, () => {});
  d2.beginCalibration();
  for (let i = 0; i + CHUNK <= len; i += CHUNK) d2.push(i / SR, quiet.subarray(i, i + CHUNK));
  const silentRoom = d2.endCalibration([0.65, 1.0, 1.35]);
  console.log(`== loopback probe, nothing comes back: measured ${silentRoom.loopbackMs ?? "null"} ${silentRoom.loopbackMs === null ? "PASS" : "FAIL"} ==`);
}

/**
 * Strums that are not a snap: a slow rake across the strings (40 ms per
 * string, ~200 ms end to end) and a very slow one (60 ms, ~300 ms). A
 * beginner's strum often looks like this. Each must count as ONE strum,
 * timed at its first string, and must not spawn extras from its stragglers.
 */
function scenarioSlowRakes() {
  for (const stagger of [0.025, 0.04, 0.06]) {
    const pattern = normalise({
      id: "sr", name: "sr", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
      strokes: ["D", "-", "D", "-", "D", "-", "D", "-"],
      accents: [], chords: ["G"], bpm: 80,
    });
    const slotS = slotSeconds(pattern, pattern.bpm);
    const t0 = 1.0;
    const strums: Strum[] = [];
    for (let c = 0; c < 2; c++) {
      for (const i of [0, 2, 4, 6]) {
        strums.push({ timeS: t0 + (c * 8 + i) * slotS, chordId: "G", slot: i, errorMs: 0 });
      }
    }
    const { verdicts, onsets } = runSession(pattern, 2, strums, t0, { staggerS: stagger });
    const t = tally(verdicts);
    const errs = verdicts.filter((v) => v.grade !== "missed" && v.grade !== "extra").map((v) => v.errorMs);
    const mean = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
    if (process.env.DEBUG_ONSETS) {
      console.log(`  rake ${Math.round(stagger * 1000)}ms onsets: ${onsets.map((o) => (o.time - t0).toFixed(3)).join(" ")}`);
    }
    console.log(
      `\n== slow rake: ${Math.round(stagger * 1000)} ms per string (${Math.round(stagger * 5000)} ms end to end), downs at 80 bpm ==` +
      `\nstrums 8, onsets ${onsets.length}, hits ${t.hits}, missed ${t.missed}, extras ${t.extras}, mean error ${mean.toFixed(0)}ms`,
    );
  }
}

function scenarioClickBleed(withStrums: boolean, withKit = false) {
  const pattern = normalise({
    id: "cb", name: "cb", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [], chords: ["G"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const audible = pattern.strokes.map((s, i) => (isAudible(s) ? i : -1)).filter((i) => i >= 0);
  const t0 = 1.0;
  const loops = 2;

  // Built by hand so the clicks are the app's, not the harness's idea of a
  // strum: clicks on every beat, a modest room floor, and — in the second
  // variant — the player actually strumming the pattern on time over them.
  const total = Math.ceil((t0 + loops * 8 * slotS + 1.2) * SR);
  const audio = new Float32Array(total);
  const rand = makeRand(11);
  const beatEvery = 8 / pattern.beatsPerBar;
  const clickTimes: number[] = [];
  const drumTimes: number[] = [];
  for (let c = 0; c < loops; c++) {
    for (let i = 0; i < 8; i++) {
      const at = t0 + (c * 8 + i) * slotS;
      if (i % beatEvery === 0) {
        clickTimes.push(at);
        renderClick(audio, at, i === 0, 0.18);
      }
      if (withKit) {
        // performSlot's groove: kick on beats 1 and 3, snare on 2 and 4,
        // a hat on every eighth.
        if (i % beatEvery === 0) renderDrum(audio, at, (i / beatEvery) % 2 === 0 ? "kick" : "snare", rand);
        renderDrum(audio, at, "hat", rand);
        drumTimes.push(at);
      }
    }
  }
  let expectedStrums = 0;
  if (withStrums) {
    const midis = chordMidiNotes(chordById("G")!);
    for (let c = 0; c < loops; c++) {
      for (const i of audible) {
        renderStrum(audio, t0 + (c * 8 + i) * slotS, midis, rand);
        expectedStrums += 1;
      }
    }
    let peak = 0;
    for (const v of audio) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i < total; i++) audio[i] *= 0.5 / peak;
  }
  for (let i = 0; i < total; i++) audio[i] += (rand() * 2 - 1) * 0.002;

  const verdicts: SlotVerdict[] = [];
  const onsets: Onset[] = [];
  const detector = new OnsetDetector(SR, (o) => {
    onsets.push(o);
    scorer.hear(o);
  });
  detector.maxStrumSpreadS = Math.min(0.11, Math.max(0.07, slotS * 0.5));
  detector.minStrumGapS = minStrumGapOf(pattern);
  const scorer = new Scorer(pattern, pattern.bpm, 0, (v) => verdicts.push(v));
  // What useStrumEngine does: hand the scorer the clicks the app played.
  scorer.clickTimes = clickTimes;
  scorer.drumTimes = drumTimes;

  const schedule: { slot: number; cycle: number; time: number }[] = [];
  for (let c = 0; c < loops; c++) {
    pattern.strokes.forEach((stroke, i) => {
      if (!isAudible(stroke)) return;
      schedule.push({ slot: i, cycle: c, time: t0 + (c * 8 + i) * slotS });
    });
  }
  let booked = 0;
  let lastSweep = 0;
  for (let i = 0; i + CHUNK <= total; i += CHUNK) {
    const now = i / SR;
    while (booked < schedule.length && schedule[booked].time <= now + LOOKAHEAD_S) {
      scorer.expect(schedule[booked].slot, schedule[booked].cycle, schedule[booked].time);
      booked += 1;
    }
    detector.push(now, audio.subarray(i, i + CHUNK));
    if (now - lastSweep >= 0.025) {
      scorer.sweep(now);
      lastSweep = now;
    }
  }
  scorer.sweep(total / SR + 1);

  const t = tally(verdicts);
  if (withStrums) {
    console.log(`\n== ${withKit ? "click + drums" : "click"} + playing: the app's own sounds AND the player, on the beat ==`);
    console.log(
      `strums ${expectedStrums} over ${clickTimes.length} clicks, onsets ${onsets.length}, ` +
      `hits ${t.hits} (want ${expectedStrums}), missed ${t.missed}, extras ${t.extras}`,
    );
    if (process.env.DEBUG_ONSETS) {
      const onBeat = (time: number) => clickTimes.some((c) => Math.abs(time - c) < 0.02);
      console.log(
        `  missed slots: ${verdicts.filter((v) => v.grade === "missed").map((v) => `c${v.cycle}s${v.slot}`).join(" ")}`,
      );
      console.log(
        `  onsets: ${onsets.map((o) => `${(o.time - t0).toFixed(3)}${onBeat(o.time) ? "*" : ""}(body${o.bodyRise.toFixed(1)} sus${o.sustain.toFixed(2)})`).join(" ")}`,
      );
    }
  } else {
    console.log(`\n== ${withKit ? "click + drums" : "click"} bleed: app's own sounds only, player silent ==`);
    console.log(
      `clicks ${clickTimes.length}, onsets ${onsets.length}, ` +
      `phantom hits ${t.hits} (must be 0), extras ${t.extras}`,
    );
    if (process.env.DEBUG_ONSETS) {
      console.log(
        `  onsets: ${onsets.map((o) => `${(o.time - t0).toFixed(3)}(body${o.bodyRise.toFixed(1)} sus${o.sustain.toFixed(2)})`).join(" ")}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario 9: bare fingers — no pick scrape, eased attacks. The HF attack
// gate keys on the pick transient, so this is its worst legitimate customer.
// ---------------------------------------------------------------------------

function scenarioFingerstyle() {
  const pattern = normalise({
    id: "fs", name: "fs", bars: 1, slotsPerBar: 8, beatsPerBar: 4,
    strokes: ["D", "-", "D", "U", "-", "U", "D", "U"],
    accents: [], chords: ["Em"], bpm: 90,
  });
  const slotS = slotSeconds(pattern, pattern.bpm);
  const audible = pattern.strokes.map((s, i) => (isAudible(s) ? i : -1)).filter((i) => i >= 0);
  const t0 = 1.0;
  const strums: Strum[] = [];
  for (let c = 0; c < 2; c++) {
    for (const i of audible) {
      strums.push({ timeS: t0 + (c * 8 + i) * slotS, chordId: "Em", slot: i, errorMs: 0 });
    }
  }
  const { verdicts, onsets } = runSession(pattern, 2, strums, t0, { fingerstyle: true });
  const t = tally(verdicts);
  console.log(`\n== fingerstyle: no scrape, eased attacks, eighths at 90 bpm ==`);
  console.log(
    `strums ${strums.length}, onsets ${onsets.length}, ` +
    `hits ${t.hits}, missed ${t.missed}, extras ${t.extras}`,
  );
}

scenarioTiming();
scenarioFast();
scenarioRingover();
scenarioStrokes();
scenarioChucks();
scenarioNoisy();
scenarioOffset();
scenarioTempos();
scenarioFingerstyle();
scenarioClickBleed(false);
scenarioClickBleed(true);
scenarioClickBleed(false, true);
scenarioClickBleed(true, true);
scenarioLoopback();
scenarioSlowRakes();
