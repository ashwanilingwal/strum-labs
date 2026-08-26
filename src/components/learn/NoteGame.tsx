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
 * The listening game. Untimed on principle: the metronome side of the app owns
 * "when", this side owns "where". You play the shown note at whatever pace
 * your hands allow; the microphone confirms and deals the next.
 *
 * `NoteGameBody` is host-agnostic — the /game page wraps it in page chrome and
 * the exercise overlay embeds it directly, so practising never has to leave
 * the list screen.
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

export function NoteGameBody({ exercise }: { exercise: Exercise }) {
  const targets = exercise.notes ?? [];
  const game = useNoteGame(targets);
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
        </div>
      ) : (
        <>
          {/* Current on the left and larger; what's coming on the right and
              smaller — the split a phone needs, desktop just gets more air. */}
          <div className="grid grid-cols-[3fr_2fr] gap-4 pt-10 sm:gap-8">
            <div>
              <div className="block-light card-flat mx-auto max-w-48 border border-line p-3">
                <ChordChart chord={noteAsChord(current)} overlay={playing ? { sounding: [current.string] } : undefined} />
              </div>
              <div className="mt-2 text-center">
                <ChromeText className="block text-[clamp(2rem,8vw,3.5rem)]">{current.name}</ChromeText>
                <p className="caps mt-1 text-fg-dim">
                  string {current.string + 1} · {current.fret === 0 ? "open" : `fret ${current.fret}`}
                </p>
                <div className="mx-auto mt-3 h-2 w-36 overflow-hidden rounded-full border border-line">
                  <div
                    className="h-full rounded-full transition-[width] duration-100"
                    style={{ width: `${Math.round(game.progress * 100)}%`, background: "var(--tight)" }}
                  />
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

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn ${playing ? "btn-hot" : "btn-lit"}`}
              onClick={() => (playing || game.status === "opening" ? game.stop() : void game.start())}
            >
              {playing ? "Stop" : game.status === "opening" ? "Opening…" : "Start the game"}
            </button>
          </div>
          {game.message ? <p className="mt-3 text-xs text-loose">{game.message}</p> : null}
        </>
      )}
    </div>
  );
}

function GameInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const exercise: Exercise | undefined = EXERCISES.find((e) => e.id === id && e.kind === "notes");

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

  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />
      <section className="relative flex-1 px-4 py-4 sm:px-8">
        <div className="wrap">
          <p className="caps text-fg-dim">{exercise.title}</p>
          <div className="mt-2">
            <NoteGameBody key={exercise.id} exercise={exercise} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/learn?tab=exercises" className="btn">All exercises</Link>
            {nextExercise?.kind === "notes" ? (
              <Link href={`/game?id=${nextExercise.id}`} className="btn">
                Next: {nextExercise.title}
              </Link>
            ) : null}
          </div>
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
