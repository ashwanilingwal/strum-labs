"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import type { useStrumEngine } from "@/hooks/useStrumEngine";
import { chordById } from "@/lib/music/chords";
import { barOfSlot, type Pattern } from "@/lib/music/pattern";
import {
  GAME_LEVELS, levelByNumber, levelPattern, PASS_CHORDS, PASS_TIMING, scoreLevel,
  unlockedUpTo, type GameLevel, type LevelResult,
} from "@/lib/music/levels";
import { QUICK_ID, type AppState } from "@/lib/storage/settings";
import { ChordChart } from "./chart/ChordChart";
import { StrumLane } from "./StrumLane";
import { bucketOf, ChordVerdict, TimingBoxes } from "./TimingBoxes";
import { ChromeText } from "./ui/ChromeText";
import { CountdownOverlay } from "./ui/CountdownOverlay";
import { GearIcon } from "./ui/GearIcon";
import { MotifField } from "./ui/MotifField";

/**
 * The play screen's first mode: StrumLab as a game.
 *
 * A level is a chord set, a strum and a tempo, played over the drums for a
 * fixed number of loops while the mic scores every strum. The screen is
 * built for a glance from the guitar: the chord, a ✅/❌ over it, the lane,
 * three emoji boxes for early / on time / late, and a streak flame. No
 * milliseconds anywhere — that is what the practice modes are for.
 *
 * Pressing Play turns the mic on first (with its room measurement) and only
 * then starts the count-in, so a level is never scored against silence. The
 * level ends itself: when the transport begins the loop after the last one,
 * a short grace lets the final verdicts land, then the transport stops and
 * the result is banked.
 */

type Engine = ReturnType<typeof useStrumEngine>;
type Phase = "select" | "playing" | "result";

/** Rotated per on-time hit so the celebration doesn't go stale. */
const HIT_EMOJI = ["🎯", "🔥", "✨", "💚", "🤘", "🌟"];

/** How long after the last loop the transport keeps going, so late verdicts land. */
const LEVEL_TAIL_MS = 700;

