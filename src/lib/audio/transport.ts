/**
 * The transport: a lookahead scheduler.
 *
 * setInterval/setTimeout are far too jittery to place notes with (10-50ms of
 * slop, and they stall completely in a background tab). The standard fix is
 * to let a coarse timer run ahead of the clock and schedule any slot falling
 * inside the next window at an exact AudioContext time. The timer being late
 * then costs nothing, because the events were already booked.
 *
 * The transport owns no audio and no React state. It emits scheduled slots
 * with the audio time they will sound; the caller decides what to do with them.
 */

/**
 * How far ahead slots are booked. Measured with scripts/transport-eval.ts:
 * the booked TIMES never drift, but a slot booked after its own time still
 * sounds late, and at 0.12 s a single 200 ms main-thread stall — one heavy
 * React commit, one GC pause — booked a slot 63 ms late. 0.3 s rides out
 * anything short of a frozen tab. The cost is that a sound booked inside the
 * window outlives a Stop by up to 300 ms, which engine.silence() now cancels.
 */
const LOOKAHEAD_S = 0.3;
const TICK_MS = 20;

export interface SlotEvent {
  /** Index into pattern.strokes. */
  slot: number;
  /** How many times the loop has run since start. */
  cycle: number;
  /** AudioContext time this slot lands on. */
  time: number;
}

export interface TransportOptions {
  /** Total slots in the loop. */
  slotCount: number;
  /** Seconds per slot. Read fresh on every tick, so tempo changes are live. */
  slotSeconds: () => number;
  now: () => number;
  onSlot: (e: SlotEvent) => void;
}

export class Transport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private nextSlot = 0;
  private cycle = 0;
  private startedAt = 0;
  private opts: TransportOptions;

  constructor(opts: TransportOptions) {
    this.opts = opts;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  update(patch: Partial<TransportOptions>) {
    this.opts = { ...this.opts, ...patch };
  }

  /**
   * `startAt` is an absolute audio time — used to leave room for a count-in.
   * `fromSlot` begins the loop mid-way, for playing a song from a chosen bar.
   */
  start(startAt?: number, fromSlot = 0) {
    if (this.timer) return;
    this.nextSlot = fromSlot % this.opts.slotCount;
    this.cycle = 0;
    // A small offset so the very first slot is scheduled, not played late.
    this.startedAt = Math.max(startAt ?? 0, this.opts.now() + 0.08);
    this.nextTime = this.startedAt;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const horizon = this.opts.now() + LOOKAHEAD_S;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      this.opts.onSlot({ slot: this.nextSlot, cycle: this.cycle, time: this.nextTime });
      this.nextTime += this.opts.slotSeconds();
      this.nextSlot += 1;
      if (this.nextSlot >= this.opts.slotCount) {
        this.nextSlot = 0;
        this.cycle += 1;
      }
    }
  }

  /**
   * Fractional slot position right now, for the playhead. Derived from the
   * audio clock rather than counted in React, so the needle never drifts from
   * what you hear.
   */
  position(): number {
    if (!this.timer) return -1;
    const elapsed = this.opts.now() - this.startedAt;
    if (elapsed < 0) return -1;
    const pos = elapsed / this.opts.slotSeconds();
    return pos % this.opts.slotCount;
  }

  /** When a given slot of the current cycle sounds. Used by the mic scorer. */
  startTime(): number {
    return this.startedAt;
  }
}
