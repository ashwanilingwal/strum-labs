"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHORDS, CHORD_TIERS, type ChordTier } from "@/lib/music/chords";
import { previewChord } from "@/lib/audio/preview";
import { ChordChart } from "../chart/ChordChart";
import { PlayCorner } from "./PlayCorner";
import { practiseChord } from "./goPractise";

export function ChordsTab() {
  const router = useRouter();
  const [tier, setTier] = useState<ChordTier | "all">("all");
  const shown = tier === "all" ? CHORDS : CHORDS.filter((c) => c.tier === tier);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTier("all")} className={`btn !px-4 !py-1.5 ${tier === "all" ? "btn-lit" : ""}`}>
          All
        </button>
        {CHORD_TIERS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTier(t.id)} className={`btn !px-4 !py-1.5 ${tier === t.id ? "btn-lit" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((chord) => (
          <div
            key={chord.id}
            className="card-flat block-light relative flex gap-4 p-4"
            onClick={() => void previewChord(chord.id)}
          >
            <PlayCorner label={`Hear ${chord.name}`} onClick={() => void previewChord(chord.id)} />
            <div className="w-24 shrink-0">
              <ChordChart chord={chord} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-2xl leading-none text-chrome-700">{chord.symbol}</div>
              <div className="caps mt-1 text-fg-dim">{chord.name}</div>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">{chord.tip}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  practiseChord(chord.id);
                  router.push("/play");
                }}
                className="btn mt-3 !px-3 !py-1 text-[11px]"
              >
                Practise
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
