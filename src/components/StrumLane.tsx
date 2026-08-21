"use client";

import {
  countLabels, handDirection, type Pattern, type Stroke,
} from "@/lib/music/pattern";
import type { Grade } from "@/lib/listen/scoring";

/**
 * The pattern as a lane of slots, with the playhead and — when the mic is on —
 * a per-slot verdict.
 *
 * Skipped slots still draw a faint hand-direction arrow. That is the single
 * most important piece of teaching in the whole screen: the strumming hand
 * never stops moving, it just misses the strings, and a lane that shows only
 * the strokes you play teaches the opposite.
 */

const GLYPH: Record<Stroke, string> = { D: "↓", U: "↑", X: "✕", "-": "" };
const SLOT_CLASS: Record<Stroke, string> = {
  D: "slot-down", U: "slot-up", X: "slot-mute", "-": "slot-skip",
};

export function StrumLane({
  pattern, activeSlot, verdicts, showVerdicts,
}: {
  pattern: Pattern;
  activeSlot: number;
  verdicts: Record<number, Grade>;
  showVerdicts: boolean;
}) {
  const labels = countLabels(pattern.slotsPerBar, pattern.beatsPerBar);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {Array.from({ length: pattern.bars }, (_, bar) => (
        <div key={bar} className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between px-0.5">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              bar {bar + 1}
            </span>
            <span className="font-display text-xs font-bold text-brass">{pattern.chords[bar]}</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${pattern.slotsPerBar}, minmax(0,1fr))` }}
          >
            {Array.from({ length: pattern.slotsPerBar }, (_, i) => {
              const index = bar * pattern.slotsPerBar + i;
              const stroke = pattern.strokes[index];
              const active = index === activeSlot;
              const verdict = showVerdicts ? verdicts[index] : undefined;
              const dir = handDirection(pattern.slotsPerBar, pattern.beatsPerBar, index);
              return (
                <div key={index} className="min-w-0">
                  <div
                    className={[
                      "slot flex h-11 items-center justify-center sm:h-14",
                      SLOT_CLASS[stroke],
                      pattern.accents.includes(index) ? "slot-accent" : "",
                      active ? "slot-active" : "",
                      verdict ? `verdict-${verdict}` : "",
                    ].join(" ")}
                  >
                    <span
                      className={`text-lg font-bold sm:text-2xl ${stroke === "-" ? "text-fg-dim opacity-45" : ""}`}
                    >
                      {stroke === "-" ? (dir === "down" ? "↓" : "↑") : GLYPH[stroke]}
                    </span>
                  </div>
                  <div
                    className={`mt-1 text-center font-lcd text-[10px] sm:text-xs ${
                      active ? "text-cream" : "text-fg-dim"
                    }`}
                  >
                    {labels[i]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
