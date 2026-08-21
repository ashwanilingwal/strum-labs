"use client";

import { type Chord } from "@/lib/music/chords";

/**
 * A chord box. Drawn as SVG rather than a font or an image so it scales, and
 * so the barre can be a real rounded bar rather than four dots pretending.
 */

const STRINGS = 6;

export function ChordDiagram({ chord, size = 132 }: { chord: Chord; size?: number }) {
  const frets = 4;
  const padX = size * 0.14;
  const padTop = size * 0.2;
  const padBottom = size * 0.06;
  const w = size - padX * 2;
  const h = size - padTop - padBottom;
  const stringGap = w / (STRINGS - 1);
  const fretGap = h / frets;

  const played = chord.frets.filter((f) => f > 0);
  const lowest = played.length ? Math.min(...played) : 1;
  const offset = lowest > 3 ? lowest - 1 : 0;

  const x = (s: number) => padX + s * stringGap;
  const y = (f: number) => padTop + (f - 0.5) * fretGap;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${chord.name} chord diagram`}
    >
      {/* nut, or the fret-number label when the shape sits up the neck */}
      {offset === 0 ? (
        <rect x={padX - 1} y={padTop - 5} width={w + 2} height={5} rx={1.5} fill="var(--cream)" />
      ) : (
        <text x={padX - 8} y={padTop + fretGap * 0.7} textAnchor="end" fontSize={size * 0.09} fill="var(--fg-dim)">
          {offset + 1}
        </text>
      )}

      {Array.from({ length: frets + 1 }, (_, f) => (
        <line
          key={`f${f}`}
          x1={padX}
          x2={padX + w}
          y1={padTop + f * fretGap}
          y2={padTop + f * fretGap}
          stroke="rgba(180,166,214,.45)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: STRINGS }, (_, s) => (
        <line
          key={`s${s}`}
          x1={x(s)}
          x2={x(s)}
          y1={padTop}
          y2={padTop + h}
          stroke="rgba(180,166,214,.55)"
          strokeWidth={0.6 + (STRINGS - 1 - s) * 0.22}
        />
      ))}

      {/* open / muted markers above the nut */}
      {chord.frets.map((fret, s) =>
        fret === 0 ? (
          <circle key={`o${s}`} cx={x(s)} cy={padTop - 13} r={3.6} fill="none" stroke="var(--cyan)" strokeWidth={1.6} />
        ) : fret < 0 ? (
          <g key={`x${s}`} stroke="var(--fg-dim)" strokeWidth={1.6} strokeLinecap="round">
            <line x1={x(s) - 3.4} y1={padTop - 16.4} x2={x(s) + 3.4} y2={padTop - 9.6} />
            <line x1={x(s) + 3.4} y1={padTop - 16.4} x2={x(s) - 3.4} y2={padTop - 9.6} />
          </g>
        ) : null,
      )}

      {chord.barre ? (
        <rect
          x={x(chord.barre.from) - stringGap * 0.34}
          y={y(chord.barre.fret - offset) - fretGap * 0.3}
          width={(chord.barre.to - chord.barre.from) * stringGap + stringGap * 0.68}
          height={fretGap * 0.6}
          rx={fretGap * 0.3}
          fill="var(--cyan)"
          opacity={0.92}
        />
      ) : null}

      {chord.frets.map((fret, s) => {
        if (fret <= 0) return null;
        const rel = fret - offset;
        if (rel < 1 || rel > frets) return null;
        const isBarreDot =
          chord.barre && fret === chord.barre.fret && s >= chord.barre.from && s <= chord.barre.to;
        if (isBarreDot) return null;
        return (
          <g key={`d${s}`}>
            <circle cx={x(s)} cy={y(rel)} r={fretGap * 0.31} fill="var(--cyan)" />
            <text
              x={x(s)}
              y={y(rel) + fretGap * 0.11}
              textAnchor="middle"
              fontSize={fretGap * 0.4}
              fontWeight={700}
              fill="var(--ink)"
            >
              {chord.fingers[s] || ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
