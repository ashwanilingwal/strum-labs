"use client";

import { CHORDS, CHORD_TIERS, chordById } from "@/lib/music/chords";
import { ChordChart } from "./chart/ChordChart";

/**
 * Change a chord without leaving the practice screen.
 *
 * A sheet rather than a dropdown: there are 32 shapes and they want their
 * diagrams visible while choosing, which no native select can do — and on a
 * phone a long dropdown is worse than a sheet in every way.
 *
 * It always edits *one named bar*, never "the chord playing right now". Those
 * are the same thing while drilling a single chord and completely different
 * mid-progression, and a control whose target moves with the playhead is a
 * control nobody can aim.
 */

export function ChordSheet({
  current, barLabel, onPick, onClose,
}: {
  current: string;
  barLabel: string;
  onPick: (chordId: string) => void;
  onClose: () => void;
}) {
  const preview = chordById(current);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close chord picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Choose chord for ${barLabel}`}
        className="block-light card-flat relative flex max-h-[85dvh] w-full max-w-lg flex-col p-4 sm:p-5"
      >
        <header className="flex items-start gap-3">
          <div className="w-20 shrink-0">{preview ? <ChordChart chord={preview} /> : null}</div>
          <div className="min-w-0 flex-1">
            <p className="caps text-fg-dim">{barLabel}</p>
            <p className="font-display text-2xl leading-none text-chrome-700">{preview?.symbol}</p>
            <p className="mt-1 text-xs text-fg-muted">{preview?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon shrink-0" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {CHORD_TIERS.map((tier) => {
            const inTier = CHORDS.filter((c) => c.tier === tier.id);
            if (!inTier.length) return null;
            return (
              <div key={tier.id} className="mb-3">
                <p className="caps mb-1.5 text-fg-dim">{tier.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {inTier.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onPick(c.id)}
                      className={`btn !px-3 !py-1.5 font-display text-sm ${c.id === current ? "btn-lit" : ""}`}
                    >
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
