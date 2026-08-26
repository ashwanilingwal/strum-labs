"use client";

import { useState } from "react";
import { useTuner } from "@/hooks/useTuner";
import {
  IN_TUNE_CENTS, nearestString, stringsOf, tuningVerdict, TUNINGS,
} from "@/lib/music/tuning";
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
 */

const RANGE = 50;

export function Tuner() {
  const [tuningId, setTuningId] = useState("standard");
  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const { status, message, hz, lastHz, start, stop } = useTuner();
  const listening = status === "listening";

  // `hz` is the live signal; `lastHz` survives its loss. The centre renders
  // from whichever exists, so it never swaps to a status message — it just
  // dims when the note has died.
  const live = hz !== null;
  const shownHz = hz ?? lastHz;
  const shown = shownHz ? nearestString(shownHz, tuning) : null;

  const verdict = shown ? tuningVerdict(shown.cents) : null;
  const needle = shown ? Math.max(-RANGE, Math.min(RANGE, shown.cents)) / RANGE : 0;

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
          <p className="caps text-fg-dim">{tuning.name} tuning</p>

          {/* The centre slot: always the string, never a status. */}
          {shown ? (
            <div style={{ opacity: live ? 1 : 0.4, transition: "opacity 300ms ease" }}>
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
              {shown ? (
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

          {/* strings */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {stringsOf(tuning).map((s) => {
              const isTarget = shown?.string.index === s.index;
              const done = isTarget && live && verdict === "in-tune";
              return (
                <div
                  key={s.index}
                  className="rounded-full border px-3 py-1.5 text-center transition"
                  style={{
                    borderColor: done ? "var(--tight)" : isTarget ? "var(--accent)" : "var(--line)",
                    background: done ? "rgba(95,227,160,0.14)" : "transparent",
                    color: isTarget ? "var(--fg)" : "var(--fg-dim)",
                    opacity: isTarget && !live ? 0.6 : 1,
                  }}
                >
                  <span className="caps-lg block">{s.label}</span>
                  <span className="num block text-[10px] opacity-70">{s.hz.toFixed(1)}</span>
                </div>
              );
            })}
          </div>

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
              onChange={(e) => setTuningId(e.target.value)}
              className="btn !px-4"
              aria-label="Tuning"
            >
              {TUNINGS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
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
