/**
 * The exercise curriculum: technique games, graded finger by finger.
 *
 * Everything here is one kind of thing on purpose. An earlier version mixed
 * three formats — strum drills that left for the play screen, watch-along
 * technique loops, and listening games — and practising meant learning three
 * UIs. Now every exercise is a listening game: the app names a note, you find
 * it at your own pace, the microphone confirms. Chords and progressions are
 * deliberately absent — they have their own world in the play screen's other
 * modes and the Learn page.
 *
 * Ordering matters and is pedagogical: open strings before one finger, one
 * finger before two, hammer-ons only after the fingers they need. Add new
 * games to the level they belong to, not the end.
 */

export interface NoteTarget {
  string: number;
  fret: number;
  name: string;
}

export interface Exercise {
  id: string;
  title: string;
  /** Index into LEVELS. */
  level: number;
  focus: "left hand" | "right hand";
  /** What to actually do, in coaching words. */
  coaching: string;
  /** When to consider it learned and move on. */
  goal: string;
  /** The targets, in order. Untimed — the mic confirms each. */
  notes: NoteTarget[];
}

export const LEVELS = [
  "First sounds",
  "One finger",
  "Two fingers",
  "Three and four",
  "Right hand",
] as const;

/** Shorthand: a target on `string` at `fret`, named. */
const n = (string: number, fret: number, name: string): NoteTarget => ({ string, fret, name });

