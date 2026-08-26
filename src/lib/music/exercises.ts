/**
 * The exercise curriculum: graded drills from first sounds to speed work.
 *
 * Everything is data over machinery that already exists. A strum drill is a
 * `Pattern` and can be sent straight to the practice screen, microphone
 * scoring included. A technique drill (hammer-ons, pull-offs, picking rolls)
 * is a tiny `Song` — the song player's picking arrays, articulation arcs and
 * pace slider are exactly a drill player once the song is two bars long.
 *
 * Ordering matters and is pedagogical: each level assumes only what earlier
 * levels taught. Add new drills to the level they belong to, not the end.
 */

import { buildChordDrill, buildPattern, STRUM_STYLES } from "./library";
import type { Pattern } from "./pattern";
import type { Song, SongBar, PickStep } from "./songs";

export interface Exercise {
  id: string;
  title: string;
  /** Index into LEVELS. */
  level: number;
  focus: "rhythm" | "left hand" | "right hand" | "changes";
  /** What to actually do, in coaching words. */
  coaching: string;
  /** When to consider it learned and move on. */
  goal: string;
  kind: "strum" | "pick";
  /** Strum drills load into the practice screen. */
  pattern?: Pattern;
  /** Technique drills play inline on the song machinery. */
  song?: Song;
}

export const LEVELS = [
  "First sounds",
  "Rhythm foundations",
  "Left hand",
  "Right hand",
  "Speed and polish",
] as const;

const style = (id: string) => STRUM_STYLES.find((s) => s.id === id)!;

/** A two-bar looping drill dressed as a Song for the player. */
function drillSong(
  id: string, title: string, bpm: number, chordId: string, bars: (PickStep | null)[][],
): Song {
  return {
    id, title, artist: "Exercise", bpm,
    slotsPerBar: 8, beatsPerBar: 4,
    chordIds: [chordId],
    strumStyleId: "downs",
    note: "",
    sections: [{ name: "Loop", bars: bars.map((picking): SongBar => ({ chordId, picking })) }],
  };
}

const rest = null;

