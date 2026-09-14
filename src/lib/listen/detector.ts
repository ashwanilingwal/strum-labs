/**
 * Onset detection and note-attack fingerprinting.
 *
 * Pipeline, per 256-sample hop (~5.8 ms at 44.1 kHz):
 *   windowed FFT -> magnitude spectrum -> flux, centroid, treble ratio, chroma
 *
 * Onsets are peak-picked from spectral flux against an *adaptive* threshold
 * built from the running median of recent flux plus the room's measured noise
 * floor. A fixed threshold is the obvious approach and fails immediately: it is
 * either deaf in a loud room or hallucinating in a quiet one.
 *
 * Detection runs a few frames behind the newest audio, because confirming a
 * local maximum requires seeing what comes after it. Identifying the *chord*
 * waits longer still — until every string of the strum is sounding — see
 * FINGERPRINT_LAG. The reported timestamp is still the true onset time, so
 * nothing is lost but screen latency.
 */

import { FFT, hannWindow } from "./fft";
import {
  bandEnergy, chroma, cosineSimilarity, dbfs, foldToChroma, median, MAX_HZ, MIN_HZ,
  normalise, NOTE_BINS, NOTE_HIGH_MIDI, NOTE_LOW_MIDI, noteEnergies,
  rms, spectralCentroid, spectralFlux,
} from "./dsp";
import {
  CHORDS, chordIsSubset, chordMidiNotes, chordVoicings, isPowerChord, type Chord,
} from "../music/chords";
import { midiToFreq, pitchClassOf } from "../music/theory";

const FFT_SIZE = 1024;
const HOP = 256;
/** Frames held back before a frame is eligible to be called an onset. */
const LAG = 5;
/**
 * Frames of audio the chord fingerprint waits for past the attack (~174 ms).
 *
 * The attack window alone cannot identify a strummed chord: a strum staggers
 * its strings over 50–125 ms, so the first ~30 ms contain only the bass
 * string and the pick scrape — measured on synthetic strums at 2/52 correct
 * (scripts/chord-match-eval.ts), with nearly every chord matching whichever
 * template most resembles one low note. Waiting until every string is
 * sounding costs feedback latency and nothing else: the onset's reported
 * time is still the true attack. A following strum closes the window early
 * so its audio never contaminates this one. Swept together with
 * FINGERPRINT_SKIP after the log-flux change: 30/8 keeps mid-progression
 * ring-over at 10/12 where 36 dropped it to 8/12 for two more isolated
 * chords — and progressions are what people actually play.
 */
const FINGERPRINT_LAG = 30;
/** Attack frames excluded from the chord chroma — pick scrape, not pitch. */
const FINGERPRINT_SKIP = 8;
/**
 * Samples kept for the chord chroma: the fingerprint window, plus enough
 * audio BEFORE the attack to measure what was already ringing there.
 */
const CHORD_RING = 24576;
/** Hops of pre-attack audio measured for the ring-over subtraction. */
const PRE_RING_HOPS = 20;
/**
 * How much of the pre-attack spectrum to subtract from the chord window.
 *
 * In a progression the previous chord is still ringing under the new strum —
 * at a 600 ms change it still carries about half the new strum's amplitude —
 * and it drags the match toward blends of the two chords: accuracy fell from
 * 96% on isolated strums to 75% in sequence, with every confidence under the
 * gate (scripts/timing-eval.ts). Subtracting the spectrum measured just
 * before the attack removes exactly that. Raw energies, common scale — see
 * noteEnergies in dsp.ts.
 */
const RING_SUBTRACT = 0.8;
/**
 * The fraction of a candidate's flux that must come from above HF_SPLIT_HZ.
 *
 * Detuned strings ringing together beat, and a beat maximum is a genuine
 * flux peak that can arrive 100–300 ms after the strum — far past the
 * same-strum merge — and used to score as an extra. But beating only
 * modulates energy the strings already have, which lives in the low
 * harmonics; a real attack carries a broadband pick transient. Requiring a
 * share of the flux above the split rejects the wobble by mechanism rather
 * than by level. What counts is the EXCESS over the running high-band
 * baseline — room noise is broadband too. Swept at the 2400 Hz split:
 * 0.05 already drops soft finger strums (5/12) and 0.08 drops them all;
 * 0.04 keeps fingerstyle at 12/12 and costs one wobble extra in the
 * hardest ring scenario. Take the extra.
 *
 * The split sits above where string harmonics stay strong, but low enough
 * that a SOFT attack transient — a bare thumb's thump, not just a pick's
 * scrape — still counts: at a 3000 Hz split a scrapeless finger strum was
 * completely undetectable (0/12). A level-rise fallback was tried for that
 * case and measured hopeless: wobble rises (1.05–2.6×) overlap real strums
 * (1.4×), because a strum's own staggered development looks like a rise and
 * a composite of many beating string-pairs moves the envelope fast. An
 * attack with literally no transient over its own still-ringing chord is
 * indistinguishable by design — the mic needs SOME thump, and real fingers
 * do produce one.
 */
const HF_ATTACK_RATIO = 0.04;
const HF_SPLIT_HZ = 2400;
/** Frames after the attack skipped before measuring body: the strings are
 *  still arriving, and the pick transient is not body. ~35 ms. */
const BODY_SKIP = 6;
/** Frames of body measured after that — out to ~120 ms past the attack. */
const BODY_FRAMES = 14;
/** Where the "late" sustain window starts: ~116 ms past the attack, when
 *  every drum in the backing kit has finished and strings have not. */
const SUSTAIN_FROM = 20;
/** Walking back from the flux peak: frames still above this fraction of the
 *  peak belong to the rise, and the earliest of them is the attack. In the
 *  log-flux domain the ring's own flux sits closer under an attack peak than
 *  linear flux did, so the fraction is high — at 0.25 the walk kept going
 *  into the ring and stamped attacks up to 35 ms early. */
const ONSET_START_FRACTION = 0.5;
/** Frames of flux history the adaptive threshold looks at (~0.5 s). */
const HISTORY = 86;
/** How long after a calibration probe click its return is looked for. */
const PROBE_WINDOW_S = 0.25;
/** A probe's flux peak must stand this far above the room to count. */
const PROBE_MIN_RISE = 4;
/** A guitarist cannot physically strum twice inside this. */
export const MIN_GAP_S = 0.055;
/**
 * Attacks this close behind a pending onset are the same strum's later
 * strings, not a new strum — a lazy strum spreads its six strings over
 * 100 ms+, and each string's arrival is its own flux peak. Absorbing them
 * keeps the fingerprint window open (they used to truncate it, capping the
 * chord chroma at the first two or three strings) and stops one sloppy strum
 * scoring as a hit plus a fistful of extras. The cost: deliberate strums
 * closer together than this merge too, so below ~110 ms gaps chord identity
 * is the only casualty — timing keeps the first attack either way.
 */
