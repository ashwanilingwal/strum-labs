"use client";

import { useState } from "react";
import { useExerciseClick } from "@/hooks/useExerciseClick";
import { EXERCISES, LEVELS, LEVEL_BLURBS, type Exercise } from "@/lib/music/exercises";
import { NoteGameBody } from "./NoteGameBody";

/**
 * The play screen's third mode: the exercise curriculum, one consistent UI.
 *
 * Everything is a listening game, and the whole mode fits the app shell with
 * no scrolling. On a desktop the full curriculum stands beside the player as
 * a rail — every tier, every game, one glance. Below `lg` the rail folds into
 * a sheet behind the exercise title, and on a phone the coaching copy folds
 * behind a disclosure too, so the game itself owns the screen. Previous and
 * Next still walk the graded path drill to drill.
 *
 * The click is optional and off by default. Exercises stay untimed on
 * principle — the mic confirms each note whenever it lands and scoring never
 * reads the click; it exists purely as a pace to lean on once a drill is easy.
 */

const FOCUS_COLOUR: Record<Exercise["focus"], string> = {
  "left hand": "var(--close)",
  "right hand": "var(--tight)",
};

/** Each exercise with its index into EXERCISES, grouped under its tier. */
function tierRows(level: number): [Exercise, number][] {
  return EXERCISES.map((e, i) => [e, i] as [Exercise, number]).filter(([e]) => e.level === level);
}

