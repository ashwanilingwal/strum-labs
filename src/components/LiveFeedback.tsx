"use client";

import type { SlotVerdict } from "@/lib/listen/scoring";
import type { RecentHit } from "@/hooks/useStrumEngine";
import {
  gradeVisual, METER_BANDS, meterPosition, verdictHeadline,
} from "@/lib/feedback/presentation";

/**
 * The live "did that land?" readout.
 *
 * Two things are shown at once because they answer different questions:
 *
 *  - The big glyph answers "was that one right?", and flashes on every strum so
 *    it reads from across the room while you are looking at your hands.
 *  - The meter answers "am I drifting?", by keeping the last dozen strums on
 *    screen as a scatter. A single number cannot show that you are consistently
 *    rushing; a cluster sitting left of centre can.
 *
 * The mean marker is drawn separately from the scatter on purpose: a tight
 * cluster in the wrong place is a latency setting to fix, while a wide spread
 * around the centre is actually a playing problem.
 */

export function LiveFeedback({
  lastVerdict, verdictSeq, recent, wantChord, meanErrorMs, hits,
}: {
  lastVerdict: SlotVerdict | null;
  verdictSeq: number;
  recent: RecentHit[];
  wantChord: string | null;
  meanErrorMs: number;
  hits: number;
}) {
  const visual = lastVerdict ? gradeVisual(lastVerdict.grade) : null;
  const hasNeedle =
    lastVerdict !== null && lastVerdict.grade !== "missed" && lastVerdict.grade !== "extra";

  return (
    <div className="panel flex items-center gap-3 p-3">
      <div
        // Re-keying on the counter restarts the CSS animation for every strum,
        // including two identical verdicts in a row.
        key={verdictSeq}
        className={`verdict-orb ${lastVerdict ? "verdict-orb-flash" : ""}`}
        style={{
          color: visual?.color ?? "var(--fg-dim)",
          borderColor: visual?.color ?? "rgba(255,255,255,.18)",
        }}
        aria-live="polite"
        aria-label={visual ? visual.label : "Waiting for a strum"}
      >
        {visual?.glyph ?? "·"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="font-display text-sm font-black uppercase tracking-[0.18em]"
            style={{ color: visual?.color ?? "var(--fg-dim)" }}
          >
            {visual?.label ?? "Listening"}
          </span>
          <span className="truncate text-xs text-fg-muted">
            {lastVerdict ? verdictHeadline(lastVerdict, wantChord) : "Play something"}
          </span>
        </div>

        <div className="mt-2">
          <div className="timing-meter">
            <div
              className="timing-band"
              style={{
                left: `${METER_BANDS.close.from * 100}%`,
                right: `${(1 - METER_BANDS.close.to) * 100}%`,
                background: "rgba(255,181,69,.22)",
              }}
            />
            <div
              className="timing-band"
              style={{
                left: `${METER_BANDS.tight.from * 100}%`,
                right: `${(1 - METER_BANDS.tight.to) * 100}%`,
                background: "rgba(198,255,74,.28)",
              }}
            />
            <div className="timing-centre" />

            {recent.map((hit, i) => {
              const age = recent.length - i;
              return (
                <span
                  key={`${i}-${hit.errorMs.toFixed(1)}`}
                  className="timing-dot"
                  style={{
                    left: `${meterPosition(hit.errorMs) * 100}%`,
                    background: gradeVisual(hit.grade).color,
                    opacity: Math.max(0.18, 1 - age * 0.07),
                  }}
                />
              );
            })}

            {hits >= 4 ? (
              <span
                className="timing-mean"
                style={{ left: `${meterPosition(meanErrorMs) * 100}%` }}
                title="Your average"
              />
            ) : null}

            {hasNeedle ? (
              <span
                className="timing-needle"
                style={{
                  left: `${meterPosition(lastVerdict.errorMs) * 100}%`,
                  background: visual!.color,
                  boxShadow: `0 0 10px ${visual!.color}`,
                }}
              />
            ) : null}
          </div>

          <div className="mt-1 flex justify-between font-lcd text-[9px] uppercase tracking-widest text-fg-dim">
            <span>early</span>
            <span>{hits >= 4 ? `avg ${meanErrorMs > 0 ? "+" : ""}${meanErrorMs.toFixed(0)} ms` : "on the beat"}</span>
            <span>late</span>
          </div>
        </div>
      </div>
    </div>
  );
}
