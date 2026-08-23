"use client";

import type { PracticeMode } from "@/lib/storage/settings";

/**
 * Chords or progressions.
 *
 * Deliberately small and centred on the play screen — it is a label you glance
 * at, not a control you use often, and at full width it read as the most
 * important thing on a page where the chord and the lane are.
 *
 * Locked while the metronome runs: switching mode rebuilds the pattern under a
 * running transport, so the bar you are hearing stops matching the one on
 * screen.
 */

const MODES: { id: PracticeMode; label: string; hint: string }[] = [
  { id: "chord", label: "Chords", hint: "Drill one shape" },
  { id: "pattern", label: "Patterns", hint: "Play a progression" },
];

export function ModeToggle({
  mode, onChange, showHints = false, disabled = false, onBlocked, compact = false,
}: {
  mode: PracticeMode;
  onChange: (m: PracticeMode) => void;
  showHints?: boolean;
  disabled?: boolean;
  onBlocked?: () => void;
  /** Small, centred, header-sized. Used on the play screen. */
  compact?: boolean;
}) {
  return (
    <div
      className={`panel-sunken flex gap-1 p-1 ${compact ? "mx-auto w-fit rounded-full" : ""}`}
      role="radiogroup"
      aria-label="What to practise"
    >
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            onClick={() => (disabled ? onBlocked?.() : onChange(m.id))}
            className={`rounded-full text-center transition ${
              compact ? "px-3 py-1" : "flex-1 px-3 py-1.5"
            }`}
            style={{
              background: on ? "var(--chrome-200)" : "transparent",
              color: on ? "#131820" : "var(--fg-dim)",
              opacity: disabled && !on ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            <span className={compact ? "caps block" : "caps-lg block"}>{m.label}</span>
            {showHints ? <span className="caps block opacity-70">{m.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
