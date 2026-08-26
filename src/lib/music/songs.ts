/**
 * Songs: chords over time, with an optional fingerpicking arrangement.
 *
 * Everything here is data — adding a song touches no code, which is the whole
 * point: a future MCP tool (or a human with a text editor) appends to `SONGS`
 * and the player picks it up. Keep it that way.
 *
 * On copyright, the line this file holds: a song's chord progression is a
 * fact and shippable; a note-for-note transcription of a recorded performance
 * is not. Picking patterns below are practice arrangements written for this
 * app — arpeggios over the real chords — not transcriptions, and each song's
 * `note` says so where it matters.
 */

import { chordById } from "./chords";
import { strumStyleById, type StrumStyle } from "./library";
import { STANDARD_TUNING } from "./theory";

/** One picked note inside a bar. */
export interface PickStep {
  /** String index, 0 = low E. */
  string: number;
  /**
   * Articulation. A hammer-on sounds `fromFret` first, then the chord's fret
   * without re-picking; a pull-off is the reverse. `fromFret` is the lower
   * fret of the pair in both cases.
   */
  art?: "hammer" | "pull";
  fromFret?: number;
}

export interface SongBar {
  chordId: string;
  /** One entry per slot; null = no pluck on that slot. Length = slotsPerBar. */
  picking: (PickStep | null)[];
}

export interface SongSection {
  name: string;
  bars: SongBar[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  slotsPerBar: number;
  beatsPerBar: number;
  /** Every chord the song uses, in display order. */
  chordIds: string[];
  /** Strum-mode fallback: one bar of strokes, tiled. */
  strumStyleId: string;
  sections: SongSection[];
  /** The honest print: key, tuning, what the arrangement is and is not. */
  note: string;
}

/** p i m a — thumb, index, middle, ring — guessed from the string. */
export function fingerFor(string: number): "p" | "i" | "m" | "a" {
  if (string <= 2) return "p";
  if (string === 3) return "i";
  if (string === 4) return "m";
  return "a";
}

/** The MIDI note a pick step actually sounds, resolved against the chord. */
export function pickMidi(chordId: string, step: PickStep): number | null {
  const chord = chordById(chordId);
  if (!chord) return null;
  const fret = chord.frets[step.string];
  if (fret < 0) return null;
  return STANDARD_TUNING[step.string] + fret;
}

export function pickFret(chordId: string, string: number): number {
  return chordById(chordId)?.frets[string] ?? -1;
}

/** Sections flattened to a single bar list for the transport. */
export function songBars(song: Song): SongBar[] {
  return song.sections.flatMap((s) => s.bars);
}

export function songStrum(song: Song): StrumStyle {
  return strumStyleById(song.strumStyleId)!;
}

/** An eight-slot arpeggio over the given strings: low, climb, peak, fall. */
function arp(a: number, b: number, c: number, d: number): (PickStep | null)[] {
  return [
    { string: a }, { string: b }, { string: c }, { string: d },
    { string: c }, { string: b }, { string: c }, { string: b },
  ];
}

const bar = (chordId: string, picking: (PickStep | null)[]): SongBar => ({ chordId, picking });

/**
 * Shared verse cycle for Every Breath You Take — the progression the whole
 * song orbits. Fresh helper per call keeps every bar its own object.
 */
const ebytVerse = (): SongBar[] => [
  bar("A", arp(1, 3, 4, 5)),
  // The add9 colour the song is famous for, taught as a mechanic: the hammer
  // lands on the B string mid-bar without a fresh pick.
  bar("A", [
    { string: 1 }, { string: 3 }, { string: 4, art: "hammer", fromFret: 0 }, { string: 5 },
    { string: 4 }, { string: 3 }, { string: 4 }, { string: 3 },
  ]),
  bar("F#m", arp(0, 3, 4, 5)),
  bar("F#m", arp(0, 3, 4, 5)),
  bar("D", arp(2, 3, 4, 5)),
  bar("E", [
    { string: 0 }, { string: 2 }, { string: 3, art: "pull", fromFret: 0 }, { string: 4 },
    { string: 3 }, { string: 2 }, { string: 3 }, { string: 2 },
  ]),
  bar("A", arp(1, 3, 4, 5)),
  bar("A", arp(1, 3, 4, 5)),
];

const ebytChorus = (): SongBar[] => [
  bar("D", arp(2, 3, 4, 5)),
  bar("D", arp(2, 3, 4, 5)),
  bar("A", arp(1, 3, 4, 5)),
  bar("A", arp(1, 3, 4, 5)),
  bar("B7", arp(1, 3, 4, 5)),
  bar("B7", arp(1, 3, 4, 5)),
  bar("E", arp(0, 2, 3, 4)),
  bar("E", arp(0, 2, 3, 4)),
];

const ebytMiddle = (): SongBar[] => [
  bar("F", arp(0, 3, 4, 5)),
  bar("F", arp(0, 3, 4, 5)),
  bar("G", arp(0, 3, 4, 5)),
  bar("G", arp(0, 3, 4, 5)),
  bar("F", arp(0, 3, 4, 5)),
  bar("F", arp(0, 3, 4, 5)),
  bar("E", arp(0, 2, 3, 4)),
  bar("E", arp(0, 2, 3, 4)),
];

export const SONGS: Song[] = [
  {
    id: "every-breath-you-take",
    title: "Every Breath You Take",
    artist: "The Police",
    bpm: 114,
    slotsPerBar: 8,
    beatsPerBar: 4,
    chordIds: ["A", "F#m", "D", "E", "B7", "F", "G"],
    strumStyleId: "eighths",
    note:
      "The record sits a half-step down — tune every string down one fret to match it, or play as written and be your own key. Charts often write a plain B in the chorus; B7 is the friendly open-shape substitute and sits fine. The picking is a practice arrangement over the song's chords, not a transcription of the recorded riff.",
    sections: [
      { name: "Intro", bars: ebytVerse() },
      { name: "Verse 1", bars: ebytVerse() },
      { name: "Chorus", bars: ebytChorus() },
      { name: "Verse 2", bars: ebytVerse() },
      { name: "Chorus", bars: ebytChorus() },
      { name: "Middle eight", bars: ebytMiddle() },
      { name: "Interlude", bars: ebytVerse() },
      { name: "Middle eight", bars: ebytMiddle() },
      { name: "Outro", bars: ebytVerse() },
    ],
  },
];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
