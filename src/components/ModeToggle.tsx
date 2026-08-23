"use client";

import type { PracticeMode } from "@/lib/storage/settings";

/**
 * Chords or progressions. The same control appears on the play screen and in
 * the settings sheet, because it answers the same question in both places:
 * what am I practising right now.
 */

const MODES: { id: PracticeMode; label: string; hint: string }[] = [
  { id: "chord", label: "Chords", hint: "Drill one shape" },
  { id: "pattern", label: "Patterns", hint: "Play a progression" },
];

export function ModeToggle({
  mode, onChange, showHints = false,
}: {
  mode: PracticeMode;
  onChange: (m: PracticeMode) => void;
  showHints?: boolean;
}) {
  return (
    <div className="panel-sunken flex gap-1 p-1" role="radiogroup" aria-label="What to practise">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.id)}
            className="flex-1 rounded-full px-3 py-1.5 text-center transition"
            style={{
              background: on ? "var(--chrome-200)" : "transparent",
              color: on ? "#131820" : "var(--fg-dim)",
            }}
          >
            <span className="caps-lg block">{m.label}</span>
            {showHints ? (
              <span className="caps block opacity-70">{m.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