export function GameMode({
  engine, state, setState, pattern, onSettings, onListenStart,
}: {
  engine: Engine;
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  pattern: Pattern;
  onSettings: () => void;
  /** Called the moment a level turns the mic on. Resolves once the player
   *  has dealt with the headphones tip (or at once, if they already have),
   *  so the countdown doesn't run behind a dialog. */
  onListenStart: () => Promise<void>;
}) {
  const level = levelByNumber(state.game.level);
  const unlocked = unlockedUpTo(state.game.results);
  const [phase, setPhase] = useState<Phase>("select");
  const [result, setResult] = useState<LevelResult | null>(null);
  const [starting, setStarting] = useState(false);
  const countdown = useCountdown();

  // The engine's return object is rebuilt every render; the timers below must
  // see the live one without depending on its identity.
  const engineRef = useRef(engine);
  useEffect(() => { engineRef.current = engine; }, [engine]);

  // ---- the level's pattern lives in the reserved slot ---------------------

  useEffect(() => {
    const wanted = levelPattern(level);
    if (pattern.name === wanted.name && pattern.bpm === wanted.bpm) return;
    setState((prev) => ({
      ...prev,
      activeId: QUICK_ID,
      patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? { ...wanted, id: QUICK_ID } : p)),
    }));
  }, [level, pattern.name, pattern.bpm, setState]);

  // ---- streak --------------------------------------------------------------

  // Derived, not tracked: the engine already keeps the last hits in order, so
  // the streak is the run of on-time ones at the end of that list — broken by
  // anything that wasn't a hit at all.
  const lastBucketNow = bucketOf(engine.lastVerdict);
  let streak = 0;
  if (lastBucketNow === "onTime") {
    for (let i = engine.recent.length - 1; i >= 0 && engine.recent[i].grade === "tight"; i--) streak += 1;
  }

  // ---- start / stop --------------------------------------------------------

  const startLevel = useCallback(async () => {
    const e = engineRef.current;
    if (e.playing || starting || countdown.n !== null) return;
    setResult(null);
    setPhase("playing");
    const needsMic = e.micStatus === "off" || e.micStatus === "error";
    if (needsMic) await onListenStart();
    setStarting(true);
    // The mic opens and measures the room WHILE the 3-2-1 runs: both take a
    // couple of seconds, and the player wants their guitar in hand by "1",
    // not after a second wait.
    const mic = needsMic ? engineRef.current.startListening() : Promise.resolve(true);
    const counted = await countdown.run(3);
    const listening = await mic;
    setStarting(false);
    if (!counted) return;
    if (!listening) {
      // No mic, no scoring, no level. The reason is on screen.
      setPhase("select");
      return;
    }
    await engineRef.current.start();
  }, [starting, onListenStart, countdown]);

  const stopLevel = useCallback(() => {
    countdown.cancel();
    engineRef.current.stop();
    engineRef.current.dismissSummary();
    setPhase("select");
  }, [countdown]);

  // The mic refused: no scoring is possible, so don't pretend to play a level.
  // The transport is stopped from here (an external system); the phase shown
  // is derived rather than set, so this effect never renders anything itself.
  const micFailed = engine.micStatus === "error";
  useEffect(() => {
    if (phase === "playing" && micFailed) engineRef.current.stop();
  }, [phase, micFailed]);
  const shownPhase: Phase = phase === "playing" && micFailed ? "select" : phase;

  // The level ends itself once the loop after the last one begins.
  useEffect(() => {
    if (phase !== "playing" || !engine.playing || engine.cycle < level.loops) return;
    const n = level.n;
    const lvl = level;
    const t = window.setTimeout(() => {
      const e = engineRef.current;
      e.stop();
      e.dismissSummary();
      const r = scoreLevel(lvl, e.stats);
      setResult(r);
      setState((prev) => {
        const old = prev.game.results[n];
        const best: LevelResult = old
          ? {
              passed: old.passed || r.passed,
              timing: Math.max(old.timing, r.timing),
              chords: Math.max(old.chords, r.chords),
              stars: Math.max(old.stars, r.stars) as LevelResult["stars"],
            }
          : r;
        return { ...prev, game: { ...prev.game, results: { ...prev.game.results, [n]: best } } };
      });
      setPhase("result");
    }, LEVEL_TAIL_MS);
    return () => window.clearTimeout(t);
  }, [phase, engine.playing, engine.cycle, level, setState]);

  // Space plays and stops here too, but through the level flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.code !== "Space" || phase === "result") return;
      e.preventDefault();
      if (engineRef.current.playing || countdown.n !== null) stopLevel();
      else void startLevel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startLevel, stopLevel, countdown.n]);

  const pickLevel = (n: number) => {
    if (engine.playing || n > unlocked) return;
    setPhase("select");
    setResult(null);
    setState((prev) => ({ ...prev, game: { ...prev.game, level: n } }));
  };

  // ---- what to show --------------------------------------------------------

  const showVerdicts = engine.micStatus === "listening";
  const bar = engine.activeSlot >= 0 ? barOfSlot(pattern, engine.activeSlot) : 0;
  const chord = chordById(pattern.chords[bar]);
  const lastBucket = showVerdicts ? bucketOf(engine.lastVerdict) : null;
  const totalSlots = pattern.strokes.length;
  const progress = engine.playing
    ? Math.min(1, (engine.cycle * totalSlots + Math.max(0, engine.activeSlot)) / (level.loops * totalSlots))
    : 0;
  const micLabel =
    engine.micStatus === "calibrating" ? "🎤 Measuring the room…"
      : engine.micStatus === "opening" ? "🎤 Opening the mic…"
      : engine.micStatus === "listening" ? "🎤 Listening"
      : engine.micStatus === "error" ? "🎤 Mic failed"
      : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* The map: every level as a bubble, locked ones dimmed. */}
        <section className="relative px-4 pt-1 sm:px-8">
          <div className="wrap">
            <div className="flex gap-2 overflow-x-auto pb-2 sm:justify-center" role="list" aria-label="Levels">
              {GAME_LEVELS.map((l) => (
                <LevelBubble
                  key={l.n}
                  level={l}
                  active={l.n === level.n}
                  locked={l.n > unlocked}
                  result={state.game.results[l.n]}
                  disabled={engine.playing}
                  onPick={() => pickLevel(l.n)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* The stage. */}
        <section className="relative flex-1 px-4 py-3 sm:px-8 sm:py-4">
          <MotifField density={0.6} />
          <div className="wrap relative z-10 flex flex-col items-center gap-3 sm:gap-4">
            <div className="text-center">
              <p className="caps text-fg-dim">
                Level {level.n} · {level.title}
                {engine.playing ? ` · loop ${Math.min(engine.cycle + 1, level.loops)} of ${level.loops}` : ""}
              </p>
              {shownPhase === "select" && !engine.playing ? (
                <p className="mt-1 max-w-md text-sm text-fg-muted">{level.emoji} {level.blurb}</p>
              ) : null}
            </div>

            {/* Progress through the level. */}
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full border border-line bg-black/20">
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{ width: `${Math.round(progress * 100)}%`, background: "var(--accent)" }}
              />
            </div>

            <div className="flex w-full items-center justify-center gap-4 sm:gap-10">
              <div className="min-w-0 text-center">
                <ChordVerdict verdict={engine.lastVerdict} show={showVerdicts} seq={engine.verdictSeq} />
                {engine.countIn > 0 ? (
                  <p className="caps text-fg-dim" role="status">
                    get ready · {engine.countIn}
                  </p>
                ) : (
                  <p className="caps text-fg-dim">{engine.playing ? `bar ${bar + 1}` : "next up"}</p>
                )}
                <ChromeText className="mt-1 block text-[clamp(4rem,13vw,7rem)]">
                  {chord?.symbol ?? "—"}
                </ChromeText>
                <p className="caps-lg mt-1 text-fg">{chord?.name}</p>
              </div>
              {chord ? (
                <div className="block-light card-flat w-28 shrink-0 p-3 sm:w-36 sm:p-4">
                  <ChordChart chord={chord} />
                </div>
              ) : null}
            </div>

            <div className="w-full">
              <StrumLane
                pattern={pattern}
                activeSlot={engine.activeSlot}
                verdicts={engine.verdicts}
                showVerdicts={showVerdicts}
              />
            </div>

            <div className="w-full max-w-md">
              <TimingBoxes
                early={engine.stats.early}
                onTime={engine.stats.tight}
                late={engine.stats.late}
                last={lastBucket}
                streak={streak}
                seq={engine.verdictSeq}
              />
            </div>

            {engine.micMessage ? <p className="text-center text-xs text-loose">{engine.micMessage}</p> : null}
            {engine.room && (engine.room.quality === "noisy" || engine.room.quality === "silent") && showVerdicts ? (
              <p className="max-w-md text-center text-xs" style={{ color: engine.room.quality === "silent" ? "var(--loose)" : "var(--close)" }}>
                {engine.room.message}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* Transport: one big button, the two sounds, the gear. */}
      <div className="shrink-0 border-t border-line bg-ink/95 px-4 py-3 sm:px-8">
        <div className="wrap flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => (engine.playing || countdown.n !== null ? stopLevel() : void startLevel())}
            className={`btn ${engine.playing || countdown.n !== null ? "btn-hot" : "btn-lit"} h-12 !px-5 text-base font-black sm:h-14 sm:!px-7`}
          >
            {countdown.n !== null ? "■ Cancel" : starting ? "🎤 Getting ready…" : engine.playing ? "■ Stop" : `▶ Play level ${level.n}`}
          </button>
          <Toggle
            on={state.audio.backing}
            label="🥁 Drums"
            onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, backing: v } }))}
          />
          <Toggle
            on={state.audio.click}
            label="🎵 Click"
            onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, click: v } }))}
          />
          {micLabel ? <span className="caps text-fg-dim">{micLabel}</span> : null}
          <button type="button" onClick={onSettings} className="btn btn-icon ml-auto" aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {/* The whole screen agrees for a beat on an on-time hit — never for a
          wrong chord. Keyed so consecutive hits each flash. */}
      {showVerdicts && engine.lastVerdict?.grade === "tight" && engine.lastVerdict.chordOk !== false ? (
        <div key={engine.verdictSeq} className="hit-wash" aria-hidden="true">
          <span className="hit-wash-emoji">{HIT_EMOJI[engine.verdictSeq % HIT_EMOJI.length]}</span>
        </div>
      ) : null}

      <CountdownOverlay n={countdown.n} />

      {phase === "result" && result ? (
        <ResultSheet
          level={level}
          result={result}
          hasNext={level.n < GAME_LEVELS.length}
          onNext={() => {
            pickLevel(level.n + 1);
          }}
          onRetry={() => void startLevel()}
          onClose={() => setPhase("select")}
        />
      ) : null}
    </>
  );
}

