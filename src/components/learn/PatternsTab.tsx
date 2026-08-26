"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  emptyPattern, handDirection, newPatternId, type Pattern, type Stroke,
} from "@/lib/music/pattern";
import { appStore, QUICK_ID, type AppState } from "@/lib/storage/settings";
import { touchLocal } from "@/hooks/useAccount";
import { previewPattern } from "@/lib/audio/preview";
import { PlayCorner } from "./PlayCorner";

/**
 * The pattern shelf. Browse, filter, hear, duplicate, take to practice.
 *
 * No delete here, deliberately: this tab is for finding something to play, and
 * removal lives in the settings sheet where managing the list already does.
 * Filters exist because the list only grows — by bars, and by chord used.
 */

const GLYPH: Record<Stroke, string> = { D: "↓", U: "↑", X: "✕", "-": "" };

/** The canonical hydration flag: false on the server, true after mount. */
const emptySubscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(emptySubscribe, () => true, () => false);

export function PatternsTab() {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  /**
   * Rendered client-only, deliberately. This tab draws localStorage-backed
   * state the server cannot know, and hydrating server HTML against it stalled
   * the whole page's Suspense boundary — silently, no console error, React
   * simply never attached. Bisected to this tab's card list; a subtree the
   * server never renders cannot mismatch.
   */
  const hydrated = useHydrated();
  const router = useRouter();
  const [barsFilter, setBarsFilter] = useState<number | null>(null);
  const [chordFilter, setChordFilter] = useState<string>("all");

  const setState = (updater: (prev: AppState) => AppState) => {
    appStore.set(updater);
    touchLocal();
  };

  const listed = state.patterns.filter((p) => p.id !== QUICK_ID);
  const chordOptions = useMemo(
    () => Array.from(new Set(listed.flatMap((p) => p.chords))).sort(),
    [listed],
  );
  const shown = listed.filter(
    (p) =>
      (barsFilter === null || p.bars === barsFilter) &&
      (chordFilter === "all" || p.chords.includes(chordFilter)),
  );

  if (!hydrated) return null;

  const add = (base: Pattern) => {
    const copy: Pattern = { ...base, id: newPatternId(), name: `${base.name} copy` };
    setState((s) => ({ ...s, patterns: [...s.patterns, copy], activeId: copy.id }));
  };

  const play = (id: string) => {
    setState((s) => ({ ...s, activeId: id }));
    router.push("/play");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {[null, 1, 2, 4].map((n) => (
          <button
            key={String(n)}
            type="button"
            onClick={() => setBarsFilter(n)}
            className={`btn !px-4 !py-1.5 ${barsFilter === n ? "btn-lit" : ""}`}
          >
            {n === null ? "All" : `${n} bar${n > 1 ? "s" : ""}`}
          </button>
        ))}
        <select
          value={chordFilter}
          onChange={(e) => setChordFilter(e.target.value)}
          className="btn !px-3 !py-1.5"
          aria-label="Filter by chord"
        >
          <option value="all">Any chord</option>
          {chordOptions.map((c) => (
            <option key={c} value={c}>uses {c}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-lit ml-auto !px-4 !py-1.5"
          onClick={() => {
            add(emptyPattern());
            router.push("/play");
          }}
        >
          New pattern
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {shown.map((p) => (
          <article
            key={p.id}
            className="card-flat block-light relative p-5"
            onClick={() => void previewPattern(p)}
          >
            <PlayCorner label={`Hear ${p.name}`} onClick={() => void previewPattern(p)} />
            <div className="flex flex-wrap items-baseline justify-between gap-2 pr-8">
              <h2 className="font-display text-2xl leading-none text-chrome-700">{p.name}</h2>
              <span className="caps text-fg-dim">{p.chords.join(" · ")} · {p.bpm} bpm</span>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {Array.from({ length: p.bars }, (_, barIdx) => (
                <div key={barIdx} className="min-w-0 flex-1" style={{ minWidth: p.slotsPerBar * 22 }}>
                  <div className="caps mb-1 text-fg-dim">bar {barIdx + 1} · {p.chords[barIdx]}</div>
                  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${p.slotsPerBar}, minmax(0,1fr))` }}>
                    {Array.from({ length: p.slotsPerBar }, (_, i) => {
                      const index = barIdx * p.slotsPerBar + i;
                      const stroke = p.strokes[index];
                      const dir = handDirection(p.slotsPerBar, p.beatsPerBar, index);
                      const cls =
                        stroke === "D" ? "slot-down" : stroke === "U" ? "slot-up"
                        : stroke === "X" ? "slot-mute" : "slot-skip";
                      return (
                        <div key={index} className={`slot flex h-8 items-center justify-center text-xs font-bold ${cls} ${p.accents.includes(index) ? "slot-accent" : ""}`}>
                          <span className={stroke === "-" ? "opacity-30" : ""}>
                            {stroke === "-" ? (dir === "down" ? "↓" : "↑") : GLYPH[stroke]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-lit !px-4 !py-1.5" onClick={(e) => { e.stopPropagation(); play(p.id); }}>
                Practise
              </button>
              <button type="button" className="btn !px-4 !py-1.5" onClick={(e) => { e.stopPropagation(); add(p); }}>
                Duplicate
              </button>
            </div>
          </article>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-fg-dim">Nothing matches those filters.</p>
      ) : null}
    </div>
  );
}
