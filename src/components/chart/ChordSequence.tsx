"use client";

import { chordById } from "@/lib/music/chords";
import { ChordChart } from "./ChordChart";
import type { ChartOverlay } from "./types";

/**
 * Several chords one after another, with the current one marked.
 *
 * Two variants because two jobs:
 *   "symbols" — a compact strip, for showing where you are in a progression
 *               without spending vertical space you need for the lane
 *   "charts"  — full boxes, for learning a progression or a song section
 *
 * Takes chord ids rather than Chord objects so a pattern's `chords` array or a
 * future song's progression can be handed straight in.
 */

export function ChordSequence({
  chords, activeIndex = -1, variant = "symbols", onSelect, overlays,
}: {
  chords: string[];
  activeIndex?: number;
  variant?: "symbols" | "charts";
  onSelect?: (index: number) => void;
  /** Per-position overlay, for animating a picking pattern across the sequence. */
  overlays?: (ChartOverlay | undefined)[];
}) {
  if (!chords.length) return null;

  if (variant === "symbols") {
    return (
      <ol className="flex flex-wrap items-center justify-center gap-1.5">
        {chords.map((id, i) => {
          const active = i === activeIndex;
          const Tag = onSelect ? "button" : "span";
          return (
            <li key={`${id}-${i}`}>
              <Tag
                {...(onSelect ? { type: "button" as const, onClick: () => onSelect(i) } : {})}
                aria-current={active ? "true" : undefined}
                className="caps-lg block rounded-full px-3 py-1 transition"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--ink)" : "var(--fg-dim)",
                  border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {id}
              </Tag>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="flex flex-wrap justify-center gap-3">
      {chords.map((id, i) => {
        const chord = chordById(id);
        if (!chord) return null;
        const active = i === activeIndex;
        return (
          <li
            key={`${id}-${i}`}
            className="block-light card-flat w-24 p-2 sm:w-28"
            style={{
              outline: active ? "2px solid var(--accent)" : "none",
              outlineOffset: "2px",
              opacity: activeIndex >= 0 && !active ? 0.55 : 1,
            }}
          >
            <ChordChart chord={chord} overlay={overlays?.[i]} />
            <p className="caps mt-1 text-center text-fg-dim">{chord.symbol}</p>
          </li>
        );
      })}
    </ol>
  );
}
