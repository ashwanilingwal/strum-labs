"use client";

/**
 * The runtime: transport, synth, metronome, microphone and scoring, wired
 * together and exposed to React as plain state.
 *
 * The rule this file follows throughout is that **React never decides when a
 * sound happens**. The transport books every note against the audio clock
 * ahead of time; React is told afterwards, from a rAF loop, purely so the
 * screen can catch up. Anything else drifts audibly within a few bars.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { performSlot } from "@/lib/audio/perform";
import { Transport } from "@/lib/audio/transport";
import { beatSlots, slotSeconds, type Pattern } from "@/lib/music/pattern";
import { OnsetDetector, type Onset, type RoomProfile } from "@/lib/listen/detector";
import { MicError, openMic, type MicCapture } from "@/lib/listen/mic";
import {
  emptyStats, estimateOffsetMs, Scorer,
  type Grade, type SessionStats, type SlotVerdict,
} from "@/lib/listen/scoring";

/** One matched strum, kept for the timing scatter. */
export interface RecentHit {
  errorMs: number;
  grade: Grade;
}
import type { AudioSettings, ListenSettings } from "@/lib/storage/settings";
import type { SamplerState } from "@/lib/audio/sampler";

export type MicStatus = "off" | "opening" | "calibrating" | "listening" | "error";

export interface HeardNote {
  chord: string | null;
  confidence: number;
  stroke: "down" | "up";
  at: number;
}

const CALIBRATION_MS = 2200;

/** How often the screen re-reads the audio clock. See the ui loop below. */
const UI_TICK_MS = 25;

