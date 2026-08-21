/**
 * Everything the app remembers, and where it remembers it.
 *
 * Storage is deliberately two-tier: the browser always holds the working copy,
 * and signing in adds a synced copy on top. That means the app is fully usable
 * with no account — nothing is gated behind a login — and signing in later
 * carries your existing patterns up rather than starting you empty.
 */

import { normalise, PRESETS, type Pattern } from "../music/pattern";
import { createLocalStore, type ExternalStore } from "./store";

export const STORAGE_KEY = "strumlab:v1";

export interface AudioSettings {
  guitar: boolean;
  click: boolean;
  volume: number;
  clickVolume: number;
  tone: "acoustic" | "electric";
  /** Bars of metronome before the pattern starts. 0 = straight in. */
  countInBars: number;
}

export interface ListenSettings {
  /** Constant round-trip latency to subtract from detected onsets. */
  offsetMs: number;
  /** Judge the chord, not just the timing. */
  checkChord: boolean;
  /** Judge up versus down. */
  checkStroke: boolean;
}

export interface AppState {
  patterns: Pattern[];
  activeId: string;
  audio: AudioSettings;
  listen: ListenSettings;
  /** Set once the room has been measured, so we don't re-ask every session. */
  roomNoiseDb: number | null;
}

export const DEFAULT_AUDIO: AudioSettings = {
  guitar: true,
  click: true,
  volume: 0.75,
  clickVolume: 0.5,
  tone: "acoustic",
  countInBars: 1,
};

export const DEFAULT_LISTEN: ListenSettings = {
  offsetMs: 0,
  checkChord: true,
  checkStroke: true,
};

export function initialState(): AppState {
  const patterns = PRESETS.map((p) => ({ ...p }));
  return {
    patterns,
    activeId: patterns[1].id,
    audio: { ...DEFAULT_AUDIO },
    listen: { ...DEFAULT_LISTEN },
    roomNoiseDb: null,
  };
}

/**
 * Anything coming back from storage — or from another device, or an older
 * version of the app — is untrusted. Reviving through `normalise` means a
 * ragged pattern can never reach the scheduler.
 */
export function reviveState(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AppState>;

  const patterns = Array.isArray(r.patterns) && r.patterns.length
    ? r.patterns.map((p) => normalise({ ...base.patterns[0], ...p }))
    : base.patterns;

  const activeId = patterns.some((p) => p.id === r.activeId) ? r.activeId! : patterns[0].id;

  return {
    patterns,
    activeId,
    audio: { ...base.audio, ...(r.audio ?? {}) },
    listen: { ...base.listen, ...(r.listen ?? {}) },
    roomNoiseDb: typeof r.roomNoiseDb === "number" ? r.roomNoiseDb : null,
  };
}

export const appStore: ExternalStore<AppState> = createLocalStore<AppState>(
  STORAGE_KEY,
  initialState(),
  reviveState,
);

export function activePattern(state: AppState): Pattern {
  return state.patterns.find((p) => p.id === state.activeId) ?? state.patterns[0];
}
