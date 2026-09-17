"use client";

import { useEffect, useRef, useState } from "react";
import { emptyPattern, newPatternId, type Pattern } from "@/lib/music/pattern";
import type { AppState } from "@/lib/storage/settings";
import type { MicStatus } from "@/hooks/useStrumEngine";
import type { SamplerState } from "@/lib/audio/sampler";
import { QUICK_ID, type DuckMode } from "@/lib/storage/settings";
import type { Tone } from "@/lib/audio/engine";
import { INSTRUMENTS, isInstrument } from "@/lib/audio/samples";
import type { RoomProfile } from "@/lib/listen/detector";
import type { DeleteResult, SyncStatus } from "@/hooks/useAccount";
import { Dialog } from "./ui/Dialog";
import { Disclosure } from "./ui/Disclosure";
import { PatternEditor } from "./PatternEditor";
import { PracticePicker } from "./PracticePicker";
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
    deleteAccount: () => Promise<DeleteResult>;
  };
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // The two account dialogs: what signing in means (asked before the OAuth
  // hop, because that is when the data is collected), and the deletion
  // confirm. `note` is the one-line outcome shown in the panel afterwards.
  const [dialog, setDialog] = useState<"signin" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
          <Disclosure
            title="What to practise"
            summary={state.mode === "chord" ? state.pick.chordId : "Progression"}
            defaultOpen
          >
            <PracticePicker state={state} setState={setState} />
          </Disclosure>

          {/* Both of these are about progressions. In chord mode there is one
              bar and one chord, chosen above — a stroke editor and a pattern
              library are answering a question nobody asked yet. */}
          {state.mode === "pattern" ? (
          <Disclosure title="Saved patterns" summary={`${state.patterns.length}`}>
            <div className="px-1 py-1">
              {state.patterns.map((p) => {
                const active = p.id === state.activeId;
                return (
                  <div key={p.id} className="flex items-center gap-2 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => selectPattern(p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={`block truncate text-sm font-semibold ${active ? "text-accent" : ""}`}>
                        {active ? "\u2713 " : ""}{p.name}
                      </span>
                      <span className="block truncate font-lcd text-[10px] text-fg-dim">
                        {p.bars} bar{p.bars > 1 ? "s" : ""} \u00b7 {p.chords.join(" ")} \u00b7 {p.bpm} bpm
                      </span>
                    </button>
                    <button type="button" className="btn !px-2 !py-1 text-[11px]" onClick={() => addPattern(p)}>
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn !px-2 !py-1 text-[11px]"
                      onClick={() => deletePattern(p.id)}
                      disabled={state.patterns.length <= 1 || p.id === QUICK_ID}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn btn-lit mt-2 w-full !py-1.5 text-[11px]"
                onClick={() => addPattern(emptyPattern())}
              >
                + New empty pattern
              </button>
            </div>
          </Disclosure>
          ) : null}

          {state.mode === "pattern" ? (
            <Disclosure title="Edit this pattern" summary={pattern.name} defaultOpen>
              <div className="px-3 py-2">
                <PatternEditor pattern={pattern} onChange={setPattern} />
              </div>
            </Disclosure>
          ) : null}

          <Disclosure
            title="Sound"
            summary={isInstrument(state.audio.tone) ? INSTRUMENTS[state.audio.tone].label : "Synth"}
          >
            <div className="divide-y divide-[color:var(--line-soft)] py-1">
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
          </Disclosure>

          <Disclosure title="Listening" summary={room ? room.quality : "off"}>
            <div className="space-y-1 py-1">
              {room ? (
                <div className="px-3 py-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background:
                          room.quality === "quiet" ? "var(--tight)"
                            : room.quality === "usable" ? "var(--close)"
                            : "var(--loose)", // noisy and silent both mean "act on this"
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
              {/* Chroma bins accept a note within a third of a semitone. Past
                  that the note lands in the wrong bin and chord recognition
                  collapses — measured at 69% in tune versus 31% at 50 cents
                  out. Timing is unaffected either way. */}
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-dim">
                Chord guesses wrong but timing fine? Check the guitar is in tune — past about a
                third of a semitone the chord matcher falls apart, while timing carries on
                working. <a href="/tuner" className="text-accent underline">Open the tuner</a>.
              </p>
              <button type="button" className="btn mx-3 mb-2 text-xs" onClick={onZeroLatency} disabled={!canZero}>
                Zero it from my last few strums
              </button>
            </div>
          </Disclosure>

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
                    <button type="button" className="btn btn-lit shrink-0 text-xs" onClick={() => setDialog("signin")}>
                      Sign in
                    </button>
                  </div>
                )}
                {account.email ? (
                  <button
                    type="button"
                    className="caps mt-3 text-fg-dim underline underline-offset-4 transition hover:text-accent"
                    onClick={() => setDialog("delete")}
                  >
                    Delete account
                  </button>
                ) : null}
                {note ? <p className="mt-2 text-xs text-fg-muted">{note}</p> : null}
              </div>
              <p className="mt-2 px-1 text-xs text-fg-dim">
                What an account stores, and what it doesn&apos;t:{" "}
                <a href="/privacy" className="text-accent underline">privacy notice</a>.
              </p>
            </section>
          ) : null}

          {dialog === "signin" ? (
            <Dialog title="Sign in with Google?" icon="☁️" onClose={() => setDialog(null)} actions={
              <>
                <button type="button" className="btn text-xs" onClick={() => setDialog(null)}>
                  Not now
                </button>
                <button
                  type="button"
                  className="btn btn-lit text-xs"
                  onClick={() => {
                    setDialog(null);
                    account.signIn();
                  }}
                >
                  Continue with Google
                </button>
              </>
            }>
              <p>
                Signing in makes a StrumLab account from the email address and name on your
                Google account, and keeps a copy of your patterns, settings and level results on
                our database (hosted by Supabase) so they follow you between devices.
              </p>
              <p>
                That is everything it stores. No marketing, nothing shared, and you can delete
                the lot from this panel whenever you like.{" "}
                <a href="/privacy" className="text-accent underline">Privacy notice</a>.
              </p>
            </Dialog>
          ) : null}

          {dialog === "delete" ? (
            <Dialog title="Delete your account?" icon="🗑️" onClose={() => (deleting ? undefined : setDialog(null))} actions={
              <>
                <button type="button" className="btn text-xs" disabled={deleting} onClick={() => setDialog(null)}>
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    const result = await account.deleteAccount();
                    setDeleting(false);
                    setDialog(null);
                    setNote(
                      result === "deleted" ? "Your account and its synced copy are gone. This browser's copy is still here."
                      : result === "unsupported" ? "Deletion isn't set up on this server yet — email the address on the privacy page and it will be done by hand."
                      : "That didn't work. Check your connection and try again, or email the address on the privacy page.",
                    );
                  }}
                >
                  {deleting ? "Deleting…" : "Delete everything"}
                </button>
              </>
            }>
              <p>
                This removes your account and the synced copy of your patterns, settings and
                results from our database, straight away and for good.
              </p>
              <p>
                The copy in this browser stays, so you can keep practising without an account.
                Clear this site&apos;s data in your browser if you want that gone too.
              </p>
            </Dialog>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
