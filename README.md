# StrumLab

A strumming trainer that listens back.

I can play chords fine. What I can't do is keep time — I rush every chorus and
never notice until I hear a recording. Metronome apps don't help with that,
because they tell you where the beat *is*, not where you *were*. So this one
listens through the microphone and tells you which strums landed and which
didn't.

Build a pattern, pick a chord per bar, hit play. Turn the mic on and it marks
every strum: on time, rushing, dragging, or missed.

```bash
npm install
npm run dev
```

Runs entirely in the browser. No samples to download, no account, nothing leaves
your machine.

## What's in it

Four pages: a cover, the practice screen, a chord library (tap any card to hear
it), and your saved patterns.

You practise one of two things, and there's a toggle at the top for it: a single
chord drilled against a rhythm, or a chord progression. Both are built the same
way — a strum style is one bar of strokes that tiles across whatever chords it's
given, so six rhythms and eight progressions cover forty-eight combinations
without storing any of them.

The practice screen is the whole point. Big chord, the pattern laid out as a
row of slots with a playhead, transport at the bottom. Everything else is
behind the settings sheet.

One detail I'm quietly pleased with: slots you *skip* still show a faint arrow
for which way the hand is travelling. Your strumming hand never stops moving,
it just misses the strings on the off-beats, and every chart I learned from
drew only the hits — which taught me the wrong thing for about a year.

## The part I actually spent time on

Hearing the guitar. Most of the work was finding out what doesn't work.

**Detecting a strum.** First attempt used a plain volume threshold. Useless —
either deaf in a normal room or triggering on a passing bus. What works is
spectral flux: sum only the *increases* in each frequency bin between frames. A
fan or a hum has a roughly constant spectrum so it contributes nothing, while a
struck string makes every bin jump at once. Noise gets rejected by the shape of
the maths rather than by filtering, which felt like cheating when it started
working.

On top of that there's a two-second calibration where you sit still and it
measures the room. If it's too loud it says so instead of silently producing
nonsense.

**Browser "enhancements" are off.** `echoCancellation`, `noiseSuppression`,
`autoGainControl` — all disabled. They're tuned for speech. Auto gain flattens
your dynamics and noise suppression decides a sustained note is background hum
and eats it. Leaving them on made everything measurably worse.

**Timestamps come from an AudioWorklet**, not the main thread, so they stay
sample-accurate even when React is busy. This is the bit that makes "you were
38ms late" a true statement rather than a guess.

**Latency is one number and it's visible.** Your mic, driver and speakers each
add a fixed delay, so your first session will look terrible for reasons that
have nothing to do with your playing. The app reports average error separately
from spread, because they mean different things: consistently 40ms late is a
setting to fix, scattered either side of the beat is a real timing problem. The
stop summary says which one you are, and there's a button that zeroes the
offset from your last few strums.

**Chord recognition is the weak part.** It matches a chroma vector against the
chord's pitch classes, scored on the *margin* over the next-best match rather
than the raw similarity — C and Am both score high on almost any C-ish strum,
so an absolute score means very little. It's shown as a soft hint and skipped
entirely when confidence is low. It'll never be as reliable as the timing.

I did briefly consider doing the analysis in R, which I know better than DSP in
JavaScript. It doesn't work: R in the browser is a 30MB WASM download and isn't
real-time, and putting it on a server adds 100–300ms to a measurement whose
entire job is resolving 30ms. The timestamp has to be taken at capture time.

## Timing

React never decides when a sound happens. A lookahead scheduler books every
note against the `AudioContext` clock about 120ms ahead; the screen catches up
afterwards. Anything driven by `setInterval` + `setState` drifts audibly within
a few bars.

One trap I fell into: the UI loop was on `requestAnimationFrame`, which doesn't
fire at all when the tab is hidden. The metronome kept running on the audio
clock while the screen froze, which looks exactly like the app being broken.
It's on a 25ms timer now.

## The guitar sounds

Three real recordings and a synth fallback:

| Tone | What it is | Licence |
| --- | --- | --- |
| Acoustic | Steel-string dreadnought | **GPL-3.0-or-later** |
| Classical | Nylon-string | CC0 |
| Electric | Fender, clean amp | CC0 |
| Synth | Karplus-Strong model | — |

All from [FreePats](https://freepats.zenvoid.org/). Only the notes the chord
library can actually reach are shipped, so an instrument is 1–2MB instead of
the whole set (the steel-string is under a megabyte). The synth isn't a leftover — it's what plays if a download
fails, because going silent is worse than sounding fake.

Adding an instrument is one command plus one line in
`src/lib/audio/samples/index.ts`:

```bash
python3 scripts/build-samples.py <id> <extracted-library-dir>
```

**Careful with the licence.** The steel-string samples are GPL-3. FreePats
publishes a "sound exception" alongside them, and I assumed it covered this
until I read it properly: it applies to *music you record using the sounds*,
not to an app that redistributes the sample files. So those files travel under
plain GPL terms. They sit in their own directory, aren't linked into the code,
and load like any other asset, which is why the source can stay MIT. Delete
`public/samples/acoustic/` and its registry entry if you want the project
wholly permissive.

## Known rough edges

- **The detector has never heard a real guitar.** Everything downstream of it
  is verified; the thresholds themselves are educated guesses. Expect to tune
  `MIN_GAP_S` and the flux multiplier in `src/lib/listen/detector.ts`.
- Chord recognition wobbles, as above.
- Use headphones. The app mutes its own guitar while listening by default,
  because otherwise the mic hears the playback and scores it as you.
- No practice history yet. Sessions are summarised and then forgotten.

## Layout

```
src/lib/music/     theory, chords, patterns    — pure, no React, no audio
src/lib/audio/     synth, transport, playback
src/lib/listen/    fft, dsp, mic, detection, scoring
src/lib/feedback/  how a verdict looks and reads
src/components/    the UI
```

`lib/music` and `lib/listen` don't import React or Web Audio, which keeps them
testable and reusable for the fingerpicking and song work I want to do next.
`AGENTS.md` has a "to change X, open Y" table.

## Saving and deploying

Patterns live in localStorage. Signing in (optional, Supabase) adds sync across
devices; without the env vars the sign-in button just doesn't appear.

Deploys to Vercel as-is. Two things that caught me out:

- `NEXT_PUBLIC_*` values are inlined at build time, so setting them in Vercel
  after a deploy does nothing until the next build.
- Supabase rejects OAuth redirects from unregistered origins, and every Vercel
  preview gets its own hostname. Add a wildcard
  (`https://your-project-*.vercel.app/auth/callback`) or sign-in works in
  production and fails on every preview.

If you add a CSP, allow `blob:` in `worker-src` and `script-src` — the
AudioWorklet loads from a blob URL, and without it listening breaks silently
while everything else looks fine.

## Licence

MIT for the code. **Not for the audio** — see [LICENSE](LICENSE), and the note
above about the steel-string samples.
