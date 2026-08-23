/**
 * Monophonic pitch detection, for the tuner.
 *
 * The FFT used for onsets is no good here. At 44.1 kHz a 1024-point transform
 * has 43 Hz bins, and low E is 82.4 Hz — the entire useful range of the bottom
 * string spans two bins. Tuning needs single-cent resolution, which is roughly
 * 0.05 Hz down there.
 *
 * So this works in the time domain instead, using the McLeod / normalised
 * square difference function. Plain autocorrelation is the obvious choice and
 * has a well-known failure: its peaks grow with amplitude, so it happily locks
 * onto an octave below the real note. NSDF normalises each lag by the energy
 * actually overlapping at that lag, which flattens that bias out.
 *
 * Pure and synchronous — takes a buffer, returns a frequency — so it can be
 * checked against synthetic tones without a microphone anywhere near it.
 */

/** Below this the result is noise, not a note. */
const CLARITY_FLOOR = 0.9;
/** Guitar range with headroom: low E is 82.4 Hz, 24th-fret high E is 1319 Hz. */
export const MIN_HZ = 60;
export const MAX_HZ = 1400;

export interface PitchResult {
  hz: number;
  /** 0..1. How periodic the buffer actually is — 1 is a pure tone. */
  clarity: number;
}

/**
 * @param buffer time-domain samples, at least two periods of the lowest note
 *               you expect (about 1100 samples at 44.1 kHz for low E)
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): PitchResult | null {
  const n = buffer.length;
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_HZ));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  if (maxLag <= minLag) return null;

  // Bail out on silence before doing any real work.
  let power = 0;
  for (let i = 0; i < n; i++) power += buffer[i] * buffer[i];
  if (power / n < 1e-7) return null;

  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0;
    let energy = 0;
    for (let i = 0; i < n - lag; i++) {
      acf += buffer[i] * buffer[i + lag];
      energy += buffer[i] * buffer[i] + buffer[i + lag] * buffer[i + lag];
    }
    nsdf[lag] = energy > 0 ? (2 * acf) / energy : 0;
  }

  // Collect the local maximum of each positive-going run, then take the first
  // one that clears a fraction of the tallest. Taking the tallest outright is
  // what makes naive implementations report the octave below.
  const peaks: number[] = [];
  let lag = minLag;
  while (lag < maxLag && nsdf[lag] > 0) lag++;   // skip the run at lag 0
  while (lag < maxLag) {
    if (nsdf[lag] > 0 && nsdf[lag] >= nsdf[lag - 1]) {
      let best = lag;
      while (lag < maxLag && nsdf[lag] > 0) {
        if (nsdf[lag] > nsdf[best]) best = lag;
        lag++;
      }
      peaks.push(best);
    }
    lag++;
  }
  if (!peaks.length) return null;

  let highest = 0;
  for (const p of peaks) if (nsdf[p] > highest) highest = nsdf[p];
  if (highest < CLARITY_FLOOR) return null;

  const threshold = highest * 0.9;
  const chosen = peaks.find((p) => nsdf[p] >= threshold);
  if (chosen === undefined) return null;

  // Parabolic interpolation across the peak. Without it the answer is
  // quantised to whole samples, which near the top string is worth tens of
  // cents — enough to make a tuner useless.
  const y0 = nsdf[chosen - 1] ?? nsdf[chosen];
  const y1 = nsdf[chosen];
  const y2 = nsdf[chosen + 1] ?? nsdf[chosen];
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom !== 0 ? (y2 - y0) / denom : 0;
  const refined = chosen + shift;

  const hz = sampleRate / refined;
  if (!Number.isFinite(hz) || hz < MIN_HZ || hz > MAX_HZ) return null;

  return { hz, clarity: Math.min(1, y1) };
}
