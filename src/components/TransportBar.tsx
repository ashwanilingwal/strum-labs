"use client";

import { MAX_BPM, MIN_BPM } from "@/lib/music/pattern";
import type { MicStatus } from "@/hooks/useStrumEngine";

/** Play, tempo, what you hear, and the way into settings. */

export function TransportBar({
  playing, onToggle, bpm, onBpm, onNudgeBpm,
  click, onClick, guitar, onGuitar,
  micStatus, onMic, onSettings, level,
}: {
  playing: boolean;
  onToggle: () => void;
  bpm: number;
  /** Absolute set, for the slider. */
  onBpm: (v: number) => void;
  /** Relative step, for the -/+ buttons. See the note in StrumLab. */
  onNudgeBpm: (delta: number) => void;
  click: boolean;
  onClick: (v: boolean) => void;
  guitar: boolean;
  onGuitar: (v: boolean) => void;
  micStatus: MicStatus;
  onMic: () => void;
  onSettings: () => void;
  level: number;
}) {
  const micOn = micStatus === "listening" || micStatus === "calibrating";
  // Two labels, not one truncated: at 320px the full phrase pushes the bar to
  // four rows, and a four-row transport hides the lane it sits under.
  const micLabel =
    micStatus === "listening" ? "Listening"
      : micStatus === "calibrating" ? "Measuring room"
      : micStatus === "opening" ? "Opening…"
      : micStatus === "error" ? "Mic failed"
      : "Listen to me play";
  const micLabelShort =
    micStatus === "listening" ? "Listening"
      : micStatus === "calibrating" ? "Room…"
      : micStatus === "opening" ? "Opening…"
      : micStatus === "error" ? "Failed"
      : "Listen";

  return (
    <div className="panel flex flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Stop" : "Play"}
        className={`btn ${playing ? "btn-hot" : "btn-lit"} h-12 w-12 !p-0 text-xl sm:h-14 sm:w-14`}
      >
        {playing ? "■" : "▶"}
      </button>

      <div className="panel-sunken flex items-center gap-1 px-2 py-1.5">
        <button type="button" className="btn btn-icon !h-8 !w-8 !p-0 text-base" aria-label="Slower" onClick={() => onNudgeBpm(-1)}>
          −
        </button>
        <div className="px-1 text-center">
          <div className="lcd px-2 py-1 text-xl leading-none tabular-nums sm:text-2xl">
            {String(bpm).padStart(3, "0")}
          </div>
          <div className="mt-0.5 font-display text-[9px] uppercase tracking-[0.2em] text-fg-dim">bpm</div>
        </div>
        <button type="button" className="btn btn-icon !h-8 !w-8 !p-0 text-base" aria-label="Faster" onClick={() => onNudgeBpm(1)}>
          +
        </button>
      </div>

      <input
        type="range"
        aria-label="Tempo"
        className="hidden min-w-24 flex-1 md:block"
        min={MIN_BPM}
        max={MAX_BPM}
        value={bpm}
        onChange={(e) => onBpm(Number(e.target.value))}
      />

      <div className="flex items-center gap-2">
        <PillToggle on={click} onChange={onClick} label="Click" />
        <PillToggle on={guitar} onChange={onGuitar} label="Guitar" />
      </div>

      <button
        type="button"
        onClick={onMic}
        className={`btn ${micOn ? "btn-hot" : ""} min-w-0`}
        aria-pressed={micOn}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: micOn ? "var(--tight)" : micStatus === "error" ? "var(--loose)" : "rgba(255,255,255,.3)",
            boxShadow: micOn ? "0 0 10px var(--tight)" : undefined,
          }}
        />
        <span className="truncate text-xs sm:hidden">{micLabelShort}</span>
        <span className="hidden truncate text-xs sm:inline sm:text-sm">{micLabel}</span>
      </button>

      {micOn ? <LevelMeter db={level} /> : null}

      {/* A gear glyph renders as an illegible speck at this size and does not
          match the editorial type elsewhere. The word is clearer and shorter
          to parse than an icon nobody has to decode. */}
      {/* An icon, not the word: on a phone the transport is the tightest row in
          the app and "Settings" cost a whole line of it. Drawn rather than an
          emoji, which renders as an illegible speck at this size. */}
      <button type="button" onClick={onSettings} className="btn btn-icon sm:ml-auto" aria-label="Settings">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.9" />
          <path
            d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4"
            stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function PillToggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`btn !px-3 !py-1.5 text-xs ${on ? "btn-lit" : ""}`}
    >
      {label}
    </button>
  );
}

/**
 * Input level, in dBFS mapped onto a -60..0 bar. It exists so a dead or
 * hopelessly quiet microphone is visible immediately rather than being
 * mistaken for bad playing.
 */
function LevelMeter({ db }: { db: number }) {
  const pct = Math.max(0, Math.min(1, (db + 60) / 60));
  return (
    <div className="panel-sunken h-3 w-20 overflow-hidden p-[2px]" aria-hidden="true">
      <div
        className="h-full rounded-full transition-[width] duration-75"
        style={{
          width: `${pct * 100}%`,
          background:
            pct > 0.9
              ? "linear-gradient(90deg,var(--tight),var(--loose))"
              : "linear-gradient(90deg,var(--accent),var(--tight))",
        }}
      />
    </div>
  );
}
