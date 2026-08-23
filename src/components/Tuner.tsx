"use client";

import { useMemo, useState } from "react";
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
 * Scaled in cents rather than hertz, and the needle range is ±50 — half a
 * semitone, past which you are closer to the next note and the number stops
 * meaning anything.
 *
 * The in-tune band is ±5 cents. Tighter than that is beyond what most people
 * can hold with a tuning peg, and looser leaves chords sounding sour even
 * though every string reads green.
 */

const RANGE = 50;

export function Tuner() {
  const [tuningId, setTuningId] = useState("standard");
  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const { status, message, hz, clarity, start, stop } = useTuner();

  const reading = useMemo(() => (hz ? nearestString(hz, tuning) : null), [hz, tuning]);
  const verdict = reading ? tuningVerdict(reading.cents) : null;
  const listening = status === "listening";

  const needle = reading
    ? Math.max(-RANGE, Math.min(RANGE, reading.cents)) / RANGE
    : 0;

  const colour =
    verdict === "in-tune" ? "var(--tight)"
      : verdict === null ? "var(--fg-dim)"
      : "var(--close)";

  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />

      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        <MotifField density={0.5} />

        <div className="wrap relative z-10 flex w-full flex-col items-center">
          <p className="caps text-fg-dim">
            {listening ? (reading ? "Nearest string" : "Play a single string") : "Tuner"}
          </p>

          {/* A chrome em-dash at display size reads as a solid white bar, not
              as "nothing yet". Better to say what it is waiting for. */}
          {reading ? (
            <ChromeText className="mt-1 block text-[clamp(4rem,18vw,10rem)]">
              {reading.string.label}
            </ChromeText>
          ) : (
            <p
              className="mt-3 font-display leading-none text-fg-dim opacity-35"
              style={{ fontSize: "clamp(2rem,7vw,3.5rem)" }}
            >
              {listening ? "listening" : "ready"}
            </p>
          )}

          <p
            className="caps-lg mt-1"
            style={{ color: colour }}
          >
            {!listening
              ? "Not listening"
              : !reading
                ? " "
                : verdict === "in-tune"
                  ? "In tune"
                  : `${Math.abs(Math.round(reading.cents))} cents ${verdict}`}
          </p>

          {/* needle */}
          <div className="mt-6 w-full max-w-md">
            <div className="relative h-14 overflow-hidden rounded-xl border border-line bg-black/30">
              {/* in-tune band */}
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${50 - (IN_TUNE_CENTS / RANGE) * 50}%`,
                  right: `${50 - (IN_TUNE_CENTS / RANGE) * 50}%`,
                  background: "rgba(95,227,160,0.18)",
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-fg opacity-60" />
              {reading ? (
                <div
                  className="absolute inset-y-1 w-1 rounded-full transition-[left] duration-100"
                  style={{
                    left: `calc(${50 + needle * 50}% - 2px)`,
                    background: colour,
                    boxShadow: `0 0 12px ${colour}`,
                  }}
                />
              ) : null}
            </div>
            <div className="mt-1 flex justify-between font-lcd text-[10px] uppercase tracking-widest text-fg-dim">
              <span>flat</span>
              <span>{hz ? `${hz.toFixed(1)} Hz` : "—"}</span>
              <span>sharp</span>
            </div>
          </div>

          {/* strings */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {stringsOf(tuning).map((s) => {
              const isTarget = reading?.string.index === s.index;
              const done = isTarget && verdict === "in-tune";
              return (
                <div
                  key={s.index}
                  className="rounded-full border px-3 py-1.5 text-center transition"
                  style={{
                    borderColor: done ? "var(--tight)" : isTarget ? "var(--accent)" : "var(--line)",
                    background: done ? "rgba(95,227,160,0.14)" : "transparent",
                    color: isTarget ? "var(--fg)" : "var(--fg-dim)",
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

          {listening && clarity > 0 && clarity < 0.95 ? (
            <p className="mt-3 max-w-sm text-center text-xs text-close">
              Reading is unsteady — play one string on its own and let it ring.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
