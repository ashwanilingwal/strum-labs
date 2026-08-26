"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exercisesByLevel, type Exercise } from "@/lib/music/exercises";
import { previewPattern } from "@/lib/audio/preview";
import { practisePattern } from "./goPractise";
import Link from "next/link";
import { DrillPlayer } from "./DrillPlayer";

/** Each focus gets a colour, so a level scans as a palette, not a list. */
const FOCUS_COLOUR: Record<Exercise["focus"], string> = {
  rhythm: "var(--accent)",
  "left hand": "var(--close)",
  "right hand": "var(--tight)",
  changes: "var(--extra)",
};

const KIND_LABEL: Record<Exercise["kind"], string> = {
  strum: "strum · scored",
  pick: "fingers · watch",
  notes: "game · listen",
};

/**
 * The curriculum, levels in order, each drill openable in place.
 *
 * Strum drills hand their pattern to the practice screen, where the
 * microphone can score them. Technique drills play right here on the song
 * machinery, chart animating, because what they teach is watched, not scored.
 */

export function ExercisesTab() {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const levels = exercisesByLevel();

  return (
    <div className="space-y-8">
      {levels.map((level, li) => (
        <section key={level.name}>
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-lg"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              {li + 1}
            </span>
            <div>
              <h2 className="caps-lg text-fg">{level.name}</h2>
              <p className="caps text-fg-dim opacity-70">{level.items.length} exercises</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {level.items.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                open={openId === ex.id}
                onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
                onPractise={() => {
                  if (ex.pattern) {
                    practisePattern(ex.pattern);
                    router.push("/play");
                  }
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ExerciseRow({
  exercise, open, onToggle, onPractise,
}: {
  exercise: Exercise;
  open: boolean;
  onToggle: () => void;
  onPractise: () => void;
}) {
  return (
    <div className="card-flat block-light overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: FOCUS_COLOUR[exercise.focus] }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg leading-tight text-chrome-700">{exercise.title}</span>
          <span className="caps" style={{ color: FOCUS_COLOUR[exercise.focus] }}>{exercise.focus}</span>
        </span>
        <span className="caps shrink-0 rounded-full border border-line px-2 py-0.5 text-fg-dim">
          {KIND_LABEL[exercise.kind]}
        </span>
        <span aria-hidden="true" className="shrink-0 text-fg-dim transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>

      {open ? (
        <div className="border-t border-line px-4 py-4">
          <p className="text-sm leading-relaxed text-fg-muted">{exercise.coaching}</p>
          <p className="mt-2 text-xs text-fg-dim">
            <span className="caps">done when</span> · {exercise.goal}
          </p>

          {exercise.kind === "notes" ? (
            <div className="mt-4">
              <Link href={`/game?id=${exercise.id}`} className="btn btn-lit inline-flex">
                Play the game
              </Link>
              <p className="caps mt-2 text-fg-dim opacity-70">
                untimed · the microphone confirms each note
              </p>
            </div>
          ) : exercise.kind === "pick" && exercise.song ? (
            <div className="mt-4">
              <DrillPlayer song={exercise.song} />
            </div>
          ) : exercise.pattern ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-lit" onClick={onPractise}>
                Open in Play
              </button>
              <button type="button" className="btn" onClick={() => exercise.pattern && void previewPattern(exercise.pattern)}>
                Hear it once
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
