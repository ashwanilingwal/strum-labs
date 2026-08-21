/**
 * Guitar + metronome audio.
 *
 * Strings are synthesised with Karplus-Strong rather than sampled: no network
 * requests, no licensing, works offline, and the damping parameter gives a
 * muted "chuck" for free. Web Audio's DelayNode can't host the feedback loop
 * at guitar frequencies (it quantises to the 128-sample render block), so each
 * string is rendered into an AudioBuffer in JS and cached by note+damping.
 *
 * Every method takes an absolute AudioContext time. Nothing here reads the
 * clock to decide *when* — that is the transport's job — which is what keeps
 * the timing rock steady while React re-renders.
 */

import { GuitarSampler, type SamplerState } from "./sampler";
import { isInstrument, type InstrumentId } from "./samples";
import { midiToFreq } from "../music/theory";

/**
 * "acoustic" and "electric" are real CC0 recordings (see samples/index.ts);
 * "synth" is the Karplus-Strong model. A sampled tone falls back to the model
 * while its recordings are still downloading, or if they failed — going silent
 * because a fetch failed would be worse than sounding synthetic.
 */
export type Tone = InstrumentId | "synth";

const BUFFER_SECONDS = 2.6;

export interface PluckOptions {
  at?: number;
  gain?: number;
  /** 0..1. Higher = duller and shorter. 1 is a dead muted string. */
  damping?: number;
  /** Hard cut-off, seconds. */
  duration?: number;
  pan?: number;
  /** Physical string index, for voice stealing. See sampler.ts. */
  voice?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: AudioNode | null = null;
  /** Samples bypass the body EQ — the recording already contains a guitar. */
  private sampleBus: GainNode | null = null;
  /** Both guitar paths meet here, so ducking is a single node. */
  private guitarGain: GainNode | null = null;
  private clickBus: GainNode | null = null;
  private sampler: GuitarSampler | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<AudioBufferSourceNode>();
  private voices = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();
  private _tone: Tone = "acoustic";

