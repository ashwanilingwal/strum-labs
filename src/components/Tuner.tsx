"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { touchLocal } from "@/hooks/useAccount";
import { useTuner } from "@/hooks/useTuner";
import { previewNotes } from "@/lib/audio/preview";
import type { Tone } from "@/lib/audio/engine";
import { INSTRUMENTS } from "@/lib/audio/samples";
import type { Chord } from "@/lib/music/chords";
import {
  centsBetween, IN_TUNE_CENTS, nearestString, stringsOf, tuningVerdict, TUNINGS,
} from "@/lib/music/tuning";
import { ChordChart } from "./chart/ChordChart";
import { appStore } from "@/lib/storage/settings";
import { ChromeText } from "./ui/ChromeText";
import { MotifField } from "./ui/MotifField";
import { Nav } from "./ui/Nav";

/**
 * The tuner.
 *
 * One rule shapes the layout: **status never replaces content.** Detection
 * comes and goes between plucks, and an earlier version swapped the big centre
 * letter for a "listening" message every time it dropped — the most prominent
 * thing on screen flickered between two unrelated displays. Now the centre
 * always holds the string: the last one heard stays put and dims while the
 * signal is gone, and liveness lives in a small pill at the side.
 *
 * Scaled in cents rather than hertz; needle range is ±50 — half a semitone,
 * past which you are closer to the next note. In-tune band is ±5 cents.
 *
 * The string chips are controls, not just a readout: tapping one plays its
 * reference note (in the same tone the practice screen uses — acoustic,
 * classical, electric or synth) and pins the tuner to that string; tapping it
 * again goes back to following whatever you play. A string held in tune for a
 * moment earns a tick that stays, and six ticks make a session.
 */

const RANGE = 50;
/**
 * Consecutive in-tune readings before a string's tick is earned. Readings
 * arrive ~50 ms apart while a note rings, so this is roughly half a second
 * of holding — long enough that brushing past the centre doesn't count.
 */
const TUNED_HOLD_READINGS = 10;
/**
 * How long after a reference pluck the tick timer stays suspended. The app's
 * own reference note is, by definition, perfectly in tune — without this the
 * tuner would hear itself and hand out ticks for free. Samples ring longest,
 * hence the generous window.
 */
const PREVIEW_GUARD_MS = 2800;
/** In manual mode, a reading this far out is a different string, not detuning. */
const WRONG_STRING_CENTS = 300;

/**
 * The "chord" the chart draws: all six strings open, which is what a guitar
 * being tuned is. Every tuning uses it — the chart shows which strings are
 * settled, and the note names live on the buttons below, so a Drop D session
 * needs no different diagram.
 */
const OPEN_STRINGS: Chord = {
  id: "tuner-open",
  symbol: "",
  name: "Open strings",
  frets: [0, 0, 0, 0, 0, 0],
  fingers: [0, 0, 0, 0, 0, 0],
  baseFret: 1,
  tier: "open",
  tip: "",
};

const TONES: { id: Tone; label: string }[] = [
  { id: "acoustic", label: INSTRUMENTS.acoustic.label },
  { id: "classical", label: INSTRUMENTS.classical.label },
  { id: "electric", label: INSTRUMENTS.electric.label },
  { id: "synth", label: "Synth" },
];