export const STRUM_MERGE_S = 0.11;
/**
 * The merge window's floor when the tempo shortens it: a strum's own strings
 * stagger over ~55 ms, so a floor at MIN_GAP let the last string register as
 * its own onset — whose refractory gap then swallowed the REAL next strum.
 * On on-time sixteenths at 140 bpm that alternation halved the detected
 * strums (scripts/timing-eval.ts).
 */
export const MIN_STRUM_SPREAD_S = 0.07;
/**
 * The longest a single strum may take from first string to last. A strum is
 * not always a snap: a beginner's rake can spread six strings over 200–300 ms,
 * and each late string is its own flux peak. The merge therefore CHAINS —
 * each absorbed string extends the window from itself, by the tempo-aware
 * gap — up to this total, and never past what the pattern leaves room for
 * (see RAKE_GUARD_S). Measured before chaining: a 200 ms rake scored one
 * extra per strum, a 300 ms rake two (scripts/timing-eval.ts, slow-rake
 * scenarios).
 */
export const RAKE_MAX_S = 0.35;
/**
 * How much of the pattern's shortest strum gap a rake may never eat: twice
 * the scorer's CLOSE band (scoring.ts), because two adjacent slots played
 * one late and the next early — each still a "close" hit the scorer must
 * grade — land that much nearer each other than the pattern says. A bound
 * at 60% of the gap merged exactly that pair at 90 bpm eighths (+60 / −85 ms,
 * 188 ms apart) into one strum.
 */
const RAKE_GUARD_S = 0.2;
/**
 * The chord window stays open past a rake's last absorbed string for one
 * merge gap plus the detection lag: a straggler at hop h is only SEEN at
 * h + LAG, and a window that closed first turned the string at +157 ms of a
 * 200 ms rake into a fresh strum — one phantom extra per strum.
 */
const RAKE_TAIL_LAG_HOPS = LAG;
/**
 * How far past a rake's last absorbed string the fingerprinted audio runs.
 * Shorter than the merge window itself: the window stays open to catch
 * stragglers, but a lone strum's chord read is tuned to FINGERPRINT_LAG
 * hops — averaging 75 ms more decay over-subtracted the previous chord's
 * ring-over (scripts/timing-eval.ts, 600 ms changes: 10/12 fell to 8/12).
 */
const RAKE_TAIL_HOPS = 12;
/** Hard cap on the chord window, in hops — must fit CHORD_RING with the
 *  pre-attack slice: 60 + PRE_RING_HOPS + skip < 96. */
const WINDOW_MAX_HOPS = 60;
/**
 * Stroke direction: a down-strum STARTS on the bass strings, an up-strum on
 * the treble — so the cue is the bass share of the FLUX (the newly-arriving
 * energy) in the attack's first frames. Two earlier heuristics failed on the
 * synthetic alternating pattern: the slope of a 500 Hz treble ratio scored
 * worse than chance (most string fundamentals sit below 500 Hz), and the
 * bass share of the *magnitude* was drowned by the previous strum's
 * bass-heavy ring. Flux ignores the ring, and the split sits at 140 Hz
 * because "treble" strings are not treble in absolute terms — G3 and B3
 * fundamentals live at 196 and 247 Hz; only the true bass strings put
 * fundamentals under 140.
 */
const BASS_SPLIT_HZ = 140;
/** Early bass-flux share above this reads as a down-strum. */
const STROKE_BASS_THRESHOLD = 0.12;
/**
 * An attack must also carry flux BELOW this split, or it is not a guitar.
 *
 * The app's own metronome plays through the speakers while the mic judges
 * (muting it would defeat its purpose), it lands exactly on the beat, and
 * its square-wave harmonics pass the HF gate — so with no further defence
 * it scores as perfectly-timed strumming: 8 clicks with the player silent
 * produced 6 phantom "tight" hits (scripts/timing-eval.ts). But the click
 * is highpassed at 600 Hz inside the engine and so has NO low content,
 * while every strum puts fundamentals under 700 Hz and even a muted chuck
 * is broadband. Requiring a low-band share rejects the click — and any
 * other trebly blip, like a hi-hat from a backing track played nearby —
 * by what it is, not by when it happens, so a genuinely on-time strum is
 * never at risk.
 */
const LOW_SPLIT_HZ = 700;
/**
 * Floor of the band the drum test reads. The backing kick is a sine that
 * sweeps 140→48 Hz, so everything it adds sits under this; the hat lives above
 * 6.5 kHz; the snare is noise band-passed around 1.8 kHz plus a 190 Hz tone.
 * A strum's fundamentals and first harmonics (E2's 82 Hz aside) fill
 * 200–700 Hz, so a rise in that band after an attack is a guitar and not the
 * app's own drums.
 */
const MID_SPLIT_HZ = 200;
const LOW_ATTACK_RATIO = 0.08;

export interface RoomProfile {
  /** Ambient level in dBFS. */
  noiseDb: number;
  /** Typical spectral flux with nobody playing. */
  fluxFloor: number;
  /** "silent" means the mic is delivering nothing at all — see endCalibration. */
  quality: "silent" | "quiet" | "usable" | "noisy";
  message: string;
  /**
   * The round trip, measured: how long after the app scheduled a click the
   * mic heard it — speaker out, across the room, mic in, driver, worklet. Null
   * when the clicks never came back (headphones, or a click too quiet to
   * register), in which case the device's own latency estimate stands.
   */
  loopbackMs: number | null;
}

