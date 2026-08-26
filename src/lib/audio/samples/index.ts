/**
 * The sampled instruments StrumLab ships.
 *
 * Adding one is two steps and touches nothing else:
 *   1. python3 scripts/build-samples.py <id> <extracted-library-dir>
 *   2. add an entry below
 *
 * The per-instrument note maps are generated; this file is the hand-written
 * registry that names them, credits them, and records their licence. Keeping
 * provenance next to the data means the credit cannot quietly drift away from
 * the files it describes.
 *
 * Licensing is deliberately per-instrument rather than one blanket statement,
 * because it genuinely differs: two sets are public domain and one is copyleft.
 * See README for what that means for the repo.
 */

import { ACOUSTIC_NOTES } from "./acoustic";
import { CLASSICAL_NOTES } from "./classical";
import { ELECTRIC_NOTES } from "./electric";

export type InstrumentId = "acoustic" | "classical" | "electric";

export interface Instrument {
  id: InstrumentId;
  /** Shown on the tone control. */
  label: string;
  /** One honest line about what it actually is. */
  blurb: string;
  credit: string;
  licence: string;
  /** MIDI note -> pitch centre of the recording covering it. */
  notes: Record<number, number>;
  /**
   * Playback gain for this instrument's samples.
   *
   * The recordings are peak-normalised, so six strings summing coherently at
   * a strum attack drove the master well past full scale — measured at the
   * bus: acoustic 1.63, classical 1.10, electric 1.22 against a ceiling of
   * 1.0, i.e. audible clipping on every open strum. These values bring each
   * tone to roughly the synth's loudness (~0.2 RMS) with peaks under 0.8.
   */
  trim: number;
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  acoustic: {
    id: "acoustic",
    label: "Acoustic",
    blurb: "Steel-string dreadnought. Bright and jangly — the sound most strumming patterns are written for.",
    credit: "FreePats FS Seagull steel-string, from samples by Gary Campion (FlameStudios), 2008",
    licence: "GPL-3.0-or-later",
    notes: ACOUSTIC_NOTES,
    trim: 0.36,
  },
  classical: {
    id: "classical",
    label: "Classical",
    blurb: "Nylon-string classical guitar. Warm and round — lovely fingerpicked, mellower for strumming.",
    credit: "FreePats Spanish classical guitar, recorded by roberto@zenvoid.org, 2008",
    licence: "CC0 1.0",
    notes: CLASSICAL_NOTES,
    trim: 0.62,
  },
  electric: {
    id: "electric",
    label: "Electric",
    blurb: "A Fender through a clean amp, bridge pickup.",
    credit: "FreePats Electric Guitar FSBS (clean), direct-sampled Fender",
    licence: "CC0 1.0",
    notes: ELECTRIC_NOTES,
    trim: 0.6,
  },
};

export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];

export function isInstrument(value: string): value is InstrumentId {
  return value in INSTRUMENTS;
}

export function sampleUrl(instrument: InstrumentId, centreMidi: number): string {
  return `/samples/${instrument}/${centreMidi}.flac`;
}

/** Distinct files for one instrument, for preloading. */
export function centresFor(instrument: InstrumentId): number[] {
  return Array.from(new Set(Object.values(INSTRUMENTS[instrument].notes))).sort((a, b) => a - b);
}
