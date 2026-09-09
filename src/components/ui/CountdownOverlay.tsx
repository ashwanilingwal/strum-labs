"use client";

/**
 * The 3-2-1 itself: one huge number, re-popped each second, over a dimmed
 * screen that still shows the level behind it. Takes no pointer events —
 * the Stop button underneath keeps working, which is how a count is
 * cancelled.
 */
export function CountdownOverlay({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
      aria-label={`Starting in ${n}`}
    >
      <span
        key={n}
        className="verdict-orb-flash font-display leading-none"
        style={{
          fontSize: "clamp(7rem, 32vw, 16rem)",
          color: "var(--acid)",
          textShadow: "0 0.06em 0 #0a1a30, 0 16px 40px rgba(0, 0, 0, 0.55)",
        }}
      >
        {n}
      </span>
      <p className="caps-lg mt-3 text-fg">🎸 grab your guitar</p>
    </div>
  );
}