export interface Onset {
  /** AudioContext time of the attack. */
  time: number;
  /** How far above threshold the flux peaked. 1 = at threshold. */
  strength: number;
  /** Peak level of the attack, dBFS. */
  levelDb: number;
  /** 12-bin pitch-class profile averaged over the attack. */
  chroma: Float32Array;
  /** Best-matching chord id, and how confident that match is (0..1). */
  chordGuess: string | null;
  chordConfidence: number;
  /** The three best-matching chords, best first. Diagnostics: shows WHAT a
   *  weak margin was split with (scripts/wav-eval.ts on real recordings). */
  chordRanking: { id: string; score: number }[];
  /** Raw match score and its margin over the runner-up. Diagnostics — they
   *  exist so scripts/chord-match-eval.ts can calibrate chordConfidence. */
  matchScore: number;
  matchMargin: number;
  /**
   * Share of the attack's flux coming from below LOW_SPLIT_HZ — how much
   * body the sound has, relative to the whole attack.
   */
  lowRatio: number;
  /**
   * How much louder the guitar's own register is AFTER this attack than it
   * was just before it: the low band measured ~40-120 ms in, over the same
   * band just before the attack.
   *
   * This is the measure that survives a metronome landing on the same
   * instant. A click adds treble and nothing else, so the body it leaves
   * behind is exactly the body it found (≈1, and below 1 over a decaying
   * chord). A strum sets strings ringing, so the body jumps — whether or not
   * a click arrived with it. Ratios of the attack's own flux cannot do this
   * job: measured on a synthetic session, an on-beat strum's low-flux share
   * fell to 0.11-0.19 (from 0.47 without a click) because the click inflates
   * the total, overlapping the clicks' own 0.01-0.08 (scripts/timing-eval.ts).
   */
  bodyRise: number;
  /**
   * How much of the attack's mid-band (200–700 Hz) energy is still there late
   * in the window (~116–174 ms) compared with early (~35–80 ms).
   *
   * The measure a coincident drum hit cannot fake. Every voice in the backing
   * kit is gone within ~100 ms — the kick's envelope, the snare's noise, the
   * hat — so a drum reads well under 1 here, while struck strings ring for
   * seconds and read ≈1 whether or not a drum landed with them. A ratio
   * against the level BEFORE the attack (like bodyRise) fails for drums:
   * over a quiet gap the "before" is the noise floor and any residue at all
   * blows the ratio up (measured: a lone kick 0.86, a real strum 1.03 —
   * inseparable). Sustain is scale-free and needs no baseline.
   */
  sustain: number;
  /** Pitch class of the lowest note heard, or null if it could not be tracked. */
  bassPitchClass: number | null;
  /** "down" | "up" and how confident, from how the brightness evolves. */
  stroke: "down" | "up";
  strokeConfidence: number;
}

interface Frame {
  time: number;
  flux: number;
  /** Flux from above HF_SPLIT_HZ only — the attack-transient band. */
  hfFlux: number;
  rms: number;
  /** Flux from below BASS_SPLIT_HZ only — the stroke-direction cue. */
  bassFlux: number;
  /** Flux from below LOW_SPLIT_HZ — what separates a strum from the click. */
  lowFlux: number;
  /**
   * Total magnitude below LOW_SPLIT_HZ — the body actually sounding, not the
   * change in it. A struck string keeps this raised for hundreds of ms; a
   * click, highpassed at 600 Hz, never touches it at all.
   */
  lowEnergy: number;
  /** Total magnitude between MID_SPLIT_HZ and LOW_SPLIT_HZ — the strings'
   *  fundamentals and first harmonics, above where a kick drum lives. */
  midEnergy: number;
  centroid: number;
  chroma: Float32Array;
}

/**
 * Per-note weights of a note's harmonic series, at their exact semitone
 * positions (h=7 lands at 33.7 semitones; 34 is close enough at these
 * bandwidths). Matching in note space rather than chroma space is what
 * separates a chord from its superset: C and Cmaj7 differ as C4 versus B3,
 * and folding to pitch classes collapses that into "C-ish with some B" —
 * which harmonics produce anyway. Measured on synthetic strums: 37% right in
 * chroma space against 96%/94%/88% (tidy / ±10 cents / lazy 25 ms-per-string)
 * in note space — scripts/chord-match-eval.ts.
 */
const NOTE_HARMONICS: { step: number; weight: number }[] = [
  { step: 0, weight: 1 },
  { step: 12, weight: 0.5 },
  { step: 19, weight: 0.33 },
  { step: 24, weight: 0.25 },
  { step: 28, weight: 0.2 },
  { step: 31, weight: 0.16 },
  { step: 34, weight: 0.14 },
  { step: 36, weight: 0.12 },
];

/** A chord's expected per-note energy profile over the measured range. */
function noteTemplate(chord: Chord, frets: number[]): Float32Array {
  const t = new Float32Array(NOTE_BINS);
  chordMidiNotes(chord, frets).forEach((midi, i) => {
    const voiceWeight = i === 0 ? 1.6 : 1;
    for (const h of NOTE_HARMONICS) {
      const m = midi + h.step;
      if (m < NOTE_LOW_MIDI || m > NOTE_HIGH_MIDI) continue;
      t[m - NOTE_LOW_MIDI] += voiceWeight * h.weight;
    }
  });
  return normalise(t);
}

/** One template per accepted voicing; a chord scores as its best voicing. */
const TEMPLATES: { chord: Chord; template: Float32Array; bass: number }[] = CHORDS.flatMap((chord) =>
  chordVoicings(chord).map((frets) => ({
    chord,
    template: noteTemplate(chord, frets),
    bass: pitchClassOf(chordMidiNotes(chord, frets)[0]),
  })),
);

/** Samples held for bass tracking. Zero-padded to BASS_FFT before transform. */
const BASS_WINDOW = 2048;
/** Padding buys interpolation, not resolution — enough to place a peak. */
const BASS_FFT = 4096;
/** Plausible bass notes: D2 up to G3. */
const BASS_LOW_MIDI = 38;
const BASS_HIGH_MIDI = 55;
/**
 * Weight on the candidate's own fundamental relative to its harmonics.
 * Swept over synthetic chords: 1 gives 23/32 roots right, 1.5 and 2.5 give
 * 25/32. Any bias toward lower candidates made it worse (18/32 at 1.04).
 */
const BASS_FUNDAMENTAL_WEIGHT = 1.5;

/**
 * How hard to punish template mass the signal does not support.
 *
 * Cosine similarity alone cannot separate a chord from its own superset:
 * Cmaj7 contains every note of C plus one, so a plain C scores against Cmaj7
 * almost as well as against itself. Subtracting the template energy that has
 * no counterpart in the observed notes targets exactly that asymmetry.
 *
 * Re-swept in note space over synthetic strums (2026-08-27): 0.5 and 0.8
 * tie on tidy strums at 50/52; 0.65 keeps that and adds two lazy-strum
 * chords. The old chroma-space sweep (59→72%) no longer applies.
 */
