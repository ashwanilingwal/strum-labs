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

/** How long a scheduled click stays on the books for the scorer to consult. */
const CLICK_LOG_SECONDS = 6;

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
  private limiter: DynamicsCompressorNode | null = null;
  private bus: AudioNode | null = null;
  /** Samples bypass the body EQ — the recording already contains a guitar. */
  private sampleBus: GainNode | null = null;
  /** Both guitar paths meet here, so ducking is a single node. */
  private guitarGain: GainNode | null = null;
  private clickBus: GainNode | null = null;
  /** The synthesised drum groove. Inside guitarGain on purpose — see build(). */
  private backingBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sampler: GuitarSampler | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<AudioBufferSourceNode>();
  private liveBacking = new Set<AudioScheduledSourceNode>();
  private voices = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();
  /** Audio times of recently scheduled clicks. See clickTimes. */
  private clicks: number[] = [];
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

  /**
   * The master bus — everything audible passes through it. Exists so
   * diagnostics (and a future level meter) can tap the mix with an analyser;
   * null before init().
   */
  get output(): AudioNode | null {
    return this.limiter;
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

    // A near-limiter after the volume control, as a safety net rather than an
    // effect: the trims keep normal playback under it, but nothing upstream
    // can guarantee every future combination of voices sums below full scale,
    // and the DAC's hard clamp is the worst-sounding limiter there is.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

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

    // Unlike the click, the drums duck WITH the guitar: a drum hit is exactly
    // the broadband transient the onset detector reads as a strum, so when the
    // mic is judging on speakers the backing must go quiet too.
    this.backingBus = ctx.createGain();
    this.backingBus.gain.value = 0.5;
    this.backingBus.connect(this.guitarGain);

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

  /**
   * Move a control bus smoothly but land it exactly.
   *
   * The obvious tool is setTargetAtTime, and it is wrong for controls: the
   * exponential never reaches its target, and measured at the master bus it
   * left a -23 dB ghost of the metronome audible with the click volume at
   * zero. A short linear ramp is equally free of zipper noise and terminates.
   * (Per-note fade-outs keep setTargetAtTime — their sources are stopped
   * moments later, which truncates the tail.)
   */
  private glide(param: AudioParam, v: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + 0.05);
  }

  setVolume(v: number) {
    this._volume = clamp01(v);
    if (this.master) this.glide(this.master.gain, this._volume);
  }

  get volume() {
    return this._volume;
  }

  setClickVolume(v: number) {
    this._clickVolume = clamp01(v);
    if (this.clickBus) this.glide(this.clickBus.gain, this._clickVolume);
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
    if (this.guitarGain) this.glide(this.guitarGain.gain, ducked ? 0 : 1);
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

  /** Half a second of white noise, rendered once — the snare and hat body. */
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  /**
   * One synthesised drum hit for the pattern backing: a pitch-dropping sine
   * kick, band-passed noise over a short tone for the snare, high-passed
   * noise for the hat. Per-note envelopes, so setValueAtTime + ramps are fine
   * here — the control-bus rule (glide only) is about buses, not one-shots.
   */
  drum(at: number, kind: "kick" | "snare" | "hat") {
    if (!this.ctx || !this.backingBus) return;
    const ctx = this.ctx;
    const t = Math.max(at, ctx.currentTime);
    const bus = this.backingBus;

    const keep = (src: AudioScheduledSourceNode, cleanup: () => void) => {
      this.liveBacking.add(src);
      src.onended = () => {
        this.liveBacking.delete(src);
        cleanup();
      };
    };

    if (kind === "kick") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.85, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(bus);
      osc.start(t);
      osc.stop(t + 0.2);
      keep(osc, () => { osc.disconnect(); gain.disconnect(); });
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);

    if (kind === "snare") {
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.8;
      gain.gain.linearRampToValueAtTime(0.5, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      // The drum's note under the rattle.
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(190, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.35, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(og).connect(bus);
      osc.start(t);
      osc.stop(t + 0.1);
      keep(osc, () => { osc.disconnect(); og.disconnect(); });
    } else {
      filter.type = "highpass";
      filter.frequency.value = 6500;
      gain.gain.linearRampToValueAtTime(0.18, t + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    }

    src.connect(filter).connect(gain).connect(bus);
    src.start(t);
    src.stop(t + 0.15);
    keep(src, () => { src.disconnect(); filter.disconnect(); gain.disconnect(); });
  }

  /**
   * When every recent click was scheduled, newest last.
   *
   * The scorer uses this to know exactly when its own metronome was audible:
   * spectral tests alone were leaving the click close enough to a strum to
   * occasionally score as one, and the app has no reason to guess about a
   * sound it played itself.
   */
  get clickTimes(): readonly number[] {
    return this.clicks;
  }

  /** Metronome click. Accented beats are higher and louder. */
  click(at: number, accent = false) {
    if (!this.ctx || !this.clickBus) return;
    const ctx = this.ctx;
    const t = Math.max(at, ctx.currentTime);

    // Logged whether or not anyone is listening — the cost is one number,
    // and the scorer must never miss a click that did sound.
    this.clicks.push(t);
    const cutoff = ctx.currentTime - CLICK_LOG_SECONDS;
    while (this.clicks.length && this.clicks[0] < cutoff) this.clicks.shift();

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
    // Drums booked inside the lookahead window must not survive a stop.
    for (const src of this.liveBacking) {
      try {
        src.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.liveBacking.clear();
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
