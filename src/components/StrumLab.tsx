"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { chordById } from "@/lib/music/chords";
import {
  barOfSlot, MAX_BPM, MIN_BPM, normalise, type Pattern,
} from "@/lib/music/pattern";
import { levelByNumber, levelPattern } from "@/lib/music/levels";
import { activePattern, appStore, quickPattern, QUICK_ID, type AppState, type PracticeMode } from "@/lib/storage/settings";
import { touchLocal, useAccount } from "@/hooks/useAccount";
import { useCountdown } from "@/hooks/useCountdown";
import { useStrumEngine } from "@/hooks/useStrumEngine";
import { ChordChart } from "./chart/ChordChart";
import { ChordSequence } from "./chart/ChordSequence";
import { LiveFeedback } from "./LiveFeedback";
import { ChordSheet } from "./ChordSheet";
import { ExerciseMode } from "./ExerciseMode";
import { GameMode } from "./GameMode";
import { bucketOf, ChordVerdict, TimingBoxes } from "./TimingBoxes";
import { ModeToggle } from "./ModeToggle";
import { SessionSummary } from "./SessionSummary";
import { SettingsPanel } from "./SettingsPanel";
import { StrumLane } from "./StrumLane";
import { TransportBar } from "./TransportBar";
import { ChromeText } from "./ui/ChromeText";
import { CountdownOverlay } from "./ui/CountdownOverlay";
import { GearIcon } from "./ui/GearIcon";
import { MotifField } from "./ui/MotifField";
import { Nav } from "./ui/Nav";

/**
 * The practice screen: chords, metronome, audio and settings.
 *
 * Laid out as stacked full-width blocks alternating dark and light ground,
 * with the chord name set in inflated chrome as the one large thing on screen.
 * The turntable that used to hold that job is gone — the lane's playhead
 * already says where you are in the loop, and the record was saying it twice.
 *
 * State lives in an external store rather than component state so the server
 * render and the first client render agree — see lib/storage/store.ts.
 */

/** Rotated per tight hit so the celebration doesn't go stale. */
const TIGHT_EMOJI = ["🎯", "🔥", "✨", "💚", "🤘"];

