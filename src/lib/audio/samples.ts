/**
 * Sampled guitar: which recording covers which note.
 *
 * Source: FreePats "Spanish classical guitar", recorded by roberto@zenvoid.org
 * in 2008 with an AKG Perception 120, released under Creative Commons CC0 1.0
 * (public domain - no attribution required, commercial use permitted).
 * https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
 *
 * Generated from that library's own .sfz key map, intersected with every note
 * the chord library can actually produce, so nothing unreachable ships. Each
 * entry maps a MIDI note to the pitch centre of the recording covering it;
 * where the two differ the sampler resamples by that interval (never more
 * than a semitone here).
 *
 * Files are FLAC and named by pitch centre. That is deliberate: FLAC is
 * lossless and, unlike MP3 or AAC, carries no encoder delay at the head of the
 * file. In a timing trainer, a few milliseconds of silent padding before every
 * attack is not an acceptable cost.
 *
 * Regenerate with scripts/build-samples.py if the chord library gains notes
 * outside the current range.
 */

/** MIDI note -> pitch centre of the sample covering it. */
export const SAMPLE_FOR_NOTE: Record<number, number> = {
  40: 40,
  41: 41,
  42: 43,
  43: 43,
  45: 45,
  46: 47,
  47: 47,
  48: 48,
  49: 50,
  50: 50,
  51: 52,
  52: 52,
  53: 53,
  54: 54,
  55: 55,
  56: 56,
  57: 57,
  58: 58,
  59: 59,
  60: 60,
  61: 61,
  62: 62,
  64: 64,
  65: 65,
  66: 66,
  67: 67,
};

export const SAMPLE_BASE_URL = "/samples/guitar";

export function sampleUrl(centreMidi: number): string {
  return `${SAMPLE_BASE_URL}/${centreMidi}.flac`;
}

/** Every distinct file, for preloading. */
export const SAMPLE_CENTRES: number[] = Array.from(
  new Set(Object.values(SAMPLE_FOR_NOTE)),
).sort((a, b) => a - b);