const UNSUPPORTED_PENALTY = 0.65;

/**
 * How much agreeing with the detected bass note is worth.
 *
 * The FFT used for everything else cannot do this job: 43 Hz bins at 44.1 kHz,
 * while E2 and A2 are 28 Hz apart. So the bass is tracked separately, on a
 * padded FFT of a longer window. Down-weighted from 0.35 when matching moved
 * to note space — the note profile now carries most of the bass information
 * itself, and 0.2 measured better on lazy strums (41 vs 39 of 52).
 */
const BASS_BONUS = 0.2;

const bassFft = new FFT(BASS_FFT);
const bassWindow = hannWindow(BASS_WINDOW);
const bassScratch = new Float32Array(BASS_FFT);
const bassMag = new Float32Array(BASS_FFT / 2);

/**
 * Which note is underneath the chord.
 *
 * Scores every plausible bass note by the energy at its fundamental and first
 * three harmonics. The obvious approach — reuse the tuner's pitch detector — is
 * wrong here and measurably so: NSDF asks "is this buffer periodic", a chord is
 * not periodic at any single lag, and it abstained on 29 of 32 chords. Low-pass
 * filtering first did not help, because five of six strings sit below any
 * cutoff that still passes a bass note.
 */
function detectBassPitchClass(samples: Float32Array, sampleRate: number): number | null {
  bassScratch.fill(0);
  for (let i = 0; i < BASS_WINDOW; i++) bassScratch[i] = samples[i] * bassWindow[i];
  bassFft.magnitudes(bassScratch, bassMag);

  const magAt = (hz: number) => {
    const b = (hz * BASS_FFT) / sampleRate;
    const i = Math.floor(b);
    const f = b - i;
    if (i < 1 || i + 1 >= bassMag.length) return 0;
    return bassMag[i] * (1 - f) + bassMag[i + 1] * f;
  };

  let best: number | null = null;
  let bestScore = 0;
  for (let midi = BASS_LOW_MIDI; midi <= BASS_HIGH_MIDI; midi++) {
    const f0 = midiToFreq(midi);
    const score =
      BASS_FUNDAMENTAL_WEIGHT * magAt(f0) +
      0.6 * magAt(2 * f0) +
      0.35 * magAt(3 * f0) +
      0.2 * magAt(4 * f0);
    if (score > bestScore) {
      bestScore = score;
      best = midi;
    }
  }
  return best === null ? null : pitchClassOf(best);
}

/** Similarity, less whatever the template expects and the signal lacks. */
function matchScore(
  observed: Float32Array,
  template: Float32Array,
  templateBass: number,
  heardBass: number | null,
): number {
  let unsupported = 0;
  for (let i = 0; i < template.length; i++) unsupported += Math.max(0, template[i] - observed[i]);
  const base = cosineSimilarity(observed, template) - UNSUPPORTED_PENALTY * unsupported;
  if (heardBass === null) return base;
  return base + (heardBass === templateBass ? BASS_BONUS : 0);
}

export class OnsetDetector {
  private fft = new FFT(FFT_SIZE);
  private window = hannWindow(FFT_SIZE);
  private ring = new Float32Array(FFT_SIZE);
  private ringFill = 0;
  private pending = new Float32Array(0);
  private pendingTime = 0;
  private hasPending = false;

  private mag = new Float32Array(FFT_SIZE / 2);
  /** Log-compressed copy of `mag` — the domain flux is measured in. */
  private cmag = new Float32Array(FFT_SIZE / 2);
  /** Longer than the FFT window: pitch needs periods, not resolution. */
  private bassRing = new Float32Array(BASS_WINDOW);
  /** Raw samples for the chord chroma — long enough to hold the whole
   *  fingerprint window plus the lag the detector runs behind at. */
  private chordRing = new Float32Array(CHORD_RING);
  private prevMag = new Float32Array(FFT_SIZE / 2);
  /**
   * Flux is a difference against the previous spectrum, and `prevMag` starts
   * empty — so the first analysed window measures itself against silence and
   * reports the entire spectrum as a rise. That is a phantom strum at the exact
   * moment listening begins, and worse, its refractory period then swallows the
   * first real one. The first window only primes the comparison.
   */
  private primed = false;
  private scratch = new Float32Array(FFT_SIZE);
  private frames: Frame[] = [];
  private fluxHistory: number[] = [];
  private hfFluxHistory: number[] = [];
  private lowFluxHistory: number[] = [];
  private lastOnsetTime = -1;
  /** Frames appended since reset — the stable index `frames` shifts under. */
  private frameCount = 0;
  /** A confirmed attack waiting out FINGERPRINT_LAG before being described.
   *  `abs` is the flux peak's frame; `onsetAbs` the backtracked attack start. */
  private pendingOnset: {
    abs: number; onsetAbs: number; time: number; frame: Frame; threshold: number;
    lowRatio: number;
    /** The last string absorbed into this strum — where the chain extends from. */
    lastAbs: number; lastTime: number;
  } | null = null;

  /** The longest one strum may take, first string to last, at this pattern. */
  private rakeMaxS(): number {
    return Math.min(RAKE_MAX_S, Math.max(STRUM_MERGE_S, this.minStrumGapS - RAKE_GUARD_S));
  }

  /**
   * How far the next string of a rake may trail the last one absorbed. Twice
   * the strum spread, so one string the flux detector misses (its peak lost
   * under the ringing of the strings before it) doesn't break the chain —
   * the 5th string of a 300 ms rake escaped as an extra on 3 strums in 8 that
   * way. Widened only where the rake bound leaves room for a strum PLUS a
   * skipped string; at eighths and faster it stays one spread, or a real
   * strum 127 ms after the previous strum's last string was chained into it.
   */
  private chainGapS(): number {
    const spread = this.maxStrumSpreadS;
    return Math.min(2 * spread, Math.max(spread, this.rakeMaxS() - spread));
  }

  /** Where the pending strum's chord window should end, in absolute hops. */
  private windowEnd(p: NonNullable<typeof this.pendingOnset>): number {
    const tail = Math.ceil((this.chainGapS() * this.sampleRate) / HOP) + RAKE_TAIL_LAG_HOPS;
    return Math.min(
      p.abs + WINDOW_MAX_HOPS,
      Math.max(p.abs + FINGERPRINT_LAG, p.lastAbs + tail),
    );
  }

