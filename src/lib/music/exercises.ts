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
  /** Index into LEVELS — the difficulty tier. */
  level: number;
  focus: "left hand" | "right hand";
  /** The topic this drill belongs to: "spider", "octaves", "finger ladder"… */
  family: string;
  /** What to actually do, in coaching words. */
  coaching: string;
  /** When to consider it learned and move on. */
  goal: string;
  /** The targets, in order. Untimed — the mic confirms each. */
  notes: NoteTarget[];
}

/**
 * Difficulty tiers, not topics. A starter should never be looking at spider
 * drills — they pick their tier and see only what belongs to it. Topics
 * (finger ladders, spiders, octaves…) are the `family` tag on each exercise,
 * visible inside a tier but never the wall between them.
 */
export const LEVELS = [
  "Starter",
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

export const LEVEL_BLURBS: Record<(typeof LEVELS)[number], string> = {
  Starter: "Day one. The open strings and the very first fretted notes.",
  Beginner: "Single fingers finding their feet — notes by name, the thumb's heartbeat.",
  Intermediate: "Fingers working together: crossings, hammer-ons, pull-offs, the full four-finger row.",
  Advanced: "Independence and reach — spiders, stretches, shifts up the neck, two-voice picking.",
};

/** Shorthand: a target on `string` at `fret`, named. */
const n = (string: number, fret: number, name: string): NoteTarget => ({ string, fret, name });

export const EXERCISES: Exercise[] = [
  {
    id: "open-strings",
    title: "Name the open strings",
    level: 0, focus: "right hand", family: "know the strings",
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
    level: 0, focus: "right hand", family: "know the strings",
    coaching:
      "Same six strings, dealt out of order. The moment this feels easy, your pick hand has learned the map.",
    goal: "The whole shuffle without brushing a neighbouring string.",
    notes: [
      n(2, 0, "D"), n(4, 0, "B"), n(1, 0, "A"), n(5, 0, "E"),
      n(3, 0, "G"), n(0, 0, "E"), n(4, 0, "B"), n(2, 0, "D"), n(1, 0, "A"), n(3, 0, "G"),
    ],
  },
  {
    id: "index-first-frets",
    title: "Index finger, every string",
    level: 0, focus: "left hand", family: "finger ladder",
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
    level: 1, focus: "left hand", family: "note finding",
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
    level: 1, focus: "left hand", family: "note finding",
    coaching:
      "Same game, next string up. C, D and E on the A string are the roots of half the barre chords you will ever play.",
    goal: "C, D and E found cold, in any order the game deals them.",
    notes: [
      n(1, 3, "C"), n(1, 5, "D"), n(1, 7, "E"), n(1, 5, "D"), n(1, 3, "C"), n(1, 7, "E"),
    ],
  },
  {
    id: "middle-second-frets",
    title: "Middle finger, every string",
    level: 1, focus: "left hand", family: "finger ladder",
    coaching:
      "Second fret, middle finger only — the index stays off duty. Each finger has to earn its own strength; borrowing the index forever is how the others stay weak.",
    goal: "Six clean notes without the index sneaking down to help.",
    notes: [
      n(0, 2, "F#"), n(1, 2, "B"), n(2, 2, "E"), n(3, 2, "A"), n(4, 2, "C#"), n(5, 2, "F#"),
    ],
  },
  {
    id: "one-two-walk",
    title: "One-two walk",
    level: 1, focus: "left hand", family: "finger ladder",
    coaching:
      "Index on fret one, middle on fret two, walking up three strings and back. Keep the index down while the middle lands — fingers that lift too early are the enemy of speed.",
    goal: "Up and down with both fingers staying close to the strings.",
    notes: [
      n(0, 1, "F"), n(0, 2, "F#"), n(1, 1, "A#"), n(1, 2, "B"), n(2, 1, "D#"), n(2, 2, "E"),
      n(2, 1, "D#"), n(1, 2, "B"), n(1, 1, "A#"), n(0, 2, "F#"), n(0, 1, "F"),
    ],
  },
  {
    id: "steady-thumb",
    title: "Steady thumb",
    level: 1, focus: "right hand", family: "picking",
    coaching:
      "Thumb only, alternating between the A and G strings. Everything in fingerstyle is built over this heartbeat — the fingers decorate, the thumb keeps time.",
    goal: "Eight alternations without watching your hand.",
    notes: [
      n(1, 0, "A"), n(3, 0, "G"), n(1, 0, "A"), n(3, 0, "G"),
      n(1, 0, "A"), n(3, 0, "G"), n(1, 0, "A"), n(3, 0, "G"),
    ],
  },
  {
    id: "hammer-arrivals",
    title: "Hammer-ons",
    level: 2, focus: "left hand", family: "legato",
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
    level: 2, focus: "left hand", family: "legato",
    coaching:
      "The mirror image: fret two, pick, then flick the finger off sideways so the open string sounds without a fresh pick. The game listens for the open note you land on.",
    goal: "A clear open-string arrival on all three strings, no re-pick.",
    notes: [
      n(1, 0, "A"), n(2, 0, "D"), n(3, 0, "G"),
      n(1, 0, "A"), n(2, 0, "D"), n(3, 0, "G"),
    ],
  },
  {
    id: "two-string-crossing",
    title: "Crossing over",
    level: 2, focus: "left hand", family: "finger ladder",
    coaching:
      "One-two on the E string, one-two on the A string, and onward — the fingers change strings as a pair. Crossing is where most stumbles live; slow it until it is boring.",
    goal: "Four crossings without a dead note at the seam.",
    notes: [
      n(0, 1, "F"), n(1, 1, "A#"), n(0, 2, "F#"), n(1, 2, "B"),
      n(2, 1, "D#"), n(3, 1, "G#"), n(2, 2, "E"), n(3, 2, "A"),
    ],
  },
  {
    id: "one-two-three",
    title: "One-two-three",
    level: 2, focus: "left hand", family: "finger ladder",
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
    level: 2, focus: "left hand", family: "finger ladder",
    coaching:
      "One finger per fret: index to pinky, frets one to four. This is the exercise every guitarist does forever — the pinky only joins the band if you invite it every day.",
    goal: "The pinky's note as strong as the index's, both strings.",
    notes: [
      n(0, 1, "F"), n(0, 2, "F#"), n(0, 3, "G"), n(0, 4, "G#"),
      n(1, 1, "A#"), n(1, 2, "B"), n(1, 3, "C"), n(1, 4, "C#"),
    ],
  },
  {
    id: "octave-pairs",
    title: "Octave pairs",
    level: 2, focus: "left hand", family: "note finding",
    coaching:
      "Each open string, then the same note an octave up, two strings over. Hearing the octave is how you start finding any note anywhere — same name, new address.",
    goal: "All four pairs found without counting frets.",
    notes: [
      n(0, 0, "E"), n(2, 2, "E"), n(1, 0, "A"), n(3, 2, "A"),
      n(2, 0, "D"), n(4, 3, "D"), n(3, 0, "G"), n(5, 3, "G"),
    ],
  },
  {
    id: "pima-roll",
    title: "The p-i-m-a roll",
    level: 2, focus: "right hand", family: "picking",
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
    id: "spider-1324",
    title: "The spider",
    level: 3, focus: "left hand", family: "spider",
    coaching:
      "Same four frets, scrambled: one, three, two, four. Your fingers want to move in order; this teaches them to move on demand. Slow is the whole point.",
    goal: "The 1-3-2-4 pattern clean on both strings without pausing to think.",
    notes: [
      n(0, 1, "F"), n(0, 3, "G"), n(0, 2, "F#"), n(0, 4, "G#"),
      n(1, 1, "A#"), n(1, 3, "C"), n(1, 2, "B"), n(1, 4, "C#"),
    ],
  },
  {
    id: "descending-four",
    title: "The descending four",
    level: 3, focus: "left hand", family: "finger ladder",
    coaching:
      "Pinky first: four, three, two, one. Coming down is harder than going up — every finger has to be already waiting on its fret, not arriving late from above.",
    goal: "Both strings descended with all four fingers planted before you start.",
    notes: [
      n(0, 4, "G#"), n(0, 3, "G"), n(0, 2, "F#"), n(0, 1, "F"),
      n(1, 4, "C#"), n(1, 3, "C"), n(1, 2, "B"), n(1, 1, "A#"),
    ],
  },
  {
    id: "spider-1423",
    title: "The spider, backwards",
    level: 3, focus: "left hand", family: "spider",
    coaching:
      "One, four, two, three — the other scramble. If 1-3-2-4 has become comfortable, this one will feel brand new, which is exactly the point.",
    goal: "Clean on both strings without pausing to work out which finger is next.",
    notes: [
      n(0, 1, "F"), n(0, 4, "G#"), n(0, 2, "F#"), n(0, 3, "G"),
      n(1, 1, "A#"), n(1, 4, "C#"), n(1, 2, "B"), n(1, 3, "C"),
    ],
  },
  {
    id: "pinky-pairs",
    title: "Pinky stretches",
    level: 3, focus: "left hand", family: "stretch",
    coaching:
      "Index and pinky only, frets one and four. The stretch should come from opening the hand, not bending the wrist — if it hurts, stop and shake it out.",
    goal: "Three string-pairs with the pinky landing square, not on its side.",
    notes: [
      n(0, 1, "F"), n(0, 4, "G#"), n(1, 1, "A#"), n(1, 4, "C#"), n(2, 1, "D#"), n(2, 4, "F#"),
    ],
  },
  {
    id: "fifth-position",
    title: "Fifth position",
    level: 3, focus: "left hand", family: "up the neck",
    coaching:
      "The chromatic four again, but starting at fret five — one finger per fret, frets five to eight. Higher up, the frets are closer; let your hand enjoy it.",
    goal: "Both strings clean without looking back at the nut to find yourself.",
    notes: [
      n(0, 5, "A"), n(0, 6, "A#"), n(0, 7, "B"), n(0, 8, "C"),
      n(1, 5, "D"), n(1, 6, "D#"), n(1, 7, "E"), n(1, 8, "F"),
    ],
  },
  {
    id: "home-and-away",
    title: "Home and away",
    level: 3, focus: "left hand", family: "up the neck",
    coaching:
      "One string, big jumps: first fret, fifth, third, seventh. Shift the whole hand, land, then press — a shift that arrives pressing is a shift that buzzes.",
    goal: "Every landing clean on the first try, eyes on the target fret before the hand moves.",
    notes: [
      n(0, 1, "F"), n(0, 5, "A"), n(0, 3, "G"), n(0, 7, "B"), n(0, 5, "A"), n(0, 1, "F"),
    ],
  },
  {
    id: "thumb-and-fingers",
    title: "Thumb and fingers",
    level: 3, focus: "right hand", family: "picking",
    coaching:
      "The thumb keeps its bass note; the fingers answer from above — bass, treble, bass, treble. This split is the whole trick of fingerstyle: two voices, one hand.",
    goal: "The bass stays steady while the treble answers, four rounds through.",
    notes: [
      n(1, 0, "A"), n(4, 0, "B"), n(1, 0, "A"), n(5, 0, "E"),
      n(1, 0, "A"), n(4, 0, "B"), n(1, 0, "A"), n(5, 0, "E"),
    ],
  },
  {
    id: "string-skips",
    title: "String skips",
    level: 3, focus: "right hand", family: "picking",
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
