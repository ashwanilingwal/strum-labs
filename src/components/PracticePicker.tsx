"use client";

import { CHORDS, CHORD_TIERS } from "@/lib/music/chords";
import { PROGRESSIONS, STRUM_STYLES } from "@/lib/music/library";
import { quickPattern, QUICK_ID, type AppState, type PracticeMode } from "@/lib/storage/settings";
import { ModeToggle } from "./ModeToggle";
import { ChordSequence } from "./chart/ChordSequence";

/**
 * What to practise: a chord or a progression, and the rhythm to play it with.
 *
 * Both halves feed the same builder — a strum style is one bar of strokes and
 * tiles across whatever chords it is given — so six rhythms and eight
 * progressions cover forty-eight combinations without storing any of them.
 *
 * Everything picked here writes to the reserved quick-pick pattern, never to a
 * pattern the player saved.
 */

export function PracticePicker({
  state, setState,
}: {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
}) {
  const apply = (patch: Partial<AppState["pick"]>, mode: PracticeMode = state.mode) => {
    setState((prev) => {
      const pick = { ...prev.pick, ...patch };
      const built = quickPattern(mode, pick);
      return {
        ...prev,
        mode,
        pick,
        activeId: QUICK_ID,
        patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? built : p)),
      };
    });
  };

  return (
    <div className="space-y-3 px-3 py-2">
      <ModeToggle mode={state.mode} onChange={(m) => apply({}, m)} showHints />

      {state.mode === "chord" ? (
        <div>
          <p className="caps mb-1.5 text-fg-dim">Chord</p>
          {CHORD_TIERS.map((tier) => {
            const inTier = CHORDS.filter((c) => c.tier === tier.id);
            if (!inTier.length) return null;
            return (
              <div key={tier.id} className="mb-2">
                <p className="caps mb-1 text-fg-dim opacity-70">{tier.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {inTier.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => apply({ chordId: c.id })}
                      className={`btn !px-3 !py-1 font-display text-sm ${
                        state.pick.chordId === c.id ? "btn-lit" : ""
                      }`}
                    >
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <p className="caps mb-1.5 text-fg-dim">Progression</p>
          <div className="space-y-1.5">
            {PROGRESSIONS.map((prog) => {
              const on = state.pick.progressionId === prog.id;
              return (
                <button
                  key={prog.id}
                  type="button"
                  onClick={() => apply({ progressionId: prog.id })}
                  className="block w-full rounded-xl border px-3 py-2 text-left transition"
                  style={{
                    borderColor: on ? "var(--accent)" : "var(--line)",
                    background: on ? "rgba(95,210,242,0.08)" : "transparent",
                  }}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-semibold ${on ? "text-accent" : ""}`}>{prog.name}</span>
                    <span className="caps shrink-0 text-fg-dim">{prog.chords.join(" · ")}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-dim">{prog.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="caps mb-1.5 text-fg-dim">Strumming</p>
        <div className="space-y-1.5">
          {STRUM_STYLES.map((style) => {
            const on = state.pick.styleId === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => apply({ styleId: style.id })}
                className="block w-full rounded-xl border px-3 py-2 text-left transition"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--line)",
                  background: on ? "rgba(95,210,242,0.08)" : "transparent",
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm font-semibold ${on ? "text-accent" : ""}`}>{style.name}</span>
                  <span className="num shrink-0 text-[11px] text-fg-dim">{style.bpm} bpm</span>
                </span>
                <span className="mt-0.5 block text-xs text-fg-dim">{style.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {state.mode === "pattern" ? (
        <div className="pt-1">
          <p className="caps mb-1.5 text-fg-dim">In this progression</p>
          <ChordSequence chords={PROGRESSIONS.find((p) => p.id === state.pick.progressionId)?.chords ?? []} />
        </div>
      ) : null}
    </div>
  );
}