  /**
   * How far apart two attacks must be to count as two strums rather than one
   * strum's strings arriving staggered. Defaults to the lazy-strum spread;
   * the engine shortens it at fast tempos (half the slot spacing), because a
   * fixed 110 ms merge was measured swallowing every other strum of on-time
   * sixteenths at 140 bpm (scripts/timing-eval.ts).
   */
  public maxStrumSpreadS = STRUM_MERGE_S;
  /**
   * Shortest gap between two real strums in the current pattern, seconds.
   * The engine sets it; it bounds how long a rake may be merged (RAKE_MAX_S).
   */
  public minStrumGapS = 0.375;

  private loBin: number;
  private hiBin: number;
  private hfBin: number;
  private bassBin: number;
  private lowBin: number;
  private midBin: number;
  private room: RoomProfile | null = null;
  private calibrating = false;
  private calibrationFrames: Frame[] = [];

  constructor(
    private sampleRate: number,
    private onOnset: (o: Onset) => void,
  ) {
    this.loBin = Math.max(1, Math.floor((MIN_HZ * FFT_SIZE) / sampleRate));
    this.hiBin = Math.min(FFT_SIZE / 2, Math.ceil((MAX_HZ * FFT_SIZE) / sampleRate));
    this.hfBin = Math.max(1, Math.floor((HF_SPLIT_HZ * FFT_SIZE) / sampleRate));
    this.bassBin = Math.max(this.loBin + 1, Math.ceil((BASS_SPLIT_HZ * FFT_SIZE) / sampleRate));
    this.lowBin = Math.max(this.loBin + 1, Math.ceil((LOW_SPLIT_HZ * FFT_SIZE) / sampleRate));
    this.midBin = Math.max(this.loBin + 1, Math.ceil((MID_SPLIT_HZ * FFT_SIZE) / sampleRate));
  }

  get roomProfile(): RoomProfile | null {
    return this.room;
  }

  /** Live input level in dBFS, for the meter. */
  get levelDb(): number {
    const last = this.frames[this.frames.length - 1];
    return last ? dbfs(last.rms) : -90;
  }

  beginCalibration() {
    this.calibrating = true;
    this.calibrationFrames = [];
  }

  /**
   * Turn the quiet frames into a room profile.
   *
   * The verdict is deliberately blunt, because the useful action is blunt:
   * a fan or an open window is worth turning off, and being told so beats
   * silently unreliable scoring.
   */
  /**
   * `probeTimes` are the audio times of clicks the app played on purpose
   * during the measurement, so the room statistics can step around them and
   * the round-trip latency can be read off them — see RoomProfile.loopbackMs.
   */
  endCalibration(probeTimes: readonly number[] = []): RoomProfile {
    this.calibrating = false;
    const all = this.calibrationFrames;
    const nearProbe = (t: number) => probeTimes.some((p) => t >= p - 0.02 && t <= p + PROBE_WINDOW_S);
    const frames = all.filter((f) => !nearProbe(f.time));
    const noiseDb = frames.length ? dbfs(median(frames.map((f) => f.rms))) : -90;
    const fluxFloor = frames.length ? median(frames.map((f) => f.flux)) : 0;
    const peakDb = frames.length ? dbfs(Math.max(...frames.map((f) => f.rms))) : -90;

    // The loopback: for each probe, the frame in its window where the flux
    // rise begins (the same walk-back the onset detector uses), provided the
    // window's peak clearly stands above the room. Median across probes.
    const lags: number[] = [];
    for (const p of probeTimes) {
      const win = all.filter((f) => f.time >= p && f.time <= p + PROBE_WINDOW_S);
      if (win.length < 3) continue;
      let peak = win[0];
      for (const f of win) if (f.flux > peak.flux) peak = f;
      if (peak.flux < Math.max(fluxFloor * PROBE_MIN_RISE, 1e-4)) continue;
      let onset = peak;
      for (let k = win.indexOf(peak) - 1; k >= 0; k--) {
        if (win[k].flux >= peak.flux * ONSET_START_FRACTION) onset = win[k];
        else break;
      }
      lags.push(onset.time - p);
    }
    // Frame times are quantised to the hop, and the walk-back lands on the
    // first frame of the rise, so the read runs half a hop early on average:
    // measured 14/33/61 ms for true 18/37/64 (scripts/timing-eval.ts).
    const halfHop = HOP / this.sampleRate / 2;
    const loopbackMs = lags.length >= 2 ? Math.round((median(lags) + halfHop) * 1000) : null;

    let quality: RoomProfile["quality"];
    let message: string;
    if (noiseDb < -80) {
      // No real room is this quiet: a microphone the OS has muted or blocked
      // (macOS system-level permission, a muted input, the wrong device)
      // delivers digital silence, opens without any error, and then simply
      // never hears a strum — which reads as "the mic doesn't work".
      quality = "silent";
      message =
        "The microphone is delivering pure silence — that usually means the wrong input " +
        "is selected, or the system is blocking the browser's mic access (on a Mac: " +
        "System Settings → Privacy & Security → Microphone). Fix that, then measure again.";
    } else if (noiseDb < -55) {
      quality = "quiet";
      message = "Nice and quiet. Timing should read accurately.";
    } else if (noiseDb < -42) {
      quality = "usable";
      message = "A little background noise, but workable. Timing will be fine; chord guesses may wobble.";
    } else {
      quality = "noisy";
      message = "It's noisy in here — a fan, traffic or a nearby speaker. Quieten the room or move the mic closer to the guitar, or the scoring will invent strums you didn't play.";
    }
    if (peakDb > -12) {
      message += " Something loud spiked during calibration, so try that again if the scoring looks wrong.";
    }
    if (probeTimes.length) {
      message += loopbackMs !== null
        ? ` Latency measured at ${loopbackMs} ms and taken into account.`
        : " The clicks didn't reach the mic (headphones?), so the device's latency estimate is in use.";
    }

    this.room = { noiseDb, fluxFloor, quality, message, loopbackMs };
    this.calibrationFrames = [];
    return this.room;
  }

  reset() {
    this.frames = [];
    this.fluxHistory = [];
    this.hfFluxHistory = [];
    this.lowFluxHistory = [];
    this.lastOnsetTime = -1;
    this.frameCount = 0;
    this.pendingOnset = null;
    this.prevMag.fill(0);
    this.primed = false;
  }

