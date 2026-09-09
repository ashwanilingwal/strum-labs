/**
 * The night sky behind a section: stars, drifting clouds, and one moon.
 *
 * Absolute, not fixed — blocks paint an opaque ground, so a page-level layer
 * behind them is invisible. Sections opt in with `relative` and lift their own
 * content with `z-10`.
 *
 * Positions are a written table rather than Math.random(): random values differ
 * between the server and client renders and trip hydration.
 */

type Shape = "star" | "twinkle" | "cloud" | "moon";

interface Motif {
  x: number;
  y: number;
  size: number;
  delay: number;
  shape: Shape;
}

const MOTIFS: Motif[] = [
  { x: 4, y: 8, size: 150, delay: 0, shape: "moon" },
  { x: 22, y: 30, size: 6, delay: 1.1, shape: "star" },
  { x: 37, y: 12, size: 10, delay: 2.4, shape: "twinkle" },
  { x: 48, y: 26, size: 5, delay: 0.6, shape: "star" },
  { x: 61, y: 9, size: 7, delay: 3.3, shape: "star" },
  { x: 73, y: 22, size: 12, delay: 1.8, shape: "twinkle" },
  { x: 86, y: 14, size: 5, delay: 4.2, shape: "star" },
  { x: 93, y: 34, size: 8, delay: 0.3, shape: "star" },
  { x: 15, y: 62, size: 7, delay: 2.9, shape: "star" },
  { x: 55, y: 48, size: 5, delay: 3.8, shape: "star" },
  { x: 80, y: 56, size: 10, delay: 1.4, shape: "twinkle" },
  { x: 8, y: 78, size: 120, delay: 0.8, shape: "cloud" },
  { x: 70, y: 70, size: 170, delay: 2.2, shape: "cloud" },
  { x: 40, y: 92, size: 140, delay: 3.6, shape: "cloud" },
  { x: 95, y: 88, size: 110, delay: 1.9, shape: "cloud" },
];

/** A fluffy cumulus in profile — three humps over a flat base. */
const CLOUD =
  "M-58 18 C-72 18 -74 -4 -56 -6 C-56 -28 -26 -34 -16 -14 C-8 -40 30 -38 32 -10 C54 -14 66 6 52 18 Z";

/** Four points with concave sides — the twinkle on the brighter stars. */
const TWINKLE =
  "M0 -50 C6 -18 18 -6 50 0 C18 6 6 18 0 50 C-6 18 -18 6 -50 0 C-18 -6 -6 -18 0 -50 Z";

export function MotifField({ density = 1 }: { density?: number }) {
  // Take every Nth motif rather than the first N: slicing the head of the
  // table clusters everything into one corner at low density. The moon is
  // always kept — a sky with no moon is just a dark room.
  const stride = Math.max(1, Math.round(1 / Math.min(1, Math.max(0.05, density))));
  const shown = MOTIFS.filter((m, i) => m.shape === "moon" || i % stride === 0);

  return (
    <div className="motif-field" aria-hidden="true">
      {shown.map((m, i) => (
        <svg
          key={i}
          className={m.shape === "cloud" ? "motif motif-cloud" : m.shape === "moon" ? "motif motif-moon" : "motif"}
          viewBox="-60 -60 120 120"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: m.size,
            height: m.size,
            animationDelay: `${m.delay}s`,
          }}
        >
          {m.shape === "moon" ? (
            <>
              <defs>
                <radialGradient id={`moon${i}`} cx="42%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#fff4c2" />
                  <stop offset="55%" stopColor="#ffe17a" />
                  <stop offset="100%" stopColor="#f0b840" />
                </radialGradient>
              </defs>
              <circle cx="0" cy="0" r="50" fill={`url(#moon${i})`} />
              <circle cx="-14" cy="-10" r="7" fill="#e9c554" opacity="0.7" />
              <circle cx="16" cy="14" r="10" fill="#e9c554" opacity="0.6" />
              <circle cx="-4" cy="24" r="5" fill="#e9c554" opacity="0.6" />
            </>
          ) : m.shape === "cloud" ? (
            <path d={CLOUD} fill="var(--chrome-400)" />
          ) : m.shape === "twinkle" ? (
            <path d={TWINKLE} fill="#fff8d6" />
          ) : (
            <circle cx="0" cy="0" r="40" fill="#fff8d6" />
          )}
        </svg>
      ))}
    </div>
  );
}