export function StrumLab() {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  const pattern = activePattern(state);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which bar's chord the sheet is editing, or null when closed. */
  const [chordSheetBar, setChordSheetBar] = useState<number | null>(null);
  /**
   * Why a control just refused. Cleared on a timer rather than left on screen,
   * because it is a nudge, not a state you need to dismiss.
   */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [zeroed, setZeroed] = useState<number | null>(null);
  /** The headphones advice, shown once per visit when listening starts. */
  const [headphoneTip, setHeadphoneTip] = useState(false);
  const headphoneTipSeen = useRef(false);
  /** Resolves the game's wait for the tip to be dismissed. */
  const tipResolver = useRef<(() => void) | null>(null);
  const countdown = useCountdown();

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    appStore.set(updater);
    touchLocal();
  }, []);

  const setPattern = useCallback(
    (next: Pattern) => {
      setState((s) => ({
        ...s,
        patterns: s.patterns.map((p) => (p.id === next.id ? normalise(next) : p)),
      }));
    },
    [setState],
  );

  const setBpm = useCallback(
    (bpm: number) => setPattern({ ...pattern, bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, bpm)) }),
    [pattern, setPattern],
  );

  /**
   * Step the tempo by a delta, resolved against the store at apply time.
   *
   * The -/+ buttons cannot do `setBpm(bpm + 1)`: `bpm` is a render-time value,
   * so two clicks landing before React re-renders both read the same number and
   * the second increment is silently lost. Anyone clicking + quickly gets fewer
   * beats than they asked for.
   */
  const nudgeBpm = useCallback(
    (delta: number) => {
      setState((prev) => {
        const current = activePattern(prev);
        const next = Math.max(MIN_BPM, Math.min(MAX_BPM, current.bpm + delta));
        if (next === current.bpm) return prev;
        return {
          ...prev,
          patterns: prev.patterns.map((p) => (p.id === current.id ? { ...p, bpm: next } : p)),
        };
      });
    },
    [setState],
  );

  // The drums play under everything but the exercises, which are untimed
  // listening games. Memoised so the engine's refs stay stable.
  const audioForMode = useMemo(
    () => ({ ...state.audio, backing: state.audio.backing && state.mode !== "exercise" }),
    [state.audio, state.mode],
  );
  const engine = useStrumEngine(pattern, audioForMode, state.listen);
  const account = useAccount(state);

  /**
   * The transport is sticky, so once the page is taller than the viewport it
   * floats over whatever is beneath it. Its flow position is the end of the
   * document, so the content above needs exactly its height reserved or the
   * last section is permanently unreachable.
   *
   * Measured rather than guessed: the bar wraps to one row on a desktop and
   * three on a 320px phone, and a fixed spacer is wrong at every size but one.
   */

  const bar = engine.activeSlot >= 0 ? barOfSlot(pattern, engine.activeSlot) : 0;
  const chord = chordById(pattern.chords[bar]);
  const showVerdicts = engine.micStatus === "listening";

  const lastWantChord =
    engine.lastVerdict && engine.lastVerdict.slot >= 0
      ? pattern.chords[barOfSlot(pattern, engine.lastVerdict.slot)]
      : null;

  const setMode = useCallback(
    (mode: PracticeMode) => {
      setState((prev) => {
        // Exercise mode has no quick pattern to rebuild — it is games only.
        if (mode === "exercise") return { ...prev, mode };
        // The game plays its current level through the reserved slot.
        if (mode === "game") {
          const lvl = levelPattern(levelByNumber(prev.game.level));
          return {
            ...prev,
            mode,
            activeId: QUICK_ID,
            patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? { ...lvl, id: QUICK_ID } : p)),
          };
        }
        return {
          ...prev,
          mode,
          activeId: QUICK_ID,
          patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? quickPattern(mode, prev.pick) : p)),
        };
      });
    },
    [setState],
  );

  const setChordForBar = useCallback(
    (barIndex: number, chordId: string) => {
      setState((prev) => {
        const target = activePattern(prev);
        const chords = target.chords.map((c, i) => (i === barIndex ? chordId : c));
        return {
          ...prev,
          // Keep the selector in step, so reopening settings shows what is
          // actually playing rather than what was last picked there.
          pick: prev.mode === "chord" ? { ...prev.pick, chordId } : prev.pick,
          patterns: prev.patterns.map((p) => (p.id === target.id ? { ...p, chords } : p)),
        };
      });
      setChordSheetBar(null);
    },
    [setState],
  );

  const warn = useCallback((message: string) => {
    setBlocked(message);
    window.setTimeout(() => setBlocked((cur) => (cur === message ? null : cur)), 2600);
  }, []);

  // Once per visit, at the moment it becomes true: on headphones the mic
  // hears only the guitar, so none of the app's defences against hearing
  // itself have to work at all. Shown while listening starts, not instead
  // of it — the game calls this too.
  const noteListenStart = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (headphoneTipSeen.current) {
          resolve();
          return;
        }
        headphoneTipSeen.current = true;
        tipResolver.current = resolve;
        setHeadphoneTip(true);
      }),
    [],
  );
  const closeTip = useCallback(() => {
    setHeadphoneTip(false);
    tipResolver.current?.();
    tipResolver.current = null;
  }, []);

  const handleMic = () => {
    if (engine.micStatus === "off" || engine.micStatus === "error") {
      void noteListenStart();
      void engine.startListening();
    } else {
      engine.stopListening();
    }
  };

  // Free play gets the same 3-2-1 as a level: time to pick the guitar up
  // before the count-in clicks. Pressing Play again during the count cancels.
  const startWithCountdown = useCallback(async () => {
    if (engine.playing || countdown.n !== null) return;
    const counted = await countdown.run(3);
    if (counted) await engine.start();
  }, [engine, countdown]);
  const toggleTransport = useCallback(() => {
    if (engine.playing || countdown.n !== null) {
      countdown.cancel();
      engine.stop();
    } else {
      void startWithCountdown();
    }
  }, [engine, countdown, startWithCountdown]);

  // Space is the universal transport key; ignore it while typing a name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const mode = appStore.get().mode;
      if (mode === "exercise" || mode === "game") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleTransport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTransport]);

  const notices = [
    engine.micMessage ? { tone: "loose", text: engine.micMessage } : null,
    engine.sampleState === "loading" ? { tone: "close", text: "Loading the guitar recordings — about 2 MB, once." } : null,
    engine.micStatus === "calibrating" ? { tone: "muted", text: "Measuring the room — stay quiet for a moment." } : null,
    engine.room && (engine.room.quality === "noisy" || engine.room.quality === "silent") && engine.micStatus === "listening"
      ? { tone: engine.room.quality === "silent" ? "loose" : "close", text: engine.room.message } : null,
    zeroed !== null ? { tone: "muted", text: `Latency offset set to ${zeroed} ms from your last few strums.` } : null,
  ].filter(Boolean) as { tone: string; text: string }[];

  return (
    /**
     * App shell rather than a long page with a sticky footer. The transport
     * lives in flow at the bottom of a fixed-height column and the content
     * between scrolls, so the bar can never overlap the lane at any size and
     * nothing has to measure anything. The sticky version needed a spacer
     * matching the bar's height, which meant depending on resize events or a
     * ResizeObserver — both of which some browser contexts simply never fire.
     */
    <main className="block-dark flex h-dvh flex-col overflow-hidden">
      <div className="shrink-0">
        <Nav
          blocked={engine.playing}
          onBlocked={(label) => warn(`Stop the metronome before opening ${label}.`)}
        />
        <div className="wrap px-4 pb-1 sm:px-8">
          <ModeToggle
            mode={state.mode}
            onChange={setMode}
            compact
            disabled={engine.playing}
            onBlocked={() => warn("Stop the metronome to switch between chords and patterns.")}
          />
        </div>
      </div>
      {state.mode === "game" ? (
        <GameMode
          engine={engine}
          state={state}
          setState={setState}
          pattern={pattern}
          onSettings={() => setSettingsOpen(true)}
          onListenStart={noteListenStart}
        />
      ) : state.mode === "exercise" ? (
        <ExerciseMode
          bpm={state.exerciseBpm}
          onNudgeBpm={(delta) =>
            setState((prev) => ({
              ...prev,
              exerciseBpm: Math.max(MIN_BPM, Math.min(MAX_BPM, prev.exerciseBpm + delta)),
            }))
          }
        />
      ) : (
      <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/*
          Auto margins rather than `justify-center` on the scroller: they centre
          the group but still let it scroll when it outgrows the box, where
          justify-center makes the overflowing top unreachable.

          Bottom-anchored on a phone, centred from `sm` up. On a small screen the
          lane is what you watch while playing, so the slack belongs above the
          chord — not between the lane and the transport, where it pushed the two
          things you actually use apart.
        */}
        <div className="mt-auto w-full sm:my-auto">

      {/* Chord — the one big thing on the screen. */}
      {/*
        Chord and diagram sit side by side at every width, as one centred group.
        On a phone that is the only way both fit above the fold; on a desktop
        centring them stops the pair drifting to one edge of a wide screen.
      */}
      <section className={`relative px-4 sm:px-8 sm:py-8 ${showVerdicts ? "py-2" : "py-5"}`}>
        <MotifField density={0.5} />

        {/* Status sits at the side; it never takes the centre slot. */}
        {engine.countIn > 0 ? (
          <div
            className="absolute right-4 top-2 z-10 flex items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:right-8 sm:top-4"
            role="status"
            aria-label={`Starting in ${engine.countIn}`}
          >
            <span className="caps text-fg-dim">in</span>
            <span className="num text-xl leading-none text-accent">{engine.countIn}</span>
          </div>
        ) : null}
        <div className="wrap relative z-10 flex w-full flex-col items-center gap-4">
          <div className="flex w-full items-center justify-center gap-4 sm:gap-10">
            <div className="min-w-0 text-center">
              <ChordVerdict verdict={engine.lastVerdict} show={showVerdicts} seq={engine.verdictSeq} />
              <p className="caps text-fg-dim">
                {engine.countIn > 0
                  ? "Count in"
                  : engine.playing
                    ? `Bar ${bar + 1} of ${pattern.bars}`
                    : "Ready"}
              </p>
              {/* The chord holds this slot unconditionally. It used to be
                  swapped for the count-in number, which removed the one thing
                  you need during a count-in — the shape to get your fingers
                  onto. The count lives beside it now. */}
              <button
                type="button"
                onClick={() => setChordSheetBar(bar)}
                className="block rounded-2xl transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={`Change the chord for bar ${bar + 1}`}
              >
                <ChromeText
                  className={`mt-1 block ${
                    showVerdicts
                      ? "text-[clamp(2.5rem,9vw,8rem)]"
                      : "text-[clamp(4.25rem,13vw,8rem)]"
                  }`}
                >
                  {chord?.symbol ?? "\u2014"}
                </ChromeText>
              </button>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <p className="caps-lg text-fg">{chord?.name}</p>
                {engine.countIn === 0 ? (
                  // The big chord is already a button, but nothing said so.
                  // A control that only works if you guess it is there is not
                  // a control.
                  <button
                    type="button"
                    onClick={() => setChordSheetBar(bar)}
                    className="btn btn-icon !h-7 !w-7 shrink-0"
                    aria-label={`Change the chord for bar ${bar + 1}`}
                    title="Change chord"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"
                        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>

            {chord ? (
              <div
                className={`block-light card-flat shrink-0 sm:w-36 sm:p-4 lg:w-40 ${
                  showVerdicts ? "w-20 p-2" : "w-32 p-3"
                }`}
              >
                <ChordChart chord={chord} />
              </div>
            ) : null}
          </div>

          {/* Where you are in the progression. Replaces the old "next X" line —
              same space, but it shows the whole shape of the pattern. */}
          {pattern.bars > 1 ? (
            <ChordSequence
              chords={pattern.chords}
              activeIndex={engine.playing ? bar : -1}
              onSelect={(i) => setChordSheetBar(i)}
            />
          ) : null}

          {chord && engine.countIn === 0 ? (
            <p
              className={`max-w-xl text-center text-sm leading-relaxed text-fg-muted ${
                engine.playing ? "hidden sm:block" : ""
              }`}
            >
              {chord.tip}
            </p>
          ) : null}
        </div>
      </section>

      {/* The pattern. Light ground so it reads as a separate object. */}
      <section className="block-light px-4 py-5 sm:px-8 sm:py-6">
        <div className="wrap">
        <div className="mb-3 flex items-center justify-between gap-4">
          <span className="caps text-fg-dim">{pattern.name}</span>
          <div className="flex items-center gap-2">
            <span className="caps text-fg-dim">
              {pattern.bars} bar{pattern.bars > 1 ? "s" : ""} · {pattern.slotsPerBar === 8 ? "eighths" : `${pattern.slotsPerBar}ths`}
            </span>
            {/* The way to a different pattern, right where the pattern is —
                the transport's gear is the same sheet, but nobody looks for
                "change the strumming" at the far end of the bar. */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn btn-icon !h-7 !w-7"
              aria-label="Change the strumming pattern"
              title="Change the strumming pattern"
            >
              <GearIcon size={13} />
            </button>
          </div>
        </div>
        <StrumLane
          pattern={pattern}
          activeSlot={engine.activeSlot}
          verdicts={engine.verdicts}
          showVerdicts={showVerdicts}
        />
        </div>
      </section>

      {showVerdicts ? (
        <section className="px-4 py-4 sm:px-8">
          <div className="mx-auto mb-3 max-w-md">
            <TimingBoxes
              early={engine.stats.early}
              onTime={engine.stats.tight}
              late={engine.stats.late}
              last={bucketOf(engine.lastVerdict)}
              seq={engine.verdictSeq}
            />
          </div>
          <LiveFeedback
            lastVerdict={engine.lastVerdict}
            verdictSeq={engine.verdictSeq}
            recent={engine.recent}
            wantChord={lastWantChord}
            meanErrorMs={engine.stats.meanErrorMs}
            hits={engine.stats.hits}
          />
          <div className="hidden sm:block">
            <ScoreStrip
              stats={engine.stats}
              checkChord={state.listen.checkChord}
              checkStroke={state.listen.checkStroke}
            />
          </div>
        </section>
      ) : null}

      {notices.length ? (
        <div className="space-y-1 px-4 pb-2 sm:px-8">
          {notices.map((n, i) => (
            <p
              key={i}
              className="text-xs"
              style={{ color: n.tone === "muted" ? "var(--fg-muted)" : `var(--${n.tone})` }}
            >
              {n.text}
            </p>
          ))}
        </div>
      ) : null}

        </div>
      </div>

      {/* Derived rather than cleared in an effect: the notice only means
          anything while the transport is running, so stopping retires it
          without any state to synchronise. */}
      {blocked && engine.playing ? (
        <div className="wrap shrink-0 px-4 pb-1 sm:px-8" role="status">
          <p className="text-center text-xs text-close">{blocked}</p>
        </div>
      ) : null}

      {/* The whole screen agrees for a beat on a tight hit — unless the
          chord check says the shape was wrong, in which case celebrating
          the timing would be lying about the strum. Keyed by the verdict
          counter so consecutive tights each flash; never takes pointers. */}
      {showVerdicts && engine.lastVerdict?.grade === "tight" && engine.lastVerdict.chordOk !== false ? (
        <div key={engine.verdictSeq} className="hit-wash" aria-hidden="true">
          <span className="hit-wash-emoji">
            {TIGHT_EMOJI[engine.verdictSeq % TIGHT_EMOJI.length]}
          </span>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-line bg-ink/95 px-4 py-3 sm:px-8">
        <div className="wrap">
        <TransportBar
          playing={engine.playing || countdown.n !== null}
          onToggle={toggleTransport}
          bpm={pattern.bpm}
          onBpm={setBpm}
          onNudgeBpm={nudgeBpm}
          click={state.audio.click}
          onClick={(v) => setState((s) => ({ ...s, audio: { ...s.audio, click: v } }))}
          guitar={state.audio.guitar}
          onGuitar={(v) => setState((s) => ({ ...s, audio: { ...s.audio, guitar: v } }))}
          backing={state.audio.backing}
          onBacking={(v) => setState((s) => ({ ...s, audio: { ...s.audio, backing: v } }))}
          micStatus={engine.micStatus}
          onMic={handleMic}
          onSettings={() => setSettingsOpen(true)}
          level={engine.level}
        />
        </div>
      </div>
      </>
      )}

      {headphoneTip ? <HeadphoneTip onClose={closeTip} /> : null}
      {state.mode !== "game" ? <CountdownOverlay n={countdown.n} /> : null}

      {chordSheetBar !== null ? (
        <ChordSheet
          current={pattern.chords[chordSheetBar] ?? pattern.chords[0]}
          barLabel={pattern.bars > 1 ? `Bar ${chordSheetBar + 1} of ${pattern.bars}` : "Chord"}
          onPick={(id) => setChordForBar(chordSheetBar, id)}
          onClose={() => setChordSheetBar(null)}
        />
      ) : null}

      {engine.summary && state.mode !== "game" ? (
        <SessionSummary
          stats={engine.summary}
          checkChord={state.listen.checkChord}
          checkStroke={state.listen.checkStroke}
          onDismiss={engine.dismissSummary}
          onAgain={() => {
            engine.dismissSummary();
            void startWithCountdown();
          }}
        />
      ) : null}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        pattern={pattern}
        setState={setState}
        setPattern={setPattern}
        micStatus={engine.micStatus}
        sampleState={engine.sampleState}
        room={engine.room}
        onRecalibrate={() => void engine.recalibrate()}
        canZero={engine.stats.hits >= 8}
        onZeroLatency={() => {
          const next = engine.absorbBias();
          if (next === null) return;
          setState((s) => ({ ...s, listen: { ...s.listen, offsetMs: next } }));
          setZeroed(next);
        }}
        account={{
          configured: account.configured,
          email: account.user?.email ?? null,
          status: account.status,
          signIn: () => void account.signIn(),
          signOut: () => void account.signOut(),
        }}
      />
    </main>
  );
}

/**
 * The headphones advice, as a dialog over a dimmed screen.
 *
 * It earns the interruption: on speakers the microphone hears the app's own
 * click and guitar as well as the player, and every defence against that is
 * an inference that can be wrong. On headphones the question does not arise.
 * Shown once per visit, when listening starts — never mid-take.
 */
function HeadphoneTip({ onClose }: { onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Space is the transport key everywhere else on this screen; while the
      // dialog is up it must dismiss rather than start the metronome behind it.
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="headphone-tip-title"
        className="block-light card-flat relative w-full max-w-sm p-5 text-center sm:p-6"
      >
        <span aria-hidden="true" className="block text-4xl">🎧</span>
        <h2 id="headphone-tip-title" className="caps-lg mt-3 text-fg">
          Headphones give the best results
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          On speakers the microphone hears the metronome and the app&apos;s guitar as well as
          you, and has to work out which was which. Through headphones it hears only your
          playing — so the timing and chord scoring are at their most accurate.
        </p>
        <button ref={okRef} type="button" className="btn btn-lit mt-5 w-full sm:w-auto sm:px-8" onClick={onClose}>
          OK
        </button>
      </section>
    </div>
  );
}

/** Session totals. Only rendered while the mic is judging. */
function ScoreStrip({
  stats, checkChord, checkStroke,
}: {
  stats: ReturnType<typeof useStrumEngine>["stats"];
  checkChord: boolean;
  checkStroke: boolean;
}) {
  const attempted = stats.hits + stats.missed;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return (
    <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
      <Stat label="On time" value={pct(stats.tight, attempted)} />
      <Stat label="Missed" value={String(stats.missed)} />
      <Stat label="Extra" value={String(stats.extra)} />
      {checkChord ? <Stat label="Chord" value={pct(stats.chordRight, stats.chordChecked)} /> : null}
      {checkStroke ? <Stat label="Direction" value={pct(stats.strokeRight, stats.strokeChecked)} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="caps text-fg-dim">{label}</div>
      <div className="num mt-0.5 text-xl text-fg">{value}</div>
    </div>
  );
}
