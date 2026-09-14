/**
 * Chord shapes.
 *
 * `frets` is always 6 entries, low E first. -1 = string not played, 0 = open.
 * `fingers` matches it: 0 = open/unused, 1..4 = index..pinky.
 *
 * Two derived things matter downstream and are computed, never stored:
 *   - MIDI notes, for the synth (what the strum should sound like)
 *   - pitch classes, for the microphone's chord matcher (what it should hear)
 * Keeping them derived means adding a chord is one literal, not three.
 */

import { midiForFret, pitchClassOf, type PitchClass } from "./theory";

export type ChordTier = "open" | "barre" | "colour";

export interface Chord {
  id: string;
  /** What's printed on the vinyl label, e.g. "Am7". */
  symbol: string;
  name: string;
  frets: number[];
  fingers: number[];
  /** Lowest fret drawn in the diagram. 1 = at the nut. */
  baseFret: number;
  barre?: { fret: number; from: number; to: number; finger: number };
  tier: ChordTier;
  tip: string;
  /**
   * Other shapes the microphone accepts as this chord. The diagram and the
   * synth use `frets`; the matcher templates every voicing. Real players do
   * not stick to the diagram: a recorded G was the 320033 shape (D on the B
   * string, no B3) and matched G5 over the 320003 template at full confidence.
   */
  voicings?: number[][];
}