export function ExerciseMode({
  bpm, onNudgeBpm,
}: {
  bpm: number;
  onNudgeBpm: (delta: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Phone only: whether the coaching copy is unfolded. */
  const [coachOpen, setCoachOpen] = useState(false);
  const click = useExerciseClick(bpm);
  const exercise = EXERCISES[index];
  const level = LEVELS[exercise.level];

  const clickControl = (
    <ClickControl
      on={click.on}
      onToggle={() => (click.on ? click.stop() : void click.start())}
      bpm={bpm}
      onNudge={onNudgeBpm}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-1 sm:px-8 sm:pb-4">
      <div className="wrap flex min-h-0 flex-1 gap-4">
        <CurriculumRail index={index} onPick={setIndex} />

        <div className="block-light card-flat flex min-h-0 flex-1 flex-col p-4 sm:p-5">
          <header className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              className="btn btn-icon !h-9 !w-9 shrink-0"
              onClick={() => setIndex(index - 1)}
              disabled={index === 0}
              aria-label="Previous exercise"
            >
              ←
            </button>
            {/* The title is the browser: it names the game and opens the whole
                curriculum. On lg+ the rail already shows it, but the sheet
                stays reachable so the affordance is one thing at every size. */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="min-w-0 flex-1 rounded-xl text-center transition hover:opacity-80"
              aria-haspopup="dialog"
              title="All exercises"
            >
              <p className="caps text-fg-dim">
                {level} · <span style={{ color: FOCUS_COLOUR[exercise.focus] }}>{exercise.family}</span>
                {" · "}{index + 1}/{EXERCISES.length}
              </p>
              <span className="font-display block truncate text-xl leading-tight text-chrome-700 sm:text-2xl">
                {exercise.title} <span aria-hidden="true" className="align-middle text-sm text-fg-dim">▾</span>
              </span>
            </button>
            <button
              type="button"
              className="btn btn-icon !h-9 !w-9 shrink-0"
              onClick={() => setIndex(index + 1)}
              disabled={index === EXERCISES.length - 1}
              aria-label="Next exercise"
            >
              →
            </button>
          </header>

          {/* Coaching: read in full on a desktop; folded on a phone so the
              game fits one screen. */}
          <div className="mt-1 text-center sm:mt-2">
            <button
              type="button"
              className="caps text-fg-dim sm:hidden"
              aria-expanded={coachOpen}
              onClick={() => setCoachOpen((v) => !v)}
            >
              how to play {coachOpen ? "▴" : "▾"}
            </button>
            <div className={`${coachOpen ? "block" : "hidden"} sm:block`}>
              <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">{exercise.coaching}</p>
              <p className="mt-1 text-xs text-fg-dim">
                <span className="caps">done when</span> · {exercise.goal}
              </p>
            </div>
          </div>

          {/* The game. The overflow is a safety valve for very short screens,
              not the design — at phone and desktop sizes everything fits. Auto
              margins rather than justify-center: they centre the slack but
              still let the top scroll into reach when the box is outgrown. */}
          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto sm:mt-3">
            <div className="my-auto">
              {/* Keyed so switching stops the old game's microphone. */}
              <NoteGameBody key={exercise.id} exercise={exercise} extraControls={clickControl} />
            </div>
          </div>
        </div>
      </div>

      {pickerOpen ? (
        <ExerciseSheet
          current={index}
          onPick={(i) => {
            setIndex(i);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}

/** Desktop only: every game in every tier beside the player — no paging. */
function CurriculumRail({ index, onPick }: { index: number; onPick: (i: number) => void }) {
  return (
    <aside className="hidden min-h-0 w-60 flex-col overflow-y-auto pr-1 lg:flex xl:w-72" aria-label="All exercises">
      {LEVELS.map((name, li) => (
        <div key={name} className="mb-2">
          <p className="caps mb-1 mt-1 text-fg-dim" title={LEVEL_BLURBS[name]}>
            {li + 1} · {name}
          </p>
          <div className="space-y-0.5">
            {tierRows(li).map(([e, i]) => {
              const active = i === index;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onPick(i)}
                  aria-current={active || undefined}
                  className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition hover:bg-[rgba(255,255,255,0.05)]"
                  style={{
                    borderColor: active ? "var(--accent)" : "transparent",
                    background: active ? "rgba(95,210,242,0.08)" : undefined,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: FOCUS_COLOUR[e.focus] }}
                    aria-hidden="true"
                  />
                  <span
                    className="truncate text-[13px] font-semibold"
                    style={{ color: active ? "var(--accent)" : "var(--fg-muted)" }}
                  >
                    {e.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

/**
 * Below lg there is no room for the rail, so the same curriculum arrives as a
 * sheet — every tier, its blurb, every game — one tap from the title.
 */
function ExerciseSheet({
  current, onPick, onClose,
}: {
  current: number;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close exercise picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Choose an exercise"
        className="block-light card-flat relative flex max-h-[85dvh] w-full max-w-lg flex-col p-4 sm:p-5"
      >
        <header className="flex items-center gap-3">
          <p className="caps-lg min-w-0 flex-1 text-fg">All exercises</p>
          <button type="button" onClick={onClose} className="btn btn-icon shrink-0" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {LEVELS.map((name, li) => (
            <div key={name} className="mb-3">
              <p className="caps text-fg-dim">{li + 1} · {name}</p>
              <p className="mb-1.5 mt-0.5 text-xs text-fg-dim opacity-80">{LEVEL_BLURBS[name]}</p>
              <div className="space-y-1">
                {tierRows(li).map(([e, i]) => {
                  const active = i === current;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onPick(i)}
                      className="flex w-full items-baseline justify-between gap-2 rounded-xl border px-3 py-1.5 text-left transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "rgba(95,210,242,0.08)" : "transparent",
                      }}
                    >
                      <span className={`text-sm font-semibold ${active ? "text-accent" : "text-fg"}`}>{e.title}</span>
                      <span className="caps shrink-0" style={{ color: FOCUS_COLOUR[e.focus] }}>{e.family}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The optional pace. A toggle plus a coarse stepper — no slider, because this
 * is a nudge ("try it a little faster"), not the transport. ±4 rather than the
 * transport bar's ±1: with no slider beside it, 1-bpm steps are thirty taps to
 * anywhere worth going.
 */
function ClickControl({
  on, onToggle, bpm, onNudge,
}: {
  on: boolean;
  onToggle: () => void;
  bpm: number;
  onNudge: (delta: number) => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      {on ? (
        <>
          <button
            type="button"
            className="btn btn-icon !h-8 !w-8 !p-0 text-base"
            aria-label="Slower"
            onClick={() => onNudge(-4)}
          >
            −
          </button>
          <span className="num w-9 text-center text-sm text-fg">{bpm}</span>
          <button
            type="button"
            className="btn btn-icon !h-8 !w-8 !p-0 text-base"
            aria-label="Faster"
            onClick={() => onNudge(4)}
          >
            +
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={`btn !px-3 !py-1.5 ${on ? "btn-lit" : ""}`}
        aria-pressed={on}
        onClick={onToggle}
        title="An optional pace to play along to — the game still waits for every note"
      >
        {on ? "Click on" : "Click"}
      </button>
    </div>
  );
}
