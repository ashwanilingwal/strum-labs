"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { detectPitch } from "@/lib/listen/pitch";
import { MicError, openMic, type MicCapture } from "@/lib/listen/mic";

/**
 * Microphone -> pitch, for the tuner.
 *
 * Reuses the practice screen's capture wholesale, including the part where
 * every browser "enhancement" is switched off. That matters more here than
 * anywhere else: auto gain control pumps a decaying note's level and noise
 * suppression treats a held string as background hum, and either one is enough
 * to make a needle wander while the guitar sits still.
 *
 * Readings are smoothed over a short window. A raw per-frame result is accurate
 * but visibly jittery, and a needle that twitches is one you cannot tune to —
 * the median rejects the occasional bad frame without adding lag the way an
 * average would.
 */

const WINDOW = 2048;
const ANALYSE_EVERY_MS = 50;
const SMOOTH_FRAMES = 5;

export type TunerStatus = "off" | "opening" | "listening" | "error";

export function useTuner() {
  const [status, setStatus] = useState<TunerStatus>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [hz, setHz] = useState<number | null>(null);
  const [clarity, setClarity] = useState(0);

  const captureRef = useRef<MicCapture | null>(null);
  const ringRef = useRef(new Float32Array(WINDOW));
  const filledRef = useRef(0);
  const lastRunRef = useRef(0);
  const recentRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    recentRef.current = [];
    filledRef.current = 0;
    setStatus("off");
    setHz(null);
    setClarity(0);
    setMessage(null);
  }, []);

  const start = useCallback(async () => {
    setMessage(null);
    setStatus("opening");
    try {
      const engine = getEngine();
      await engine.init();
      const ctx = engine.context!;
      const sampleRate = ctx.sampleRate;

      const capture = await openMic(ctx, ({ samples }) => {
        // Slide the analysis window along by whatever arrived.
        const ring = ringRef.current;
        const take = Math.min(samples.length, WINDOW);
        ring.copyWithin(0, take);
        ring.set(samples.subarray(samples.length - take), WINDOW - take);
        filledRef.current = Math.min(WINDOW, filledRef.current + take);
        if (filledRef.current < WINDOW) return;

        const now = performance.now();
        if (now - lastRunRef.current < ANALYSE_EVERY_MS) return;
        lastRunRef.current = now;

        const result = detectPitch(ring, sampleRate);
        if (!result) {
          recentRef.current = [];
          setHz(null);
          setClarity(0);
          return;
        }

        const recent = recentRef.current;
        recent.push(result.hz);
        if (recent.length > SMOOTH_FRAMES) recent.shift();
        const sorted = [...recent].sort((a, b) => a - b);
        setHz(sorted[sorted.length >> 1]);
        setClarity(result.clarity);
      });

      captureRef.current = capture;
      setStatus("listening");
    } catch (err) {
      stop();
      setStatus("error");
      setMessage(err instanceof MicError ? err.message : "The microphone couldn't be started.");
    }
  }, [stop]);

  useEffect(() => () => captureRef.current?.stop(), []);

  return { status, message, hz, clarity, start, stop };
}
