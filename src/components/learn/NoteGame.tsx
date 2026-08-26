"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useNoteGame } from "@/hooks/useNoteGame";
import { EXERCISES, type Exercise, type NoteTarget } from "@/lib/music/exercises";
import type { Chord } from "@/lib/music/chords";
import { ChordChart } from "../chart/ChordChart";
import { ChromeText } from "../ui/ChromeText";
import { Nav } from "../ui/Nav";

/**
 * The listening game, full screen. Untimed on principle: the metronome side of
 * the app owns "when", this side owns "where". You play the shown note at
 * whatever pace your hands allow; the microphone confirms and deals the next.
 *
 * Layout is the split the phone needs: current target on the left and larger,
 * what's coming on the right and smaller. Desktop gets the same shape with
 * more air. Status lives in a corner pill — content slots never flip.
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

function GameInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const exercise: Exercise | undefined = EXERCISES.find((e) => e.id === id && e.kind === "notes");
  const targets = useMemo(() => exercise?.notes ?? [], [exercise]);
  const game = useNoteGame(targets);

  const nextExercise = useMemo(() => {
    if (!exercise) return undefined;
    const i = EXERCISES.indexOf(exercise);
    return EXERCISES[i + 1];
  }, [exercise]);

  if (!exercise) {
    return (
      <main className="block-dark min-h-dvh">
        <Nav />
        <div className="wrap px-4 py-16 text-center sm:px-8">
          <p className="text-fg-muted">That game doesn&rsquo;t exist.</p>
          <Link href="/learn?tab=exercises" className="btn btn-lit mt-4 inline-flex">Back to exercises</Link>
        </div>
      </main>
    );
  }

  const current = targets[game.index];
  const upcoming = targets.slice(game.index + 1, game.index + 5);
  const playing = game.status === "listening";

  const pill =
    game.status === "idle" ? { dot: "var(--fg-dim)", label: "Mic off" }
      : game.status === "opening" ? { dot: "var(--close)", label: "Opening…" }
      : game.status === "error" ? { dot: "var(--loose)", label: "Mic failed" }
      : game.status === "done" ? { dot: "var(--tight)", label: "Done" }
      : game.heard ? { dot: "var(--tight)", label: `Hearing ${game.heard}` }
      : { dot: "var(--close)", label: "Listening…" };

  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />

      <section className="relative flex-1 px-4 py-4 sm:px-8">
        <div
          className="absolute right-4 top-2 z-10 flex items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:right-8"
          role="status"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: pill.dot }} />
          <span className="caps text-fg-dim">{pill.label}</span>
        </div>

        <div className="wrap">
          <p className="caps text-fg-dim">{exercise.title}</p>

          {game.status === "done" ? (
            <div className="mt-6 text-center">
              <ChromeText className="block text-[clamp(2.5rem,10vw,6rem)]">Done</ChromeText>
              <p className="mt-3 text-sm text-fg-muted">
                All {targets.length} notes found. {exercise.goal}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-lit" onClick={() => void game.start()}>
                  Again
                </button>
                {nextExercise ? (
                  <Link
                    href={nextExercise.kind === "notes" ? `/game?id=${nextExercise.id}` : "/learn?tab=exercises"}
                    className="btn"
                  >
                    Next: {nextExercise.title}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-[3fr_2fr] gap-4 sm:gap-8">
              {/* Left, larger: the note to find. */}
              <div>
                <div className="block-light card-flat mx-auto max-w-56 p-3">
                  <ChordChart chord={noteAsChord(current)} overlay={playing ? { sounding: [current.string] } : undefined} />
                </div>
                <div className="mt-2 text-center">
                  <ChromeText className="block text-[clamp(2.5rem,10vw,5rem)]">{current.name}</ChromeText>
                  <p className="caps mt-1 text-fg-dim">
                    string {current.string + 1} · {current.fret === 0 ? "open" : `fret ${current.fret}`}
                  </p>
                  {/* Hold-progress: fills as the note registers. */}
                  <div className="mx-auto mt-3 h-2 w-40 overflow-hidden rounded-full border border-line">
                    <div
                      className="h-full rounded-full transition-[width] duration-100"
                      style={{ width: `${Math.round(game.progress * 100)}%`, background: "var(--tight)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Right, smaller: what's coming. */}
              <div>
                <p className="caps text-fg-dim">up next</p>
                <ol className="mt-2 space-y-1.5">
                  {upcoming.map((t, i) => (
                    <li key={`${game.index + 1 + i}`} className="flex items-baseline gap-2 rounded-lg border border-line px-2.5 py-1.5" style={{ opacity: 1 - i * 0.18 }}>
                      <span className="font-display text-lg leading-none text-fg">{t.name}</span>
                      <span className="caps text-fg-dim">
                        s{t.string + 1} · {t.fret === 0 ? "open" : `f${t.fret}`}
                      </span>
                    </li>
                  ))}
                  {upcoming.length === 0 ? <li className="caps text-fg-dim">last one</li> : null}
                </ol>
                <p className="caps mt-4 text-fg-dim">
                  {game.hits} / {targets.length} found
                </p>
                {nextExercise ? (
                  <p className="caps mt-2 text-fg-dim opacity-70">then: {nextExercise.title}</p>
                ) : null}
              </div>
            </div>
          )}

          {game.status !== "done" ? (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`btn ${playing ? "btn-hot" : "btn-lit"}`}
                onClick={() => (playing || game.status === "opening" ? game.stop() : void game.start())}
              >
                {playing ? "Stop" : game.status === "opening" ? "Opening…" : "Start the game"}
              </button>
              <Link href="/learn?tab=exercises" className="btn">All exercises</Link>
            </div>
          ) : null}

          {game.message ? <p className="mt-3 text-xs text-loose">{game.message}</p> : null}
          <p className="mt-4 max-w-xl text-xs leading-relaxed text-fg-dim">{exercise.coaching}</p>
        </div>
      </section>
    </main>
  );
}

export function NoteGame() {
  return (
    <Suspense>
      <GameInner />
    </Suspense>
  );
}
