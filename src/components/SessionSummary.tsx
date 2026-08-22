"use client";

import type { SessionStats } from "@/lib/listen/scoring";
import { TIGHT_MS } from "@/lib/listen/scoring";
import { ChromeText } from "./ui/ChromeText";

/**
 * What happened, shown when you stop.
 *
 * The headline is deliberately about the *spread*, not the average. A player
 * who is consistently 40 ms late has good time and a latency setting to fix;
 * a player scattered either side of the beat has a timing problem. Reporting
 * only "60% on time" hides which of those you are.
 */

function verdictLine(stats: SessionStats): { title: string; note: string } {
  const attempted = stats.hits + stats.missed;
  const onTime = attempted ? stats.tight / attempted : 0;
  const bias = stats.meanErrorMs;
  const spread = stats.spreadMs;

  if (attempted < 4) {
    return { title: "Not much to go on", note: "Play a few more bars and stop again for a proper read." };
  }
  if (onTime >= 0.8) {
    return { title: "Locked in", note: "That is solid time. Nudge the tempo up and see where it breaks." };
  }
  if (spread <= TIGHT_MS && Math.abs(bias) > TIGHT_MS) {
    return {
      title: bias > 0 ? "Steady, but behind" : "Steady, but ahead",
      note: `Your strokes are consistent — they just sit ${Math.abs(Math.round(bias))} ms ${bias > 0 ? "late" : "early"} as a group. That is usually the latency setting, not your playing. Try "zero it from my last few strums" in settings.`,
    };
  }
  if (onTime >= 0.5) {
    return { title: "Getting there", note: "Roughly half your strums landed. Drop the tempo ten beats and aim for consistency before speed." };
  }
  if (stats.missed > stats.hits) {
    return { title: "Mostly missed", note: "More slots went unheard than heard. Check the mic is picking you up, or slow right down." };
  }
  return { title: "Loose", note: "Wide spread either side of the beat. Slow it down until the clicks and your strums feel like one sound." };
}

export function SessionSummary({
  stats, checkChord, checkStroke, onDismiss, onAgain,
}: {
  stats: SessionStats;
  checkChord: boolean;
  checkStroke: boolean;
  onDismiss: () => void;
  onAgain: () => void;
}) {
  const attempted = stats.hits + stats.missed;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const { title, note } = verdictLine(stats);

  const rows: { label: string; value: string; hint?: string }[] = [
    { label: "On time", value: pct(stats.tight, attempted), hint: `${stats.tight} of ${attempted}` },
    {
      label: "Average",
      value: stats.hits ? `${stats.meanErrorMs > 0 ? "+" : ""}${stats.meanErrorMs.toFixed(0)} ms` : "—",
      hint: stats.hits ? (stats.meanErrorMs > 0 ? "dragging" : "rushing") : undefined,
    },
    { label: "Consistency", value: stats.hits ? `±${stats.spreadMs.toFixed(0)} ms` : "—", hint: "spread" },
    { label: "Missed", value: String(stats.missed) },
    { label: "Extra", value: String(stats.extra) },
  ];
  if (checkChord && stats.chordChecked) {
    rows.push({ label: "Right chord", value: pct(stats.chordRight, stats.chordChecked), hint: `${stats.chordChecked} judged` });
  }
  if (checkStroke && stats.strokeChecked) {
    rows.push({ label: "Right direction", value: pct(stats.strokeRight, stats.strokeChecked), hint: `${stats.strokeChecked} judged` });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close summary"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Session summary"
        className="block-light card-flat relative max-h-full w-full max-w-lg overflow-y-auto p-5 sm:p-7"
      >
        <p className="caps text-fg-dim">How that went</p>
        <ChromeText className="mt-1 block text-[clamp(2rem,8vw,3.25rem)]">{title}</ChromeText>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{note}</p>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="caps text-fg-dim">{r.label}</dt>
              <dd className="num mt-0.5 text-xl text-fg">{r.value}</dd>
              {r.hint ? <dd className="text-[11px] text-fg-dim">{r.hint}</dd> : null}
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="btn btn-lit" onClick={onAgain}>
            Go again
          </button>
          <button type="button" className="btn" onClick={onDismiss}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
