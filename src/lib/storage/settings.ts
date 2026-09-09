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
import { GAME_LEVELS, type LevelResult } from "../music/levels";
import { MAX_BPM, MIN_BPM, normalise, PRESETS, type Pattern } from "../music/pattern";
import { createLocalStore, type ExternalStore } from "./store";

export const STORAGE_KEY = "strumlab:v1";

export interface AudioSettings {
  guitar: boolean;
  click: boolean;
  /** The synthesised drum groove under pattern practice. */
  backing: boolean;
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

/** The level game, one chord, a progression, or the technique games. */
export type PracticeMode = "game" | "chord" | "pattern" | "exercise";

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
  /**
   * Tempo of exercise mode's optional pace click. Only the tempo persists —
   * on/off is per-visit and always starts off, so no session opens with a
   * metronome already ticking over an untimed game.
   */
  exerciseBpm: number;
  /** The level game: which level is up, and how every attempt so far ended. */
  game: {
    level: number;
    results: Record<number, LevelResult>;
  };
  /** Set once the room has been measured, so we don't re-ask every session. */
  roomNoiseDb: number | null;
}

export const DEFAULT_AUDIO: AudioSettings = {
  guitar: true,
  click: true,
  // On by default: the drums ARE the level. Off is one tap away.
  backing: true,
  volume: 0.75,
  // 0.5 buried the click under the guitar for most players (raised 2026-08-27).
  clickVolume: 0.7,
  tone: "acoustic",
  countInBars: 1,
};

/**
 * The click default moved 0.5 → 0.7. A stored 0.5 is almost always the old
 * default rather than a choice — the slider was never the reason anyone opened
 * settings — so it is lifted to the new default. Anyone who actually wants a
 * quieter click sets it once more and any other value sticks forever.
 */
const OLD_CLICK_DEFAULT = 0.5;

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
  if (mode === "chord" || mode === "game") {
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
    mode: "game",
    pick,
    audio: { ...DEFAULT_AUDIO },
    listen: { ...DEFAULT_LISTEN },
    exerciseBpm: 60,
    game: { level: 1, results: {} },
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
    r.mode === "pattern" ? "pattern"
      : r.mode === "exercise" ? "exercise"
      : r.mode === "chord" ? "chord"
      : "game";

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
  if (audio.clickVolume === OLD_CLICK_DEFAULT) audio.clickVolume = base.audio.clickVolume;
  // State saved before the game existed predates drums-on-by-default; the
  // groove is now the point of a level, so it comes on once for everyone.
  if (!r.game) audio.backing = true;

  const rawGame = (r.game ?? {}) as Partial<AppState["game"]>;
  const results: Record<number, LevelResult> = {};
  for (const [k, v] of Object.entries(rawGame.results ?? {})) {
    const n = Number(k);
    if (!GAME_LEVELS.some((l) => l.n === n) || !v || typeof v !== "object") continue;
    const stars = Math.max(0, Math.min(3, Math.round(Number(v.stars) || 0))) as LevelResult["stars"];
    results[n] = {
      passed: Boolean(v.passed),
      timing: Math.max(0, Math.min(1, Number(v.timing) || 0)),
      chords: Math.max(0, Math.min(1, Number(v.chords) || 0)),
      stars,
    };
  }
  const game = {
    level: GAME_LEVELS.some((l) => l.n === rawGame.level) ? (rawGame.level as number) : 1,
    results,
  };

  return {
    patterns,
    activeId,
    mode,
    pick,
    audio,
    listen: { ...base.listen, ...(r.listen ?? {}) },
    exerciseBpm: typeof r.exerciseBpm === "number"
      ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(r.exerciseBpm)))
      : base.exerciseBpm,
    game,
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
