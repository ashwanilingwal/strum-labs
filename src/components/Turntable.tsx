"use client";

import { useMemo } from "react";

/** Tonearm layout, in the overlay's 0-100 coordinate space. */
const PIVOT_X = 99;
const PIVOT_Y = 3;
const ARM_LEN = 70;
const OUTER_DEG = 103;
const INNER_DEG = 127;
import type { Chord } from "@/lib/music/chords";
import type { Pattern } from "@/lib/music/pattern";

/**
 * The deck. The record carries the chord you are playing right now on its
 * label, and the tonearm tracks how far through the loop you are — so the
 * ornament is also the progress indicator.
 *
 * The rotation is a CSS animation whose duration is one bar. Driving it from
 * React would mean a state update every frame to move a decoration.
 */

export function Turntable({
  chord, nextChord, pattern, playing, activeSlot, countIn,
}: {
  chord: Chord | undefined;
  nextChord: Chord | undefined;
  pattern: Pattern;
  playing: boolean;
  activeSlot: number;
  countIn: number;
}) {
  const barSeconds = (60 / pattern.bpm) * pattern.beatsPerBar;
  const total = pattern.strokes.length;
  const progress = activeSlot >= 0 ? activeSlot / total : 0;

  // Tonearm geometry, in the 0-100 space of the overlay below. The arm is a
  // fixed length pivoting at the back right; sweeping it from OUTER_DEG to
  // INNER_DEG walks the stylus from the outer groove to the label, which is
  // the direction a record actually plays.
  const armAngle = useMemo(() => OUTER_DEG + progress * (INNER_DEG - OUTER_DEG), [progress]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(46vh,420px)]">
      {/* The grooves spin; the label does not. A real label turns with the
          record, but the chord you are playing has to stay readable, and a
          name rotating past upside-down twice a bar is unusable. The moving
          sheen and groove marker carry the motion instead. */}
      <div
        className={`vinyl absolute inset-[3%] ${playing && !countIn ? "spin" : "spin spin-paused"}`}
        style={{ ["--spin-duration" as string]: `${barSeconds}s` }}
      >
        <div className="vinyl-sheen absolute inset-0" />
        <div
          className="absolute left-1/2 top-[6%] h-[18%] w-[2px] -translate-x-1/2 rounded-full"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,.5), transparent)" }}
        />
      </div>

      <div className="pointer-events-none absolute inset-[30%] flex flex-col items-center justify-center vinyl-label">
        <span className="font-display text-[9px] font-bold uppercase tracking-[0.3em] opacity-70">
          {countIn > 0 ? "count in" : "now playing"}
        </span>
        <span className="font-display text-[clamp(1.7rem,7vw,3.1rem)] font-black leading-none">
          {countIn > 0 ? countIn : (chord?.symbol ?? "\u2014")}
        </span>
        <span className="max-w-[88%] text-center text-[10px] font-semibold uppercase leading-tight tracking-widest opacity-70">
          {countIn > 0 ? "get ready" : (chord?.name ?? "no chord")}
        </span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_1px_rgba(255,255,255,.25)]" />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="arm-chrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#cdd7e6" />
            <stop offset="52%" stopColor="#5b6679" />
            <stop offset="70%" stopColor="#e7eefa" />
            <stop offset="100%" stopColor="#2c3242" />
          </linearGradient>
        </defs>
        <g
          transform={`rotate(${armAngle} ${PIVOT_X} ${PIVOT_Y})`}
          style={{ transition: "transform 180ms ease-out" }}
        >
          <rect x={PIVOT_X - 11} y={PIVOT_Y - 3.2} width={11} height={6.4} rx={3.2} fill="url(#arm-chrome)" />
          <rect x={PIVOT_X} y={PIVOT_Y - 1.4} width={ARM_LEN} height={2.8} rx={1.4} fill="url(#arm-chrome)" />
          <rect
            x={PIVOT_X + ARM_LEN - 6}
            y={PIVOT_Y - 3.6}
            width={8}
            height={7.2}
            rx={2}
            fill="#1b2030"
            stroke="rgba(255,255,255,.35)"
            strokeWidth={0.6}
          />
        </g>
        <circle cx={PIVOT_X} cy={PIVOT_Y} r={4.6} fill="url(#arm-chrome)" />
        <circle cx={PIVOT_X} cy={PIVOT_Y} r={1.6} fill="#1b2030" />
      </svg>

      {nextChord && nextChord.id !== chord?.id ? (
        <div className="panel absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-xs">
          <span className="text-fg-dim">next </span>
          <span className="font-display font-bold text-cyan">{nextChord.symbol}</span>
        </div>
      ) : null}
    </div>
  );
}
