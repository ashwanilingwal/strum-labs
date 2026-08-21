/**
 * Confetti behind a section: sparkles, chrome orbs and orbit rings.
 *
 * Absolute, not fixed — blocks paint an opaque ground, so a page-level layer
 * behind them is invisible. Sections opt in with `relative` and lift their own
 * content with `z-10`.
 *
 * Positions are a written table rather than Math.random(): random values differ
 * between the server and client renders and trip hydration.
 */

type Shape = "sparkle" | "orb" | "ring";

interface Motif {
  x: number;
  y: number;
  size: number;
  delay: number;
  shape: Shape;
  spin: number;
}

const MOTIFS: Motif[] = [
  { x: 5, y: 33, size: 46, delay: 0, shape: "sparkle", spin: -12 },
  { x: 13, y: 74, size: 26, delay: 1.6, shape: "orb", spin: 0 },
  { x: 25, y: 38, size: 20, delay: 3.2, shape: "sparkle", spin: 8 },
  { x: 33, y: 91, size: 38, delay: 0.8, shape: "ring", spin: -28 },
  { x: 47, y: 9, size: 22, delay: 4.1, shape: "orb", spin: 0 },
  { x: 61, y: 63, size: 16, delay: 2.4, shape: "sparkle", spin: -6 },
  { x: 70, y: 21, size: 40, delay: 1.2, shape: "ring", spin: 30 },
  { x: 79, y: 82, size: 24, delay: 3.7, shape: "sparkle", spin: -18 },
  { x: 88, y: 44, size: 32, delay: 0.4, shape: "orb", spin: 0 },
  { x: 95, y: 12, size: 20, delay: 2.9, shape: "sparkle", spin: -22 },
  { x: 55, y: 96, size: 28, delay: 5.0, shape: "ring", spin: 6 },
  { x: 8, y: 48, size: 18, delay: 4.6, shape: "sparkle", spin: -14 },
];

/** Four points with concave sides — the Y2K twinkle, not a five-point star. */
const SPARKLE =
  "M0 -50 C6 -18 18 -6 50 0 C18 6 6 18 0 50 C-6 18 -18 6 -50 0 C-18 -6 -6 -18 0 -50 Z";

export function MotifField({ density = 1 }: { density?: number }) {
  // Take every Nth motif rather than the first N: slicing the head of the
  // table clusters everything into one corner at low density.
  const stride = Math.max(1, Math.round(1 / Math.min(1, Math.max(0.05, density))));
  const shown = MOTIFS.filter((_, i) => i % stride === 0);

  return (
    <div className="motif-field" aria-hidden="true">
      {shown.map((m, i) => (
        <svg
          key={i}
          className="motif"
          viewBox="-60 -60 120 120"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: m.size,
            height: m.size,
            animationDelay: `${m.delay}s`,
            rotate: `${m.spin}deg`,
          }}
        >
          {m.shape === "sparkle" ? (
            <path d={SPARKLE} fill="var(--chrome-300)" />
          ) : m.shape === "orb" ? (
            <>
              {/* A lit sphere: the offset highlight is what makes it read as
                  chrome rather than a flat disc. */}
              <defs>
                <radialGradient id={`orb${i}`} cx="35%" cy="28%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="38%" stopColor="var(--chrome-300)" />
                  <stop offset="78%" stopColor="var(--chrome-500)" />
                  <stop offset="100%" stopColor="var(--chrome-700)" />
                </radialGradient>
              </defs>
              <circle cx="0" cy="0" r="48" fill={`url(#orb${i})`} />
            </>
          ) : (
            <circle
              cx="0"
              cy="0"
              r="44"
              fill="none"
              stroke="var(--chrome-400)"
              strokeWidth="7"
            />
          )}
        </svg>
      ))}
    </div>
  );
}
