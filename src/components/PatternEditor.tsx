"use client";

import { useState } from "react";
import {
  countLabels, handDirection, MAX_BARS, normalise, STROKES,
  type Pattern, type Stroke,
} from "@/lib/music/pattern";
import { ChordPicker } from "./ChordPicker";
import { SectionTitle } from "./ui";

/**
 * The pattern builder.
 *
 * Tapping a slot cycles it through down, up, mute, skip. That is one gesture
 * for the only decision the grid encodes, which beats a palette-then-paint
 * flow on a phone where there is no hover to show what tool is armed.
 *
 * Skip slots keep showing a faint hand-direction arrow while you edit, for the
 * same reason the player does: the pattern is a motion, not a list of hits.
 */

const CYCLE: Stroke[] = ["D", "U", "X", "-"];
const GLYPH: Record<Stroke, string> = { D: "↓", U: "↑", X: "✕", "-": "" };
const SLOT_CLASS: Record<Stroke, string> = {
  D: "slot-down", U: "slot-up", X: "slot-mute", "-": "slot-skip",
};

export function PatternEditor({
  pattern, onChange,
}: {
  pattern: Pattern;
  onChange: (p: Pattern) => void;
}) {
  const [pickingBar, setPickingBar] = useState<number | null>(null);
  const labels = countLabels(pattern.slotsPerBar, pattern.beatsPerBar);

  const patch = (next: Partial<Pattern>) => onChange(normalise({ ...pattern, ...next }));

  const cycleSlot = (index: number) => {
    const strokes = [...pattern.strokes];
    const at = CYCLE.indexOf(strokes[index]);
    strokes[index] = CYCLE[(at + 1) % CYCLE.length];
    patch({ strokes });
  };

  const toggleAccent = (index: number) => {
    const accents = pattern.accents.includes(index)
      ? pattern.accents.filter((a) => a !== index)
      : [...pattern.accents, index];
    patch({ accents });
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>Pattern</SectionTitle>
        <div className="panel space-y-3 p-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-fg-dim">Name</span>
            <input
              value={pattern.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="panel-sunken w-full px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="Name this pattern"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-fg-dim">Bars</span>
            <div className="panel-sunken flex gap-1 p-1">
              {Array.from({ length: MAX_BARS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ bars: n })}
                  className={`flex-1 rounded-lg py-1.5 font-display text-sm font-bold transition ${
                    pattern.bars === n ? "btn-lit text-ink" : "text-fg-dim hover:text-fg"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle
          right={
            <span className="text-[10px] text-fg-dim">tap to cycle · dot = accent</span>
          }
        >
          Strokes and chords
        </SectionTitle>

        <div className="space-y-3">
          {Array.from({ length: pattern.bars }, (_, bar) => (
            <div key={bar} className="panel p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-display text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                  bar {bar + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setPickingBar(pickingBar === bar ? null : bar)}
                  className="btn !py-1.5 font-display text-sm font-bold text-accent"
                  aria-expanded={pickingBar === bar}
                >
                  {pattern.chords[bar]} <span className="text-fg-dim">▾</span>
                </button>
              </div>

              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${pattern.slotsPerBar}, minmax(0,1fr))` }}
              >
                {Array.from({ length: pattern.slotsPerBar }, (_, i) => {
                  const index = bar * pattern.slotsPerBar + i;
                  const stroke = pattern.strokes[index];
                  const dir = handDirection(pattern.slotsPerBar, pattern.beatsPerBar, index);
                  const accented = pattern.accents.includes(index);
                  return (
                    <div key={index} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => cycleSlot(index)}
                        aria-label={`Slot ${index + 1}: ${STROKES.find((s) => s.id === stroke)?.label}`}
                        className={`slot flex h-12 w-full items-center justify-center ${SLOT_CLASS[stroke]} ${
                          accented ? "slot-accent" : ""
                        }`}
                      >
                        <span className={`text-xl font-bold ${stroke === "-" ? "text-fg-dim opacity-40" : ""}`}>
                          {stroke === "-" ? (dir === "down" ? "↓" : "↑") : GLYPH[stroke]}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleAccent(index)}
                        aria-label={`Accent slot ${index + 1}`}
                        aria-pressed={accented}
                        className="mt-1 flex w-full flex-col items-center gap-0.5 py-0.5"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full transition"
                          style={{
                            background: accented ? "var(--fg)" : "rgba(255,255,255,.16)",
                            boxShadow: accented ? "0 0 6px var(--fg)" : undefined,
                          }}
                        />
                        <span className="font-lcd text-[10px] text-fg-dim">{labels[i]}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {pickingBar === bar ? (
                <div className="mt-3">
                  <ChordPicker
                    value={pattern.chords[bar]}
                    onChange={(id) => {
                      const chords = [...pattern.chords];
                      chords[bar] = id;
                      patch({ chords });
                    }}
                    onClose={() => setPickingBar(null)}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn text-xs"
          onClick={() => patch({ strokes: pattern.strokes.map(() => "-" as Stroke), accents: [] })}
        >
          Clear strokes
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() =>
            patch({
              strokes: pattern.strokes.map((_, i) =>
                handDirection(pattern.slotsPerBar, pattern.beatsPerBar, i) === "down" ? "D" : "U",
              ),
            })
          }
        >
          Fill down-up
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => {
            // Copy bar 1 over the rest — the usual way a multi-bar pattern is
            // actually built, since only the chord changes between bars.
            const first = pattern.strokes.slice(0, pattern.slotsPerBar);
            const strokes = pattern.strokes.map((s, i) => first[i % pattern.slotsPerBar] ?? s);
            const firstAccents = pattern.accents.filter((a) => a < pattern.slotsPerBar);
            const accents = Array.from({ length: pattern.bars }, (_, b) =>
              firstAccents.map((a) => a + b * pattern.slotsPerBar),
            ).flat();
            patch({ strokes, accents });
          }}
          disabled={pattern.bars < 2}
        >
          Copy bar 1 to all
        </button>
      </div>
    </div>
  );
}
