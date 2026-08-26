"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exercise } from "@/lib/music/exercises";
import { LEVELS } from "@/lib/music/exercises";
import { loopSeconds } from "@/lib/music/pattern";
import { previewPattern, stopPreview } from "@/lib/audio/preview";
import { DrillPlayer } from "./DrillPlayer";
import { NoteGameBody } from "./NoteGame";
import { practisePattern } from "./goPractise";

/**
 * One exercise, centred over the list.
 *
 * The reason this exists is session shape: someone might hold a drill for one
 * minute or three hours, then want the next one. Full-page players made every
 * one of those transitions a navigation. Here the list never goes away —
 * Previous and Next walk the whole curriculum from inside the card, and only
 * mic-scored strum practice (which genuinely lives on the play screen) leaves.
 *
 * Keyed by exercise id from the parent, so switching remounts the player and
 * its cleanup stops whatever was sounding.
 */

export function ExerciseOverlay({
  exercise, onClose, onStep, hasPrev, hasNext,
}: {
  exercise: Exercise;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Which exercise's preview is sounding. Keyed by id rather than a boolean
  // so stepping to another exercise derives to "not previewing" with no state
  // to reset — the linter is right that an effect for that is a smell.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewing = previewingId === exercise.id;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && hasNext) onStep(1);
      if (e.key === "ArrowLeft" && hasPrev) onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep, hasPrev, hasNext]);

  // Whatever this card set in motion stops when the card changes or closes.
  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      stopPreview();
    };
  }, [exercise.id]);

  const togglePreview = () => {
    if (!exercise.pattern) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (previewing) {
      stopPreview();
      setPreviewingId(null);
      return;
    }
    void previewPattern(exercise.pattern);
    setPreviewingId(exercise.id);
    const id = exercise.id;
    previewTimer.current = setTimeout(
      () => setPreviewingId((cur) => (cur === id ? null : cur)),
      loopSeconds(exercise.pattern, exercise.pattern.bpm) * 1000 + 400,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close exercise"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={exercise.title}
        className="block-light card-flat relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-y-auto p-5 sm:p-6"
      >
        <header className="flex items-start gap-3 pr-10">
          <div className="min-w-0 flex-1">
            <p className="caps text-fg-dim">
              level {exercise.level + 1} · {LEVELS[exercise.level]} · {exercise.focus}
            </p>
            <h2 className="font-display mt-0.5 text-2xl leading-tight text-chrome-700">
              {exercise.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn btn-icon absolute right-4 top-4"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{exercise.coaching}</p>
        <p className="mt-2 text-xs text-fg-dim">
          <span className="caps">done when</span> · {exercise.goal}
        </p>

        <div className="mt-4">
          {exercise.kind === "notes" ? (
            <NoteGameBody key={exercise.id} exercise={exercise} />
          ) : exercise.kind === "pick" && exercise.song ? (
            <DrillPlayer key={exercise.id} song={exercise.song} />
          ) : exercise.pattern ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`btn ${previewing ? "btn-hot" : ""}`} onClick={togglePreview}>
                {previewing ? "Stop" : "Hear it once"}
              </button>
              <button
                type="button"
                className="btn btn-lit"
                onClick={() => {
                  if (!exercise.pattern) return;
                  practisePattern(exercise.pattern);
                  router.push("/play");
                }}
              >
                Open in Play · mic scoring
              </button>
            </div>
          ) : null}
        </div>

        <footer className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <button type="button" className="btn !px-4 !py-1.5" onClick={() => onStep(-1)} disabled={!hasPrev}>
            ← Previous
          </button>
          <span className="caps text-fg-dim">← → keys work too</span>
          <button type="button" className="btn btn-lit !px-4 !py-1.5" onClick={() => onStep(1)} disabled={!hasNext}>
            Next →
          </button>
        </footer>
      </section>
    </div>
  );
}
