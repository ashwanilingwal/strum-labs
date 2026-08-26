"use client";

/**
 * The listening game runtime: microphone -> pitch -> matcher -> next target.
 *
 * The same capture chain as the tuner (enhancements off, worklet timestamps),
 * feeding the pure matcher in lib/listen/noteGame — which is where all the
 * rules live and where they are tested. This hook only wires the plumbing and
 * plays the little confirmation note.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { detectPitch } from "@/lib/listen/pitch";
import { MicError, openMic, type MicCapture } from "@/lib/listen/mic";
import { createMatcher, feed, type NoteMatcher } from "@/lib/listen/noteGame";
import type { NoteTarget } from "@/lib/music/exercises";
import { STANDARD_TUNING, noteName } from "@/lib/music/theory";

const WINDOW = 2048;
const ANALYSE_EVERY_MS = 50;

export type GameStatus = "idle" | "opening" | "listening" | "done" | "error";

export function targetMidi(t: NoteTarget): number {
  return STANDARD_TUNING[t.string] + t.fret;
}

export function useNoteGame(targets: NoteTarget[]) {
  const [status, setStatus] = useState<GameStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);
  const [hits, setHits] = useState(0);
  /** Increments on every hit — the UI keys its green flash off this, so two
   *  hits in a row still flash twice. */
  const [hitSeq, setHitSeq] = useState(0);

  const captureRef = useRef<MicCapture | null>(null);
  const matcherRef = useRef<NoteMatcher | null>(null);
  const indexRef = useRef(0);
  const ringRef = useRef(new Float32Array(WINDOW));
  const filledRef = useRef(0);
  const lastRunRef = useRef(0);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    matcherRef.current = null;
    filledRef.current = 0;
    setStatus("idle");
    setHeard(null);
    setProgress(0);
  }, []);

  const start = useCallback(async () => {
    setMessage(null);
    setStatus("opening");
    setIndex(0);
    setHits(0);
    indexRef.current = 0;
    try {
      const engine = getEngine();
      await engine.init();
      const ctx = engine.context!;
      matcherRef.current = createMatcher(targetMidi(targets[0]), performance.now());

      const capture = await openMic(ctx, ({ samples }) => {
        const ring = ringRef.current;
        const take = Math.min(samples.length, WINDOW);
        ring.copyWithin(0, take);
        ring.set(samples.subarray(samples.length - take), WINDOW - take);
        filledRef.current = Math.min(WINDOW, filledRef.current + take);
        if (filledRef.current < WINDOW) return;

        const now = performance.now();
        if (now - lastRunRef.current < ANALYSE_EVERY_MS) return;
        lastRunRef.current = now;

        const matcher = matcherRef.current;
        if (!matcher) return;
        const result = detectPitch(ring, ctx.sampleRate);
        const fed = feed(matcher, result?.hz ?? null, now);
        setProgress(fed.progress);
        setHeard(fed.heardMidi !== null ? noteName(fed.heardMidi) : null);

        if (fed.hit) {
          setHits((h) => h + 1);
          setHitSeq((n) => n + 1);
          // The reward: the note you just found, an octave up, quietly.
          engine.pluck(matcher.targetMidi + 12, { gain: 0.25, duration: 0.6 });
          const next = indexRef.current + 1;
          if (next >= targets.length) {
            matcherRef.current = null;
            captureRef.current?.stop();
            captureRef.current = null;
            setStatus("done");
          } else {
            indexRef.current = next;
            setIndex(next);
            matcherRef.current = createMatcher(targetMidi(targets[next]), now);
          }
        }
      });

      captureRef.current = capture;
      setStatus("listening");
    } catch (err) {
      stop();
      setStatus("error");
      setMessage(err instanceof MicError ? err.message : "The microphone couldn't be started.");
    }
  }, [targets, stop]);

  useEffect(() => () => captureRef.current?.stop(), []);

  return { status, message, index, progress, heard, hits, hitSeq, start, stop };
}
