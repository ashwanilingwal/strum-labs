"use client";

import { chordById, type Chord } from "@/lib/music/chords";
import type { ChartOptions, ChartOverlay } from "./types";

/**
 * A chord box, drawn from data.
 *
 * SVG rather than a font or an image so it scales cleanly and the barre can be
 * a real rounded bar instead of four dots pretending to be one.
 *
 * The component is sized by its container, not by a pixel prop: `size` only
 * drives the viewBox, so the internal geometry maths stays in one coordinate
 * space while the rendered box is whatever CSS says it is.
 *
 * Everything transient — which strings are sounding, which finger plucks what —
 * arrives through `overlay`, so fingerpicking and arpeggio views are new data
 * rather than a new component. See ./types.ts.
 */

const STRINGS = 6;
const FRETS = 4;

export function ChordChart({
  chord, size = 168, overlay, options,
}: {
  chord: Chord | string;
  /** viewBox units. The rendered size comes from the parent. */
  size?: number;
  overlay?: ChartOverlay;
  options?: ChartOptions;
}) {
  const resolved = typeof chord === "string" ? chordById(chord) : chord;
  if (!resolved) return null;

  const { showPosition = true, showFingers = true } = options ?? {};
  const padX = size * 0.14;
  const padTop = size * 0.2;
  const padBottom = size * 0.06;
  const w = size - padX * 2;
  const h = size - padTop - padBottom;
  const stringGap = w / (STRINGS - 1);
  const fretGap = h / FRETS;

  // Overlay fret overrides win, so a riff can bend one string without needing
  // its own entry in the chord library.
  const frets = resolved.frets.map((f, i) => overlay?.extraFrets?.[i] ?? f);

  const played = frets.filter((f) => f > 0);
  const lowest = played.length ? Math.min(...played) : 1;
  const offset = lowest > 3 ? lowest - 1 : 0;

  const x = (s: number) => padX + s * stringGap;
  const y = (f: number) => padTop + (f - 0.5) * fretGap;

  const sounding = new Set(overlay?.sounding ?? []);
  const damped = new Set(overlay?.damped ?? []);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${resolved.name} chord diagram`}
      style={{ display: "block" }}
    >
      {offset === 0 ? (
        <rect x={padX - 1} y={padTop - 5} width={w + 2} height={5} rx={1.5} fill="var(--fg)" />
      ) : showPosition ? (
        <text x={padX - 8} y={padTop + fretGap * 0.7} textAnchor="end" fontSize={size * 0.09} fill="var(--fg-dim)">
          {offset + 1}
        </text>
      ) : null}

      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line
          key={`f${f}`}
          x1={padX} x2={padX + w}
          y1={padTop + f * fretGap} y2={padTop + f * fretGap}
          stroke="var(--fg-dim)" strokeWidth={1} opacity={0.55}
        />
      ))}

      {Array.from({ length: STRINGS }, (_, s) => {
        const lit = sounding.has(s);
        return (
          <line
            key={`s${s}`}
            x1={x(s)} x2={x(s)} y1={padTop} y2={padTop + h}
            stroke={lit ? "var(--accent)" : "var(--fg-dim)"}
            strokeWidth={(lit ? 1.8 : 0.6) + (STRINGS - 1 - s) * 0.22}
            opacity={damped.has(s) ? 0.3 : lit ? 1 : 0.7}
          />
        );
      })}

      {/* open / muted markers above the nut */}
      {frets.map((fret, s) =>
        fret === 0 ? (
          <circle
            key={`o${s}`} cx={x(s)} cy={padTop - 13} r={3.6}
            fill={sounding.has(s) ? "var(--accent)" : "none"}
            stroke="var(--accent)" strokeWidth={1.6}
          />
        ) : fret < 0 ? (
          <g key={`x${s}`} stroke="var(--fg-dim)" strokeWidth={1.6} strokeLinecap="round">
            <line x1={x(s) - 3.4} y1={padTop - 16.4} x2={x(s) + 3.4} y2={padTop - 9.6} />
            <line x1={x(s) + 3.4} y1={padTop - 16.4} x2={x(s) - 3.4} y2={padTop - 9.6} />
          </g>
        ) : null,
      )}

      {resolved.barre ? (
        <rect
          x={x(resolved.barre.from) - stringGap * 0.34}
          y={y(resolved.barre.fret - offset) - fretGap * 0.3}
          width={(resolved.barre.to - resolved.barre.from) * stringGap + stringGap * 0.68}
          height={fretGap * 0.6}
          rx={fretGap * 0.3}
          fill="var(--accent)"
          opacity={0.92}
        />
      ) : null}

      {frets.map((fret, s) => {
        if (fret <= 0) return null;
        const rel = fret - offset;
        if (rel < 1 || rel > FRETS) return null;
        const inBarre =
          resolved.barre && fret === resolved.barre.fret &&
          s >= resolved.barre.from && s <= resolved.barre.to;
        if (inBarre) return null;
        return (
          <g key={`d${s}`}>
            <circle
              cx={x(s)} cy={y(rel)} r={fretGap * 0.31}
              fill="var(--accent)"
              stroke={sounding.has(s) ? "var(--fg)" : "none"}
              strokeWidth={2}
            />
            {showFingers ? (
              <text
                x={x(s)} y={y(rel) + fretGap * 0.11}
                textAnchor="middle" fontSize={fretGap * 0.4} fontWeight={700}
                fill="var(--surface-lift)"
              >
                {resolved.fingers[s] || ""}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* right-hand fingering, below the box — the fingerpicking hook */}
      {overlay?.pluck
        ? Object.entries(overlay.pluck).map(([str, finger]) =>
            finger ? (
              <text
                key={`p${str}`}
                x={x(Number(str))} y={padTop + h + size * 0.055}
                textAnchor="middle" fontSize={size * 0.075} fontWeight={700}
                fill="var(--accent)"
              >
                {finger}
              </text>
            ) : null,
          )
        : null}
    </svg>
  );
}
