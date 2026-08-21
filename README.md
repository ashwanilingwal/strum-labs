# StrumLab

A single-screen guitar practice deck: build a strumming pattern, pick the chord
for each bar, play it against a metronome — and let the microphone tell you how
close you actually were.

Runs entirely in the browser. No samples, no audio uploads, no server required.

```bash
npm run dev
```

## The one screen

There is one route. Chords, metronome, audio and settings are all it contains;
settings slide over the deck rather than living on a separate page.

- **The deck** — the record's label shows the chord you are on, the tonearm
  tracks your position in the loop.
- **The lane** — the pattern as slots. Skipped slots still draw a faint
  direction arrow, because the strumming hand never stops moving.
- **The transport** — play, tempo, what you hear, and the microphone.
- **Settings** — the pattern builder, sound, listening and (optionally) account.

## How the timing works

React never decides when a sound happens. `lib/audio/transport.ts` runs a
lookahead scheduler: a coarse 20 ms timer books every upcoming slot against the
`AudioContext` clock about 120 ms ahead. The timer being late costs nothing
because the notes were already scheduled. The screen catches up afterwards from
a `requestAnimationFrame` loop that reveals each slot at the moment it sounds.

Anything driven from `setInterval` + `setState` drifts audibly within a few bars
and stalls outright in a background tab.

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
    music/      theory, chords, pattern     — pure, no React, no audio
    audio/      engine (Karplus-Strong), transport
    listen/     fft, dsp, mic, detector, scoring
    storage/    local store, settings, cloud sync
    supabase/   optional auth
  hooks/        useStrumEngine, useAccount
  components/   the screen
```

`lib/music` and `lib/listen` are deliberately free of React and of Web Audio, so
they can be tested directly and reused for the chord-progression, song and
fingerpicking work later. `Pattern.slotsPerBar` is a field rather than a
constant for the same reason: the editor only offers eighths today, but
sixteenths and triplets already work everywhere downstream.

## Saving

Patterns live in `localStorage` and the app is fully usable with no account.
Signing in (optional) adds a synced copy — set the Supabase env vars in
`.env.example` and run `supabase/schema.sql`. Without those vars the sign-in
control is not rendered at all, rather than shown and broken.

On first sign-in the newer copy wins; if the local one is newer it is pushed up,
so signing in never silently discards work done while signed out.
