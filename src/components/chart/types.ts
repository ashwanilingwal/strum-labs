/**
 * What a chord chart can be asked to draw, beyond the shape itself.
 *
 * The shape comes from `lib/music/chords.ts` and never changes at render time.
 * Everything here is *transient* — what is happening to that shape right now —
 * which is the axis future features move along:
 *
 *   fingerpicking  -> `sounding` marks the string being plucked this instant,
 *                     `pluck` names the right-hand finger doing it
 *   arpeggios      -> the same, one string at a time
 *   palm muting    -> `damped`
 *   riffs/tab      -> `extraFrets` overrides individual strings without
 *                     inventing a whole chord entry
 *
 * Keeping this separate from `Chord` is deliberate: a chord is a fact about the
 * instrument, an overlay is a fact about the moment. Adding a feature should
 * widen this type, not the chord library.
 */

/** Right-hand fingers, in the standard classical notation. */
export type PluckFinger = "p" | "i" | "m" | "a";

export const PLUCK_LABEL: Record<PluckFinger, string> = {
  p: "thumb",
  i: "index",
  m: "middle",
  a: "ring",
};

export interface ChartOverlay {
  /** String indices (0 = low E) sounding right now. */
  sounding?: number[];
  /**
   * Strings confirmed in tune — drawn green with a tick above the nut.
   *
   * Transient in the same sense as the rest of this type: it is a fact about
   * this tuning session, not about the shape. The tuner is its first user.
   */
  tuned?: number[];
  /** Which right-hand finger plucks which string. */
  pluck?: Partial<Record<number, PluckFinger>>;
  /** Strings deliberately damped on top of the chord's own muted strings. */
  damped?: number[];
  /** Per-string fret overrides, for riffs and passing notes. -1 = don't play. */
  extraFrets?: Partial<Record<number, number>>;
  /**
   * Hammer-ons and pull-offs, drawn as a small arc over the string between the
   * two frets with an H or P label — the standard notation, kept on the chart
   * so the left hand learns where the move happens, not just that it exists.
   */
  arcs?: { string: number; fromFret: number; toFret: number; kind: "hammer" | "pull" }[];
}

export interface ChartOptions {
  /** Draw the fret-number label when the shape sits up the neck. */
  showPosition?: boolean;
  /** Draw finger numbers inside the dots. */
  showFingers?: boolean;
}
