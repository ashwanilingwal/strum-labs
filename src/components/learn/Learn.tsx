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
  { id: "chords", label: "Chords" },
  { id: "patterns", label: "Patterns" },
  { id: "exercises", label: "Exercises" },
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

      <div className="sticky top-0 z-10 border-y border-line bg-ink/95 px-4 py-2.5 backdrop-blur sm:px-8">
        <div className="wrap flex gap-2" role="tablist" aria-label="Learn sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTo(t.id)}
              className={`btn !px-4 !py-1.5 ${tab === t.id ? "btn-lit" : ""}`}
            >
              {t.label}
            </button>
          ))}
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
