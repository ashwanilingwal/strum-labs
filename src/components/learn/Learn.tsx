"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChromeText } from "../ui/ChromeText";
import { MotifField } from "../ui/MotifField";
import { Nav } from "../ui/Nav";
import { ChordsTab } from "./ChordsTab";
import { PatternsTab } from "./PatternsTab";
import { ExercisesTab } from "./ExercisesTab";

/**
 * One place to learn from: chords, patterns, exercises. Three tabs instead of
 * three nav destinations — the nav was already at its 320px limit, and tabs
 * cost attention only after you have decided to come learn something.
 *
 * The tab lives in the URL (?tab=) so /chords and /patterns can redirect to
 * the right one and old bookmarks keep working.
 */

const TABS = [
  {
    id: "chords",
    label: "Chords",
    blurb: "Every shape, with fingerings and tips. Tap a card to hear it, or send it to practice.",
  },
  {
    id: "patterns",
    label: "Patterns",
    blurb: "Your strumming patterns. Filter them, hear them, take one to the metronome.",
  },
  {
    id: "exercises",
    label: "Exercises",
    blurb: "A graded path — first sounds to speed work. Drills, technique, and listening games.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function LearnInner() {
  const params = useSearchParams();
  const router = useRouter();

  // The URL is the only source of truth. An earlier version mirrored it into
  // state, and router.replace remounted the Suspense child, which re-read the
  // not-yet-updated URL and snapped the tab straight back.
  const fromUrl = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "chords";

  const switchTo = (id: TabId) => {
    router.replace(`/learn?tab=${id}`, { scroll: false });
  };

  return (
    <main className="block-dark min-h-dvh">
      <Nav />

      <header className="relative px-4 pb-4 pt-2 sm:px-8">
        <MotifField density={0.4} />
        <div className="wrap relative z-10">
          <ChromeText className="block text-[clamp(2.4rem,9vw,5.5rem)]">Learn</ChromeText>
        </div>
      </header>

      {/* Three tiles, not three plain buttons: a newcomer should be able to
          tell what lives behind each before committing a tap. */}
      <div className="px-4 pb-4 sm:px-8">
        <div className="wrap grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Learn sections">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTo(t.id)}
                className="rounded-2xl border p-4 text-left transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "rgba(95,210,242,0.08)" : "transparent",
                }}
              >
                <span
                  className="font-display block text-xl leading-tight"
                  style={{ color: active ? "var(--accent)" : "var(--fg)" }}
                >
                  {t.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-dim">{t.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="block-light px-4 py-6 sm:px-8">
        <div className="wrap">
          {tab === "chords" ? <ChordsTab /> : tab === "patterns" ? <PatternsTab /> : <ExercisesTab />}
        </div>
      </section>
    </main>
  );
}

export function Learn() {
  return (
    <Suspense>
      <LearnInner />
    </Suspense>
  );
}