export const EXERCISES: Exercise[] = [
  // ---- Level 0: First sounds ---------------------------------------------
  {
    id: "first-downstrokes",
    title: "Single downstrokes",
    level: 0, focus: "rhythm", kind: "strum",
    coaching:
      "Hold Em — two fingers, all six strings — and strum down on each click. Nothing else. Let the wrist fall through the strings rather than pushing them.",
    goal: "Sixteen downstrokes in a row that land on the click and ring clean.",
    pattern: { ...buildChordDrill(style("downs"), "Em"), bpm: 60 },
  },
  {
    id: "one-string-at-a-time",
    title: "One string at a time",
    level: 0, focus: "right hand", kind: "pick",
    coaching:
      "Still on Em. Pick each string on its own, low to high and back down. Slowly. You are teaching your hand where the strings live without looking.",
    goal: "A full climb and descent without hitting a neighbouring string.",
    song: drillSong("one-string-at-a-time", "One string at a time", 60, "Em", [
      [{ string: 0 }, rest, { string: 1 }, rest, { string: 2 }, rest, { string: 3 }, rest],
      [{ string: 4 }, rest, { string: 5 }, rest, { string: 4 }, rest, { string: 3 }, rest],
      [{ string: 2 }, rest, { string: 1 }, rest, { string: 0 }, rest, rest, rest],
    ]),
  },

  // ---- Level 1: Rhythm foundations ---------------------------------------
  {
    id: "down-up-eighths",
    title: "Down and up",
    level: 1, focus: "rhythm", kind: "strum",
    coaching:
      "Down on the numbers, up on the ands, and the hand never stops swinging. The up-strum catches fewer strings — that is correct, not a mistake.",
    goal: "A minute of eighths with the mic reading mostly on time.",
    pattern: { ...buildChordDrill(style("eighths"), "Am"), bpm: 70 },
  },
  {
    id: "first-change",
    title: "The first chord change",
    level: 1, focus: "changes", kind: "strum",
    coaching:
      "G for a bar, C for a bar, downstrokes only. The secret: start moving your fingers on the last up-swing of the bar, not when the new bar arrives.",
    goal: "Eight changes without the first beat of the new bar arriving late.",
    pattern: { ...buildPattern(style("downs"), ["G", "C"], "G to C"), bpm: 64 },
  },
  {
    id: "folk-pattern",
    title: "The one pattern",
    level: 1, focus: "rhythm", kind: "strum",
    coaching:
      "D · DU · UDU. Miss the strings on the skipped beats but keep the arm moving — the motion is the metronome your body keeps.",
    goal: "Play it on G without thinking about it while talking to someone.",
    pattern: { ...buildChordDrill(style("folk"), "G"), bpm: 72 },
  },

  // ---- Level 2: Left hand -------------------------------------------------
  {
    id: "hammer-ons",
    title: "Hammer-ons",
    level: 2, focus: "left hand", kind: "pick",
    coaching:
      "Pick the open string, then bring a finger down hard enough that the new note sounds without picking again. It is a hammer — speed, not pressure.",
    goal: "The hammered note as loud as the picked one, on every string pair.",
    song: drillSong("hammer-ons", "Hammer-ons", 66, "Em", [
      [{ string: 1, art: "hammer", fromFret: 0 }, rest, rest, rest, { string: 1, art: "hammer", fromFret: 0 }, rest, rest, rest],
      [{ string: 2, art: "hammer", fromFret: 0 }, rest, rest, rest, { string: 2, art: "hammer", fromFret: 0 }, rest, rest, rest],
    ]),
  },
  {
    id: "pull-offs",
    title: "Pull-offs",
    level: 2, focus: "left hand", kind: "pick",
    coaching:
      "The mirror image: pick the fretted note, then flick the finger off sideways — slightly downward, plucking the string as it leaves — so the open string sounds.",
    goal: "A clear open note with no re-pick, both strings, at tempo.",
    song: drillSong("pull-offs", "Pull-offs", 66, "Em", [
      [{ string: 1, art: "pull", fromFret: 0 }, rest, rest, rest, { string: 1, art: "pull", fromFret: 0 }, rest, rest, rest],
      [{ string: 2, art: "pull", fromFret: 0 }, rest, rest, rest, { string: 2, art: "pull", fromFret: 0 }, rest, rest, rest],
    ]),
  },
  {
    id: "trill",
    title: "Hammer and pull together",
    level: 2, focus: "left hand", kind: "pick",
    coaching:
      "Pick once, hammer on, pull off — three notes for one pick. This is the trill, and it is the doorway to legato playing.",
    goal: "Four clean cycles in a row without the volume dying away.",
    song: drillSong("trill", "Hammer and pull together", 60, "Em", [
      [{ string: 1, art: "hammer", fromFret: 0 }, rest, { string: 1, art: "pull", fromFret: 0 }, rest, { string: 1, art: "hammer", fromFret: 0 }, rest, { string: 1, art: "pull", fromFret: 0 }, rest],
      [{ string: 2, art: "hammer", fromFret: 0 }, rest, { string: 2, art: "pull", fromFret: 0 }, rest, { string: 2, art: "hammer", fromFret: 0 }, rest, { string: 2, art: "pull", fromFret: 0 }, rest],
    ]),
  },

  // ---- Level 3: Right hand ------------------------------------------------
  {
    id: "thumb-bass",
    title: "Steady thumb",
    level: 3, focus: "right hand", kind: "pick",
    coaching:
      "On Am, the thumb alternates between the two lowest sounding strings on every beat. Everything in fingerstyle is built over this heartbeat.",
    goal: "The thumb keeps going while you hold a conversation — genuinely automatic.",
    song: drillSong("thumb-bass", "Steady thumb", 66, "Am", [
      [{ string: 1 }, rest, { string: 3 }, rest, { string: 1 }, rest, { string: 3 }, rest],
      [{ string: 1 }, rest, { string: 3 }, rest, { string: 1 }, rest, { string: 3 }, rest],
    ]),
  },
  {
    id: "pima-roll",
    title: "The full roll",
    level: 3, focus: "right hand", kind: "pick",
    coaching:
      "Thumb, index, middle, ring — one string each, low to high, one finger per string, always the same finger on the same string. The roll behind half of fingerstyle.",
    goal: "An even roll where no note is louder than its neighbours.",
    song: drillSong("pima-roll", "The full roll", 72, "Am", [
      [{ string: 1 }, { string: 3 }, { string: 4 }, { string: 5 }, { string: 4 }, { string: 3 }, { string: 1 }, rest],
      [{ string: 1 }, { string: 3 }, { string: 4 }, { string: 5 }, { string: 4 }, { string: 3 }, { string: 1 }, rest],
    ]),
  },
  {
    id: "muted-chucks",
    title: "Muted chucks",
    level: 3, focus: "rhythm", kind: "strum",
    coaching:
      "On beats 2 and 4, land the side of your strumming hand on the strings as you strike — a drum hit instead of a chord. That percussive slap is the backbeat.",
    goal: "The chuck lands exactly with the click, chords ringing either side of it.",
    pattern: { ...buildChordDrill(style("chuck"), "Am"), bpm: 76 },
  },

  // ---- Level 4: Speed and polish -----------------------------------------
  {
    id: "change-sprint",
    title: "The change sprint",
    level: 4, focus: "changes", kind: "strum",
    coaching:
      "G, D, Em, C — one bar each, the folk pattern throughout. When a pass is clean, nudge the tempo up five. When it falls apart, drop ten and rebuild.",
    goal: "The full cycle clean at 90, three times in a row.",
    pattern: { ...buildPattern(style("folk"), ["G", "D", "Em", "C"], "Change sprint"), bpm: 70 },
  },
  {
    id: "barre-endurance",
    title: "Barre endurance",
    level: 4, focus: "left hand", kind: "strum",
    coaching:
      "F for a bar, C for a bar. The rest bar is the point: releasing and re-forming the barre is harder than holding it, and it is what songs actually demand.",
    goal: "Sixteen F bars across a session without the last ones buzzing.",
    pattern: { ...buildPattern(style("downs"), ["F", "C"], "Barre endurance"), bpm: 62 },
  },
];

export function exercisesByLevel(): { name: string; items: Exercise[] }[] {
  return LEVELS.map((name, i) => ({
    name,
    items: EXERCISES.filter((e) => e.level === i),
  }));
}
