# StrumLab

A single-screen guitar practice deck: build a strumming pattern, pick the chord
for each bar, play it against a metronome — and let the microphone tell you how
close you actually were.

Runs entirely in the browser. No samples, no audio uploads, no server required.

```bash
npm run dev
```

## The pages

| Route | What it is |
| --- | --- |
| `/` | Cover — wordmark, one sentence, one button. Deliberately the only page that does nothing; a landing page that also tries to be a working surface is neither. |
| `/play` | The practice screen. |
| `/chords` | All 32 shapes, tap any card to hear it on the real recordings. |
| `/patterns` | Saved patterns as cards with the stroke grid drawn out — the shape is what you recognise, not the name. |

### The practice screen

- **The chord**, set in inflated chrome, is the one large thing on screen.
- **The lane** — the pattern as slots on a light ground. Skipped slots still
  draw a faint direction arrow, because the strumming hand never stops moving,
  and a lane showing only the strokes you play teaches the opposite.
- **The feedback** — appears only while the mic is judging.
- **The transport** — play, tempo, what you hear, the microphone, settings.

Each slot carries its own mark as it goes past: a coloured ring, a badge
(tight / close / loose / missed) and its timing error in milliseconds. A missed
slot is desaturated, so "nothing heard there" reads differently from "played,
but badly" — different mistakes, different fixes.

## The look

Flat editorial: full-width blocks alternating black and brushed steel, liquid
chrome lettering, sparkle and orb confetti, tiny wide-tracked caps. Y2K in its
chrome-and-gunmetal register rather than its pastel one. There was a skeuomorphic
hi-fi deck here — chrome bezels, glossy controls, a spinning record with a
tonearm tracking the loop. It is gone. The tonearm and the lane's playhead were
saying the same thing twice, and the gloss fought the type.

Two things worth knowing before changing any of it:

- **Components never name a colour.** They use semantic tokens — `--fg`,
  `--accent`, `--tight`. Switching a block from dark to light is one class,
  `.block-light`, which re-points those tokens so every child follows without
  knowing it moved. Re-skinning the app is an edit to `globals.css` alone — the
  pastel-to-chrome change was exactly that plus one component.

### Screen sizes

Verified from 320px to 1920px. Three things do the work: `.wrap` caps content
at 1440px so body copy never runs to unreadable line lengths on an ultrawide;
the strum lane sets a minimum width per bar so it scrolls rather than
compressing arrows into unreadable slivers; and the caps tracking tightens
below 380px, where 0.28em of letter-spacing is width the screen cannot spare.
- **Layout is an app shell, not a long page.** `main` is a fixed-height column:
  nav, one scrolling region, transport pinned in flow at the bottom. The
  earlier version used a sticky footer, which needs a spacer exactly matching
  the bar's height — and measuring that means depending on `resize` events or a
  `ResizeObserver`, both of which some embedded browser contexts never fire. In
  a shell the bar simply cannot overlap the content at any size, and nothing
  has to measure anything.
- **The chrome lettering is two stacked copies** of the same text: a blurred
  solid behind for the bloom, a gradient-clipped face on top. It has to be two
  elements, because `background-clip: text` discards everything outside the
  glyphs — the glow included. The gradient's hard mid-stops are what read as a
  reflection; a smooth ramp between the same colours looks like plastic.

## How the timing works

React never decides when a sound happens. `lib/audio/transport.ts` runs a
lookahead scheduler: a coarse 20 ms timer books every upcoming slot against the
`AudioContext` clock about 120 ms ahead. The timer being late costs nothing
because the notes were already scheduled. The screen catches up afterwards from
a `requestAnimationFrame` loop that reveals each slot at the moment it sounds.

Anything driven from `setInterval` + `setState` drifts audibly within a few bars
and stalls outright in a background tab.

## The guitar sound

Two of the three tones are **real recordings**, both public domain:

| Tone | What it is | Source | Licence |
| --- | --- | --- | --- |
| Acoustic | Nylon-string classical guitar | FreePats Spanish classical, rec. roberto@zenvoid.org, 2008 | CC0 1.0 |
| Electric | A Fender through a clean amp, bridge pickup | FreePats Electric Guitar FSBS (clean) | CC0 1.0 |
| Synth | Karplus-Strong plucked-string model | — | — |

The synth is not just a leftover: it is what plays if a download fails, because
a practice tool going silent over a failed fetch is worse than one sounding
synthetic.

