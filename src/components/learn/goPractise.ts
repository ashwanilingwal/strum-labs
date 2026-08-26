"use client";

/**
 * Hand something to the practice screen. Everything lands in the reserved
 * quick-pick slot, never on a saved pattern — same rule the settings picker
 * follows.
 */

import { quickPattern, QUICK_ID, appStore } from "@/lib/storage/settings";
import type { Pattern } from "@/lib/music/pattern";

export function practiseChord(chordId: string) {
  appStore.set((prev) => {
    const pick = { ...prev.pick, chordId };
    return {
      ...prev,
      mode: "chord",
      pick,
      activeId: QUICK_ID,
      patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? quickPattern("chord", pick) : p)),
    };
  });
}

export function practisePattern(pattern: Pattern) {
  appStore.set((prev) => ({
    ...prev,
    activeId: QUICK_ID,
    patterns: prev.patterns.map((p) => (p.id === QUICK_ID ? { ...pattern, id: QUICK_ID } : p)),
  }));
}
