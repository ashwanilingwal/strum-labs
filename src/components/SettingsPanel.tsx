"use client";

import { useEffect, useRef, useState } from "react";
import { emptyPattern, newPatternId, PRESETS, type Pattern } from "@/lib/music/pattern";
import type { AppState } from "@/lib/storage/settings";
import type { MicStatus } from "@/hooks/useStrumEngine";
import type { SamplerState } from "@/lib/audio/sampler";
import type { DuckMode } from "@/lib/storage/settings";
import type { Tone } from "@/lib/audio/engine";
import { INSTRUMENTS, isInstrument } from "@/lib/audio/samples";
import type { RoomProfile } from "@/lib/listen/detector";
import type { SyncStatus } from "@/hooks/useAccount";
import { PatternEditor } from "./PatternEditor";
import { SectionTitle, SegmentedControl, Slider, Toggle } from "./ui";

/**
 * Everything configurable, in one sheet over the deck. Nothing here is a
 * separate page — the whole app is one screen, and settings slide over it.
 */

export function SettingsPanel({
  open, onClose, state, pattern, setState, setPattern,
  micStatus, sampleState, room, onRecalibrate, onZeroLatency, canZero,
  account,
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  pattern: Pattern;
  setState: (updater: (prev: AppState) => AppState) => void;
  setPattern: (p: Pattern) => void;
  micStatus: MicStatus;
  sampleState: SamplerState;
  room: RoomProfile | null;
  onRecalibrate: () => void;
  onZeroLatency: () => void;
  canZero: boolean;
  account: {
    configured: boolean;
    email: string | null;
    status: SyncStatus;
    signIn: () => void;
    signOut: () => void;
  };
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectPattern = (id: string) => setState((s) => ({ ...s, activeId: id }));

  const addPattern = (base: Pattern) => {
    const copy: Pattern = { ...base, id: newPatternId(), name: `${base.name} copy` };
    setState((s) => ({ ...s, patterns: [...s.patterns, copy], activeId: copy.id }));
  };

  const deletePattern = (id: string) => {
    setState((s) => {
      if (s.patterns.length <= 1) return s;
      const patterns = s.patterns.filter((p) => p.id !== id);
      return { ...s, patterns, activeId: patterns[0].id };
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-[color:var(--surface)]/95 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="chrome-text font-display text-lg font-black uppercase tracking-[0.18em]">
            Settings
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-icon" aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/*
            Collapsed by default and showing only the pattern in play. The full
            list was the first thing in the sheet and pushed the editor — the
            thing you actually came here for — below the fold. Switching pattern
            is occasional; editing one is constant.
          */}
          <section>
            <SectionTitle>Pattern in play</SectionTitle>
            <div className="panel p-1">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="flex w-full items-center gap-2 px-2 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-accent">{pattern.name}</span>
                  <span className="block truncate font-lcd text-[10px] text-fg-dim">
                    {pattern.bars} bar{pattern.bars > 1 ? "s" : ""} · {pattern.chords.join(" ")} · {pattern.bpm} bpm
                  </span>
                </span>
                <span className="caps shrink-0 text-fg-dim">
                  {pickerOpen ? "Close" : "Change"}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-fg-dim transition-transform"
                  style={{ transform: pickerOpen ? "rotate(180deg)" : "none" }}
                >
                  ▾
                </span>
              </button>

              {pickerOpen ? (
                <div className="border-t border-line px-1 pb-1 pt-1">
                  {state.patterns.map((p) => {
                    const active = p.id === state.activeId;
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-1 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            selectPattern(p.id);
                            setPickerOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className={`block truncate text-sm font-semibold ${active ? "text-accent" : ""}`}>
                            {active ? "\u2713 " : ""}{p.name}
                          </span>
                          <span className="block truncate font-lcd text-[10px] text-fg-dim">
                            {p.bars} bar{p.bars > 1 ? "s" : ""} · {p.chords.join(" ")} · {p.bpm} bpm
                          </span>
                        </button>
                        <button type="button" className="btn !px-2 !py-1 text-[11px]" onClick={() => addPattern(p)}>
                          Copy
                        </button>
                        <button
                          type="button"
                          className="btn !px-2 !py-1 text-[11px]"
                          onClick={() => deletePattern(p.id)}
                          disabled={state.patterns.length <= 1}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}

                  <div className="mt-1 border-t border-line pt-2">
                    <button
                      type="button"
                      onClick={() => setPresetsOpen((v) => !v)}
                      aria-expanded={presetsOpen}
                      className="caps flex w-full items-center justify-between px-1 py-1 text-fg-dim"
                    >
                      Start from a preset
                      <span aria-hidden="true">{presetsOpen ? "\u2212" : "+"}</span>
                    </button>
                    {presetsOpen ? (
                      <div className="flex flex-wrap gap-1.5 px-1 pb-1 pt-1">
                        {PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="btn !px-2.5 !py-1 text-[11px]"
                            onClick={() => addPattern(p)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="btn btn-lit mt-2 w-full !py-1.5 text-[11px]"
                    onClick={() => addPattern(emptyPattern())}
                  >
                    + New empty pattern
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <PatternEditor pattern={pattern} onChange={setPattern} />

          <section>
            <SectionTitle>Sound</SectionTitle>
            <div className="panel divide-y divide-[color:var(--line-soft)] py-1">
              <Toggle
                label="Guitar"
                hint="Hear the chords played back"
                on={state.audio.guitar}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, guitar: v } }))}
              />
              <Toggle
                label="Metronome click"
                on={state.audio.click}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, click: v } }))}
              />
              <Slider
                label="Guitar volume"
                readout={`${Math.round(state.audio.volume * 100)}%`}
                value={state.audio.volume} min={0} max={1} step={0.01}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, volume: v } }))}
              />
              <Slider
                label="Click volume"
                readout={`${Math.round(state.audio.clickVolume * 100)}%`}
                value={state.audio.clickVolume} min={0} max={1} step={0.01}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, clickVolume: v } }))}
              />
              <SegmentedControl
                label="Tone"
                value={state.audio.tone}
                options={[
                  { id: "acoustic" as Tone, label: INSTRUMENTS.acoustic.label },
                  { id: "classical" as Tone, label: INSTRUMENTS.classical.label },
                  { id: "electric" as Tone, label: INSTRUMENTS.electric.label },
                  { id: "synth" as Tone, label: "Synth" },
                ]}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, tone: v } }))}
              />
              <div className="px-3 pb-2 text-[11px] leading-relaxed text-fg-dim">
                {isInstrument(state.audio.tone) ? (
                  <>
                    <p>{INSTRUMENTS[state.audio.tone].blurb}</p>
                    <p className="mt-1 opacity-80">
                      {INSTRUMENTS[state.audio.tone].credit} · {INSTRUMENTS[state.audio.tone].licence}
                    </p>
                    <p className="mt-1">
                      {sampleState === "loading" ? (
                        <span className="text-close">Downloading the recordings — about 2 MB, once.</span>
                      ) : sampleState === "error" ? (
                        <span className="text-loose">
                          They failed to load, so you are hearing the synth instead.
                        </span>
                      ) : sampleState === "ready" ? (
                        <span className="text-tight">Loaded.</span>
                      ) : (
                        "Downloads the first time you press play."
                      )}
                    </p>
                  </>
                ) : (
                  <p>Plucked-string model, synthesised in the browser. No download, and it is what plays if a recording fails to load.</p>
                )}
              </div>
              <SegmentedControl
                label="Count-in"
                value={String(state.audio.countInBars)}
                options={[{ id: "0", label: "None" }, { id: "1", label: "1 bar" }, { id: "2", label: "2 bars" }]}
                onChange={(v) => setState((s) => ({ ...s, audio: { ...s.audio, countInBars: Number(v) } }))}
              />
            </div>
          </section>

          <section>
            <SectionTitle>Listening</SectionTitle>
            <div className="panel space-y-1 py-1">
              {room ? (
                <div className="px-3 py-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background:
                          room.quality === "quiet" ? "var(--tight)"
                            : room.quality === "usable" ? "var(--close)"
                            : "var(--loose)",
                      }}
                    />
                    <span className="text-sm font-semibold capitalize">{room.quality} room</span>
                    <span className="ml-auto font-lcd text-[11px] text-fg-dim">
                      {room.noiseDb.toFixed(0)} dB
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-fg-muted">{room.message}</p>
                </div>
              ) : (
                <p className="px-3 py-2 text-xs text-fg-dim">
                  Turn on listening from the transport bar. It measures the room for two seconds
                  first, so keep quiet while it does.
                </p>
              )}

              <button
                type="button"
                className="btn mx-3 text-xs"
                onClick={onRecalibrate}
                disabled={micStatus !== "listening"}
              >
                Measure the room again
              </button>

              <Toggle
                label="Check the chord"
                hint="Flags when you play a different chord than the bar asks for"
                on={state.listen.checkChord}
                onChange={(v) => setState((s) => ({ ...s, listen: { ...s.listen, checkChord: v } }))}
              />
              <Toggle
                label="Check up vs down"
                hint="Guesses stroke direction from the attack. Experimental"
                on={state.listen.checkStroke}
                onChange={(v) => setState((s) => ({ ...s, listen: { ...s.listen, checkStroke: v } }))}
              />
              <SegmentedControl
                label="When the mic is listening"
                value={state.listen.duckMode}
                options={[
                  { id: "mute" as DuckMode, label: "Mute guitar" },
                  { id: "subtract" as DuckMode, label: "Subtract" },
                  { id: "off" as DuckMode, label: "Leave it" },
                ]}
                onChange={(v) => setState((s) => ({ ...s, listen: { ...s.listen, duckMode: v } }))}
              />
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-dim">
                {state.listen.duckMode === "mute"
                  ? "The guitar part goes quiet while the mic judges, so the app can't hear itself and score its own playback as your strumming. The click keeps playing."
                  : state.listen.duckMode === "subtract"
                    ? "Keeps the guitar audible and tries to ignore onsets that are its own playback. Best effort only — a quiet, perfectly-timed strum looks exactly like bleed and can be dropped."
                    : "Nothing is suppressed. Right on headphones; on speakers the app will score its own guitar as if you played it."}
              </p>

              <Slider
                label="Latency offset"
                readout={`${state.listen.offsetMs} ms`}
                value={state.listen.offsetMs} min={-150} max={250} step={1}
                onChange={(v) => setState((s) => ({ ...s, listen: { ...s.listen, offsetMs: v } }))}
              />
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-dim">
                Your microphone, driver and speakers each add a fixed delay. If every strum reads
                late by about the same amount, that is this number, not your playing.
              </p>
              <button type="button" className="btn mx-3 mb-2 text-xs" onClick={onZeroLatency} disabled={!canZero}>
                Zero it from my last few strums
              </button>
            </div>
          </section>

          {account.configured ? (
            <section>
              <SectionTitle>Account</SectionTitle>
              <div className="panel p-3">
                {account.email ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{account.email}</p>
                      <p className="text-xs text-fg-dim">
                        {account.status === "synced" ? "Patterns saved to your account"
                          : account.status === "syncing" ? "Saving…"
                          : account.status === "error" ? "Couldn't save — will retry"
                          : "Saved on this device"}
                      </p>
                    </div>
                    <button type="button" className="btn text-xs" onClick={account.signOut}>
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-fg-muted">
                      Your patterns are saved in this browser. Sign in to keep them across devices.
                    </p>
                    <button type="button" className="btn btn-lit shrink-0 text-xs" onClick={account.signIn}>
                      Sign in
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
