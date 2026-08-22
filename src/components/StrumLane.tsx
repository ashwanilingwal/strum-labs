"use client";

import {
  countLabels, handDirection, type Pattern, type Stroke,
} from "@/lib/music/pattern";
import type { SlotVerdict } from "@/lib/listen/scoring";
import { signedMs, verdictVisual } from "@/lib/feedback/presentation";

/**
 * The pattern as a lane of slots, with the playhead and — when the mic is on —
 * a live verdict on each slot as it goes past.
 *
 * Skipped slots still draw a faint hand-direction arrow. That is the single
 * most important piece of teaching in the whole screen: the strumming hand
 * never stops moving, it just misses the strings, and a lane that shows only
 * the strokes you play teaches the opposite.
 *
 * Verdict colours and glyphs come from lib/feedback/presentation so that this
 * component never has to know what "close" means in milliseconds.
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
  verdicts: Record<number, SlotVerdict>;
  showVerdicts: boolean;
}) {
  const labels = countLabels(pattern.slotsPerBar, pattern.beatsPerBar);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {Array.from({ length: pattern.bars }, (_, bar) => (
        <div
          key={bar}
          className="min-w-0 flex-1"
          // Below this the arrows and counts become unreadable, so the lane
          // scrolls instead of compressing. Four bars never fit a phone.
          style={{ minWidth: pattern.slotsPerBar * 30 }}
        >
          <div className="mb-1.5 flex items-baseline justify-between px-0.5">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              bar {bar + 1}
            </span>
            <span className="font-display text-xs font-bold text-accent">{pattern.chords[bar]}</span>
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
              const visual = verdict ? verdictVisual(verdict.grade, verdict.errorMs) : null;
              const dir = handDirection(pattern.slotsPerBar, pattern.beatsPerBar, index);
              return (
                <div key={index} className="min-w-0">
                  <div
                    className={[
                      "slot relative flex h-14 items-center justify-center sm:h-16",
                      SLOT_CLASS[stroke],
                      pattern.accents.includes(index) ? "slot-accent" : "",
                      active ? "slot-active" : "",
                      visual ? visual.className : "",
                    ].join(" ")}
                  >
                    <span
                      className={`text-2xl font-bold sm:text-3xl ${stroke === "-" ? "text-fg-dim opacity-45" : ""}`}
                    >
                      {stroke === "-" ? (dir === "down" ? "↓" : "↑") : GLYPH[stroke]}
                    </span>

                    {visual ? (
                      <span
                        key={`${index}-${verdict!.grade}-${verdict!.cycle}`}
                        className="verdict-badge"
                        style={{ color: visual.color, borderColor: visual.color }}
                        aria-label={visual.label}
                      >
                        {visual.glyph}
                      </span>
                    ) : null}

                    {/* Chord and stroke mistakes are marked separately from
                        timing, because they are a different thing to fix. */}
                    {verdict?.chordOk === false ? (
                      <span className="verdict-flag" style={{ background: "var(--extra)" }} title="Wrong chord">
                        {verdict.heardChord ?? "?"}
                      </span>
                    ) : verdict?.strokeOk === false ? (
                      <span className="verdict-flag" style={{ background: "var(--accent-deep)" }} title="Wrong direction">
                        {verdict.slot >= 0 && stroke === "D" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`mt-1.5 text-center font-lcd text-xs leading-tight ${
                      active ? "text-fg" : "text-fg-dim"
                    }`}
                  >
                    {verdict && verdict.grade !== "missed" ? (
                      <span style={{ color: visual!.color }}>{signedMs(verdict.errorMs)}</span>
                    ) : (
                      labels[i]
                    )}
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
