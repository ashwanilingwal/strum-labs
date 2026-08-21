/**
 * Sampled guitar playback.
 *
 * Real recordings of a Spanish classical guitar (CC0 — see samples.ts for
 * provenance). Where the synth models a string, this just plays the recording
 * back, resampled by at most one semitone.
 *
 * Two things differ from the synth path on purpose:
 *
 * 1. **No body EQ.** The synth needs a body resonance filter because a raw
 *    Karplus-Strong string has no body. A recording already contains the
 *    guitar, the room and the microphone — running it through the same filter
 *    would be applying the body twice.
 *
 * 2. **Loading is explicit and reported.** ~2 MB has to arrive and be decoded
 *    before the first note. The caller shows that state rather than the app
 *    silently playing nothing on the first press.
 */

import { SAMPLE_CENTRES, SAMPLE_FOR_NOTE, sampleUrl } from "./samples";

export type SamplerState = "idle" | "loading" | "ready" | "error";

export interface SamplePlayOptions {
  at?: number;
  gain?: number;
  /** 0..1. Drives the muted "chuck": shorter and much duller. */
  damping?: number;
  duration?: number;
  pan?: number;
  /**
   * Identifies the physical string. Re-striking a string cuts its previous
   * note, exactly as a real one does — without this, a 5-second low E rings
   * under every subsequent strum and the whole thing turns to mush.
   */
  voice?: number;
}

export class GuitarSampler {
  private buffers = new Map<number, AudioBuffer>();
  private inflight: Promise<void> | null = null;
  private _state: SamplerState = "idle";
  private live = new Set<AudioBufferSourceNode>();
  /** Currently-sounding note per string, for voice stealing. */
  private voices = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();

  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
  ) {}

  get state(): SamplerState {
    return this._state;
  }

  get ready(): boolean {
    return this._state === "ready";
  }

  /** Fetch and decode every sample. Safe to call repeatedly. */
  load(): Promise<void> {
    if (this.inflight) return this.inflight;
    this._state = "loading";

    this.inflight = (async () => {
      try {
        await Promise.all(
          SAMPLE_CENTRES.map(async (centre) => {
            const res = await fetch(sampleUrl(centre));
            if (!res.ok) throw new Error(`${res.status} for ${sampleUrl(centre)}`);
            const bytes = await res.arrayBuffer();
            this.buffers.set(centre, await this.ctx.decodeAudioData(bytes));
          }),
        );
        this._state = "ready";
      } catch {
        // Leave the caller to fall back to the synth; a practice tool that
        // goes silent because a download failed is worse than one that
        // sounds synthetic.
        this._state = "error";
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  /** Nearest sample we actually hold, for notes outside the generated map. */
  private centreFor(midi: number): number | null {
    const mapped = SAMPLE_FOR_NOTE[midi];
    if (mapped !== undefined && this.buffers.has(mapped)) return mapped;
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const centre of this.buffers.keys()) {
      const d = Math.abs(centre - midi);
      if (d < bestDistance) {
        bestDistance = d;
        best = centre;
      }
    }
    return best;
  }

  play(midi: number, opts: SamplePlayOptions = {}): boolean {
    const centre = this.centreFor(Math.round(midi));
    const buffer = centre === null ? undefined : this.buffers.get(centre);
    if (!buffer || centre === null) return false;

    const ctx = this.ctx;
    const at = Math.max(opts.at ?? ctx.currentTime, ctx.currentTime);
    const damping = Math.max(0, Math.min(1, opts.damping ?? 0));

    if (opts.voice !== undefined) this.stealVoice(opts.voice, at);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - centre) / 12);

    const gain = ctx.createGain();
    const peak = (opts.gain ?? 0.7) * (damping > 0.5 ? 0.5 : 1);
    gain.gain.setValueAtTime(0, at);
    // A short ramp rather than a hard start: an instantaneous jump to full
    // gain on a recorded attack produces an audible click.
    gain.gain.linearRampToValueAtTime(peak, at + 0.003);

    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;

    let node: AudioNode = src;
    if (damping > 0.5) {
      // A palm mute kills the highs, not just the length.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      src.connect(lp);
      node = lp;
    }
    node.connect(gain).connect(pan).connect(this.destination);

    const dur = opts.duration ?? (damping > 0.5 ? 0.16 : buffer.duration);
    const end = at + dur;
    gain.gain.setTargetAtTime(0, Math.max(at + 0.02, end - 0.08), 0.035);
    src.start(at);
    src.stop(end + 0.12);

    this.live.add(src);
    if (opts.voice !== undefined) this.voices.set(opts.voice, { src, gain });
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    return true;
  }

  /**
   * Damp whatever this string was playing. A short fade rather than a hard
   * stop: cutting a ringing string dead produces a click, and a real string
   * being re-struck decays over a few milliseconds anyway.
   */
  private stealVoice(voice: number, at: number) {
    const held = this.voices.get(voice);
    if (!held) return;
    this.voices.delete(voice);
    try {
      held.gain.gain.cancelScheduledValues(at);
      held.gain.gain.setTargetAtTime(0, at, 0.012);
      held.src.stop(at + 0.09);
    } catch {
      // Already stopped.
    }
  }

  silence() {
    this.voices.clear();
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }
}
