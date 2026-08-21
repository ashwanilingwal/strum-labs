"use client";

/**
 * The decorative background: drifting colour blobs, a retro perspective grid,
 * and a field of twinkling sparkles.
 *
 * Kept as one self-contained component behind everything else (fixed, z-index
 * below the app, pointer-events none) so the look can be swapped wholesale
 * without touching a single piece of the app's own UI. All of its motion is
 * CSS; nothing here re-renders.
 *
 * Positions are a fixed table rather than Math.random(): random values would
 * differ between the server render and the client render and trip hydration.
 */

interface Sparkle {
  /** Percentages. */
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
}

const SPARKLES: Sparkle[] = [
  { x: 6, y: 12, size: 22, delay: 0, color: "var(--cyan)" },
  { x: 17, y: 68, size: 13, delay: 1.4, color: "var(--magenta)" },
  { x: 28, y: 24, size: 10, delay: 2.6, color: "var(--cream)" },
  { x: 38, y: 84, size: 17, delay: 0.7, color: "var(--lime)" },
  { x: 47, y: 8, size: 12, delay: 3.1, color: "var(--magenta)" },
  { x: 58, y: 58, size: 9, delay: 1.9, color: "var(--cyan)" },
  { x: 66, y: 16, size: 19, delay: 2.2, color: "var(--cream)" },
  { x: 74, y: 78, size: 12, delay: 0.4, color: "var(--violet)" },
  { x: 83, y: 34, size: 15, delay: 3.6, color: "var(--cyan)" },
  { x: 91, y: 62, size: 11, delay: 1.1, color: "var(--magenta)" },
  { x: 96, y: 18, size: 18, delay: 2.9, color: "var(--lime)" },
  { x: 12, y: 44, size: 10, delay: 4.2, color: "var(--violet)" },
  { x: 53, y: 92, size: 14, delay: 3.8, color: "var(--cyan)" },
  { x: 79, y: 5, size: 10, delay: 1.6, color: "var(--cream)" },
];

/** A four-point sparkle with concave sides — the Y2K star, not a pentagram. */
const STAR_PATH =
  "M12 0 C13.2 8.4 15.6 10.8 24 12 C15.6 13.2 13.2 15.6 12 24 C10.8 15.6 8.4 13.2 0 12 C8.4 10.8 10.8 8.4 12 0 Z";

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="blob blob-d" />

      <div className="grid-floor" />
      <div className="grid-horizon" />

      {SPARKLES.map((s, i) => (
        <svg
          key={i}
          className="sparkle"
          viewBox="0 0 24 24"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            color: s.color,
            animationDelay: `${s.delay}s`,
          }}
        >
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}
