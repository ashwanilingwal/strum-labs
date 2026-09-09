"use client";

import type { SlotVerdict } from "@/lib/listen/scoring";

/**
 * The game's feedback, in emoji rather than milliseconds.
 *
 * Three boxes — early, on time, late — each a running count, the one you
 * just landed in lit up. A streak flame appears once three on-time strums
 * land in a row. Numbers stay: a count going up is the reward loop; the
 * millisecond readouts and scatter meter of the practice screen do not
 * belong in a game.
 */

export type TimingBucket = "early" | "onTime" | "late";

/** Which box a verdict lands in, or null for a miss or an extra. */
export function bucketOf(v: SlotVerdict | null): TimingBucket | null {
  if (!v || v.grade === "missed" || v.grade === "extra") return null;
  if (v.grade === "tight") return "onTime";
  return v.errorMs < 0 ? "early" : "late";
}

const BOXES: { key: TimingBucket; emoji: string; label: string; color: string; tint: string }[] = [
  { key: "early", emoji: "🐇", label: "Early", color: "var(--close)", tint: "rgba(255, 212, 90, 0.18)" },
  { key: "onTime", emoji: "🎯", label: "On time", color: "var(--tight)", tint: "rgba(111, 227, 143, 0.2)" },
  { key: "late", emoji: "🐢", label: "Late", color: "var(--close)", tint: "rgba(255, 212, 90, 0.18)" },
];

export function TimingBoxes({
  early, onTime, late, last, streak = 0, seq = 0,
}: {
  early: number;
  onTime: number;
  late: number;
  /** The box the most recent strum landed in, lit for emphasis. */
  last: TimingBucket | null;
  /** Consecutive on-time strums. Shown from three up. */
  streak?: number;
  /** Bumps per verdict so the lit box re-pops for repeats. */
  seq?: number;
}) {
  const counts: Record<TimingBucket, number> = { early, onTime, late };
  return (
    <div className="flex items-stretch gap-2">
      {BOXES.map((b) => {
        const lit = last === b.key;
        return (
          <div
            key={b.key}
            className="flex flex-1 flex-col items-center rounded-2xl border px-2 py-2 transition-transform duration-150"
            style={{
              borderColor: lit ? b.color : "var(--line)",
              background: lit ? b.tint : "rgba(255, 255, 255, 0.04)",
              transform: lit ? "scale(1.06)" : "scale(1)",
            }}
          >
            <span key={lit ? seq : -1} className={`text-2xl leading-none ${lit ? "verdict-orb-flash" : ""}`} aria-hidden="true">
              {b.emoji}
            </span>
            <span className="num mt-1 text-xl font-bold leading-none" style={{ color: b.color }}>
              {counts[b.key]}
            </span>
            <span className="caps mt-1 text-fg-dim">{b.label}</span>
          </div>
        );
      })}
      {streak >= 3 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl border px-3 py-2"
          style={{ borderColor: "var(--loose)", background: "rgba(255, 107, 107, 0.16)" }}
          role="status"
          aria-label={`${streak} on time in a row`}
        >
          <span className="text-2xl leading-none" aria-hidden="true">🔥</span>
          <span className="num mt-1 text-xl font-bold leading-none" style={{ color: "var(--loose)" }}>×{streak}</span>
          <span className="caps mt-1 text-fg-dim">streak</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Right or wrong chord, sat directly above the chord itself. Holds its
 * height when there is nothing to say, so the chord never jumps. Says
 * nothing at all when the matcher wasn't sure — silence beats accusation.
 */
export function ChordVerdict({
  verdict, show, seq = 0,
}: {
  verdict: SlotVerdict | null;
  show: boolean;
  seq?: number;
}) {
  const judged =
    show && verdict && verdict.chordOk !== null &&
    verdict.grade !== "missed" && verdict.grade !== "extra";
  if (!judged) return <div className="h-8" aria-hidden="true" />;
  const ok = verdict.chordOk === true;
  return (
    <div className="flex h-8 items-center justify-center" role="status">
      <span
        key={seq}
        className="verdict-orb-flash inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black"
        style={{
          background: ok ? "rgba(111, 227, 143, 0.2)" : "rgba(255, 107, 107, 0.2)",
          color: ok ? "var(--tight)" : "var(--loose)",
        }}
      >
        {ok ? "✅ Right chord!" : `❌ Heard ${verdict.heardChord ?? "?"}`}
      </span>
    </div>
  );
}
