"use client";

import { useCallback, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { chordById, chordMidiNotes } from "@/lib/music/chords";
import { centresFor, INSTRUMENT_IDS } from "@/lib/audio/samples";
import { Transport } from "@/lib/audio/transport";
import { attachTap } from "@/lib/listen/mic";

/** Everything the speakers should do, measured at the master bus. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const [lines, setLines] = useState<string[]>([]);

  const run = useCallback(async () => {
    const out: string[] = [];
    const say = (l: string) => { out.push(l); setLines([...out]); };

    const engine = getEngine();
    await engine.init();
    const ctx = engine.context!;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    engine.output!.connect(an);
    const buf = new Float32Array(an.fftSize);

    /** Poll every 10ms for `ms`; return RMS envelope and absolute sample peak. */
    // Timestamps are recorded per sample rather than assumed: the poll loop's
    // real period drifts with main-thread load, and inferring time from index
    // times a nominal 10ms turned scheduling truth into measurement noise.
    let absPeak = 0;
    let stamps: number[] = [];
    const capture = async (ms: number) => {
      const env: number[] = [];
      stamps = [];
      absPeak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) {
          s += buf[i] * buf[i];
          const a = Math.abs(buf[i]);
          if (a > absPeak) absPeak = a;
        }
        env.push(Math.sqrt(s / buf.length));
        stamps.push(performance.now() - t0);
        await sleep(10);
      }
      return env;
    };
    const settle = async () => { engine.silence(); await sleep(350); };
    const peak = (env: number[]) => Math.max(...env);

    const t0 = ctx.currentTime;
    await sleep(120);
    say(`A. context: state=${ctx.state}, clock advanced ${(ctx.currentTime - t0).toFixed(3)}s  ${ctx.currentTime > t0 ? "PASS" : "FAIL"}`);

    const g = chordMidiNotes(chordById("G")!);

    // B. every tone actually makes sound
    for (const tone of [...INSTRUMENT_IDS, "synth"] as const) {
      await settle();
      engine.setTone(tone);
      if (tone !== "synth") {
        await engine.loadSamples();
        say(`B. ${tone}: sampleState=${engine.sampleState} (${centresFor(tone).length} files), usingSamples=${engine.usingSamples}`);
      } else {
        say(`B. synth: sampleState=${engine.sampleState}, usingSamples=${engine.usingSamples}`);
      }
      engine.strum(g, "down", { gain: 0.8 });
      const env = await capture(700);
      const p = peak(env);
      const clip = absPeak > 0.98;
      say(`   strum peak RMS ${p.toFixed(4)}, abs peak ${absPeak.toFixed(3)}  ${p > 0.01 ? (clip ? "CLIPPING" : "PASS") : "FAIL — SILENT"}`);
    }

    // C. muted chuck is short; open strum rings
    await settle();
    engine.setTone("acoustic");
    engine.strum(g, "down", { gain: 0.8, muted: true });
    let env = await capture(600);
    const mutedLate = Math.max(...env.slice(40));
    await settle();
    engine.strum(g, "down", { gain: 0.8 });
    env = await capture(600);
    const openLate = Math.max(...env.slice(40));
    say(`C. after 400ms: muted=${mutedLate.toFixed(4)} vs open=${openLate.toFixed(4)}  ${mutedLate < openLate * 0.5 ? "PASS" : "FAIL — chuck not damped"}`);

    // D. master volume
    await settle();
    engine.setVolume(0);
    // setVolume smooths over ~20ms to avoid zipper noise; give it time to
    // land before judging silence, or the test races the fade.
    await sleep(150);
    engine.strum(g, "down", { gain: 0.8 });
    env = await capture(400);
    const silentPeak = peak(env);
    engine.setVolume(0.75);
    say(`D. volume 0: peak ${silentPeak.toFixed(4)}  ${silentPeak < 0.004 ? "PASS" : "FAIL — not muted"}`);

    // E. click audible; click volume 0 silent
    await settle();
    engine.click(ctx.currentTime + 0.05, true);
    env = await capture(300);
    const clickPeak = peak(env);
    await settle();
    engine.setClickVolume(0);
    await sleep(100);
    engine.click(ctx.currentTime + 0.05, true);
    env = await capture(300);
    const clickMuted = peak(env);
    engine.setClickVolume(0.5);
    say(`E. click peak ${clickPeak.toFixed(4)} ${clickPeak > 0.005 ? "PASS" : "FAIL"}; at volume 0: ${clickMuted.toFixed(4)} ${clickMuted < 0.002 ? "PASS" : "FAIL"}`);

    // F. scheduling accuracy: clicks 300ms apart
    await settle();
    const base = ctx.currentTime + 0.15;
    for (let k = 0; k < 4; k++) engine.click(base + k * 0.3, k === 0);
    env = await capture(1500);
    const thr = Math.max(0.004, peak(env) * 0.25);
    const peaks: number[] = [];
    for (let i = 1; i < env.length - 1; i++) {
      if (env[i] > thr && env[i] >= env[i - 1] && env[i] > env[i + 1] &&
          (!peaks.length || i - peaks[peaks.length - 1] > 10)) peaks.push(i);
    }
    const gaps = peaks.slice(1).map((p, i) => Math.round(stamps[p] - stamps[peaks[i]]));
    const gapsOk = gaps.length === 3 && gaps.every((gap) => Math.abs(gap - 300) <= 40);
    say(`F. click gaps ${gaps.map((x) => x + "ms").join(", ") || "none found"}  ${gapsOk ? "PASS" : "FAIL — expected 3 gaps of ~300ms"}`);

    // G. silence() kills ringing notes
    await settle();
    engine.strum(g, "down", { gain: 0.8 });
    await sleep(200);
    engine.silence();
    await sleep(150);
    env = await capture(250);
    const after = peak(env);
    say(`G. after silence(): ${after.toFixed(4)}  ${after < 0.004 ? "PASS" : "FAIL — still ringing"}`);

    // H. Metronome regularity under load. A real Transport books a click on
    // every slot at 120 bpm eighths while the main thread is stalled on
    // purpose (the way a heavy commit or a GC pause would); the master bus is
    // tapped with the mic's own worklet, so onsets are read to the sample and
    // compared with when each click was booked.
    await settle();
    engine.setClickVolume(0.5);
    const blocks: { time: number; samples: Float32Array }[] = [];
    const detach = await attachTap(ctx, engine.output!, (b) => blocks.push(b));
    const booked: number[] = [];
    const transport = new Transport({
      slotCount: 4,
      slotSeconds: () => 0.25,
      now: () => ctx.currentTime,
      onSlot: (e) => {
        booked.push(e.time);
        engine.click(e.time, e.slot === 0);
      },
    });
    transport.start(ctx.currentTime + 0.2);
    for (const ms of [60, 120, 180, 240, 120, 60]) {
      await sleep(550);
      const until = performance.now() + ms;
      while (performance.now() < until) { /* deliberate stall */ }
    }
    await sleep(500);
    const stoppedAt = ctx.currentTime;
    transport.stop();
    engine.silence();
    await sleep(200);
    detach();
    // Clicks booked inside the lookahead at Stop are cancelled by silence()
    // on purpose; only clicks due before the stop are expected back.
    const due = booked.filter((t) => t < stoppedAt);
    let maxAbs = 0;
    for (const b of blocks) for (let i = 0; i < b.samples.length; i++) maxAbs = Math.max(maxAbs, Math.abs(b.samples[i]));
    const onThr = maxAbs * 0.3;
    const heard: number[] = [];
    let lastOn = -1;
    for (const b of blocks) {
      for (let i = 0; i < b.samples.length; i++) {
        if (Math.abs(b.samples[i]) < onThr) continue;
        const t = b.time + i / ctx.sampleRate;
        if (t - lastOn > 0.1) heard.push(t);
        lastOn = t;
      }
    }
    // heard − booked is a CONSTANT for a healthy graph (the limiter's lookahead
    // delays everything equally, and the loopback probe absorbs it); what
    // must be near zero is the spread around that constant, and the jitter
    // between consecutive clicks.
    const errs = heard.map((t) => {
      let best = Infinity;
      for (const bt of due) if (Math.abs(t - bt) < Math.abs(best)) best = t - bt;
      return best * 1000;
    });
    const sortedErr = [...errs].sort((a, b) => a - b);
    const medErr = sortedErr.length ? sortedErr[sortedErr.length >> 1] : NaN;
    const spread = errs.length ? Math.max(...errs.map((e) => Math.abs(e - medErr))) : NaN;
    const hGaps = heard.slice(1).map((t, i) => (t - heard[i]) * 1000);
    const gapJitter = hGaps.length ? Math.max(...hGaps.map((g) => Math.abs(g - 250))) : NaN;
    const hOk = heard.length === due.length && spread < 3 && gapJitter < 3;
    say(
      `H. metronome under stalls: due ${due.length}, heard ${heard.length}; ` +
      `graph latency ≈ ${medErr.toFixed(2)}ms (constant), spread ±${spread.toFixed(2)}ms; ` +
      `gap jitter max ${gapJitter.toFixed(2)}ms  ${hOk ? "PASS" : "FAIL — a click moved or went missing"}`,
    );

    engine.output!.disconnect(an);
    say("done");
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <button id="run" onClick={() => void run()} style={{ padding: 8, marginBottom: 12 }}>run</button>
      <pre id="out" style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{lines.join("\n")}</pre>
    </main>
  );
}
