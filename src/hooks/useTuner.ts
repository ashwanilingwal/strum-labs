"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { detectPitch } from "@/lib/listen/pitch";
import { MicError, openMic, type MicCapture } from "@/lib/listen/mic";
import { centsBetween } from "@/lib/music/tuning";

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

/**
 * Acquire strictly, hold loosely.
 *
 * A decaying string loses periodicity "quality" long before it stops being
 * audible — harmonics decay at different rates and the noise floor grows
 * relative to the signal — so one strict gate reads only the loud first second
 * or two of a five-second note and then blinks out. Acquisition still demands
 * a clean reading; once a note is held, following it only has to clear the
 * lower bar, and a short grace period bridges frames where even that fails.
 */
const ACQUIRE_CLARITY = 0.9;
/**
 * Swept on a synthetic decaying string: 0.9 reads to 1.44s, 0.6 to 1.81s, 0.5
 * to 2.02s. Below 0.7 the occasional wrong frame appears, but those are
 * octave errors — over a thousand cents out — and FOLLOW_CENTS rejects them.
 */
const HOLD_CLARITY = 0.5;
/** A reading this far from the held note is a different string, not drift. */
const FOLLOW_CENTS = 250;
/** How long the display keeps the last reading when frames fail. */
const HOLD_MS = 900;

export type TunerStatus = "off" | "opening" | "listening" | "error";

export function useTuner() {
  const [status, setStatus] = useState<TunerStatus>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [hz, setHz] = useState<number | null>(null);
  /**
   * The last pitch ever accepted, surviving signal loss and stop(). The UI
   * keeps the centre display on this, dimmed, rather than swapping the most
   * prominent thing on screen for a status message every time the note decays
   * between plucks.
   */
  const [lastHz, setLastHz] = useState<number | null>(null);
  const [clarity, setClarity] = useState(0);

  const captureRef = useRef<MicCapture | null>(null);
  const ringRef = useRef(new Float32Array(WINDOW));
  const filledRef = useRef(0);
  const lastRunRef = useRef(0);
  const recentRef = useRef<number[]>([]);
  /** The note currently on screen, readable synchronously from the mic callback. */
  const heldHzRef = useRef<number | null>(null);
  const lastGoodAtRef = useRef(0);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    recentRef.current = [];
    filledRef.current = 0;
    heldHzRef.current = null;
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

        const held = heldHzRef.current;
        const result = detectPitch(ring, sampleRate, held === null ? ACQUIRE_CLARITY : HOLD_CLARITY);

        let accepted: typeof result = null;
        if (result) {
          if (held === null || Math.abs(centsBetween(result.hz, held)) <= FOLLOW_CENTS) {
            accepted = result;
          } else if (result.clarity >= ACQUIRE_CLARITY) {
            // A clean reading far from the held note is a new string being
            // played, not drift — switch to it rather than clinging on.
            recentRef.current = [];
            accepted = result;
          }
        }

        if (accepted) {
          lastGoodAtRef.current = now;
          const recent = recentRef.current;
          recent.push(accepted.hz);
          if (recent.length > SMOOTH_FRAMES) recent.shift();
          const sorted = [...recent].sort((a, b) => a - b);
          const median = sorted[sorted.length >> 1];
          heldHzRef.current = median;
          setHz(median);
          setLastHz(median);
          setClarity(accepted.clarity);
          return;
        }

        // Nothing usable this frame. Keep the last reading briefly rather
        // than blinking, then let go for real.
        if (held !== null && now - lastGoodAtRef.current < HOLD_MS) return;
        heldHzRef.current = null;
        recentRef.current = [];
        setHz(null);
        setClarity(0);
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

  return { status, message, hz, lastHz, clarity, start, stop };
}
