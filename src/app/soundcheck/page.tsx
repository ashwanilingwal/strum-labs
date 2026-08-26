"use client";

import { useCallback, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { chordById, chordMidiNotes } from "@/lib/music/chords";
import { centresFor, INSTRUMENT_IDS } from "@/lib/audio/samples";

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
