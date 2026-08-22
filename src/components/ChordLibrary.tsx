"use client";

import { useCallback, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { CHORDS, CHORD_TIERS, chordMidiNotes, type ChordTier } from "@/lib/music/chords";
import { appStore } from "@/lib/storage/settings";
import { ChordChart } from "./chart/ChordChart";
import { ChromeText } from "./ui/ChromeText";
import { MotifField } from "./ui/MotifField";
import { Nav } from "./ui/Nav";

/**
 * Every chord the app knows, as a browsable reference.
 *
 * Each card can be strummed with the real recordings — hearing a shape is most
 * of what tells you whether you have fingered it correctly, and until now the
 * only way to hear one was to build a pattern around it.
 */

export function ChordLibrary() {
  const [tier, setTier] = useState<ChordTier | "all">("all");
  const [sounding, setSounding] = useState<string | null>(null);

  const strum = useCallback(async (id: string) => {
    const chord = CHORDS.find((c) => c.id === id);
    if (!chord) return;
    const engine = getEngine();
    await engine.init();
    engine.setTone(appStore.get().audio.tone);
    void engine.loadSamples();
    engine.strum(chordMidiNotes(chord), "down", { gain: 0.75 });
    setSounding(id);
    window.setTimeout(() => setSounding((cur) => (cur === id ? null : cur)), 700);
  }, []);

  const shown = tier === "all" ? CHORDS : CHORDS.filter((c) => c.tier === tier);

  return (
    <main className="block-dark min-h-dvh">
      <Nav />

      <header className="relative px-4 pb-6 pt-4 sm:px-8">
        <MotifField density={0.5} />
        <div className="wrap relative z-10">
          <ChromeText className="text-[clamp(3rem,11vw,7rem)]">Chords</ChromeText>
          <p className="caps mt-3 text-fg-dim">{CHORDS.length} shapes · tap any card to hear it</p>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-y border-line bg-ink/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="wrap flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTier("all")}
            className={`btn !px-4 !py-1.5 ${tier === "all" ? "btn-lit" : ""}`}
          >
            All
          </button>
          {CHORD_TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={`btn !px-4 !py-1.5 ${tier === t.id ? "btn-lit" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <section className="block-light px-4 py-8 sm:px-8">
        <div className="wrap grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.map((chord) => (
            <button
              key={chord.id}
              type="button"
              onClick={() => void strum(chord.id)}
              className="card-flat group flex gap-4 p-4 text-left transition"
              style={{
                outline: sounding === chord.id ? "2px solid var(--accent)" : "none",
                outlineOffset: "2px",
              }}
              aria-label={`Hear ${chord.name}`}
            >
              <div className="w-24 shrink-0 sm:w-26">
                <ChordChart chord={chord} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl leading-none text-chrome-700">{chord.symbol}</div>
                <div className="caps mt-1 text-fg-dim">{chord.name}</div>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{chord.tip}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