function LevelBubble({
  level, active, locked, result, disabled, onPick,
}: {
  level: GameLevel;
  active: boolean;
  locked: boolean;
  result: LevelResult | undefined;
  disabled: boolean;
  onPick: () => void;
}) {
  const passed = result?.passed ?? false;
  return (
    <button
      type="button"
      role="listitem"
      onClick={onPick}
      disabled={locked || disabled}
      aria-current={active || undefined}
      aria-label={`Level ${level.n}, ${level.title}${locked ? ", locked" : passed ? `, ${result!.stars} stars` : ""}`}
      className="relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 transition"
      style={{
        borderColor: active ? "var(--acid)" : passed ? "var(--tight)" : "var(--line)",
        background: active ? "rgba(142, 228, 58, 0.16)" : "rgba(255, 255, 255, 0.05)",
        boxShadow: active ? "0 0 18px rgba(142, 228, 58, 0.35)" : "none",
        opacity: locked ? 0.4 : 1,
        cursor: locked || disabled ? "not-allowed" : "pointer",
      }}
    >
      <span className="text-2xl leading-none" aria-hidden="true">{locked ? "🔒" : level.emoji}</span>
      <span className="caps mt-1" style={{ color: active ? "var(--acid)" : "var(--fg-dim)" }}>{level.n}</span>
      {passed ? (
        <span className="absolute -bottom-2 text-[10px] leading-none" aria-hidden="true">
          {"⭐".repeat(result!.stars)}
        </span>
      ) : null}
    </button>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`btn !px-3 !py-1.5 text-xs ${on ? "btn-lit" : ""}`}
    >
      {label}
    </button>
  );
}

