"use client";

/**
 * The small ▶ in a card's corner. Tap-to-hear existed before this, but an
 * affordance you have to guess is not an affordance. While its sound is
 * playing it becomes a stop square — patterns run long, and "make it stop"
 * deserves a control, not a wait.
 */

export function PlayCorner({
  label, onClick, playing = false,
}: {
  label: string;
  onClick: () => void;
  playing?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={playing ? label.replace(/^Hear/, "Stop") : label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border transition hover:opacity-100"
      style={{
        borderColor: playing ? "var(--loose)" : "var(--line)",
        background: "var(--surface-lift)",
        color: playing ? "var(--loose)" : "var(--accent)",
        opacity: playing ? 1 : 0.85,
      }}
    >
      {playing ? (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <rect width="8" height="8" rx="1" fill="currentColor" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 1l7 4-7 4z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
