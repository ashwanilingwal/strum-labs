"use client";

/**
 * The small ▶ in a card's corner. Tap-to-hear existed before this, but an
 * affordance you have to guess is not an affordance — the corner button says
 * "this card makes sound" without costing layout.
 */

export function PlayCorner({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border transition hover:opacity-100"
      style={{
        borderColor: "var(--line)",
        background: "var(--surface-lift)",
        color: "var(--accent)",
        opacity: 0.85,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 1l7 4-7 4z" fill="currentColor" />
      </svg>
    </button>
  );
}