export const CHORDS: Chord[] = [
  // ---- open majors ----
  { id: "C", symbol: "C", name: "C major", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, tier: "open", tip: "Keep the ring finger anchored — it's the pivot into Am and Em.", voicings: [[0, 3, 2, 0, 1, 0]] },
  { id: "A", symbol: "A", name: "A major", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, tier: "open", tip: "Three fingers crammed into one fret. Roll them slightly so the high E rings." },
  { id: "G", symbol: "G", name: "G major", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4], baseFret: 1, tier: "open", tip: "Use ring and pinky on the outer strings — it makes G to C almost free.", voicings: [[3, 2, 0, 0, 3, 3]] },
  { id: "E", symbol: "E", name: "E major", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, tier: "open", tip: "The shape every barre chord is built from. Learn it with fingers 2-3-1, not 1-2-3." },
  { id: "D", symbol: "D", name: "D major", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, tier: "open", tip: "Don't hit the low E. Aim the strum at the D string.", voicings: [[-1, 0, 0, 2, 3, 2]] },
  // ---- open minors ----
  { id: "Am", symbol: "Am", name: "A minor", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, tier: "open", tip: "Same shape as E major moved across one string." },
  { id: "Em", symbol: "Em", name: "E minor", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, tier: "open", tip: "Two fingers, all six strings. The easiest full chord on the guitar." },
  { id: "Dm", symbol: "Dm", name: "D minor", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, tier: "open", tip: "The pinky-free cousin of D. Watch that the high E doesn't get muted." },
  // ---- dominant sevenths ----
  { id: "A7", symbol: "A7", name: "A dominant 7th", frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], baseFret: 1, tier: "open", tip: "A with the G string opened up. Instantly bluesy." },
  { id: "D7", symbol: "D7", name: "D dominant 7th", frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1, tier: "open", tip: "Leans hard towards G. Use it as the last bar before a G." },
  { id: "E7", symbol: "E7", name: "E dominant 7th", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1, tier: "open", tip: "Lift one finger off E major and you're there." },
  { id: "G7", symbol: "G7", name: "G dominant 7th", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1, tier: "open", tip: "The chord that pulls you back to C." },
  { id: "B7", symbol: "B7", name: "B dominant 7th", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1, tier: "open", tip: "Awkward the first fifty times. Essential in E-key blues." },
  { id: "C7", symbol: "C7", name: "C dominant 7th", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1, tier: "open", tip: "C with the pinky added. Sets up an F." },
  // ---- sevenths, soft ----
  { id: "Am7", symbol: "Am7", name: "A minor 7th", frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1, tier: "open", tip: "Am with the ring finger lifted. Two fingers, much smokier." },
  { id: "Em7", symbol: "Em7", name: "E minor 7th", frets: [0, 2, 2, 0, 3, 0], fingers: [0, 1, 2, 0, 4, 0], baseFret: 1, tier: "open", tip: "Em plus the pinky on B. Or just play Em and lift a finger." },
  { id: "Dm7", symbol: "Dm7", name: "D minor 7th", frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], baseFret: 1, tier: "open", tip: "One finger flattened across the top two strings." },
  { id: "Cmaj7", symbol: "Cmaj7", name: "C major 7th", frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1, tier: "colour", tip: "C with the index lifted. Dreamy rather than resolved." },
  { id: "Fmaj7", symbol: "Fmaj7", name: "F major 7th", frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1, tier: "colour", tip: "The four-string escape hatch from the F barre chord." },
  // ---- suspensions and colour ----
  { id: "Dsus4", symbol: "Dsus4", name: "D suspended 4th", frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1, tier: "colour", tip: "Add the pinky to D and take it off again. That wobble is the whole trick." },
  { id: "Dsus2", symbol: "Dsus2", name: "D suspended 2nd", frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1, tier: "colour", tip: "D with the high E opened. Airy and unresolved." },
  { id: "Asus2", symbol: "Asus2", name: "A suspended 2nd", frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1, tier: "colour", tip: "Neither major nor minor — there's no third in it." },
  { id: "Asus4", symbol: "Asus4", name: "A suspended 4th", frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, tier: "colour", tip: "Tense. Drop the pinky back to A and it exhales." },
  { id: "Esus4", symbol: "Esus4", name: "E suspended 4th", frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], baseFret: 1, tier: "colour", tip: "One finger added to E major." },
  { id: "Cadd9", symbol: "Cadd9", name: "C add 9", frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], baseFret: 1, tier: "colour", tip: "The pop-song C. Keeps ring and pinky planted so G is one move away." },
  { id: "Gsus4", symbol: "Gsus4", name: "G suspended 4th", frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4], baseFret: 1, tier: "colour", tip: "Big and ringing. Good as the bar before a G." },
  // ---- barre ----
  { id: "F", symbol: "F", name: "F major", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Roll the index onto its bony edge. Squeezing harder is not the answer." },
  { id: "Bm", symbol: "Bm", name: "B minor", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barre: { fret: 2, from: 1, to: 5, finger: 1 }, tier: "barre", tip: "Am shape barred at the 2nd fret. Skip the low E entirely." },
  { id: "Bb", symbol: "Bb", name: "B flat major", frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, barre: { fret: 1, from: 1, to: 5, finger: 1 }, tier: "barre", tip: "The A shape barred at the 1st fret." },
  { id: "F#m", symbol: "F#m", name: "F sharp minor", frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barre: { fret: 2, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Em shape barred at the 2nd fret. The relative minor of A." },
  // ---- more barre shapes: the movable families across common roots ----
  { id: "B", symbol: "B", name: "B major", frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, barre: { fret: 2, from: 1, to: 5, finger: 1 }, tier: "barre", tip: "The A shape moved up two frets. The barre's tip mutes the low E for you." },
  { id: "F#", symbol: "F#", name: "F sharp major", frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barre: { fret: 2, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "The E shape barred at the 2nd fret. If F works, this works." },
  { id: "Fm", symbol: "Fm", name: "F minor", frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Em shape at the 1st fret. One finger fewer than F major." },
  { id: "Gm", symbol: "Gm", name: "G minor", frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barre: { fret: 3, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Em shape at the 3rd fret. Higher up, the frets get closer and kinder." },
  { id: "G#m", symbol: "G#m", name: "G sharp minor", frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barre: { fret: 4, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Em shape at the 4th fret. The relative minor of B." },
  { id: "Cm", symbol: "Cm", name: "C minor", frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barre: { fret: 3, from: 1, to: 5, finger: 1 }, tier: "barre", tip: "Am shape at the 3rd fret. Skip the low E entirely." },
  { id: "C#m", symbol: "C#m", name: "C sharp minor", frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barre: { fret: 4, from: 1, to: 5, finger: 1 }, tier: "barre", tip: "Am shape at the 4th fret. Everywhere in pop, straight after an E." },
  { id: "F7", symbol: "F7", name: "F dominant 7th", frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "E7 shape barred. Bluesier and slightly easier than the full F." },
  { id: "F#m7", symbol: "F#m7", name: "F sharp minor 7th", frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1, barre: { fret: 2, from: 0, to: 5, finger: 1 }, tier: "barre", tip: "Em7 shape barred at the 2nd. Two fingers, big sound." },

  // ---- more open sevenths and colour ----
  { id: "Bm7", symbol: "Bm7", name: "B minor 7th", frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3], baseFret: 1, tier: "open", tip: "The friendly stand-in for Bm — no barre, airy open strings." },
  { id: "Amaj7", symbol: "Amaj7", name: "A major 7th", frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1, tier: "colour", tip: "A with the lights dimmed. Gorgeous before a D." },
  { id: "Dmaj7", symbol: "Dmaj7", name: "D major 7th", frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1, tier: "colour", tip: "One flat finger can barre all three. Summer in a chord." },
  { id: "Gmaj7", symbol: "Gmaj7", name: "G major 7th", frets: [3, 2, 0, 0, 0, 2], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1, tier: "colour", tip: "G with the top softened. Try it where a G feels too plain." },
  { id: "A7sus4", symbol: "A7sus4", name: "A 7th suspended 4th", frets: [-1, 0, 2, 0, 3, 0], fingers: [0, 0, 2, 0, 3, 0], baseFret: 1, tier: "colour", tip: "Two fingers and endless suspension. The classic intro-riff chord." },

  // ---- slash chords: same chords, different floor ----
  { id: "D/F#", symbol: "D/F#", name: "D over F sharp", frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3], baseFret: 1, tier: "colour", tip: "D with F# underneath — many players hook the thumb over for the bass." },
  { id: "G/B", symbol: "G/B", name: "G over B", frets: [-1, 2, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4], baseFret: 1, tier: "colour", tip: "The walking step between C and Am. Bass lines love it." },
  { id: "C/G", symbol: "C/G", name: "C over G", frets: [3, 3, 2, 0, 1, 0], fingers: [3, 4, 2, 0, 1, 0], baseFret: 1, tier: "colour", tip: "C with a G floor. Fuller than plain C when it ends a song." },

  // ---- power ----
  { id: "G5", symbol: "G5", name: "G power chord", frets: [3, 5, 5, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0], baseFret: 1, tier: "colour", tip: "The movable two-finger shape. Slide it anywhere and it keeps its name." },
  { id: "C5", symbol: "C5", name: "C power chord", frets: [-1, 3, 5, 5, -1, -1], fingers: [0, 1, 3, 4, 0, 0], baseFret: 1, tier: "colour", tip: "Same shape, A-string root. Mute the rest with lazy fingers." },
  { id: "D5", symbol: "D5", name: "D power chord", frets: [-1, 5, 7, 7, -1, -1], fingers: [0, 1, 3, 4, 0, 0], baseFret: 1, tier: "colour", tip: "Further up the same rails. Watch the diagram's fret marker." },

  { id: "E5", symbol: "E5", name: "E power chord", frets: [0, 2, 2, -1, -1, -1], fingers: [0, 1, 2, 0, 0, 0], baseFret: 1, tier: "colour", tip: "Neither happy nor sad. Distortion's favourite." },
  { id: "A5", symbol: "A5", name: "A power chord", frets: [-1, 0, 2, 2, -1, -1], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1, tier: "colour", tip: "Two notes. Mute everything you aren't playing." },
];

const BY_ID = new Map(CHORDS.map((c) => [c.id, c]));

export function chordById(id: string): Chord | undefined {
  return BY_ID.get(id);
}

/** The MIDI notes a strum of this shape actually sounds, low to high. */
export function chordMidiNotes(chord: Chord, frets: number[] = chord.frets): number[] {
  const out: number[] = [];
  frets.forEach((fret, str) => {
    if (fret >= 0) out.push(midiForFret(str, fret));
  });
  return out;
}

/** Every shape the microphone should accept as this chord, diagram first. */
export function chordVoicings(chord: Chord): number[][] {
  return [chord.frets, ...(chord.voicings ?? [])];
}

/** Whether every pitch class of `inner` is in `outer` — a heard D5 inside a wanted D. */
export function chordIsSubset(inner: Chord, outer: Chord): boolean {
  const outerSet = new Set(chordPitchClasses(outer));
  return chordPitchClasses(inner).every((pc) => outerSet.has(pc));
}

/** Two pitch classes only: root and fifth. What a chord looks like with a weak third. */
export function isPowerChord(chord: Chord): boolean {
  return chordPitchClasses(chord).length === 2;
}

/** Which string indices sound, low to high. Needed to stagger a strum. */
export function soundingStrings(chord: Chord): number[] {
  return chord.frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0);
}

/**
 * Pitch class of the lowest sounding string.
 *
 * This is the only thing separating some chords: Dsus2 and Asus4 contain
 * exactly the same notes, as do Asus2 and Esus4. Nothing in a pitch-class
 * profile can tell those apart, because there is nothing to tell apart — only
 * which note is underneath them differs.
 */
export function chordBassPitchClass(chord: Chord): PitchClass {
  return pitchClassOf(chordMidiNotes(chord)[0]);
}

/** The set of pitch classes in the chord — the target the mic matches against. */
export function chordPitchClasses(chord: Chord): PitchClass[] {
  return Array.from(new Set(chordMidiNotes(chord).map(pitchClassOf))).sort((a, b) => a - b);
}

/**
 * Pitch-class weights of a note's harmonic series.
 *
 * Index is the semitone offset of harmonic h from the fundamental, folded into
 * an octave: h=2 is the octave (0), h=3 a fifth (7), h=5 a major third (4),
 * h=7 lands near a minor seventh (10).
 *
 * This is why a fundamentals-only template cannot tell C from C7. Real audio
 * for a plain C chord contains a Bb-ish component from the seventh harmonic of
 * every note in it, so it matches C7's template better than C's own. Building
 * the same harmonics into the templates puts both on equal footing, and the
 * comparison becomes one of degree rather than presence.
 */
const HARMONICS: { semitones: number; weight: number }[] = [
  { semitones: 0, weight: 1 },      // h=1 fundamental
  { semitones: 0, weight: 0.5 },    // h=2 octave
  { semitones: 7, weight: 0.33 },   // h=3 fifth
  { semitones: 0, weight: 0.25 },   // h=4 two octaves
  { semitones: 4, weight: 0.2 },    // h=5 major third
  { semitones: 7, weight: 0.16 },   // h=6 fifth
  { semitones: 10, weight: 0.14 },  // h=7 flat seventh — the C/C7 culprit
  { semitones: 0, weight: 0.12 },   // h=8
];

/**
 * A weighted 12-bin template for chroma matching.
 *
 * The bass note is weighted higher because it is the loudest partial in a real
 * strum and the most reliable discriminator between chords that share notes.
 */
export function chordTemplate(chord: Chord): Float32Array {
  const t = new Float32Array(12);
  const notes = chordMidiNotes(chord);
  notes.forEach((midi, i) => {
    const voiceWeight = i === 0 ? 1.6 : 1;
    for (const h of HARMONICS) {
      t[pitchClassOf(midi + h.semitones)] += voiceWeight * h.weight;
    }
  });
  let norm = 0;
  for (const v of t) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 12; i++) t[i] /= norm;
  return t;
}

export const CHORD_TIERS: { id: ChordTier; label: string }[] = [
  { id: "open", label: "Open chords" },
  { id: "colour", label: "Sus and colour" },
  { id: "barre", label: "Barre chords" },
];
