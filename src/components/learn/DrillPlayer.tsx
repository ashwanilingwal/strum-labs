"use client";

import { useMemo } from "react";
import { useSongEngine } from "@/hooks/useSongEngine";
import { chordById } from "@/lib/music/chords";
import { fingerFor, pickFret, songBars, type Song } from "@/lib/music/songs";
import type { ChartOverlay } from "../chart/types";
import { ChordChart } from "../chart/ChordChart";

/**
 * A drill is a two-bar song on loop, so this is the song player folded down to
 * one chart: the animated overlay, play/stop, and the pace slider. Mount it
 * keyed by exercise so each drill gets a fresh engine binding.
 */

export function DrillPlayer({ song }: { song: Song }) {
  const engine = useSongEngine(song);
  const bars = useMemo(() => songBars(song), [song]);
  const current = engine.activeBar >= 0 ? bars[engine.activeBar] : bars[0];
  const chord = chordById(current.chordId);

  const overlay = useMemo<ChartOverlay | undefined>(() => {
    if (!current) return undefined;
    const step = engine.activeStep >= 0 ? current.picking[engine.activeStep] : null;
    const out: ChartOverlay = {};
    if (step) {
      out.sounding = [step.string];
      out.pluck = { [step.string]: fingerFor(step.string) };
    }
    for (const s of current.picking) {
      if (s?.art && s.fromFret !== undefined) {
        out.arcs = out.arcs ?? [];
        if (!out.arcs.some((a) => a.string === s.string)) {
          out.arcs.push({
            string: s.string,
            fromFret: s.fromFret,
            toFret: pickFret(current.chordId, s.string),
            kind: s.art,
          });
        }
      }
    }
    return out;
  }, [current, engine.activeStep]);

  if (!chord) return null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="w-32 shrink-0 sm:w-36">
        <ChordChart chord={chord} overlay={overlay} />
        <p className="caps mt-1 text-center text-fg-dim">{chord.symbol}</p>
      </div>

      <div className="min-w-40 flex-1 space-y-3">
        <button
          type="button"
          onClick={engine.toggle}
          className={`btn ${engine.playing ? "btn-hot" : "btn-lit"}`}
        >
          {engine.playing ? "Stop" : "Play the drill"}
        </button>

        <div className="flex items-center gap-2">
          <span className="caps shrink-0 text-fg-dim">pace</span>
          <input
            type="range"
            aria-label="Drill pace"
            className="min-w-0 flex-1"
            min={40}
            max={110}
            step={5}
            value={engine.pace}
            onChange={(e) => engine.setPace(Number(e.target.value))}
          />
          <span className="num shrink-0 text-sm text-fg">{engine.effectiveBpm} bpm</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={engine.click}
          onClick={() => engine.setClick(!engine.click)}
          className={`btn !px-3 !py-1 text-xs ${engine.click ? "btn-lit" : ""}`}
        >
          Click
        </button>
      </div>
    </div>
  );
}
