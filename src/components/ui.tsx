"use client";

import type { ReactNode } from "react";

/** Small chrome-and-gloss primitives shared across the screen. */

export function Toggle({
  on, onChange, label, hint,
}: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-fg-dim">{hint}</span> : null}
      </span>
      <span
        className="relative h-6 w-11 shrink-0 rounded-full border transition"
        style={{
          borderColor: on ? "var(--accent)" : "var(--line)",
          background: on ? "var(--accent)" : "transparent",
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
          style={{
            left: on ? "22px" : "2px",
            background: on ? "var(--ink)" : "var(--fg-dim)",
          }}
        />
      </span>
    </button>
  );
}

export function Slider({
  value, min, max, step = 1, onChange, label, readout,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; label: string; readout: string;
}) {
  return (
    <label className="block px-3 py-2">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="lcd px-2 py-0.5 text-xs">{readout}</span>
      </span>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 text-sm font-semibold">{label}</div>
      <div className="panel-sunken flex gap-1 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                on ? "text-ink" : "text-fg-muted hover:text-fg"
              }`}
              style={
                on
                  ? {
                      background: "var(--lilac-200)",
                    }
                  : undefined
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-1">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-fg-muted">
        {children}
      </h3>
      {right}
    </div>
  );
}
