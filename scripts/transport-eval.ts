/**
 * Does the metronome keep time?
 *
 * The transport is a lookahead scheduler: a coarse timer books every slot at
 * an exact audio time before it falls due. This drives it against a real
 * clock for a few seconds while deliberately stalling the event loop — the
 * way a busy React render or a GC pause would — and checks three things:
 *
 *  1. every slot's booked time is EXACTLY t0 + k·slotSeconds (no drift, no
 *     late-shifting: a slot booked late must still carry its true time),
 *  2. how much lead each slot had when booked (time − now at booking); a
 *     negative lead means the audio engine would have played it late,
 *  3. a tempo change lands on the next slot with no jump or double.
 *
 * Run with: npx tsx scripts/transport-eval.ts
 */

import { Transport } from "../src/lib/audio/transport";

const now = () => performance.now() / 1000;

/** Block the event loop, the way a long render would. */
function stall(ms: number) {
  const until = performance.now() + ms;
  while (performance.now() < until) { /* spin */ }
}

interface Booked { slot: number; cycle: number; time: number; lead: number }

async function runFor(seconds: number, stalls: number[], bpmPlan: (t: number) => number) {
  const booked: Booked[] = [];
  const t0 = now();
  let slotS = 60 / bpmPlan(0) / 2;
  const transport = new Transport({
    slotCount: 8,
    slotSeconds: () => slotS,
    now,
    onSlot: (e) => booked.push({ ...e, lead: e.time - now() }),
  });
  transport.start(t0 + 0.1);
  const stallEvery = seconds / (stalls.length + 1);
  for (let i = 0; i < stalls.length; i++) {
    await new Promise((r) => setTimeout(r, stallEvery * 1000));
    slotS = 60 / bpmPlan(now() - t0) / 2;
    stall(stalls[i]);
  }
  await new Promise((r) => setTimeout(r, stallEvery * 1000));
  transport.stop();
  return { booked, t0: t0 + 0.1 };
}

function report(label: string, booked: Booked[], expected: (k: number) => number) {
  const drift = booked.map((b, k) => (b.time - expected(k)) * 1000);
  const maxDrift = Math.max(...drift.map(Math.abs));
  const leads = booked.map((b) => b.lead * 1000);
  const minLead = Math.min(...leads);
  const late = leads.filter((l) => l < 0).length;
  const dups = new Set(booked.map((b) => `${b.cycle}:${b.slot}`)).size !== booked.length;
  let gapErr = 0;
  for (let k = 1; k < booked.length; k++) {
    const gap = booked[k].time - booked[k - 1].time;
    gapErr = Math.max(gapErr, Math.abs(gap - (expected(k) - expected(k - 1))) * 1000);
  }
  console.log(`\n== ${label} ==`);
  console.log(`slots booked ${booked.length}, duplicates ${dups ? "YES — FAIL" : "none"}`);
  console.log(`booked-time drift vs t0+k·slot: max ${maxDrift.toFixed(3)} ms (must be ~0)`);
  console.log(`inter-slot gap error: max ${gapErr.toFixed(3)} ms (must be ~0)`);
  console.log(
    `lead when booked: min ${minLead.toFixed(0)} ms, ` +
    `${late ? `${late} slot(s) booked AFTER their time — would sound late` : "none late"}`,
  );
}

async function main() {
  // 1. Steady 120 bpm eighths, stalls up to 200 ms — twice the old lookahead.
  {
    const slot = 60 / 120 / 2;
    const { booked, t0 } = await runFor(4, [40, 90, 130, 200], () => 120);
    report("120 bpm, event-loop stalls of 40/90/130/200 ms", booked, (k) => t0 + k * slot);
  }
  // 2. A tempo change mid-run: 90 → 140 bpm. The gap after the change must
  //    be the new one exactly, and no slot may be skipped or doubled.
  {
    const { booked } = await runFor(3, [10], (t) => (t < 1.5 ? 90 : 140));
    const gaps = booked.slice(1).map((b, i) => Math.round((b.time - booked[i].time) * 1000));
    const distinct = [...new Set(gaps)];
    console.log(`\n== tempo change 90 → 140 bpm ==`);
    console.log(`gaps seen (ms): ${distinct.join(", ")}  ${distinct.every((g) => g === 333 || g === 214) ? "PASS — only the two tempos' spacings" : "FAIL — a gap that is neither tempo"}`);
  }
}

void main();
