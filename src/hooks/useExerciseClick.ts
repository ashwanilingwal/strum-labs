"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { Transport } from "@/lib/audio/transport";

/**
 * The optional pace click for exercise mode.
 *
 * Exercises are untimed on principle — the mic confirms each note whenever it
 * arrives, and nothing here changes that. The click is a metronome you opt
 * into once a drill feels easy, to lean the pace faster or slower; scoring
 * never reads it. It starts off and its on/off state is never persisted, so
 * no session opens with a click already running over an untimed game.
 *
 * Scheduling goes through the Transport (lookahead against the audio clock),
 * never React timers. Tempo is read fresh on every tick, so the stepper
 * changes the pace live without restarting the loop.
 */
export function useExerciseClick(bpm: number) {
  const [on, setOn] = useState(false);
  const transportRef = useRef<Transport | null>(null);
  // Mirrored into a ref so the running transport reads the live tempo without
  // being rebuilt (and without a stale closure) on every stepper tap.
  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const stop = useCallback(() => {
    transportRef.current?.stop();
    transportRef.current = null;
    setOn(false);
  }, []);

  const start = useCallback(async () => {
    if (transportRef.current) return;
    const engine = getEngine();
    // The toggle tap is the user gesture the AudioContext needs.
    await engine.init();
    const transport = new Transport({
      slotCount: 4,
      slotSeconds: () => 60 / bpmRef.current,
      now: () => engine.currentTime,
      onSlot: (e) => engine.click(e.time, e.slot === 0),
    });
    transport.start();
    transportRef.current = transport;
    setOn(true);
  }, []);

  // Leaving exercise mode (or the page) takes the click with it.
  useEffect(() => () => transportRef.current?.stop(), []);

  return { on, start, stop };
}
