"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { targetMidi, useNoteGame } from "@/hooks/useNoteGame";
import { previewNotes, stopPreview } from "@/lib/audio/preview";
import { type Exercise, type NoteTarget } from "@/lib/music/exercises";
import type { Chord } from "@/lib/music/chords";
import { ChordChart } from "./chart/ChordChart";
import { ChromeText } from "./ui/ChromeText";

/**
 * The listening game, host-agnostic. Untimed on principle: the metronome side
 * of the app owns "when", this side owns "where" — you play the shown note at
 * whatever pace your hands allow; the microphone confirms and deals the next.
 */

/** A one-note "chord" so the chart can draw a single finger position. */
function noteAsChord(t: NoteTarget): Chord {
  const frets = [-1, -1, -1, -1, -1, -1];
  const fingers = [0, 0, 0, 0, 0, 0];
  frets[t.string] = t.fret;
  if (t.fret > 0) fingers[t.string] = 1;
  return {
    id: `note-${t.string}-${t.fret}`, symbol: t.name, name: t.name,
    frets, fingers, baseFret: 1, tier: "open", tip: "",
  };
}

const DEMO_STEP_MS = 550;

export function NoteGameBody({
  exercise, extraControls,
}: {
  exercise: Exercise;
  /** Host-owned controls for the button row — the exercise click lives here,
   *  outside this component, so it survives the keyed remount per exercise. */
  extraControls?: ReactNode;
}) {
  const targets = exercise.notes ?? [];
  const game = useNoteGame(targets);
  const playing = game.status === "listening";

  /**
   * "Hear it": the app plays the whole sequence gently, stepping the big
   * display through each target as it sounds — so the drill is heard before
   * it is attempted. Pure playback; game state never advances.
   */
  const [demoIndex, setDemoIndex] = useState<number | null>(null);
  const demoTimers = useRef<number[]>([]);
  const clearDemo = () => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
  };
  useEffect(() => () => { clearDemo(); stopPreview(); }, []);

  const demoing = demoIndex !== null;
  const playDemo = () => {
    if (playing) return;
    clearDemo();
    void previewNotes(
      targets.map((t) => ({ midi: targetMidi(t), voice: t.string })),
      DEMO_STEP_MS / 1000,
    );
    targets.forEach((_, i) => {
      demoTimers.current.push(window.setTimeout(() => setDemoIndex(i), i * DEMO_STEP_MS));
    });
    demoTimers.current.push(
      window.setTimeout(() => setDemoIndex(null), targets.length * DEMO_STEP_MS + 250),
    );
  };
  const stopDemo = () => {
    clearDemo();
    stopPreview();
    setDemoIndex(null);
  };

  // During the demo the big slot follows the demo, not the game.
  const shown = demoing ? targets[demoIndex] : targets[game.index];
  const upcoming = targets.slice(game.index + 1, game.index + 5);

  const pill =
    demoing ? { dot: "var(--accent)", label: "Playing it for you" }
      : game.status === "idle" ? { dot: "var(--fg-dim)", label: "Mic off" }
      : game.status === "opening" ? { dot: "var(--close)", label: "Opening…" }
      : game.status === "error" ? { dot: "var(--loose)", label: "Mic failed" }
      : game.status === "done" ? { dot: "var(--tight)", label: "Done" }
      : game.heard ? { dot: "var(--tight)", label: `Hearing ${game.heard}` }
      : { dot: "var(--close)", label: "Listening…" };

  return (
    <div className="relative">
      <div
        className="absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full border border-line px-3 py-1.5"
        role="status"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: pill.dot }} />
        <span className="caps text-fg-dim">{pill.label}</span>
      </div>

      {game.status === "done" ? (
        <div className="py-6 text-center">
          <ChromeText className="block text-[clamp(2rem,8vw,4rem)]">Done</ChromeText>
          <p className="mt-3 text-sm text-fg-muted">
            All {targets.length} notes found. {exercise.goal}
          </p>
          <button type="button" className="btn btn-lit mt-5" onClick={() => void game.start()}>
            Again
          </button>
          {/* Still here on the done screen, so a running click can be stopped
              without restarting the game. */}
          {extraControls ? <div className="mt-4 flex justify-center">{extraControls}</div> : null}
        </div>
      ) : (
        <>
          {/* Current on the left and larger; what's coming on the right and
              smaller — the split a phone needs, desktop just gets more air. */}
          <div className="grid grid-cols-[3fr_2fr] gap-4 pt-10 sm:gap-8">
            <div>
              <div className="relative mx-auto max-w-48">
                <div className="block-light card-flat border border-line p-3">
                  <ChordChart
                    chord={noteAsChord(shown)}
                    overlay={playing || demoing ? { sounding: [shown.string] } : undefined}
                  />
                </div>
                {/* The green moment. Keyed so every hit flashes, even repeats. */}
                {game.hitSeq > 0 ? (
                  <div key={game.hitSeq} className="hit-flash" aria-hidden="true">✓</div>
                ) : null}
              </div>
              <div className="mt-2 text-center">
                <ChromeText className="block text-[clamp(2rem,8vw,3.5rem)]">{shown.name}</ChromeText>
                <p className="caps mt-1 text-fg-dim">
                  string {shown.string + 1} · {shown.fret === 0 ? "open" : `fret ${shown.fret}`}
                </p>
                <div className="mx-auto mt-3 h-2 w-36 overflow-hidden rounded-full border border-line">
                  <div
                    className="h-full rounded-full transition-[width] duration-100"
                    style={{ width: `${Math.round(game.progress * 100)}%`, background: "var(--tight)" }}
                  />
                </div>
                {/* The whole sequence as dots: green found, accent current. */}
                <div className="mt-2 flex flex-wrap justify-center gap-1" aria-hidden="true">
                  {targets.map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full transition-colors"
                      style={{
                        background:
                          i < game.index ? "var(--tight)"
                            : i === game.index ? "var(--accent)"
                            : "var(--line)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="caps text-fg-dim">up next</p>
              <ol className="mt-2 space-y-1.5">
                {upcoming.map((t, i) => (
                  <li
                    key={`${game.index + 1 + i}`}
                    className="flex items-baseline gap-2 rounded-lg border border-line px-2.5 py-1.5"
                    style={{ opacity: 1 - i * 0.18 }}
                  >
                    <span className="font-display text-lg leading-none text-fg">{t.name}</span>
                    <span className="caps text-fg-dim">
                      s{t.string + 1} · {t.fret === 0 ? "open" : `f${t.fret}`}
                    </span>
                  </li>
                ))}
                {upcoming.length === 0 ? <li className="caps text-fg-dim">last one</li> : null}
              </ol>
              <p className="caps mt-4 text-fg-dim">{game.hits} / {targets.length} found</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn ${playing ? "btn-hot" : "btn-lit"}`}
              onClick={() => {
                if (playing || game.status === "opening") {
                  game.stop();
                } else {
                  stopDemo();
                  void game.start();
                }
              }}
            >
              {playing ? "Stop" : game.status === "opening" ? "Opening…" : "Start the game"}
            </button>
            <button
              type="button"
              className={`btn ${demoing ? "btn-hot" : ""}`}
              onClick={() => (demoing ? stopDemo() : playDemo())}
              disabled={playing}
              title={playing ? "Stop the game first" : "The app plays the drill through once"}
            >
              {demoing ? "Stop" : "Hear it"}
            </button>
            {extraControls}
          </div>
          {game.message ? <p className="mt-3 text-xs text-loose">{game.message}</p> : null}
        </>
      )}
    </div>
  );
}