/** How the level went — big, emoji-first, one number per rule. */
function ResultSheet({
  level, result, hasNext, onNext, onRetry, onClose,
}: {
  level: GameLevel;
  result: LevelResult;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-result-title"
        className="block-light card-flat relative w-full max-w-sm p-5 text-center sm:p-6"
      >
        <span aria-hidden="true" className="block text-6xl leading-none">
          {result.passed ? (result.stars === 3 ? "🏆" : "🎉") : "😅"}
        </span>
        <h2 id="level-result-title" className="font-display mt-3 text-2xl leading-tight text-chrome-700">
          {result.passed ? `Level ${level.n} cleared!` : "Not yet!"}
        </h2>
        <p className="mt-1 text-2xl leading-none" aria-label={`${result.stars} of 3 stars`}>
          {"⭐".repeat(result.stars)}{"☆".repeat(3 - result.stars)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat emoji="🎯" label="on the beat" value={pct(result.timing)} ok={result.timing >= PASS_TIMING} need={pct(PASS_TIMING)} />
          <Stat emoji="🎸" label="right chord" value={pct(result.chords)} ok={result.chords >= PASS_CHORDS} need={pct(PASS_CHORDS)} />
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          {result.passed
            ? hasNext ? `${level.emoji} Next: ${GAME_LEVELS[level.n].emoji} ${GAME_LEVELS[level.n].title}` : "👑 That was the last level. You're a strummer now."
            : result.timing < PASS_TIMING
              ? "Watch the drums, not your hand — land the strum right on the beat."
              : "The timing's there! Check the chord shape — are all six strings ringing clean?"}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {result.passed && hasNext ? (
            <button type="button" className="btn btn-lit" onClick={onNext}>Next level →</button>
          ) : null}
          <button type="button" className={`btn ${result.passed ? "" : "btn-lit"}`} onClick={onRetry}>
            {result.passed ? "Play again" : "Try again"}
          </button>
          <button type="button" className="btn" onClick={onClose}>Levels</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ emoji, label, value, ok, need }: { emoji: string; label: string; value: string; ok: boolean; need: string }) {
  return (
    <div
      className="rounded-2xl border px-3 py-2"
      style={{
        borderColor: ok ? "var(--tight)" : "var(--loose)",
        background: ok ? "rgba(111, 227, 143, 0.14)" : "rgba(255, 107, 107, 0.12)",
      }}
    >
      <div className="text-xl leading-none" aria-hidden="true">{emoji}</div>
      <div className="num mt-1 text-2xl font-bold leading-none" style={{ color: ok ? "var(--tight)" : "var(--loose)" }}>{value}</div>
      <div className="caps mt-1 text-fg-dim">{label} · need {need}</div>
    </div>
  );
}