  private _volume = 0.75;
  private _clickVolume = 0.5;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get tone(): Tone {
    return this._tone;
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  async init(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.build();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this._volume;
    this.master.connect(ctx.destination);

    // A gentle body resonance so the raw string doesn't sound like a sine sweep.
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 220;
    body.Q.value = 1.1;
    body.gain.value = 4;

    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 3200;
    air.gain.value = -4;

    // Signal graph:
    //   synth  -> body -> air -\
    //                           guitarGain -> master -> destination
    //   sample -> sampleBus ----/
    //   click  -> clickBus ------------------> master
    //
    // The click deliberately sits outside guitarGain: ducking the guitar while
    // the mic listens must not take the metronome with it.
    this.guitarGain = ctx.createGain();
    this.guitarGain.gain.value = 1;
    this.guitarGain.connect(this.master);

    body.connect(air).connect(this.guitarGain);
    this.bus = body;

    this.sampleBus = ctx.createGain();
    this.sampleBus.gain.value = 1;
    this.sampleBus.connect(this.guitarGain);

    this.clickBus = ctx.createGain();
    this.clickBus.gain.value = this._clickVolume;
    this.clickBus.connect(this.master);

    this.sampler = new GuitarSampler(ctx, this.sampleBus);
  }

  /** Kick off the ~2 MB download for the current tone. Idempotent. */
  loadSamples(): Promise<void> {
    if (!this.sampler || !isInstrument(this._tone)) return Promise.resolve();
    return this.sampler.load(this._tone);
  }

  /** Load state of the current tone. "idle" for the synth, which needs none. */
  get sampleState(): SamplerState {
    if (!this.sampler || !isInstrument(this._tone)) return "idle";
    return this.sampler.state(this._tone);
  }

  /** True when the next note will be a real recording rather than the model. */
  get usingSamples(): boolean {
    return isInstrument(this._tone) && (this.sampler?.ready(this._tone) ?? false);
  }

  setVolume(v: number) {
    this._volume = clamp01(v);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
  }

  get volume() {
    return this._volume;
  }

  setClickVolume(v: number) {
    this._clickVolume = clamp01(v);
    if (this.clickBus && this.ctx) this.clickBus.gain.setTargetAtTime(this._clickVolume, this.ctx.currentTime, 0.02);
  }

  get clickVolume() {
    return this._clickVolume;
  }

  setTone(t: Tone) {
    this._tone = t;
    this.buffers.clear();
  }

  /**
   * Duck the guitar without touching the player's volume setting. Used when
   * the microphone is listening, so the app's own playback is not scored as
   * the player's strumming.
   */
  setGuitarDuck(ducked: boolean) {
    if (!this.ctx) return;
    this.guitarGain?.gain.setTargetAtTime(ducked ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  /** Render (and cache) one plucked string. */
  private buffer(midi: number, damping: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${this._tone}:${midi}:${damping.toFixed(2)}`;
    const hit = this.buffers.get(key);
    if (hit) return hit;

    const sr = ctx.sampleRate;
    const freq = midiToFreq(midi);
    const period = Math.max(2, Math.round(sr / freq));
    const length = Math.ceil(sr * BUFFER_SECONDS);
    const buf = ctx.createBuffer(1, length, sr);
    const out = buf.getChannelData(0);

    // Excitation: filtered noise. The electric tone starts brighter and thinner.
    const line = new Float32Array(period);
    let last = 0;
    const colour = this._tone === "electric" ? 0.35 : 0.6;
    for (let i = 0; i < period; i++) {
      const white = Math.random() * 2 - 1;
      last = last * colour + white * (1 - colour);
      line[i] = last;
    }

    // Feedback loop: a two-tap average is a one-pole lowpass, which is exactly
    // the string losing its high harmonics first — the reason a plucked note
    // gets duller as it decays rather than just quieter.
    const decay = this._tone === "electric" ? 0.9975 : 0.996;
    const loss = decay * (1 - damping * 0.16);
    const bright = 0.5 - damping * 0.22;
    let idx = 0;
    let prev = 0;
    for (let i = 0; i < length; i++) {
      const cur = line[idx];
      const filtered = bright * cur + (1 - bright) * prev;
      prev = filtered;
      line[idx] = filtered * loss;
      out[i] = cur;
      idx = (idx + 1) % period;
    }

    this.buffers.set(key, buf);
    return buf;
  }

  pluck(midi: number, opts: PluckOptions = {}) {
    if (!this.ctx || !this.bus) return;

    // Real recording first; the model is the fallback, not the default.
    if (this.usingSamples && this.sampler!.play(this._tone as InstrumentId, midi, opts)) return;

    const ctx = this.ctx;
    const at = Math.max(opts.at ?? ctx.currentTime, ctx.currentTime);
    const damping = clamp01(opts.damping ?? 0);

    if (opts.voice !== undefined) {
      const held = this.voices.get(opts.voice);
      if (held) {
        this.voices.delete(opts.voice);
        try {
          held.gain.gain.cancelScheduledValues(at);
          held.gain.gain.setTargetAtTime(0, at, 0.012);
          held.src.stop(at + 0.09);
        } catch {
          // Already stopped.
        }
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = this.buffer(Math.round(midi), damping);

    // Detune slightly per note so repeated strums don't phase-lock into a
    // machine-gun artefact.
    src.detune.value = (Math.random() - 0.5) * 6;

    const gain = ctx.createGain();
    const peak = (opts.gain ?? 0.7) * (damping > 0.5 ? 0.55 : 1);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.004);

    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;

    src.connect(gain).connect(pan).connect(this.bus);

    const dur = opts.duration ?? (damping > 0.5 ? 0.16 : BUFFER_SECONDS);
    const end = at + dur;
    gain.gain.setTargetAtTime(0, end - 0.06, 0.03);
    src.start(at);
    src.stop(end + 0.1);

    this.live.add(src);
    if (opts.voice !== undefined) this.voices.set(opts.voice, { src, gain });
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
  }

  /**
   * Strum a set of notes. Direction changes the order the strings are struck
   * and the stagger — an up-strum is faster and usually hits fewer strings,
   * which is most of why it sounds different from a down-strum.
   */
  strum(
    midis: number[],
    direction: "down" | "up",
    opts: { at?: number; gain?: number; muted?: boolean; voices?: number[] } = {},
  ) {
    if (!midis.length) return;
    const at = opts.at ?? this.currentTime;
    const muted = opts.muted ?? false;
    // Keep each note paired with its string so reversing for an up-strum does
    // not shuffle the voice assignments.
    const pairs = midis.map((midi, i) => ({ midi, voice: opts.voices?.[i] ?? i }));
    const order = direction === "down" ? pairs : [...pairs].reverse();
    const spread = muted ? 0.004 : direction === "down" ? 0.011 : 0.008;
    const base = opts.gain ?? 0.7;

    order.forEach(({ midi, voice }, i) => {
      // Up-strums lean on the treble strings; downs lean on the bass.
      const positional = direction === "down" ? 1 - i * 0.03 : 0.82 - i * 0.02;
      this.pluck(midi, {
        at: at + i * spread,
        gain: base * positional,
        damping: muted ? 0.95 : 0,
        duration: muted ? 0.14 : undefined,
        pan: (i / Math.max(1, order.length - 1) - 0.5) * 0.35,
        voice,
      });
    });
  }

  /** Metronome click. Accented beats are higher and louder. */
  click(at: number, accent = false) {
    if (!this.ctx || !this.clickBus) return;
    const ctx = this.ctx;
    const t = Math.max(at, ctx.currentTime);

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(accent ? 1650 : 1100, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;

    osc.connect(gain).connect(hp).connect(this.clickBus);
    osc.start(t);
    osc.stop(t + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      hp.disconnect();
    };
  }

  /** Kill everything ringing — used when the transport stops. */
  silence() {
    this.sampler?.silence();
    this.voices.clear();
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.live.clear();
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** One engine per tab. Created lazily so it never runs during SSR. */
let singleton: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
