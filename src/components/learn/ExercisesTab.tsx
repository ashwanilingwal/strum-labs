"use client";

import { useState } from "react";
import { EXERCISES, exercisesByLevel, type Exercise } from "@/lib/music/exercises";
import { ExerciseOverlay } from "./ExerciseOverlay";

/**
 * The curriculum as a scannable list. Rows do exactly one thing: open the
 * exercise in a centred overlay, where Previous/Next walk the whole path —
 * practising never navigates away from this screen.
 */

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

export function ExercisesTab() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const levels = exercisesByLevel();
  const open = openIndex !== null ? EXERCISES[openIndex] : null;

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
              <button
                key={ex.id}
                type="button"
                onClick={() => setOpenIndex(EXERCISES.indexOf(ex))}
                className="card-flat block-light flex w-full items-center gap-3 px-4 py-3 text-left transition hover:opacity-90"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: FOCUS_COLOUR[ex.focus] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg leading-tight text-chrome-700">{ex.title}</span>
                  <span className="caps" style={{ color: FOCUS_COLOUR[ex.focus] }}>{ex.focus}</span>
                </span>
                <span className="caps shrink-0 rounded-full border border-line px-2 py-0.5 text-fg-dim">
                  {KIND_LABEL[ex.kind]}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {open !== null && openIndex !== null ? (
        <ExerciseOverlay
          exercise={open}
          onClose={() => setOpenIndex(null)}
          onStep={(d) => setOpenIndex(Math.min(EXERCISES.length - 1, Math.max(0, openIndex + d)))}
          hasPrev={openIndex > 0}
          hasNext={openIndex < EXERCISES.length - 1}
        />
      ) : null}
    </div>
  );
}
