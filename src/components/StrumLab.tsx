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
import { SettingsPanel } from "./SettingsPanel";
import { StrumLane } from "./StrumLane";
import { TransportBar } from "./TransportBar";
import { Turntable } from "./Turntable";

/**
 * The whole app: chords, metronome, audio and settings on one screen.
 *
 * State lives in an external store rather than component state so that the
 * server render and the first client render agree — see lib/storage/store.ts.
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

  const handleMic = () => {
    if (engine.micStatus === "off" || engine.micStatus === "error") void engine.startListening();
    else engine.stopListening();
  };

  const showVerdicts = engine.micStatus === "listening";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-3 p-3 sm:p-4 lg:h-dvh lg:overflow-hidden">
      <div className="bezel flex min-h-0 flex-1 flex-col">
        <div className="bezel-inner scanlines relative flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="flex items-center justify-center">
              <Turntable
                chord={chord}
                nextChord={nextChord}
                pattern={pattern}
                playing={engine.playing}
                activeSlot={engine.activeSlot}
                countIn={engine.countIn}
              />
            </div>

            <div className="flex min-h-0 flex-col justify-center gap-3">
              <div className="panel flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="panel-sunken shrink-0 p-2">
                  {chord ? <ChordDiagram chord={chord} size={124} /> : null}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-3xl font-black leading-none text-brass sm:text-4xl">
                    {chord?.symbol ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs uppercase tracking-widest text-fg-dim">
                    {chord?.name}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-fg-muted sm:text-sm">{chord?.tip}</p>
                </div>
              </div>

              <div className="panel p-3">
                <StrumLane
                  pattern={pattern}
                  activeSlot={engine.activeSlot}
                  verdicts={engine.verdicts}
                  showVerdicts={showVerdicts}
                />
              </div>

              {showVerdicts ? (
                <ScoreStrip
                  stats={engine.stats}
                  heard={engine.heard}
                  checkChord={state.listen.checkChord}
                  checkStroke={state.listen.checkStroke}
                />
              ) : null}

              {engine.micMessage ? (
                <p className="panel px-3 py-2 text-xs text-rose">{engine.micMessage}</p>
              ) : null}
              {engine.micStatus === "calibrating" ? (
                <p className="panel px-3 py-2 text-xs text-fg-muted">
                  Measuring the room — stay quiet for a moment.
                </p>
              ) : null}
              {engine.room && engine.room.quality === "noisy" && engine.micStatus === "listening" ? (
                <p className="panel px-3 py-2 text-xs text-amber">{engine.room.message}</p>
              ) : null}
              {zeroed !== null ? (
                <p className="panel px-3 py-2 text-xs text-fg-muted">
                  Latency offset set to {zeroed} ms from your last few strums.
                </p>
              ) : null}
            </div>
          </div>

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

/** Compact scoring readout. Only rendered while the mic is actually judging. */
function ScoreStrip({
  stats, heard, checkChord, checkStroke,
}: {
  stats: ReturnType<typeof useStrumEngine>["stats"];
  heard: ReturnType<typeof useStrumEngine>["heard"];
  checkChord: boolean;
  checkStroke: boolean;
}) {
  const attempted = stats.hits + stats.missed;
  return (
    <div className="panel grid grid-cols-2 gap-2 p-2 text-center sm:grid-cols-4">
      <Stat label="Tight" value={attempted ? `${Math.round((stats.tight / attempted) * 100)}%` : "—"} />
      <Stat
        label="Timing"
        value={stats.hits ? `${stats.meanErrorMs > 0 ? "+" : ""}${stats.meanErrorMs.toFixed(0)} ms` : "—"}
        hint={stats.hits ? `±${stats.spreadMs.toFixed(0)}` : undefined}
      />
      {checkChord ? (
        <Stat
          label="Chord"
          value={stats.chordChecked ? `${Math.round((stats.chordRight / stats.chordChecked) * 100)}%` : "—"}
          hint={heard?.chord ? `heard ${heard.chord}` : undefined}
        />
      ) : (
        <Stat label="Missed" value={String(stats.missed)} />
      )}
      {checkStroke ? (
        <Stat
          label="Up / down"
          value={stats.strokeChecked ? `${Math.round((stats.strokeRight / stats.strokeChecked) * 100)}%` : "—"}
          hint={heard ? heard.stroke : undefined}
        />
      ) : (
        <Stat label="Extra" value={String(stats.extra)} />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel-sunken px-2 py-1.5">
      <div className="font-display text-[9px] uppercase tracking-[0.2em] text-fg-dim">{label}</div>
      <div className="font-lcd text-base leading-tight text-lime">{value}</div>
      {hint ? <div className="truncate text-[10px] text-fg-dim">{hint}</div> : null}
    </div>
  );
}