export function useStrumEngine(pattern: Pattern, audio: AudioSettings, listen: ListenSettings) {
  const engine = useMemo(() => getEngine(), []);

  const [playing, setPlaying] = useState(false);
  const [activeSlot, setActiveSlot] = useState(-1);
  const [countIn, setCountIn] = useState(0);

  const [sampleState, setSampleState] = useState<SamplerState>("idle");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomProfile | null>(null);
  const [level, setLevel] = useState(-90);
  // Keyed by slot, holding the whole verdict rather than just its grade: the
  // lane shows the timing error and the chord/stroke checks inline, and
  // widening this later (per-string detail, say) should not need a new channel.
  const [verdicts, setVerdicts] = useState<Record<number, SlotVerdict>>({});
  const [lastVerdict, setLastVerdict] = useState<SlotVerdict | null>(null);
  const [verdictSeq, setVerdictSeq] = useState(0);
  const [recent, setRecent] = useState<RecentHit[]>([]);
  const [stats, setStats] = useState<SessionStats>(emptyStats());
  /** Snapshot taken on stop, so the summary survives the reset. */
  const [summary, setSummary] = useState<SessionStats | null>(null);
  // stop() is a stable callback and cannot read `stats` from its closure, so
  // the latest value is mirrored here.
  const statsRef = useRef<SessionStats>(emptyStats());

  /**
   * The count-in exists to hand you the tempo before the first bar. Once you
   * have it, hearing 4-3-2-1 again on every restart is just a delay between you
   * and the thing you are practising — and restarting is constant while
   * drilling. So it plays on the first start and then stays quiet until
   * something changes what you are counting into: a different pattern, or a
   * different tempo.
   */
  const countedInFor = useRef<string | null>(null);
  const [heard, setHeard] = useState<HeardNote | null>(null);

  // Live copies for the scheduling callbacks, which must not be rebuilt on
  // every render — recreating them would tear down and restart the transport.
  // Written from an effect rather than during render: the audio callbacks only
  // ever run after commit, so a post-render write is soon enough.
  const patternRef = useRef(pattern);
  const audioRef = useRef(audio);
  const listenRef = useRef(listen);
  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  useEffect(() => { listenRef.current = listen; }, [listen]);

  const transportRef = useRef<Transport | null>(null);
  const scorerRef = useRef<Scorer | null>(null);
  const detectorRef = useRef<OnsetDetector | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  /** Slot changes queued against audio time, drained by the rAF loop. */
  const uiQueue = useRef<{ slot: number; time: number }[]>([]);

  // ---- transport ---------------------------------------------------------

  const handleSlot = useCallback(
    ({ slot, cycle, time }: { slot: number; cycle: number; time: number }) => {
      const p = patternRef.current;
      const a = audioRef.current;

      performSlot(engine, p, slot, time, { guitar: a.guitar, click: a.click });
      scorerRef.current?.expect(slot, cycle, time);
      uiQueue.current.push({ slot, time });
    },
    [engine],
  );

  const ensureTransport = useCallback(() => {
    if (!transportRef.current) {
      transportRef.current = new Transport({
        slotCount: patternRef.current.strokes.length,
        slotSeconds: () => slotSeconds(patternRef.current, patternRef.current.bpm),
        now: () => engine.currentTime,
        onSlot: handleSlot,
      });
    }
    return transportRef.current;
  }, [engine, handleSlot]);

  // Tempo and pattern edits take effect on the next scheduled slot.
  useEffect(() => {
    transportRef.current?.update({
      slotCount: pattern.strokes.length,
      slotSeconds: () => slotSeconds(patternRef.current, patternRef.current.bpm),
    });
    scorerRef.current?.update(pattern, pattern.bpm);
  }, [pattern]);

  useEffect(() => {
    engine.setVolume(audio.volume);
    engine.setClickVolume(audio.clickVolume);
    engine.setTone(audio.tone);
  }, [engine, audio.volume, audio.clickVolume, audio.tone]);

  /**
   * Pull the ~2 MB of recordings down once the acoustic tone is in play. It
   * cannot start before the AudioContext exists (decoding needs it), so this
   * is driven by the engine being live rather than by mount.
   */
  const fetchSamples = useCallback(async () => {
    if (audioRef.current.tone === "synth") return;
    if (engine.sampleState === "ready" || engine.sampleState === "loading") return;
    setSampleState("loading");
    await engine.loadSamples();
    setSampleState(engine.sampleState);
  }, [engine]);

  useEffect(() => {
    // Only possible once the AudioContext exists, which needs a user gesture —
    // so this covers switching tone mid-session; the first load is kicked off
    // by start()/startListening() instead.
    if (audio.tone === "synth" || !engine.ready) return;
    let alive = true;
    void (async () => {
      // Yield first: updating state synchronously in an effect body cascades
      // an extra render, and there is nothing to show in that render anyway.
      await Promise.resolve();
      if (alive) await fetchSamples();
    })();
    return () => {
      alive = false;
    };
  }, [audio.tone, engine, fetchSamples]);

  useEffect(() => {
    if (scorerRef.current) scorerRef.current.offsetMs = listen.offsetMs;
  }, [listen.offsetMs]);

  // The app's own guitar reaching the microphone is the single biggest source
  // of phantom strums. "mute" is the only fully reliable answer, so it is the
  // default; the others are opt-in and documented as best-effort.
  const listening = micStatus === "listening";
  useEffect(() => {
    const shouldDuck = listening && listen.duckMode === "mute";
    engine.setGuitarDuck(shouldDuck);
    if (scorerRef.current) {
      scorerRef.current.duckMode = listen.duckMode;
      scorerRef.current.guitarAudible = audio.guitar && !shouldDuck;
    }
  }, [engine, listening, listen.duckMode, audio.guitar]);

  const stop = useCallback(() => {
    transportRef.current?.stop();
    engine.silence();
    uiQueue.current = [];
    setPlaying(false);
    setActiveSlot(-1);
    setCountIn(0);
    // Only worth a summary if the microphone actually judged something.
    if (statsRef.current.hits + statsRef.current.missed > 0) {
      setSummary({ ...statsRef.current });
    }
  }, [engine]);

  const start = useCallback(async () => {
    await engine.init();
    void fetchSamples();
    const p = patternRef.current;
    const a = audioRef.current;
    const beat = 60 / p.bpm;
    const t0 = engine.currentTime + 0.15;
    const signature = `${p.id}:${p.bpm}:${a.countInBars}`;
    const needsCountIn = countedInFor.current !== signature;
    countedInFor.current = signature;
    const countBeats = needsCountIn ? a.countInBars * p.beatsPerBar : 0;

    for (let i = 0; i < countBeats; i++) {
      engine.click(t0 + i * beat, i % p.beatsPerBar === 0);
    }

    scorerRef.current?.reset();
    setVerdicts({});
    setLastVerdict(null);
    setRecent([]);
    setSummary(null);
    statsRef.current = emptyStats();
    setStats(emptyStats());

    const transport = ensureTransport();
    transport.start(t0 + countBeats * beat);
    setPlaying(true);

    if (countBeats > 0) {
      setCountIn(countBeats);
      // Purely cosmetic — the audio for the count-in is already booked.
      for (let i = 0; i < countBeats; i++) {
        const remaining = countBeats - i;
        window.setTimeout(
          () => setCountIn(remaining - 1 > 0 ? remaining - 1 : 0),
          (t0 + i * beat - engine.currentTime) * 1000,
        );
      }
    }
  }, [engine, ensureTransport, fetchSamples]);

  const toggle = useCallback(() => {
    if (playing) stop();
    else void start();
  }, [playing, start, stop]);

  // ---- ui loop: screen catches up to the audio clock ---------------------

  /**
   * Driven by a timer, deliberately not requestAnimationFrame.
   *
   * rAF does not fire at all while the page is hidden, backgrounded or
   * throttled — and the transport keeps scheduling audio regardless, because
   * it runs on the audio clock. The result is a frozen playhead over a running
   * metronome, which reads as "the buttons do nothing".
   *
   * Nothing here is per-frame animation: it drains discrete slot events, sweeps
   * missed notes and samples the input level. The fastest a slot can change is
   * ~68ms (220bpm sixteenths), so a 25ms tick samples every slot two to three
   * times over and costs far less than a frame callback would.
   */
  useEffect(() => {
    if (!playing) return;

    const tick = () => {
      const now = engine.currentTime;

      // Reveal slots at the moment they actually sound.
      let next = -1;
      while (uiQueue.current.length && uiQueue.current[0].time <= now) {
        next = uiQueue.current.shift()!.slot;
      }
      if (next >= 0) {
        setActiveSlot(next);
        // A fresh loop wipes last cycle's marks so the lane reads as "now".
        if (next === 0) setVerdicts({});
      }

      scorerRef.current?.sweep(now);
      const d = detectorRef.current;
      if (d) setLevel(d.levelDb);
    };

    tick();
    const id = setInterval(tick, UI_TICK_MS);
    return () => clearInterval(id);
  }, [playing, engine]);

  // ---- microphone --------------------------------------------------------

  const handleVerdict = useCallback((v: SlotVerdict, s: SessionStats) => {
    if (v.slot >= 0) setVerdicts((prev) => ({ ...prev, [v.slot]: v }));
    statsRef.current = s;
    setStats(s);
    setLastVerdict(v);
    // A monotonic counter drives the flash, not the verdict object: two
    // identical verdicts in a row must still re-trigger the animation.
    setVerdictSeq((n) => n + 1);
    if (v.grade !== "missed" && v.grade !== "extra") {
      setRecent((prev) => [...prev.slice(-15), { errorMs: v.errorMs, grade: v.grade }]);
    }
  }, []);

  const handleOnset = useCallback((o: Onset) => {
    const l = listenRef.current;
    setHeard({
      chord: l.checkChord ? o.chordGuess : null,
      confidence: o.chordConfidence,
      stroke: o.stroke,
      at: o.time,
    });
    scorerRef.current?.hear(o);
  }, []);

  const stopListening = useCallback(() => {
    engine.setGuitarDuck(false);
    captureRef.current?.stop();
    captureRef.current = null;
    detectorRef.current = null;
    scorerRef.current = null;
    setMicStatus("off");
    setMicMessage(null);
    setLevel(-90);
    setVerdicts({});
    setLastVerdict(null);
    setRecent([]);
  }, [engine]);

  const startListening = useCallback(async () => {
    setMicMessage(null);
    setMicStatus("opening");
    try {
      await engine.init();
      void fetchSamples();
      const ctx = engine.context!;
      const detector = new OnsetDetector(ctx.sampleRate, handleOnset);
      detectorRef.current = detector;

      const capture = await openMic(ctx, ({ time, samples }) => {
        detectorRef.current?.push(time, samples);
      });
      captureRef.current = capture;

      const scorer = new Scorer(
        patternRef.current,
        patternRef.current.bpm,
        listenRef.current.offsetMs || estimateOffsetMs(ctx),
        handleVerdict,
      );
      scorer.duckMode = listenRef.current.duckMode;
      scorer.guitarAudible = audioRef.current.guitar && listenRef.current.duckMode !== "mute";
      scorerRef.current = scorer;

      // Measure the room before trusting anything it says.
      setMicStatus("calibrating");
      detector.beginCalibration();
      await new Promise((r) => window.setTimeout(r, CALIBRATION_MS));
      if (detectorRef.current !== detector) return; // torn down mid-calibration
      const profile = detector.endCalibration();
      setRoom(profile);
      detector.reset();
      setMicStatus("listening");
    } catch (err) {
      stopListening();
      setMicStatus("error");
      setMicMessage(err instanceof MicError ? err.message : "The microphone couldn't be started.");
    }
  }, [engine, fetchSamples, handleOnset, handleVerdict, stopListening]);

  const recalibrate = useCallback(async () => {
    const detector = detectorRef.current;
    if (!detector) return;
    setMicStatus("calibrating");
    detector.beginCalibration();
    await new Promise((r) => window.setTimeout(r, CALIBRATION_MS));
    if (detectorRef.current !== detector) return;
    setRoom(detector.endCalibration());
    detector.reset();
    setMicStatus("listening");
  }, []);

  /** Zero out a consistent early/late bias measured from the player's own hits. */
  const absorbBias = useCallback((): number | null => {
    const s = scorerRef.current;
    if (!s || stats.hits < 8) return null;
    const corrected = Math.round(s.offsetMs + stats.meanErrorMs);
    s.offsetMs = corrected;
    return corrected;
  }, [stats.hits, stats.meanErrorMs]);

  useEffect(() => () => {
    transportRef.current?.stop();
    captureRef.current?.stop();
  }, []);

  return {
    playing, activeSlot, countIn, toggle, start, stop,
    micStatus, micMessage, room, level, listening, sampleState,
    startListening, stopListening, recalibrate, absorbBias,
    verdicts, lastVerdict, verdictSeq, recent, stats, heard,
    summary, dismissSummary: () => setSummary(null),
    beats: beatSlots(pattern),
  };
}
