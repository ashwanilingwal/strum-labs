/**
 * Flower confetti behind everything.
 *
 * Fixed, pointer-events none, z-index below the page. Positions are a written
 * table rather than Math.random(): random values differ between the server and
 * client renders and trip hydration.
 */

interface Bloom {
  x: number;
  y: number;
  size: number;
  delay: number;
  tone: string;
  spin: number;
}

const BLOOMS: Bloom[] = [
  { x: 5, y: 33, size: 62, delay: 0, tone: "var(--lilac-400)", spin: -12 },
  { x: 13, y: 74, size: 34, delay: 1.6, tone: "var(--lilac-300)", spin: 22 },
  { x: 25, y: 38, size: 24, delay: 3.2, tone: "var(--blush)", spin: 8 },
  { x: 33, y: 91, size: 46, delay: 0.8, tone: "var(--lilac-200)", spin: -28 },
  { x: 47, y: 9, size: 28, delay: 4.1, tone: "var(--lilac-400)", spin: 16 },
  { x: 61, y: 63, size: 20, delay: 2.4, tone: "var(--lilac-300)", spin: -6 },
  { x: 70, y: 21, size: 52, delay: 1.2, tone: "var(--lilac-200)", spin: 30 },
  { x: 79, y: 82, size: 30, delay: 3.7, tone: "var(--blush)", spin: -18 },
  { x: 88, y: 44, size: 40, delay: 0.4, tone: "var(--lilac-400)", spin: 11 },
  { x: 95, y: 12, size: 26, delay: 2.9, tone: "var(--lilac-300)", spin: -22 },
  { x: 55, y: 96, size: 34, delay: 5.0, tone: "var(--lilac-200)", spin: 6 },
  { x: 8, y: 48, size: 22, delay: 4.6, tone: "var(--lilac-400)", spin: -14 },
];

const PETALS = 6;

export function FlowerField({ density = 1 }: { density?: number }) {
  // Take every Nth bloom rather than the first N: slicing the head of the
  // table clusters everything into one corner at low density.
  const stride = Math.max(1, Math.round(1 / Math.min(1, Math.max(0.05, density))));
  const blooms = BLOOMS.filter((_, i) => i % stride === 0);
  return (
    <div className="flower-field" aria-hidden="true">
      {blooms.map((b, i) => (
        <svg
          key={i}
          className="flower"
          viewBox="-50 -50 100 100"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            color: b.tone,
            animationDelay: `${b.delay}s`,
            rotate: `${b.spin}deg`,
          }}
        >
          {Array.from({ length: PETALS }, (_, p) => (
            <ellipse
              key={p}
              cx="0"
              cy="-24"
              rx="13"
              ry="24"
              fill="currentColor"
              transform={`rotate(${(360 / PETALS) * p})`}
            />
          ))}
          <circle cx="0" cy="0" r="9" fill="currentColor" opacity="0.45" />
        </svg>
      ))}
    </div>
  );
}
