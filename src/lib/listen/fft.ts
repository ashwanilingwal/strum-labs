/**
 * Minimal in-place radix-2 FFT.
 *
 * Bundling a DSP library for one transform is not worth 40kB, and the browser
 * has no FFT of its own that returns phase or lets us pick the hop size —
 * AnalyserNode only samples whenever you ask it, which is exactly the timing
 * jitter this whole module exists to avoid.
 */

export class FFT {
  readonly size: number;
  private cos: Float32Array;
  private sin: Float32Array;
  private rev: Uint32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.size = size;
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    // Bit-reversal permutation, precomputed once.
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** Transforms `re`/`im` in place. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = this.cos[k];
          const s = this.sin[k];
          const a = i + j;
          const b = a + half;
          const tre = re[b] * c - im[b] * s;
          const tim = re[b] * s + im[b] * c;
          re[b] = re[a] - tre;
          im[b] = im[a] - tim;
          re[a] += tre;
          im[a] += tim;
        }
      }
    }
  }

  /** Magnitude spectrum of a real signal. Returns size/2 bins. */
  magnitudes(input: Float32Array, out: Float32Array): void {
    const n = this.size;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    re.set(input.subarray(0, n));
    this.transform(re, im);
    for (let i = 0; i < n / 2; i++) {
      out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }
  }
}

export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}
