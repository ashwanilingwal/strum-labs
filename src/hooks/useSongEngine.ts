"use client";

/**
 * Song playback: the same lookahead transport as practice, driving individual
 * plucks instead of pattern slots. No microphone, no scoring — a song page is
 * for following along, and the practice screen already owns judging.
 *
 * Hammer-ons and pull-offs are approximated the honest way the synth allows:
 * the first note is picked, the second sounds on the same string voice at
 * lower gain half a slot later — voice stealing damps the first exactly as a
 * finger landing on (or leaving) the fret would.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getEngine } from "@/lib/audio/engine";
import { Transport } from "@/lib/audio/transport";
import { chordById, chordMidiNotes } from "@/lib/music/chords";
import {
  pickMidi, songBars, songStrum, type Song, type SongBar,
} from "@/lib/music/songs";
import { STANDARD_TUNING } from "@/lib/music/theory";
import { appStore } from "@/lib/storage/settings";
import { isInstrument } from "@/lib/audio/samples";
import type { Tone } from "@/lib/audio/engine";

export type SongMode = "pick" | "strum";

const UI_TICK_MS = 25;

export function useSongEngine(song: Song) {
  const engine = useMemo(() => getEngine(), []);
  // Subscribed, not a one-off read — the tone select must re-render when the
  // store changes, including changes made from the settings sheet.
  const app = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getServerSnapshot);
  const bars = useMemo(() => songBars(song), [song]);
  const strum = useMemo(() => songStrum(song), [song]);
  const totalSlots = bars.length * song.slotsPerBar;

  const [playing, setPlaying] = useState(false);
  const [activeSlot, setActiveSlot] = useState(-1);
  const [mode, setMode] = useState<SongMode>("pick");
  /** Percent of the song's own tempo. 100 = as written. */
  const [pace, setPace] = useState(100);
  const [click, setClick] = useState(true);

  const modeRef = useRef(mode);
  const paceRef = useRef(pace);
  const clickRef = useRef(click);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { paceRef.current = pace; }, [pace]);
  useEffect(() => { clickRef.current = click; }, [click]);

  const transportRef = useRef<Transport | null>(null);
  const uiQueue = useRef<{ slot: number; time: number }[]>([]);

  const slotSeconds = useCallback(
    () => (60 / (song.bpm * (paceRef.current / 100))) * (song.beatsPerBar / song.slotsPerBar),
    [song],
  );

  const handleSlot = useCallback(
    ({ slot, time }: { slot: number; time: number }) => {
      const barIndex = Math.floor(slot / song.slotsPerBar);
      const inBar = slot % song.slotsPerBar;
      const barData: SongBar | undefined = bars[barIndex];
      if (!barData) return;

      const perBeat = song.slotsPerBar / song.beatsPerBar;
      if (clickRef.current && inBar % perBeat === 0) {
        engine.click(time, inBar === 0);
      }

      if (modeRef.current === "strum") {
        const stroke = strum.strokes[inBar];
        if (stroke === "D" || stroke === "U" || stroke === "X") {
          const chord = chordById(barData.chordId);
          if (chord) {
            engine.strum(chordMidiNotes(chord), stroke === "U" ? "up" : "down", {
              at: time,
              gain: strum.accents.includes(inBar) ? 0.85 : 0.62,
              muted: stroke === "X",
            });
          }
        }
      } else {
        const step = barData.picking[inBar];
        if (step) {
          const half = slotSeconds() / 2;
          if (step.art && step.fromFret !== undefined) {
            const base = STANDARD_TUNING[step.string];
            const chordFret = chordById(barData.chordId)?.frets[step.string] ?? 0;
            const low = base + step.fromFret;
            const high = base + chordFret;
            const first = step.art === "hammer" ? low : high;
            const second = step.art === "hammer" ? high : low;
            engine.pluck(first, { at: time, gain: 0.6, voice: step.string });
            // The legato note: same string voice, no pick attack to speak of.
            engine.pluck(second, { at: time + half, gain: 0.38, voice: step.string });
          } else {
            const midi = pickMidi(barData.chordId, step);
            if (midi !== null) engine.pluck(midi, { at: time, gain: 0.6, voice: step.string });
          }
        }
      }

      uiQueue.current.push({ slot, time });
    },
    [bars, engine, slotSeconds, song, strum],
  );

  const stop = useCallback(() => {
    transportRef.current?.stop();
    engine.silence();
    uiQueue.current = [];
    setPlaying(false);
    setActiveSlot(-1);
  }, [engine]);

  const start = useCallback(async (fromSlot = 0) => {
    await engine.init();
    // The song page shares the app-wide tone; changing it here writes back.
    const tone = appStore.get().audio.tone;
    engine.setTone(tone);
    if (isInstrument(tone)) void engine.loadSamples();

    if (!transportRef.current) {
      transportRef.current = new Transport({
        slotCount: totalSlots,
        slotSeconds,
        now: () => engine.currentTime,
        onSlot: handleSlot,
      });
    } else {
      transportRef.current.update({ slotCount: totalSlots, slotSeconds, onSlot: handleSlot });
    }
    transportRef.current.start(undefined, fromSlot);
    setPlaying(true);
  }, [engine, handleSlot, slotSeconds, totalSlots]);

  /**
   * Begin playback at a chosen bar — the practice move a long song needs:
   * nobody drills the outro by sitting through five sections to reach it.
   * Works stopped or mid-play; playing simply restarts from the new spot.
   */
  const startFromBar = useCallback(
    (barIndex: number) => {
      transportRef.current?.stop();
      engine.silence();
      uiQueue.current = [];
      setActiveSlot(barIndex * song.slotsPerBar);
      void start(barIndex * song.slotsPerBar);
    },
    [engine, song.slotsPerBar, start],
  );

  /** Switch instrument mid-song; persists to the app-wide setting. */
  const setTone = useCallback(
    (tone: Tone) => {
      appStore.set((prev) => ({ ...prev, audio: { ...prev.audio, tone } }));
      engine.setTone(tone);
      if (isInstrument(tone)) void engine.loadSamples();
    },
    [engine],
  );

  const toggle = useCallback(() => {
    if (playing) stop();
    else void start();
  }, [playing, start, stop]);

  // Screen catches up to the audio clock. A timer, never rAF — see AGENTS.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const now = engine.currentTime;
      let next = -1;
      while (uiQueue.current.length && uiQueue.current[0].time <= now) {
        next = uiQueue.current.shift()!.slot;
      }
      if (next >= 0) setActiveSlot(next);
    };
    tick();
    const id = setInterval(tick, UI_TICK_MS);
    return () => clearInterval(id);
  }, [playing, engine]);

  useEffect(() => () => {
    transportRef.current?.stop();
  }, []);

  const activeBar = activeSlot >= 0 ? Math.floor(activeSlot / song.slotsPerBar) : -1;
  const activeStep = activeSlot >= 0 ? activeSlot % song.slotsPerBar : -1;

  return {
    playing, toggle, stop, startFromBar, setTone,
    tone: app.audio.tone,
    activeSlot, activeBar, activeStep,
    mode, setMode, pace, setPace, click, setClick,
    bars,
    effectiveBpm: Math.round(song.bpm * (pace / 100)),
  };
}