  /** Feed one block from the mic. Blocks need not be hop-aligned. */
  push(time: number, samples: Float32Array) {
    // Splice the new block onto anything left over from last time so hops stay
    // exactly HOP apart no matter how the browser sizes its callbacks.
    let data = samples;
    let dataTime = time;
    if (this.hasPending) {
      const merged = new Float32Array(this.pending.length + samples.length);
      merged.set(this.pending, 0);
      merged.set(samples, this.pending.length);
      data = merged;
      dataTime = this.pendingTime;
      this.hasPending = false;
    }

    let offset = 0;
    while (offset + HOP <= data.length) {
      this.consumeHop(dataTime + offset / this.sampleRate, data.subarray(offset, offset + HOP));
      offset += HOP;
    }
    const rest = data.length - offset;
    if (rest > 0) {
      this.pending = data.slice(offset);
      this.pendingTime = dataTime + offset / this.sampleRate;
      this.hasPending = true;
    }
  }

  private consumeHop(time: number, hop: Float32Array) {
    // Slide the analysis window along by one hop.
    this.ring.copyWithin(0, HOP);
    this.ring.set(hop, FFT_SIZE - HOP);
    this.bassRing.copyWithin(0, HOP);
    this.bassRing.set(hop, BASS_WINDOW - HOP);
    this.chordRing.copyWithin(0, HOP);
    this.chordRing.set(hop, CHORD_RING - HOP);
    this.ringFill = Math.min(FFT_SIZE, this.ringFill + HOP);
    if (this.ringFill < FFT_SIZE) return;

    for (let i = 0; i < FFT_SIZE; i++) this.scratch[i] = this.ring[i] * this.window[i];
    this.fft.magnitudes(this.scratch, this.mag);

    if (!this.primed) {
      this.prevMag.set(this.cmag);
      this.primed = true;
      return;
    }

    // Flux is measured on log-compressed magnitudes. Linear flux is deaf to
    // the most common strum of all — the same chord re-struck over its own
    // loud ring: the bins are already energised, so the *increase* is a small
    // fraction of what is there, and synthetic re-strums 350 ms apart simply
    // never crossed the threshold (scripts/timing-eval.ts). In the log domain
    // a doubling counts the same whether the bin started loud or quiet, and
    // the high band's noise-to-scrape jump gets amplified, which is exactly
    // what the HF attack gate wants.
    for (let i = 0; i < this.mag.length; i++) this.cmag[i] = Math.log1p(this.mag[i]);
    const flux = spectralFlux(this.cmag, this.prevMag, this.loBin, this.hiBin);
    const hfFlux = spectralFlux(this.cmag, this.prevMag, this.hfBin, this.hiBin);
    const bassFlux = spectralFlux(this.cmag, this.prevMag, this.loBin, this.bassBin);
    const lowFlux = spectralFlux(this.cmag, this.prevMag, this.loBin, this.lowBin);
    const frame: Frame = {
      // The window is centred on audio that is FFT_SIZE/2 samples old; report
      // the time of the window's centre so onsets aren't stamped half a window
      // late.
      time: time + HOP / this.sampleRate - FFT_SIZE / 2 / this.sampleRate,
      flux,
      hfFlux,
      rms: rms(hop),
      bassFlux,
      lowFlux,
      lowEnergy: bandEnergy(this.mag, this.loBin, this.lowBin),
      midEnergy: bandEnergy(this.mag, this.midBin, this.lowBin),
      centroid: spectralCentroid(this.mag, this.sampleRate, FFT_SIZE, this.loBin, this.hiBin),
      chroma: chroma(this.mag, this.sampleRate, FFT_SIZE, new Float32Array(12)),
    };
    this.prevMag.set(this.cmag);

    if (this.calibrating) {
      this.calibrationFrames.push(frame);
      if (this.calibrationFrames.length > 400) this.calibrationFrames.shift();
      return;
    }

    this.frames.push(frame);
    this.frameCount += 1;
    if (this.frames.length > HISTORY + LAG + 8) this.frames.shift();
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > HISTORY) this.fluxHistory.shift();
    this.hfFluxHistory.push(hfFlux);
    if (this.hfFluxHistory.length > HISTORY) this.hfFluxHistory.shift();
    this.lowFluxHistory.push(lowFlux);
    if (this.lowFluxHistory.length > HISTORY) this.lowFluxHistory.shift();

    this.detect();

