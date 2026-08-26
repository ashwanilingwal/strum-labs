/**
 * Everything the app remembers, and where it remembers it.
 *
 * Storage is deliberately two-tier: the browser always holds the working copy,
 * and signing in adds a synced copy on top. That means the app is fully usable
 * with no account — nothing is gated behind a login — and signing in later
 * carries your existing patterns up rather than starting you empty.
 */

import type { Tone } from "../audio/engine";
import { isInstrument } from "../audio/samples";
import { buildChordDrill, buildPattern, PROGRESSIONS, STRUM_STYLES, strumStyleById } from "../music/library";
import { normalise, PRESETS, type Pattern } from "../music/pattern";
import { createLocalStore, type ExternalStore } from "./store";

export const STORAGE_KEY = "strumlab:v1";

export interface AudioSettings {
  guitar: boolean;
  click: boolean;
  volume: number;
  clickVolume: number;
  tone: Tone;
  /** Bars of metronome before the pattern starts. 0 = straight in. */
  countInBars: number;
}

/**
 * What to do about the app's own guitar reaching the microphone.
 *
 * This matters more than it sounds. Echo cancellation is deliberately off (it
 * mangles guitar), so on speakers the mic hears the app's playback and scores
 * it as the player's strumming — and the better the samples, the worse it gets.
 */
export type DuckMode = "mute" | "subtract" | "off";

export interface ListenSettings {
  /** Constant round-trip latency to subtract from detected onsets. */
  offsetMs: number;
  /** Judge the chord, not just the timing. */
  checkChord: boolean;
  /** Judge up versus down. */
  checkStroke: boolean;
  duckMode: DuckMode;
}

/** One chord, a progression, or the technique games. */
export type PracticeMode = "chord" | "pattern" | "exercise";

/**
 * Quick picks are written into one reserved pattern rather than appended.
 *
 * Choosing a chord or a progression is browsing, not authoring — it should not
 * spawn a new saved pattern every time, and it must never overwrite one the
 * player built. Everything picked lands here; everything saved lives beside it.
 */
export const QUICK_ID = "quick-pick";

export interface AppState {
  patterns: Pattern[];
  activeId: string;
  mode: PracticeMode;
  /** What each selector was last set to, so switching modes restores it. */
  pick: {
    chordId: string;
    progressionId: string;
    styleId: string;
  };
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
  // Muting is the only option that is always correct. Subtraction is a
  // best-effort guess, and leaving it playing is only right on headphones.
  duckMode: "mute",
};

export const DEFAULT_PICK = {
  chordId: "G",
  progressionId: "four-chords",
  styleId: "folk",
};

/** Rebuild the reserved quick-pick pattern from the current selection. */
export function quickPattern(mode: PracticeMode, pick: AppState["pick"]): Pattern {
  const style = strumStyleById(pick.styleId) ?? STRUM_STYLES[0];
  if (mode === "chord") {
    return { ...buildChordDrill(style, pick.chordId), id: QUICK_ID };
  }
  const prog = PROGRESSIONS.find((p) => p.id === pick.progressionId) ?? PROGRESSIONS[0];
  return { ...buildPattern(style, prog.chords, `${prog.name} · ${style.name}`), id: QUICK_ID };
}

export function initialState(): AppState {
  const pick = { ...DEFAULT_PICK };
  const patterns = [quickPattern("chord", pick), ...PRESETS.map((p) => ({ ...p }))];
  return {
    patterns,
    activeId: QUICK_ID,
    mode: "chord",
    pick,
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

  const pick = { ...base.pick, ...(r.pick ?? {}) };
  const mode: PracticeMode =
    r.mode === "pattern" ? "pattern" : r.mode === "exercise" ? "exercise" : "chord";

  // The reserved slot must always exist — stored state from before it did, or
  // one where it was deleted, would otherwise leave the selectors pointing at
  // nothing.
  if (!patterns.some((p) => p.id === QUICK_ID)) {
    patterns.unshift(quickPattern(mode, pick));
  }

  const activeId = patterns.some((p) => p.id === r.activeId) ? r.activeId! : QUICK_ID;

  // A tone stored by an older version (or a device that has since had an
  // instrument removed) must not reach the engine unrecognised.
  const audio = { ...base.audio, ...(r.audio ?? {}) };
  if (audio.tone !== "synth" && !isInstrument(audio.tone)) audio.tone = base.audio.tone;

  return {
    patterns,
    activeId,
    mode,
    pick,
    audio,
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
