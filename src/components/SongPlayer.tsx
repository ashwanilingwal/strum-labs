"use client";

import { useMemo } from "react";
import { useSongEngine, type SongMode } from "@/hooks/useSongEngine";
import { chordById } from "@/lib/music/chords";
import { fingerFor, pickFret, type Song } from "@/lib/music/songs";
import type { ChartOverlay } from "./chart/types";
import { ChordChart } from "./chart/ChordChart";
import { ChromeText } from "./ui/ChromeText";
import { MotifField } from "./ui/MotifField";
import { Nav } from "./ui/Nav";

/**
 * Follow-along player for one song.
 *
 * The six chord charts are the fixed content — they never move or reorder.
 * What animates is an overlay on the chart of the bar being played: the string
 * being plucked lights up, the right-hand finger letter shows beneath it, and
 * hammer/pull arcs appear on the bars that have them. Status (the bar counter)
 * stays out of the content slots, per the invariant.
 */

export function SongPlayer({ song }: { song: Song }) {
  const engine = useSongEngine(song);
  const { bars, activeBar, activeStep } = engine;

  const current = activeBar >= 0 ? bars[activeBar] : null;
  const currentChordId = current?.chordId ?? bars[0].chordId;

  // The animated overlay for the active chart only.
  const overlay = useMemo<ChartOverlay | undefined>(() => {
    if (!current || engine.mode !== "pick") return undefined;
    const step = activeStep >= 0 ? current.picking[activeStep] : null;
    const out: ChartOverlay = {};
    if (step) {
      out.sounding = [step.string];
      out.pluck = { [step.string]: fingerFor(step.string) };
      if (step.art && step.fromFret !== undefined) {
        out.arcs = [{
          string: step.string,
          fromFret: step.fromFret,
          toFret: pickFret(current.chordId, step.string),
          kind: step.art,
        }];
      }
    }
    // Arcs for the whole bar stay visible even between their slots, so the
    // move can be read before it arrives.
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
  }, [current, activeStep, engine.mode]);

  // Bars grouped back into sections for the progress strip.
  const sections = useMemo(
    () =>
      song.sections.map((s, i) => ({
        name: s.name,
        startIndex: song.sections.slice(0, i).reduce((n, x) => n + x.bars.length, 0),
        bars: s.bars,
      })),
    [song],
  );

  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />

      <section className="relative flex-1 px-4 py-6 sm:px-8">
        <MotifField density={0.4} />

        {/* Status pill: where you are. Never in a content slot. */}
        {engine.playing && activeBar >= 0 ? (
          <div
            className="absolute right-4 top-2 z-10 flex items-center gap-2 rounded-full border border-line px-3 py-1.5 sm:right-8"
            role="status"
          >
            <span className="caps text-fg-dim">bar</span>
            <span className="num text-lg leading-none text-accent">{activeBar + 1}</span>
            <span className="caps text-fg-dim">/ {bars.length}</span>
          </div>
        ) : null}

        <div className="wrap relative z-10">
          <header className="text-center">
            <p className="caps text-fg-dim">{song.artist}</p>
            <ChromeText className="mt-1 block text-[clamp(1.8rem,6vw,4rem)]">
              {song.title}
            </ChromeText>
            <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-fg-dim">
              {song.note}
            </p>
          </header>

          {/* The six chords. The active one carries the animated overlay. */}
          <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {song.chordIds.map((id) => {
              const chord = chordById(id);
              if (!chord) return null;
              const active = id === currentChordId;
              return (
                <div
                  key={id}
                  className="block-light card-flat p-2 transition"
                  style={{
                    outline: active ? "2px solid var(--accent)" : "none",
                    outlineOffset: "2px",
                    opacity: engine.playing && !active ? 0.55 : 1,
                  }}
                >
                  <ChordChart chord={chord} overlay={active ? overlay : undefined} />
                  <p className="caps mt-1 text-center text-fg-dim">{chord.symbol}</p>
                </div>
              );
            })}
          </div>

          {/* Progress: sections and bars. */}
          <div className="mt-6 space-y-3">
            {sections.map((section) => (
              <div key={section.name}>
                <p className="caps mb-1.5 text-fg-dim">{section.name}</p>
                <ol className="flex flex-wrap gap-1.5">
                  {section.bars.map((b, i) => {
                    const index = section.startIndex + i;
                    const isNow = index === activeBar;
                    const hasArt = b.picking.some((s) => s?.art);
                    return (
                      <li
                        key={index}
                        className="caps rounded-full border px-2.5 py-1"
                        style={{
                          borderColor: isNow ? "var(--accent)" : "var(--line)",
                          background: isNow ? "rgba(95,210,242,0.12)" : "transparent",
                          color: isNow ? "var(--fg)" : "var(--fg-dim)",
                        }}
                      >
                        {b.chordId}
                        {hasArt ? <span className="ml-1 text-close">·</span> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            <p className="caps text-fg-dim opacity-70">· marks a bar with a hammer-on or pull-off</p>
          </div>
        </div>
      </section>

      {/* Transport */}
      <div className="shrink-0 border-t border-line bg-ink/95 px-4 py-3 sm:px-8">
        <div className="wrap flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={engine.toggle}
            aria-label={engine.playing ? "Stop" : "Play"}
            className={`btn ${engine.playing ? "btn-hot" : "btn-lit"} h-12 w-12 !p-0 text-xl`}
          >
            {engine.playing ? "■" : "▶"}
          </button>

          <div className="panel-sunken flex gap-1 p-1" role="radiogroup" aria-label="How to play it">
            {(["pick", "strum"] as SongMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={engine.mode === m}
                onClick={() => engine.setMode(m)}
                className="caps rounded-full px-3 py-1.5 transition"
                style={{
                  background: engine.mode === m ? "var(--chrome-200)" : "transparent",
                  color: engine.mode === m ? "#131820" : "var(--fg-dim)",
                }}
              >
                {m === "pick" ? "Fingerpick" : "Strum"}
              </button>
            ))}
          </div>

          {/* Pace: slow the song down without changing what it is. */}
          <div className="flex min-w-40 flex-1 items-center gap-2">
            <span className="caps shrink-0 text-fg-dim">pace</span>
            <input
              type="range"
              aria-label="Pace"
              className="min-w-0 flex-1"
              min={40}
              max={110}
              step={5}
              value={engine.pace}
              onChange={(e) => engine.setPace(Number(e.target.value))}
            />
            <span className="num shrink-0 text-sm text-fg">
              {engine.pace}% · {engine.effectiveBpm} bpm
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={engine.click}
            onClick={() => engine.setClick(!engine.click)}
            className={`btn !px-3 !py-1.5 text-xs ${engine.click ? "btn-lit" : ""}`}
          >
            Click
          </button>
        </div>
      </div>
    </main>
  );
}
