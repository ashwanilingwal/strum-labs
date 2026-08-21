/**
 * Microphone capture.
 *
 * Two things here are counter-intuitive and load-bearing:
 *
 * 1. Every piece of browser audio "enhancement" is switched OFF. Echo
 *    cancellation, noise suppression and auto gain control are tuned for
 *    speech: AGC pumps the level so dynamics vanish, and noise suppression
 *    treats a sustained guitar note as stationary noise and eats it. They make
 *    a guitar measurably harder to analyse, not easier.
 *
 * 2. The AudioWorklet does no analysis. It only forwards raw blocks with the
 *    audio clock time of their first sample. Timestamps are therefore
 *    sample-accurate even if the main thread stalls, which is what lets the
 *    scorer say "38 ms late" honestly. All the DSP lives in plain modules.
 */

const TAP_PROCESSOR = `
class TapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(512);
    this.filled = 0;
    this.chunkStart = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.filled === 0) this.chunkStart = currentTime;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.filled++] = ch[i];
      if (this.filled === this.buf.length) {
        this.port.postMessage({ time: this.chunkStart, samples: this.buf.slice() });
        this.filled = 0;
        this.chunkStart = currentTime + (i + 1) / sampleRate;
      }
    }
    return true;
  }
}
registerProcessor('tap', TapProcessor);
`;

export interface MicBlock {
  /** AudioContext time of the first sample in this block. */
  time: number;
  samples: Float32Array;
}

export type MicErrorKind = "denied" | "unavailable" | "insecure" | "unknown";

export class MicError extends Error {
  kind: MicErrorKind;
  constructor(kind: MicErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface MicCapture {
  sampleRate: number;
  stop: () => void;
}

export async function openMic(ctx: AudioContext, onBlock: (b: MicBlock) => void): Promise<MicCapture> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicError(
      "insecure",
      "The browser won't share a microphone here. This needs https, or localhost.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicError("denied", "Microphone access was blocked. Allow it in the browser's address bar, then try again.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new MicError("unavailable", "No microphone found. Plug one in, or pick a different input in your system settings.");
    }
    throw new MicError("unknown", "The microphone couldn't be opened.");
  }

  const blobUrl = URL.createObjectURL(new Blob([TAP_PROCESSOR], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const source = ctx.createMediaStreamSource(stream);

  // Mains hum and desk rumble live under 70 Hz; the lowest guitar note is 82 Hz.
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 70;
  highpass.Q.value = 0.7;

  // Above ~6 kHz there is nothing but hiss for our purposes.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6000;

  const tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  tap.port.onmessage = (e: MessageEvent<MicBlock>) => onBlock(e.data);

  // A worklet with nothing downstream may never be pulled, so it is connected
  // through a silent gain rather than left dangling. Nothing reaches the
  // speakers, which also means no feedback howl.
  const silent = ctx.createGain();
  silent.gain.value = 0;

  source.connect(highpass).connect(lowpass).connect(tap).connect(silent).connect(ctx.destination);

  return {
    sampleRate: ctx.sampleRate,
    stop() {
      tap.port.onmessage = null;
      try {
        source.disconnect();
        highpass.disconnect();
        lowpass.disconnect();
        tap.disconnect();
        silent.disconnect();
      } catch {
        // Already torn down.
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