**There is no steel-string tone, and that is the honest gap.** A steel-string
dreadnought — bright and jangly — is what most strumming patterns are actually
written for; the nylon classical is warmer and rounder, and better suited to the
fingerpicking work later. FreePats has [a steel-string
set](https://freepats.zenvoid.org/Guitar/steel-acoustic-guitar.html), but it is
GPL-3, and its exception only covers *music you record using the samples*, not
an application that redistributes the sample files. Bundling it would mean
shipping GPL-3 files, so it was left out deliberately rather than overlooked.

### How instruments are built

Only the samples the chord library can actually reach are shipped — about 2 MB
per instrument instead of the full sets. Adding one is two steps:

```bash
python3 scripts/build-samples.py <id> <extracted-library-dir>
# then add one entry to src/lib/audio/samples/index.ts
```

Nothing else in the app needs to know it exists.

They are **FLAC**, deliberately. FLAC is lossless and carries no encoder delay
at the head of the file, where MP3 and AAC both prepend padding. Measured in the
browser, these decode with 0.1–0.3 ms of leading silence, so an attack lands
exactly where the transport scheduled it. In a timing trainer that is not a
detail.

Notes ring for five to nine seconds, so each string gets **one voice**:
re-striking a string damps whatever it was playing, as a real one does. Without
that, a bar of eighths stacks around 48 overlapping notes. Measured on the real
engine, the cap holds peak polyphony at 12.

## Hearing itself

The app plays a guitar while listening through a microphone, with echo
cancellation deliberately off. On speakers it will otherwise hear its own
playback and score it as your strumming — and better samples make that worse,
not better.

Three options, in `Settings → Listening`:

- **Mute guitar** (default) — the guitar part goes quiet while the mic judges.
  The click keeps playing. The only option that is always correct.
- **Subtract** — keeps the guitar audible and drops onsets that land on the
  app's own notes and are no louder than the quiet end of what it's been
  hearing. Best effort: a quiet, perfectly-timed strum looks exactly like
  bleed and will occasionally be dropped.
- **Leave it** — nothing suppressed. Right on headphones, wrong on speakers.

## How the listening works

There is no server and no R — the analysis is all local, because the timestamp
of a strum has to be taken at capture time to be worth anything. A round trip
to a backend would add 100–300 ms to a measurement whose whole point is
resolving 30 ms.

```
getUserMedia (all "enhancements" OFF)
  -> highpass 70 Hz  (mains hum, desk rumble)
  -> lowpass 6 kHz   (hiss)
  -> AudioWorklet    (forwards raw blocks + sample-accurate timestamps)
  -> FFT per 256-sample hop (~5.8 ms)
       -> spectral flux   -> onset detection
       -> chroma          -> which chord
       -> treble ratio    -> up or down
  -> Scorer: match onsets to expected slots
```

Three decisions worth knowing before changing anything:

**Browser audio processing is switched off.** `echoCancellation`,
`noiseSuppression` and `autoGainControl` are speech algorithms. AGC flattens
your dynamics; noise suppression treats a sustained note as stationary noise and
eats it. They make a guitar harder to analyse, not easier.

**Noise is rejected structurally, not filtered.** Onsets come from *spectral
flux* — the sum of increases in bin magnitude. A fan, mains hum or traffic has a
roughly constant spectrum and so contributes almost nothing; a struck string
makes every bin jump at once. On top of that, a two-second calibration measures
the room's actual noise floor, sets the detection threshold from it, and says
plainly when the room is too loud to trust.

**Latency is one number, and it is visible.** The mic, driver and speakers each
add a fixed delay. That is `listen.offsetMs`, seeded from the AudioContext's own
reported latencies. The scorer reports mean error separately from spread, so a
constant bias reads as a setting to fix rather than as bad playing — and
"zero it from my last few strums" does exactly that.

Chord confidence is the *margin* over the next-best chord, not the raw match
score. Chords share notes; C and Am both score high on almost any C-ish strum,
so an absolute score means very little on its own.

## Layout

```
src/
  lib/
    music/      theory, chords, pattern      — pure, no React, no audio
    audio/      engine (Karplus-Strong), transport, perform
    listen/     fft, dsp, mic, detector, scoring
    feedback/   presentation                 — how a verdict looks and reads
    storage/    local store, settings, cloud sync
    supabase/   optional auth
  hooks/        useStrumEngine, useAccount
  components/   the screen, plus Backdrop
```

`lib/music`, `lib/listen` and `lib/feedback` are deliberately free of React and
of Web Audio, so they can be tested directly and reused for the
chord-progression, song and fingerpicking work later. `Pattern.slotsPerBar` is a
field rather than a constant for the same reason: the editor only offers
eighths today, but sixteenths and triplets already work everywhere downstream.

Three files exist purely as seams, because they are where changes land:

- `lib/audio/perform.ts` — what a slot *sounds* like. Adding fingerpicking or
  per-string plucks is an edit here, not in the scheduler.
- `lib/feedback/presentation.ts` — every verdict colour, glyph, phrase and the
  timing-meter geometry. No component knows what "close" means in milliseconds.
- `components/Backdrop.tsx` — the entire decorative background. Nothing else
  references its classes, so the look is replaceable in one file.

**`AGENTS.md` carries a "to change X, open Y" table and the invariants.** Start
there rather than reading the tree.

## Saving

Patterns live in `localStorage` and the app is fully usable with no account.
Signing in (optional) adds a synced copy — set the Supabase env vars in
`.env.example` and run `supabase/schema.sql`. Without those vars the sign-in
control is not rendered at all, rather than shown and broken.

On first sign-in the newer copy wins; if the local one is newer it is pushed up,
so signing in never silently discards work done while signed out.