export const EXERCISES: Exercise[] = [
  // ---- Level 0: First sounds ---------------------------------------------
  {
    id: "open-strings",
    title: "Name the open strings",
    level: 0, focus: "right hand",
    coaching:
      "The game shows a string; you play it open and let it ring. No timer, no rush. E-A-D-G-B-E is the alphabet everything else is written in.",
    goal: "All six strings, up and back down, without looking at your pick hand.",
    notes: [
      n(0, 0, "E"), n(1, 0, "A"), n(2, 0, "D"), n(3, 0, "G"), n(4, 0, "B"), n(5, 0, "E"),
      n(5, 0, "E"), n(4, 0, "B"), n(3, 0, "G"), n(2, 0, "D"), n(1, 0, "A"), n(0, 0, "E"),
    ],
  },
  {
    id: "string-shuffle",
    title: "Strings, shuffled",
    level: 0, focus: "right hand",
    coaching:
      "Same six strings, dealt out of order. The moment this feels easy, your pick hand has learned the map.",
    goal: "The whole shuffle without brushing a neighbouring string.",
    notes: [
      n(2, 0, "D"), n(4, 0, "B"), n(1, 0, "A"), n(5, 0, "E"),
      n(3, 0, "G"), n(0, 0, "E"), n(4, 0, "B"), n(2, 0, "D"), n(1, 0, "A"), n(3, 0, "G"),
    ],
  },

  // ---- Level 1: One finger ------------------------------------------------
  {
    id: "index-first-frets",
    title: "Index finger, every string",
    level: 1, focus: "left hand",
    coaching:
      "First fret, index finger, one string at a time. Press just behind the fret wire, not on top of it — clean notes come from position, not force.",
    goal: "Six clean notes with no buzz and no aching hand.",
    notes: [
      n(0, 1, "F"), n(1, 1, "A#"), n(2, 1, "D#"), n(3, 1, "G#"), n(4, 1, "C"), n(5, 1, "F"),
    ],
  },
  {
    id: "notes-low-e",
    title: "Notes on the low E",
    level: 1, focus: "left hand",
    coaching:
      "Fret the note the game asks for, pick it, let it ring until it registers. Knowing the low E by name is how barre chords stop being guesswork.",
    goal: "F, G and A found without counting frets from the top.",
    notes: [
      n(0, 1, "F"), n(0, 3, "G"), n(0, 5, "A"), n(0, 3, "G"), n(0, 1, "F"), n(0, 5, "A"),
    ],
  },
  {
    id: "notes-a-string",
    title: "Notes on the A string",
    level: 1, focus: "left hand",
    coaching:
      "Same game, next string up. C, D and E on the A string are the roots of half the barre chords you will ever play.",
    goal: "C, D and E found cold, in any order the game deals them.",
    notes: [
      n(1, 3, "C"), n(1, 5, "D"), n(1, 7, "E"), n(1, 5, "D"), n(1, 3, "C"), n(1, 7, "E"),
    ],
  },

  // ---- Level 2: Two fingers -----------------------------------------------
  {
    id: "one-two-walk",
    title: "One-two walk",
    level: 2, focus: "left hand",
    coaching:
      "Index on fret one, middle on fret two, walking up three strings and back. Keep the index down while the middle lands — fingers that lift too early are the enemy of speed.",
    goal: "Up and down with both fingers staying close to the strings.",
    notes: [
      n(0, 1, "F"), n(0, 2, "F#"), n(1, 1, "A#"), n(1, 2, "B"), n(2, 1, "D#"), n(2, 2, "E"),
      n(2, 1, "D#"), n(1, 2, "B"), n(1, 1, "A#"), n(0, 2, "F#"), n(0, 1, "F"),
    ],
  },
  {
    id: "hammer-arrivals",
    title: "Hammer-ons",
    level: 2, focus: "left hand",
    coaching:
      "Pick the open string, then hammer a finger onto fret two hard enough that the new note sounds without picking again. The game listens for where you land — if the hammered note registers, it was loud enough.",
    goal: "Every arrival as loud as the picked note that launched it.",
    notes: [
      n(1, 2, "B"), n(2, 2, "E"), n(3, 2, "A"),
      n(1, 2, "B"), n(2, 2, "E"), n(3, 2, "A"),
    ],
  },
  {
    id: "pull-arrivals",
    title: "Pull-offs",
    level: 2, focus: "left hand",
    coaching:
      "The mirror image: fret two, pick, then flick the finger off sideways so the open string sounds without a fresh pick. The game listens for the open note you land on.",
    goal: "A clear open-string arrival on all three strings, no re-pick.",
    notes: [
      n(1, 0, "A"), n(2, 0, "D"), n(3, 0, "G"),
      n(1, 0, "A"), n(2, 0, "D"), n(3, 0, "G"),
    ],
  },

  // ---- Level 3: Three and four fingers ------------------------------------
  {
    id: "one-two-three",
    title: "One-two-three",
    level: 3, focus: "left hand",
    coaching:
      "Index, middle, ring — frets one, two, three — up two strings and back. The ring finger is the weak one; let it be slow before you let it be sloppy.",
    goal: "Both strings climbed and descended with every note ringing.",
    notes: [
      n(0, 1, "F"), n(0, 2, "F#"), n(0, 3, "G"),
      n(1, 1, "A#"), n(1, 2, "B"), n(1, 3, "C"),
      n(1, 2, "B"), n(1, 1, "A#"), n(0, 3, "G"), n(0, 2, "F#"), n(0, 1, "F"),
    ],
  },
  {
    id: "chromatic-four",
    title: "The chromatic four",
    level: 3, focus: "left hand",
    coaching:
      "One finger per fret: index to pinky, frets one to four. This is the exercise every guitarist does forever — the pinky only joins the band if you invite it every day.",
    goal: "The pinky's note as strong as the index's, both strings.",
    notes: [
      n(0, 1, "F"), n(0, 2, "F#"), n(0, 3, "G"), n(0, 4, "G#"),
      n(1, 1, "A#"), n(1, 2, "B"), n(1, 3, "C"), n(1, 4, "C#"),
    ],
  },
  {
    id: "spider-1324",
    title: "The spider",
    level: 3, focus: "left hand",
    coaching:
      "Same four frets, scrambled: one, three, two, four. Your fingers want to move in order; this teaches them to move on demand. Slow is the whole point.",
    goal: "The 1-3-2-4 pattern clean on both strings without pausing to think.",
    notes: [
      n(0, 1, "F"), n(0, 3, "G"), n(0, 2, "F#"), n(0, 4, "G#"),
      n(1, 1, "A#"), n(1, 3, "C"), n(1, 2, "B"), n(1, 4, "C#"),
    ],
  },

  // ---- Level 4: Right hand ------------------------------------------------
  {
    id: "steady-thumb",
    title: "Steady thumb",
    level: 4, focus: "right hand",
    coaching:
      "Thumb only, alternating between the A and G strings. Everything in fingerstyle is built over this heartbeat — the fingers decorate, the thumb keeps time.",
    goal: "Eight alternations without watching your hand.",
    notes: [
      n(1, 0, "A"), n(3, 0, "G"), n(1, 0, "A"), n(3, 0, "G"),
      n(1, 0, "A"), n(3, 0, "G"), n(1, 0, "A"), n(3, 0, "G"),
    ],
  },
  {
    id: "pima-roll",
    title: "The p-i-m-a roll",
    level: 4, focus: "right hand",
    coaching:
      "Thumb, index, middle, ring — one string each, low to high and back. Always the same finger on the same string; the roll behind half of fingerstyle.",
    goal: "An even roll where no note is louder than its neighbours.",
    notes: [
      n(1, 0, "A"), n(3, 0, "G"), n(4, 0, "B"), n(5, 0, "E"),
      n(4, 0, "B"), n(3, 0, "G"), n(1, 0, "A"),
      n(3, 0, "G"), n(4, 0, "B"), n(5, 0, "E"),
    ],
  },
  {
    id: "string-skips",
    title: "String skips",
    level: 4, focus: "right hand",
    coaching:
      "Non-adjacent strings, on purpose. Skipping cleanly is what separates aiming from hoping.",
    goal: "Every skip lands its string first time.",
    notes: [
      n(1, 0, "A"), n(4, 0, "B"), n(2, 0, "D"), n(5, 0, "E"), n(0, 0, "E"), n(3, 0, "G"),
    ],
  },
];

export function exercisesByLevel(): { name: string; items: Exercise[] }[] {
  return LEVELS.map((name, i) => ({
    name,
    items: EXERCISES.filter((e) => e.level === i),
  }));
}
