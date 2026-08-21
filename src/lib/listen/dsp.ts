/**
 * Feature extraction. Pure functions over magnitude spectra.
 *
 * Everything here is deliberately free of state and of Web Audio, so it can be
 * unit-tested against synthetic spectra and reused for the fingerpicking and
 * single-note work later.
 */

import { pitchClassOf, freqToMidi } from "../music/theory";

/** Guitar-relevant band. Below this is rumble; above it is mostly noise. */
export const MIN_HZ = 70;
export const MAX_HZ = 5000;
/** Chroma is far more reliable if it ignores the very top harmonics. */
export const CHROMA_MAX_HZ = 2200;

export function binToHz(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function dbfs(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-9));
}

/**
 * Spectral flux: the sum of *increases* in bin magnitude since the last frame.
 *
 * The half-wave rectification is the whole point. Steady noise — a fan, mains
 * hum, traffic — has a roughly constant spectrum, so its bins neither rise nor
 * fall and it contributes almost nothing. A struck string makes every bin jump
 * at once. Noise is rejected structurally here, not filtered away.
 */
export function spectralFlux(cur: Float32Array, prev: Float32Array, loBin: number, hiBin: number): number {
  let flux = 0;
  for (let i = loBin; i < hiBin; i++) {
    const d = cur[i] - prev[i];
    if (d > 0) flux += d;
  }
  return flux;
}

/** Energy-weighted mean frequency. Bright sounds sit higher. */
export function spectralCentroid(mag: Float32Array, sampleRate: number, fftSize: number, loBin: number, hiBin: number): number {
  let num = 0;
  let den = 0;
  for (let i = loBin; i < hiBin; i++) {
    const m = mag[i];
    num += m * binToHz(i, sampleRate, fftSize);
    den += m;
  }
  return den > 0 ? num / den : 0;
}

/** Fraction of band energy sitting above `splitHz`. Used for stroke direction. */
export function trebleRatio(mag: Float32Array, sampleRate: number, fftSize: number, splitHz: number, loBin: number, hiBin: number): number {
  let low = 0;
  let high = 0;
  for (let i = loBin; i < hiBin; i++) {
    const hz = binToHz(i, sampleRate, fftSize);
    if (hz < splitHz) low += mag[i];
    else high += mag[i];
  }
  const total = low + high;
  return total > 0 ? high / total : 0;
}

/**
 * 12-bin chroma vector: fold every bin onto its pitch class.
 *
 * Bins are weighted by how close they sit to the centre of a semitone, which
 * suppresses the smear between adjacent pitch classes that otherwise makes
 * every chord look like every other chord.
 */
export function chroma(mag: Float32Array, sampleRate: number, fftSize: number, out: Float32Array): Float32Array {
  out.fill(0);
  const lo = Math.max(1, Math.floor((MIN_HZ * fftSize) / sampleRate));
  const hi = Math.min(mag.length, Math.ceil((CHROMA_MAX_HZ * fftSize) / sampleRate));
  for (let i = lo; i < hi; i++) {
    const m = mag[i];
    if (m <= 0) continue;
    const hz = binToHz(i, sampleRate, fftSize);
    const midi = freqToMidi(hz);
    const nearest = Math.round(midi);
    const cents = Math.abs(midi - nearest);
    if (cents > 0.35) continue;
    const weight = 1 - cents / 0.35;
    out[pitchClassOf(nearest)] += m * weight;
  }
  return normalise(out);
}

export function normalise(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
