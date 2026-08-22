"use client";

import { useState } from "react";
import { CHORDS, CHORD_TIERS, chordById, type ChordTier } from "@/lib/music/chords";
import { ChordChart } from "./chart/ChordChart";

/**
 * Choosing the chord for a bar.
 *
 * Grouped by difficulty and opened on the group the current chord belongs to,
 * so the default view is a short list of chords you can probably already play
 * rather than every shape in the library at once.
 */

export function ChordPicker({
  value, onChange, onClose,
}: {
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const current = chordById(value);
  const [tier, setTier] = useState<ChordTier>(current?.tier ?? "open");
  const shown = CHORDS.filter((c) => c.tier === tier);
  const preview = chordById(value);

  return (
    <div className="panel p-3">
      <div className="mb-3 flex items-start gap-3">
        <div className="panel-sunken w-24 shrink-0 p-1.5">
          {preview ? <ChordChart chord={preview} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-black text-accent">{preview?.symbol}</div>
          <div className="text-xs text-fg-muted">{preview?.name}</div>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-dim">{preview?.tip}</p>
        </div>
        <button type="button" onClick={onClose} className="btn btn-icon shrink-0" aria-label="Close chord picker">
          ✕
        </button>
      </div>

      <div className="panel-sunken mb-2 flex gap-1 p-1">
        {CHORD_TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTier(t.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              tier === t.id ? "bg-white/15 text-fg" : "text-fg-dim hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid max-h-52 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
        {shown.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`btn !px-1 !py-2 font-display text-sm ${c.id === value ? "btn-lit" : ""}`}
          >
            {c.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
