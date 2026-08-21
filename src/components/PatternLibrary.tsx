"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  handDirection, newPatternId, PRESETS, emptyPattern, type Pattern, type Stroke,
} from "@/lib/music/pattern";
import { appStore, type AppState } from "@/lib/storage/settings";
import { touchLocal } from "@/hooks/useAccount";
import { ChromeText } from "./ui/ChromeText";
import { FlowerField } from "./ui/FlowerField";
import { Nav } from "./ui/Nav";

/**
 * Saved patterns as cards, with the stroke grid actually drawn.
 *
 * The settings sheet lists patterns as one line of text each, which is fine for
 * switching between two but useless for recognising one at a glance — the
 * shape of a pattern is the thing you remember, not its name.
 */

const GLYPH: Record<Stroke, string> = { D: "↓", U: "↑", X: "✕", "-": "" };

export function PatternLibrary() {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  const router = useRouter();

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    appStore.set(updater);
    touchLocal();
  }, []);

  const play = (id: string) => {
    setState((s) => ({ ...s, activeId: id }));
    router.push("/play");
  };

  const add = (base: Pattern) => {
    const copy: Pattern = { ...base, id: newPatternId(), name: `${base.name} copy` };
    setState((s) => ({ ...s, patterns: [...s.patterns, copy], activeId: copy.id }));
  };

  const remove = (id: string) =>
    setState((s) => {
      if (s.patterns.length <= 1) return s;
      const patterns = s.patterns.filter((p) => p.id !== id);
      return { ...s, patterns, activeId: s.activeId === id ? patterns[0].id : s.activeId };
    });

  return (
    <main className="block-dark min-h-dvh">
      <Nav />

      <header className="relative flex flex-wrap items-end justify-between gap-4 px-4 pb-6 pt-4 sm:px-8">
        <FlowerField density={0.5} />
        <div className="relative z-10">
          <ChromeText className="text-[clamp(3rem,11vw,7rem)]">Patterns</ChromeText>
          <p className="caps mt-3 text-fg-dim">{state.patterns.length} saved · tap one to practise it</p>
        </div>
        <button type="button" className="btn btn-lit relative z-10" onClick={() => add(emptyPattern())}>
          New pattern
        </button>
      </header>

      <section className="block-light px-4 py-8 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          {state.patterns.map((p) => (
            <article
              key={p.id}
              className="card-flat p-5"
              style={{
                outline: p.id === state.activeId ? "2px solid var(--lilac-500)" : "none",
                outlineOffset: "2px",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl leading-none text-lilac-700">{p.name}</h2>
                <span className="caps text-fg-dim">
                  {p.chords.join(" · ")} · {p.bpm} bpm
                </span>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: p.bars }, (_, bar) => (
                  <div key={bar} className="min-w-0 flex-1">
                    <div className="caps mb-1 text-fg-dim">bar {bar + 1} · {p.chords[bar]}</div>
                    <div
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${p.slotsPerBar}, minmax(0,1fr))` }}
                    >
                      {Array.from({ length: p.slotsPerBar }, (_, i) => {
                        const index = bar * p.slotsPerBar + i;
                        const stroke = p.strokes[index];
                        const dir = handDirection(p.slotsPerBar, p.beatsPerBar, index);
                        const cls =
                          stroke === "D" ? "slot-down" : stroke === "U" ? "slot-up"
                          : stroke === "X" ? "slot-mute" : "slot-skip";
                        return (
                          <div
                            key={index}
                            className={`slot flex h-8 items-center justify-center text-xs font-bold ${cls} ${
                              p.accents.includes(index) ? "slot-accent" : ""
                            }`}
                          >
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
                <button type="button" className="btn btn-lit !px-4 !py-1.5" onClick={() => play(p.id)}>
                  Practise
                </button>
                <button type="button" className="btn !px-4 !py-1.5" onClick={() => add(p)}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn !px-4 !py-1.5"
                  onClick={() => remove(p.id)}
                  disabled={state.patterns.length <= 1}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="caps-lg text-fg">Start from a preset</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn !px-4 !py-1.5" onClick={() => add(p)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
