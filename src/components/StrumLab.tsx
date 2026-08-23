"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { chordById } from "@/lib/music/chords";
import {
  barOfSlot, MAX_BPM, MIN_BPM, normalise, type Pattern,
} from "@/lib/music/pattern";
import { activePattern, appStore, quickPattern, QUICK_ID, type AppState, type PracticeMode } from "@/lib/storage/settings";
import { touchLocal, useAccount } from "@/hooks/useAccount";
import { useStrumEngine } from "@/hooks/useStrumEngine";
import { ChordChart } from "./chart/ChordChart";
import { ChordSequence } from "./chart/ChordSequence";
import { LiveFeedback } from "./LiveFeedback";
import { ChordSheet } from "./ChordSheet";
import { ModeToggle } from "./ModeToggle";
import { SessionSummary } from "./SessionSummary";
import { SettingsPanel } from "./SettingsPanel";
import { StrumLane } from "./StrumLane";
import { TransportBar } from "./TransportBar";
import { ChromeText } from "./ui/ChromeText";
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

export function StrumLab() {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  const pattern = activePattern(state);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which bar's chord the sheet is editing, or null when closed. */
  const [chordSheetBar, setChordSheetBar] = useState<number | null>(null);
  const [zeroed, setZeroed] = useState<number | null>(null);

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

  const engine = useStrumEngine(pattern, state.audio, state.listen);
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
  // Space is the universal transport key; ignore it while typing a name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        engine.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const bar = engine.activeSlot >= 0 ? barOfSlot(pattern, engine.activeSlot) : 0;
  const chord = chordById(pattern.chords[bar]);
  const showVerdicts = engine.micStatus === "listening";

  const lastWantChord =
    engine.lastVerdict && engine.lastVerdict.slot >= 0
      ? pattern.chords[barOfSlot(pattern, engine.lastVerdict.slot)]
      : null;

  const setMode = useCallback(
    (mode: PracticeMode) => {
      setState((prev) => ({
        ...prev,
        mode,
        activeId: QUICK_ID,
        patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? quickPattern(mode, prev.pick) : p)),
      }));
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

  const handleMic = () => {
    if (engine.micStatus === "off" || engine.micStatus === "error") void engine.startListening();
    else engine.stopListening();
  };

  const notices = [
    engine.micMessage ? { tone: "loose", text: engine.micMessage } : null,
    engine.sampleState === "loading" ? { tone: "close", text: "Loading the guitar recordings — about 2 MB, once." } : null,
    engine.micStatus === "calibrating" ? { tone: "muted", text: "Measuring the room — stay quiet for a moment." } : null,
    engine.room && engine.room.quality === "noisy" && engine.micStatus === "listening"
      ? { tone: "close", text: engine.room.message } : null,
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
        <Nav />
        <div className="wrap px-4 pb-2 sm:px-8">
          <ModeToggle mode={state.mode} onChange={setMode} />
        </div>
      </div>
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
        <div className="wrap relative z-10 flex w-full flex-col items-center gap-4">
          <div className="flex w-full items-center justify-center gap-4 sm:gap-10">
            <div className="min-w-0 text-center">
              <p className="caps text-fg-dim">
                {engine.countIn > 0
                  ? "Count in"
                  : engine.playing
                    ? `Bar ${bar + 1} of ${pattern.bars}`
                    : "Ready"}
              </p>
              {engine.countIn > 0 ? (
                <ChromeText className="mt-1 block text-[clamp(4.25rem,13vw,8rem)]">
                  {String(engine.countIn)}
                </ChromeText>
              ) : (
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
              )}
              <p className="caps-lg mt-1.5 text-fg">
                {engine.countIn > 0 ? "Get ready" : chord?.name}
              </p>
              {engine.countIn === 0 && !showVerdicts ? (
                <p className="caps mt-1 text-fg-dim opacity-70">tap to change</p>
              ) : null}
            </div>

            {chord ? (
              <div
                className={`block-light card-flat shrink-0 p-3 sm:w-36 sm:p-4 lg:w-40 ${
                  showVerdicts ? "hidden w-24 sm:block" : "w-32"
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
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <span className="caps text-fg-dim">{pattern.name}</span>
          <span className="caps text-fg-dim">
            {pattern.bars} bar{pattern.bars > 1 ? "s" : ""} · {pattern.slotsPerBar === 8 ? "eighths" : `${pattern.slotsPerBar}ths`}
          </span>
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

      <div className="shrink-0 border-t border-line bg-ink/95 px-4 py-3 sm:px-8">
        <div className="wrap">
        <TransportBar
          playing={engine.playing}
          onToggle={engine.toggle}
          bpm={pattern.bpm}
          onBpm={setBpm}
          onNudgeBpm={nudgeBpm}
          click={state.audio.click}
          onClick={(v) => setState((s) => ({ ...s, audio: { ...s.audio, click: v } }))}
          guitar={state.audio.guitar}
          onGuitar={(v) => setState((s) => ({ ...s, audio: { ...s.audio, guitar: v } }))}
          micStatus={engine.micStatus}
          onMic={handleMic}
          onSettings={() => setSettingsOpen(true)}
          level={engine.level}
        />
        </div>
      </div>

      {chordSheetBar !== null ? (
        <ChordSheet
          current={pattern.chords[chordSheetBar] ?? pattern.chords[0]}
          barLabel={pattern.bars > 1 ? `Bar ${chordSheetBar + 1} of ${pattern.bars}` : "Chord"}
          onPick={(id) => setChordForBar(chordSheetBar, id)}
          onClose={() => setChordSheetBar(null)}
        />
      ) : null}

      {engine.summary ? (
        <SessionSummary
          stats={engine.summary}
          checkChord={state.listen.checkChord}
          checkStroke={state.listen.checkStroke}
          onDismiss={engine.dismissSummary}
          onAgain={() => {
            engine.dismissSummary();
            void engine.start();
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