    // A pending attack whose window has filled is finally described.
    if (this.pendingOnset && this.frameCount >= this.windowEnd(this.pendingOnset)) {
      this.finishPending(null);
    }
  }

  /** Absolute index of frames[rel]. */
  private absIndexOf(rel: number): number {
    return this.frameCount - this.frames.length + rel;
  }

  /**
   * Describe and emit the pending onset. `capAbs` truncates its window at a
   * newly-detected attack, so a fast following strum never leaks into it.
   */
  private finishPending(capAbs: number | null) {
    const p = this.pendingOnset;
    if (!p) return;
    this.pendingOnset = null;
    const base = this.frameCount - this.frames.length;
    const endAbs = Math.min(
      this.windowEnd(p), capAbs ?? Infinity,
      Math.max(p.abs + FINGERPRINT_LAG, p.lastAbs + RAKE_TAIL_HOPS),
    );
    // The frame window starts at the backtracked attack, not the flux peak:
    // the stroke-direction slope reads the first ~30 ms, and anchored at the
    // peak it was reading the middle of the strum instead of its start.
    const startRel = Math.max(0, p.onsetAbs - base);
    const endRel = Math.max(startRel + 1, Math.min(this.frames.length, endAbs - base));

    // The chord chroma's slices of the sample ring. Post: from just past the
    // attack (skipping the pick scrape) to the window's end — the ring's
    // newest sample sits at frameCount, so a capped window ends short of the
    // ring's end and the next strum's audio stays out. Pre: the audio just
    // before the attack, i.e. whatever was still ringing there.
    const hopsPast = this.frameCount - endAbs;
    const segEnd = CHORD_RING - hopsPast * HOP;
    const segLen = Math.max(2, endAbs - p.abs - FINGERPRINT_SKIP) * HOP;
    const postSeg = this.chordRing.subarray(Math.max(0, segEnd - segLen), Math.max(0, segEnd));

    // Anchored to the backtracked attack START, not the flux peak: the peak
    // sits a few hops into the strum, and a pre-window measured up to it
    // contains the strum's own first strings — subtracting those turned every
    // isolated E into an E5 (the bass trio removed from its own chord).
    const attackAt = segEnd - (endAbs - p.onsetAbs) * HOP;
    const preEnd = attackAt - 2 * HOP;
    const preSeg = this.chordRing.subarray(Math.max(0, preEnd - PRE_RING_HOPS * HOP), Math.max(0, preEnd));

    this.onOnset(this.fingerprint(
      startRel, endRel, postSeg, preSeg, p.time, p.frame, p.threshold, p.lowRatio,
    ));
  }

  private detect() {
    const idx = this.frames.length - 1 - LAG;
    if (idx < 1) return;
    const f = this.frames[idx];

    // Threshold = a multiple of a LOW percentile of recent flux, floored by
    // what the room itself produces when nobody is playing. The median was
    // the obvious choice and fails during continuous fast playing: with an
    // attack every ~110 ms, half the history IS attacks, the median tracks
    // them upward, and detection goes deaf after half a second of on-time
    // sixteenths (scripts/timing-eval.ts). A low percentile stays under the
    // attacks, and the multiplier is deliberately permissive — since the HF
    // attack gate below rejects ring wobbles by mechanism, the flux gate no
    // longer has to carry the whole job of separating them by level.
    const sortedFlux = [...this.fluxHistory].sort((a, b) => a - b);
    const base = sortedFlux.length
      ? sortedFlux[Math.floor(sortedFlux.length * 0.25)]
      : 0;
    const floor = (this.room?.fluxFloor ?? 0) * 3;
    const threshold = Math.max(base * 1.8, floor, 1e-4);
    if (f.flux < threshold) return;

    // Must be the local peak, or one strum registers three times.
    for (let k = idx - 2; k <= idx + 2; k++) {
      if (k < 0 || k >= this.frames.length || k === idx) continue;
      if (this.frames[k].flux > f.flux) return;
    }

    // The flux peak sits mid-strum — the strings arrive staggered — so the
    // reported time walks back to where the rise began. Without this every
    // timestamp read ~30 ms late on synthetic strums (scripts/timing-eval.ts).
    // Bounded below by the threshold too, or over a ringing chord the walk
    // continues into the ring's own flux and stamps the attack early.
    const backstop = Math.max(f.flux * ONSET_START_FRACTION, threshold * 0.7);
    let onsetIdx = idx;
    for (let k = idx - 1; k >= Math.max(0, idx - 6); k--) {
      if (this.frames[k].flux >= backstop) onsetIdx = k;
      else break;
    }
    const time = this.frames[onsetIdx].time;

    if (this.lastOnsetTime > 0 && time - this.lastOnsetTime < MIN_GAP_S) return;
    // Reject attacks that never rise above the room. Without this, a noisy
    // room's own fluctuations get scored as playing.
    if (this.room && dbfs(f.rms) < this.room.noiseDb + 8) return;

    // Beating between ringing strings produces genuine flux peaks with no
    // attack in them — see HF_ATTACK_RATIO. Summed over the whole attack,
    // from the backtracked start to just past the peak, because the pick
    // scrape leads the strings by a few frames. The room's own broadband
    // noise carries HF flux in every frame, so what counts is the EXCESS
    // over the running high-band baseline — without that subtraction a
    // merely "usable" room floated every ring wobble over the gate
    // (21 phantom extras in one 12-strum session, scripts/timing-eval.ts).
    const sortedHf = [...this.hfFluxHistory].sort((a, b) => a - b);
    const hfBase = sortedHf.length ? sortedHf[Math.floor(sortedHf.length * 0.5)] : 0;
    // A LOW percentile, deliberately: during continuous playing the median
    // low-band flux IS the playing, and a baseline that tracks it upward eats
    // the very strums it is meant to protect.
    const sortedLow = [...this.lowFluxHistory].sort((a, b) => a - b);
    const lowBase = sortedLow.length ? sortedLow[Math.floor(sortedLow.length * 0.3)] : 0;
    let hf = 0;
    let lf = 0;
    let low = 0;
    let frames = 0;
    for (let k = Math.max(0, onsetIdx - 1); k <= Math.min(this.frames.length - 1, idx + 2); k++) {
      hf += this.frames[k].hfFlux;
      lf += this.frames[k].flux;
      low += this.frames[k].lowFlux;
      frames += 1;
    }
    const hfExcess = hf - hfBase * frames;
    const lowExcess = low - lowBase * frames;
    if ((globalThis as { __ONSET_DEBUG?: boolean }).__ONSET_DEBUG) {
      console.log(
        `  cand t=${time.toFixed(3)} hfx/lf=${(hfExcess / (lf || 1)).toFixed(4)}` +
        ` lowx/lf=${(lowExcess / (lf || 1)).toFixed(3)}` +
        ``,
      );
    }
    if (hfExcess < lf * HF_ATTACK_RATIO) return;
    // All treble, no body: the metronome click, not a strum. See LOW_SPLIT_HZ.
    // Excess over the running low-band baseline, or the room's own noise
    // floor lends the click enough low-band flux to slip through.
    const lowRatio = lowExcess / (lf || 1);
    if (lowRatio < LOW_ATTACK_RATIO) return;

    // The same strum's later strings: keep the window open, emit nothing. The
    // gap is measured from the LAST string absorbed, so a slow rake chains
    // through; the whole rake is bounded by RAKE_MAX_S and by the pattern.
    if (this.pendingOnset) {
      const p = this.pendingOnset;
      if (time - p.lastTime < this.chainGapS() && time - p.time < this.rakeMaxS()) {
        p.lastTime = time;
        p.lastAbs = this.absIndexOf(idx);
        this.lastOnsetTime = time;
        return;
      }
    }

    this.lastOnsetTime = time;
    // A new attack closes the previous fingerprint early — its window must
    // not include this strum's audio — and then waits out its own window.
    const abs = this.absIndexOf(idx);
    this.finishPending(abs);
    this.pendingOnset = {
      abs, onsetAbs: this.absIndexOf(onsetIdx), time, frame: f, threshold,
      lowRatio, lastAbs: abs, lastTime: time,
    };
  }

  /** Describe the attack: what chord it looks like, and which way the hand went. */
  private fingerprint(
    startRel: number, endRel: number, postSeg: Float32Array, preSeg: Float32Array,
    time: number, f: Frame, threshold: number, lowRatio: number,
  ): Onset {
    const window = this.frames.slice(startRel, endRel);

    // How much more body is sounding after the attack than before it — the
    // one measure a coincident metronome click cannot fake. See Onset.bodyRise.
    // The few frames IMMEDIATELY before the attack, not a long average: over
    // a decaying chord a long window sits higher than the trough the new
    // strum actually rises from, which crushed the ratio for on-beat strums.
    const pre = this.frames.slice(Math.max(0, startRel - 4), Math.max(0, startRel - 1));
    const post = window.slice(BODY_SKIP, BODY_SKIP + BODY_FRAMES);
    const rise = (pick: (fr: Frame) => number) =>
      pre.length >= 3 && post.length >= 3
        ? median(post.map(pick)) / Math.max(median(pre.map(pick)), 1e-9)
        // Not enough history to compare against (session start): believe it.
        : Infinity;
    const bodyRise = rise((fr) => fr.lowEnergy);
    // Sustain: late mid-band energy over early. See Onset.sustain. A window
    // cut short by a following attack has no "late" — believe the attack.
    const earlyMid = window.slice(BODY_SKIP, BODY_SKIP + 8).map((fr) => fr.midEnergy);
    const lateMid = window.slice(SUSTAIN_FROM, SUSTAIN_FROM + 10).map((fr) => fr.midEnergy);
    const sustain =
      earlyMid.length >= 4 && lateMid.length >= 4
        ? median(lateMid) / Math.max(median(earlyMid), 1e-9)
        : Infinity;

    // The chord, heard note-by-note over the deferred window, minus whatever
    // was already ringing before the attack. The FFT chroma the frames carry
    // cannot do this job — see noteEnergies in dsp.ts.
    const energies = noteEnergies(postSeg, this.sampleRate, new Float32Array(NOTE_BINS));
    if (preSeg.length >= 2048) {
      const pre = noteEnergies(preSeg, this.sampleRate, new Float32Array(NOTE_BINS));
      for (let i = 0; i < NOTE_BINS; i++) {
        energies[i] = Math.max(0, energies[i] - RING_SUBTRACT * pre[i]);
      }
    }
    // Compress before matching. A real guitar's third rings several dB under
    // its root and fifth (the root's harmonics reinforce the fifth, nothing
    // reinforces the third), and on linear amplitudes the loud pair swamped
    // it: a recorded D read as D5, a recorded G as G5. Under a square root
    // the weak note still counts — and the synthetic set rose from 94/92/87%
    // to 100% on all three tiers (scripts/chord-match-eval.ts). A cube root
    // over-flattens: it loses a synthetic Gmaj7 and the recorded Em's margin.
    for (let i = 0; i < NOTE_BINS; i++) energies[i] = Math.sqrt(energies[i]);
    normalise(energies);
    const avg = foldToChroma(energies, new Float32Array(12));

    const heardBass = detectBassPitchClass(this.bassRing, this.sampleRate);

    const byChord = new Map<Chord, number>();
    for (const { chord, template, bass } of TEMPLATES) {
      const score = matchScore(energies, template, bass, heardBass);
      if (score > (byChord.get(chord) ?? -Infinity)) byChord.set(chord, score);
    }
    const ranked = [...byChord].sort((a, b) => b[1] - a[1]);
    const ranking = ranked.map(([chord, score]) => ({ id: chord.id, score }));
    const best = ranking[0] ?? null;
    // A chord's own power chord is not a competitor: on a real guitar the
    // third rings under the root and fifth, so the full chord and its
    // root-fifth subset always score close together. Counting that as doubt
    // left a cleanly recorded D at margin 0.07 (D 0.33 vs D5 0.26) when its
    // nearest REAL rival, Dsus2, sat at 0.09.
    const rival = ranked.find(([chord], i) => i > 0 && !(isPowerChord(chord) && chordIsSubset(chord, ranked[0][0])));
    const runnerUp = rival?.[1] ?? 0;
    // Confidence is the *margin* over the next-best chord, and nothing else.
    // Chords share notes, so an absolute score means very little on its own —
    // measured on the synthetic set, wrong guesses actually had *higher*
    // median raw scores than right ones (0.61 vs 0.49), while margins
    // separated cleanly: right p10≈0.10/p50≈0.28 against wrong p50≈0.03–0.08
    // (scripts/chord-match-eval.ts). The old score term was dropped for that
    // reason. Calibrated so the scorer's gate ignores the murky bottom
    // quartile of correct guesses rather than ever accusing from a weak one.
    const margin = best ? Math.max(0, best.score - runnerUp) : 0;
    const chordConfidence = best ? Math.max(0, Math.min(1, (margin - 0.06) / 0.18)) : 0;

    // Stroke direction from where the strum STARTS — see BASS_SPLIT_HZ. This
    // wants the first frames of the attack, not the long chord window.
    const attack = window.slice(0, Math.min(3, window.length));
    let bassNew = 0;
    let allNew = 0;
    for (const fr of attack) {
      bassNew += fr.bassFlux;
      allNew += fr.flux;
    }
    const early = allNew > 0 ? bassNew / allNew : 0;
    const stroke: "down" | "up" = early >= STROKE_BASS_THRESHOLD ? "down" : "up";
    // Halved in dense playing (the engine narrows the merge window at fast
    // tempos): quick strums overlap their neighbours' rings and the early
    // frames stop being readable — measured down-strums at sixteenth spacing
    // sat inside the up-strum range, and a confident wrong "up" is worse
    // than silence.
    const dense = this.maxStrumSpreadS < STRUM_MERGE_S;
    const strokeConfidence =
      Math.min(1, Math.abs(early - STROKE_BASS_THRESHOLD) / 0.12) * (dense ? 0.5 : 1);
    if ((globalThis as { __ONSET_DEBUG?: boolean }).__ONSET_DEBUG) {
      console.log(`  stroke t=${time.toFixed(3)} earlyBass=${early.toFixed(3)} -> ${stroke}`);
    }

    return {
      time,
      strength: f.flux / threshold,
      levelDb: dbfs(f.rms),
      chroma: avg,
      chordGuess: best?.id ?? null,
      chordConfidence,
      matchScore: best?.score ?? 0,
      chordRanking: ranking.slice(0, 3),
      matchMargin: margin,
      lowRatio,
      bodyRise,
      sustain,
      bassPitchClass: heardBass,
      stroke,
      strokeConfidence,
    };
  }
}
