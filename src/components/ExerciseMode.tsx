"use client";

import { useState } from "react";
import { EXERCISES, LEVELS, type Exercise } from "@/lib/music/exercises";
import { NoteGameBody } from "./NoteGameBody";

/**
 * The play screen's third mode: the exercise curriculum, one consistent UI.
 *
 * Everything is a listening game — no metronome, no transport, no leaving the
 * screen. Pick a level, pick a game, play it; Previous and Next walk the whole
 * graded path, so a session moves drill to drill without a single navigation.
 */

const FOCUS_COLOUR: Record<Exercise["focus"], string> = {
  "left hand": "var(--close)",
  "right hand": "var(--tight)",
};

export function ExerciseMode() {
  const [index, setIndex] = useState(0);
  const exercise = EXERCISES[index];
  const level = LEVELS[exercise.level];
  const inLevel = EXERCISES.filter((e) => e.level === exercise.level);

  return (
    <section className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-8">
      <div className="wrap flex min-h-0 flex-1 flex-col">
        {/* Level rail: where you are on the path. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {LEVELS.map((name, li) => {
            const active = li === exercise.level;
            const first = EXERCISES.findIndex((e) => e.level === li);
            return (
              <button
                key={name}
                type="button"
                onClick={() => setIndex(first)}
                className="caps shrink-0 rounded-full border px-3 py-1.5 transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  color: active ? "var(--accent)" : "var(--fg-dim)",
                  background: active ? "rgba(95,210,242,0.08)" : "transparent",
                }}
              >
                {li + 1} · {name}
              </button>
            );
          })}
        </div>

        {/* Games in this level. */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {inLevel.map((e) => {
            const i = EXERCISES.indexOf(e);
            const active = i === index;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setIndex(i)}
                className="shrink-0 rounded-xl border px-3 py-1.5 text-left transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "rgba(95,210,242,0.08)" : "transparent",
                }}
              >
                <span className="block text-sm font-semibold" style={{ color: active ? "var(--fg)" : "var(--fg-dim)" }}>
                  {e.title}
                </span>
                <span className="caps block" style={{ color: FOCUS_COLOUR[e.focus] }}>{e.focus}</span>
              </button>
            );
          })}
        </div>

        <div className="block-light card-flat mt-3 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="caps text-fg-dim">
            level {exercise.level + 1} · {level}
          </p>
          <h2 className="font-display mt-0.5 text-2xl leading-tight text-chrome-700">{exercise.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{exercise.coaching}</p>
          <p className="mt-1.5 text-xs text-fg-dim">
            <span className="caps">done when</span> · {exercise.goal}
          </p>

          <div className="mt-4">
            {/* Keyed so switching stops the old game's microphone. */}
            <NoteGameBody key={exercise.id} exercise={exercise} />
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              className="btn !px-4 !py-1.5"
              onClick={() => setIndex(index - 1)}
              disabled={index === 0}
            >
              ← Previous
            </button>
            <span className="caps text-fg-dim">
              {index + 1} / {EXERCISES.length}
            </span>
            <button
              type="button"
              className="btn btn-lit !px-4 !py-1.5"
              onClick={() => setIndex(index + 1)}
              disabled={index === EXERCISES.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