export function Tuner() {
  const [tuningId, setTuningId] = useState("standard");
  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const strings = useMemo(() => stringsOf(tuning), [tuning]);
  const { status, message, hz, lastHz, start, stop } = useTuner();
  const listening = status === "listening";

  /** Pinned string index, or null to follow whatever is played. */
  const [target, setTarget] = useState<number | null>(null);
  /** Sticky ticks: strings already brought into tune this session. */
  const [tuned, setTuned] = useState<ReadonlySet<number>>(new Set());

  // The practice screen's tone, shared on purpose: hearing the reference in
  // the voice you practise with is the point of offering it here at all.
  const appState = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  const tone = appState.audio.tone;
  const setTone = (t: Tone) => {
    appStore.set((s) => ({ ...s, audio: { ...s.audio, tone: t } }));
    touchLocal();
  };

  // `hz` is the live signal; `lastHz` survives its loss. The centre renders
  // from whichever exists, so it never swaps to a status message — it just
  // dims when the note has died.
  const live = hz !== null;
  const shownHz = hz ?? lastHz;
  const shown = useMemo(
    () =>
      target !== null
        ? shownHz
          ? { string: strings[target], cents: centsBetween(shownHz, strings[target].hz) }
          : { string: strings[target], cents: 0 }
        : shownHz
          ? nearestString(shownHz, tuning)
          : null,
    [target, shownHz, strings, tuning],
  );

  /** The string the chart should light: the pinned one, else what is heard. */
  const activeIndex = target ?? shown?.string.index ?? null;

  /** Pinned to one string but clearly hearing another. */
  const wrongString =
    target !== null && shownHz !== null && Math.abs(shown!.cents) > WRONG_STRING_CENTS;

  const verdict = shown && shownHz && !wrongString ? tuningVerdict(shown.cents) : null;
  const needle = shown && !wrongString ? Math.max(-RANGE, Math.min(RANGE, shown.cents)) / RANGE : 0;

  // ---- sticky ticks ------------------------------------------------------

  const holdRef = useRef<{ index: number; count: number } | null>(null);
  /** True while a reference pluck may still be ringing into the mic. */
  const previewingRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);

  // Runs on every accepted reading (each render while a note rings): a string
  // earns its tick after enough consecutive in-tune readings. Ticks are
  // sticky — drifting out later does not take one away; changing tuning
  // resets them.
  useEffect(() => {
    if (!live || !shown || verdict !== "in-tune" || previewingRef.current) {
      holdRef.current = null;
      return;
    }
    const idx = shown.string.index;
    const hold = holdRef.current;
    holdRef.current =
      hold && hold.index === idx ? { index: idx, count: hold.count + 1 } : { index: idx, count: 1 };
    if (holdRef.current.count >= TUNED_HOLD_READINGS && !tuned.has(idx)) {
      const next = new Set(tuned).add(idx);
      setTuned(next);
      // Guided mode: a pinned string that just earned its tick hands the pin
      // to the next untuned string, so a tune-up walks the neck one string
      // at a time. Free mode (no pin) stays free.
      setTarget((cur) => {
        if (cur === null) return null;
        for (let d = 1; d <= strings.length; d++) {
          const candidate = (idx + d) % strings.length;
          if (!next.has(candidate)) return candidate;
        }
        return null;
      });
    }
  }, [live, shown, verdict, tuned, strings.length]);

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

  const allTuned = tuned.size >= strings.length;

  const resetSession = () => {
    setTuned(new Set());
    setTarget(null);
    holdRef.current = null;
  };

  const tapString = (index: number, midi: number) => {
    setTarget((cur) => (cur === index ? null : index));
    previewingRef.current = true;
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      previewingRef.current = false;
    }, PREVIEW_GUARD_MS);
    void previewNotes([{ midi, voice: index }]);
  };

  const colour = !live
    ? "var(--fg-dim)"
    : verdict === "in-tune"
      ? "var(--tight)"
      : "var(--close)";

  const pill =
    status === "off" ? { dot: "var(--fg-dim)", label: "Mic off" }
      : status === "opening" ? { dot: "var(--close)", label: "Opening…" }
      : status === "error" ? { dot: "var(--loose)", label: "Mic failed" }
      : live ? { dot: "var(--tight)", label: "Hearing you" }
      : { dot: "var(--close)", label: "Listening…" };

  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />

      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        <MotifField density={0.5} />

        {/* Liveness lives here, at the side — never in the centre slot. */}
        <div
          className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:right-8"
          role="status"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: pill.dot,
              boxShadow: live ? `0 0 8px ${pill.dot}` : "none",
            }}
          />
          <span className="caps text-fg-dim">{pill.label}</span>
        </div>

        <div className="wrap relative z-10 flex w-full flex-col items-center">
          <p className="caps text-fg-dim">
            {tuning.name} tuning
            {target !== null ? ` · tuning the ${strings[target].label}` : ""}
          </p>

          {/* The centre slot: always the string, never a status. */}
          {shown ? (
            <div style={{ opacity: live || target !== null ? 1 : 0.4, transition: "opacity 300ms ease" }}>
              <ChromeText className="mt-1 block text-[clamp(4rem,18vw,10rem)]">
                {shown.string.label}
              </ChromeText>
            </div>
          ) : (
            // Nothing heard yet. A dash here renders as a fat grey bar in the
            // display face — it reads as a smudge, not as "no reading". Hold
            // the height so the layout does not jump, and let the caption
            // below say what to do.
            <div
              aria-hidden="true"
              className="mt-1 select-none font-display leading-none opacity-0"
              style={{ fontSize: "clamp(4rem,18vw,10rem)" }}
            >
              E
            </div>
          )}

          <p className="caps-lg mt-1" style={{ color: colour, opacity: live ? 1 : 0.6 }}>
            {!shown
              ? "Play one string to begin"
              : wrongString
                ? `That's not the ${shown.string.label} — play string ${shown.string.index + 1}`
                : !shownHz
                  ? "Play the string, or tap it to hear the target"
                  : verdict === "in-tune"
                    ? "In tune"
                    : verdict === "flat"
                      ? `Tune up · ${Math.abs(Math.round(shown.cents))} low`
                      : `Tune down · ${Math.abs(Math.round(shown.cents))} high`}
          </p>

          {/* needle */}
          <div className="mt-6 w-full max-w-md">
            <div className="relative h-14 overflow-hidden rounded-xl border border-line bg-black/30">
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${50 - (IN_TUNE_CENTS / RANGE) * 50}%`,
                  right: `${50 - (IN_TUNE_CENTS / RANGE) * 50}%`,
                  background: "rgba(95,227,160,0.18)",
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-fg opacity-60" />
              {shown && shownHz && !wrongString ? (
                <div
                  className="absolute inset-y-1 w-1 rounded-full transition-[left,opacity] duration-100"
                  style={{
                    left: `calc(${50 + needle * 50}% - 2px)`,
                    background: colour,
                    boxShadow: live ? `0 0 12px ${colour}` : "none",
                    opacity: live ? 1 : 0.4,
                  }}
                />
              ) : null}
            </div>
            <div className="mt-1 flex justify-between font-lcd text-[10px] uppercase tracking-widest text-fg-dim">
              <span>too low</span>
              <span>{shownHz ? `${shownHz.toFixed(1)} Hz` : "—"}</span>
              <span>too high</span>
            </div>
          </div>

          {/* The six strings as the app's own chord chart — the same diagram
              the chords, play and exercise screens use, here showing the
              shape a tuned guitar makes: all six open. The string being
              tuned lights in the accent colour; a string held in tune turns
              green and takes a tick above the nut, and stays. */}
          <div className="block-light card-flat mt-6 w-full max-w-[220px] p-3">
            <ChordChart
              chord={OPEN_STRINGS}
              overlay={{
                sounding: activeIndex !== null && !tuned.has(activeIndex) ? [activeIndex] : [],
                tuned: [...tuned],
              }}
              options={{ showFingers: false }}
            />
          </div>

          {/* Strings: tap to hear the reference and pin the tuner to it. The
              same tick as the chart, so the two read as one thing. */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {strings.map((s) => {
              const isTarget = target !== null ? target === s.index : shown?.string.index === s.index;
              const done = tuned.has(s.index);
              return (
                <button
                  key={s.index}
                  type="button"
                  onClick={() => tapString(s.index, s.midi)}
                  aria-pressed={target === s.index}
                  aria-label={`${s.label} string${done ? ", in tune" : ""} — tap to hear it and tune to it`}
                  className="relative rounded-full border px-3 py-1.5 text-center transition"
                  style={{
                    borderColor: done ? "var(--tight)" : isTarget ? "var(--accent)" : "var(--line)",
                    background: done ? "rgba(95,227,160,0.14)" : "transparent",
                    color: isTarget ? "var(--fg)" : "var(--fg-dim)",
                    opacity: isTarget && !live && target === null ? 0.6 : 1,
                  }}
                >
                  <span className="caps-lg block">{s.label}</span>
                  <span className="num block text-[10px] opacity-70">{s.hz.toFixed(1)}</span>
                  {done ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: "var(--tight)", color: "var(--ink)" }}
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="caps mt-2 text-fg-dim opacity-80">
            {allTuned
              ? "6 / 6 in tune"
              : `Tap a string to hear it · ${tuned.size} / ${strings.length} in tune`}
          </p>

          {/* The finish line. Green, and it stays until the next session. */}
          {allTuned ? (
            <div
              className="mt-5 w-full max-w-md rounded-2xl border px-5 py-4 text-center"
              style={{ borderColor: "var(--tight)", background: "rgba(95,227,160,0.12)" }}
              role="status"
            >
              <p className="caps-lg" style={{ color: "var(--tight)" }}>
                You&apos;re all tuned up for practice! 🎸
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Link href="/play" className="btn btn-lit">Go practise</Link>
                <button type="button" className="btn" onClick={resetSession}>
                  Tune again
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className={`btn ${listening ? "btn-hot" : "btn-lit"}`}
              onClick={() => (listening || status === "opening" ? stop() : void start())}
            >
              {listening ? "Stop" : status === "opening" ? "Opening…" : "Start tuning"}
            </button>
            <select
              value={tuningId}
              onChange={(e) => {
                setTuningId(e.target.value);
                resetSession();
              }}
              className="btn !px-4"
              aria-label="Tuning"
            >
              {TUNINGS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {/* What the reference notes sound like — the same tone the play
                screen uses, so switching here switches there too. */}
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="btn !px-4"
              aria-label="Reference tone"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <p className="mt-3 text-center text-xs text-fg-dim">{tuning.hint}</p>

          {message ? <p className="mt-3 text-center text-xs text-loose">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
