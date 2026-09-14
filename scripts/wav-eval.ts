/**
 * Run real recordings through the onset detector and chord matcher.
 *
 *   npx tsx scripts/wav-eval.ts "path/to/D major.wav" [more.wav ...]
 *
 * The expected chord is read from the file name when it is recognisable
 * ("D major" → D, "E minor" → Em, "AMAJOR" → A, "g major" → G). Mono or
 * stereo 16/24/32-bit PCM and 32-bit float WAVs at any rate are accepted;
 * stereo is averaged and other rates are resampled linearly to 44.1 kHz.
 * Room calibration uses the file's first 250 ms only when that stretch is
 * clearly quieter than the rest, as a recording that starts on the strum
 * would otherwise calibrate the room to the guitar itself.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { OnsetDetector, type Onset } from "../src/lib/listen/detector";

const SR = 44100;
const CHUNK = 512;
const CALIB_S = 0.25;

function readWav(path: string): { sampleRate: number; samples: Float32Array } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let pos = 12;
  let format = 1;
  let channels = 1;
  let sampleRate = SR;
  let bits = 16;
  let data: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE carries the real format in its sub-format GUID.
      if (format === 0xfffe && size >= 26) format = buf.readUInt16LE(body + 24);
    } else if (id === "data") {
      data = buf.subarray(body, body + size);
    }
    pos = body + size + (size % 2);
  }
  if (!data) throw new Error(`${path}: no data chunk`);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = (i * channels + c) * bytes;
      let v: number;
      if (format === 3 && bits === 32) v = data.readFloatLE(at);
      else if (bits === 16) v = data.readInt16LE(at) / 32768;
      else if (bits === 24) v = ((data[at] | (data[at + 1] << 8) | (data[at + 2] << 16)) << 8 >> 8) / 8388608;
      else if (bits === 32) v = data.readInt32LE(at) / 2147483648;
      else if (bits === 8) v = (data[at] - 128) / 128;
      else throw new Error(`${path}: unsupported ${bits}-bit format ${format}`);
      sum += v;
    }
    mono[i] = sum / channels;
  }
  return { sampleRate, samples: mono };
}

function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.floor((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const src = (i * from) / to;
    const k = Math.floor(src);
    const frac = src - k;
    out[i] = samples[k] * (1 - frac) + (samples[Math.min(k + 1, samples.length - 1)] ?? 0) * frac;
  }
  return out;
}

function rmsDb(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, from); i < Math.min(samples.length, to); i++) {
    sum += samples[i] * samples[i];
    n += 1;
  }
  return n ? 20 * Math.log10(Math.sqrt(sum / n) + 1e-12) : -Infinity;
}

function expectedChord(file: string): string | null {
  const m = /^\s*([A-Ga-g])\s*(#|b)?\s*(major|maj|minor|min|m)?\b/i.exec(basename(file).replace(/\.wav$/i, ""));
  if (!m) return null;
  const root = m[1].toUpperCase() + (m[2] ?? "");
  const q = (m[3] ?? "").toLowerCase();
  return q === "minor" || q === "min" || q === "m" ? `${root}m` : root;
}

function describe(o: Onset, t0: number): string {
  const chord = o.chordGuess ? `${o.chordGuess} conf ${o.chordConfidence.toFixed(2)}` : "no chord";
  const alts = o.chordRanking.slice(1).map((r) => `${r.id} ${r.score.toFixed(2)}`).join(", ");
  return (
    `  t=${(o.time - t0).toFixed(3)}s x${o.strength.toFixed(1)} ${o.levelDb.toFixed(0)}dB ` +
    `${chord} (score ${o.matchScore.toFixed(2)}, margin ${o.matchMargin.toFixed(2)}; then ${alts}) ` +
    `stroke ${o.stroke ?? "?"} body${o.bodyRise === Infinity ? "∞" : o.bodyRise.toFixed(1)} sus${o.sustain.toFixed(2)}`
  );
}

function evaluate(path: string) {
  const wav = readWav(path);
  const audio = resample(wav.samples, wav.sampleRate, SR);
  const expected = expectedChord(path);
  const headDb = rmsDb(audio, 0, Math.floor(CALIB_S * SR));
  const bodyDb = rmsDb(audio, Math.floor(CALIB_S * SR), audio.length);
  const calibrate = headDb < bodyDb - 15;

  const onsets: Onset[] = [];
  const detector = new OnsetDetector(SR, (o) => onsets.push(o));
  let room = "uncalibrated";
  let start = 0;
  if (calibrate) {
    detector.beginCalibration();
    const calibEnd = Math.floor(CALIB_S * SR);
    for (let i = 0; i + CHUNK <= calibEnd; i += CHUNK) detector.push(i / SR, audio.subarray(i, i + CHUNK));
    const profile = detector.endCalibration();
    room = `${profile.quality} (${profile.noiseDb.toFixed(0)} dB)`;
    detector.reset();
    start = calibEnd;
  }
  for (let i = start; i + CHUNK <= audio.length; i += CHUNK) detector.push(i / SR, audio.subarray(i, i + CHUNK));
  // Flush: a second of silence lets the last chord window close.
  const tail = new Float32Array(CHUNK);
  const end = Math.floor(audio.length / CHUNK) * CHUNK;
  for (let i = 0; i < SR; i += CHUNK) detector.push((end + i) / SR, tail);

  console.log(
    `\n== ${basename(path)}: ${(audio.length / SR).toFixed(2)}s, ${wav.sampleRate} Hz, peak ${bodyDb.toFixed(0)} dB rms, ` +
    `head ${headDb.toFixed(0)} dB → room ${room}; expected ${expected ?? "?"} ==`,
  );
  if (!onsets.length) {
    console.log("  no onsets detected");
    return { expected, onsets };
  }
  for (const o of onsets) console.log(describe(o, 0));
  const guessed = onsets.filter((o) => o.chordGuess);
  const right = expected ? guessed.filter((o) => o.chordGuess === expected).length : null;
  const confident = onsets.filter((o) => o.chordConfidence >= 0.55);
  const confidentRight = expected ? confident.filter((o) => o.chordGuess === expected).length : null;
  console.log(
    `  onsets ${onsets.length}, guessed ${guessed.length}` +
    (expected ? `, right ${right}/${guessed.length}; past the 0.55 gate ${confident.length}, of which right ${confidentRight}` : ""),
  );
  return { expected, onsets };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npx tsx scripts/wav-eval.ts file.wav [...]");
  process.exit(1);
}
for (const f of files) evaluate(f);
