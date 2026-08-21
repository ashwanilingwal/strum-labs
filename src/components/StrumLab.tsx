"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { chordById } from "@/lib/music/chords";
import {
  barOfSlot, MAX_BPM, MIN_BPM, normalise, type Pattern,
} from "@/lib/music/pattern";
import { activePattern, appStore, type AppState } from "@/lib/storage/settings";
import { touchLocal, useAccount } from "@/hooks/useAccount";
import { useStrumEngine } from "@/hooks/useStrumEngine";
import { ChordDiagram } from "./ChordDiagram";
import { LiveFeedback } from "./LiveFeedback";
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
  const nextChord = chordById(pattern.chords[(bar + 1) % pattern.bars]);
  const showVerdicts = engine.micStatus === "listening";

  const lastWantChord =
    engine.lastVerdict && engine.lastVerdict.slot >= 0
      ? pattern.chords[barOfSlot(pattern, engine.lastVerdict.slot)]
      : null;

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
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">

      {/* Chord — the one big thing on the screen. */}
      <section className="relative flex flex-1 shrink-0 flex-col justify-center px-4 py-8 sm:px-8">
        <MotifField density={0.5} />
        <div className="wrap flex w-full flex-col gap-6 lg:flex-row lg:items-center lg:gap-12">
        <div className="relative z-10 min-w-0 flex-1">
          <p className="caps text-fg-dim">
            {engine.countIn > 0 ? "Count in" : engine.playing ? `Bar ${bar + 1} of ${pattern.bars}` : "Ready"}
          </p>
          <ChromeText className="mt-2 text-[clamp(5rem,19vw,18rem)]">
            {engine.countIn > 0 ? String(engine.countIn) : (chord?.symbol ?? "—")}
          </ChromeText>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="caps-lg text-fg">{engine.countIn > 0 ? "Get ready" : chord?.name}</span>
            {nextChord && nextChord.id !== chord?.id && engine.countIn === 0 ? (
              <span className="caps text-fg-dim">
                next <span className="text-accent">{nextChord.symbol}</span>
              </span>
            ) : null}
          </div>
          {chord && engine.countIn === 0 ? (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">{chord.tip}</p>
          ) : null}
        </div>

        {chord ? (
          <div className="block-light card-flat relative z-10 w-32 shrink-0 self-start p-3 sm:w-44 sm:p-4 lg:self-center">
            <ChordDiagram chord={chord} size={168} />
          </div>
        ) : null}
        </div>
      </section>

      {/* The pattern. Light ground so it reads as a separate object. */}
      <section className="block-light px-4 py-6 sm:px-8">
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
          <ScoreStrip
            stats={engine.stats}
            checkChord={state.listen.checkChord}
            checkStroke={state.listen.checkStroke}
          />
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

      <div className="shrink-0 border-t border-line bg-ink/95 px-4 py-3 sm:px-8">
        <div className="wrap">
        <TransportBar
          playing={engine.playing}
          onToggle={engine.toggle}
          bpm={pattern.bpm}
          onBpm={setBpm}
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
      <Stat label="Tight" value={pct(stats.tight, attempted)} />
      <Stat label="Missed" value={String(stats.missed)} />
      <Stat label="Extra" value={String(stats.extra)} />
      {checkChord ? <Stat label="Chord" value={pct(stats.chordRight, stats.chordChecked)} /> : null}
      {checkStroke ? <Stat label="Up / down" value={pct(stats.strokeRight, stats.strokeChecked)} /> : null}
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
