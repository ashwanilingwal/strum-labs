<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StrumLab

One screen: chords, metronome, audio, settings. Nothing else belongs on it.

## Where to change what

Find your row, open that file, stop. None of these require reading the rest.

| To change | Open | Notes |
| --- | --- | --- |
| What a slot **sounds** like | `lib/audio/perform.ts` | One function. Fingerpicking, per-string plucks and drum sounds all go here. |
| **When** things happen | `lib/audio/transport.ts` | Lookahead scheduler. Don't move timing into React. |
| The **synth** itself | `lib/audio/engine.ts` | Karplus-Strong. `pluck`, `strum`, `click`. Also owns the audio graph and the duck node. |
| **Sampled** guitar playback | `lib/audio/sampler.ts` | Real recordings. Voice stealing lives here. |
| Add a sampled **instrument** | `scripts/build-samples.py`, then `lib/audio/samples/index.ts` | Two steps, nothing else. Per-instrument note maps are generated — do not hand-edit. |
| Add a **chord** | `lib/music/chords.ts` | One literal. MIDI notes, pitch classes and the mic's match template are all derived. |
| The **pattern** data model | `lib/music/pattern.ts` | `normalise()` is the only way a pattern should ever be mutated. |
| Add a **preset** | `lib/music/pattern.ts` → `PRESET_SOURCE` | |
| How strums are **detected** | `lib/listen/detector.ts` | Thresholds live at the top as named constants. |
| Spectral **maths** | `lib/listen/dsp.ts`, `lib/listen/fft.ts` | Pure, no Web Audio, directly testable. |
| **Mic setup** / permissions | `lib/listen/mic.ts` | Includes the AudioWorklet source. |
| How a strum is **judged** | `lib/listen/scoring.ts` | `TIGHT_MS`, `CLOSE_MS`, latency offset, missed/extra, bleed rejection. |
| How a verdict **looks or reads** | `lib/feedback/presentation.ts` | Colours, glyphs, wording, meter geometry. No component hardcodes these. |
| The **background** | `components/Backdrop.tsx` + the backdrop block in `globals.css` | Self-contained. Nothing else references those classes. |
| **Theme** colours | `:root` in `globals.css` | Every surface is a token or a utility class. |
| The **live feedback** UI | `components/LiveFeedback.tsx` | Big verdict + timing scatter. |
| The **lane** | `components/StrumLane.tsx` | Playhead and per-slot verdicts. |
| The **pattern builder** | `components/PatternEditor.tsx` | Lives inside the settings sheet, not its own page. |
| **Persistence** | `lib/storage/settings.ts` | `reviveState` is the trust boundary for anything from disk or cloud. |

## Invariants

Break these and things fail in ways that are hard to trace back.

1. **React never decides when a sound happens.** The transport books notes
   against the `AudioContext` clock ahead of time; components are told after
   the fact from a rAF loop. Anything scheduled from `setInterval` + `setState`
   drifts audibly within bars.
2. **Patterns are only mutated through `normalise()`.** It is what guarantees
   `strokes.length === bars * slotsPerBar` and that `chords.length === bars`.
   Nothing downstream defends against a ragged pattern.
3. **`lib/music` and `lib/listen` import no React and no Web Audio.** They are
   pure so they stay testable and reusable for progressions, songs and
   fingerpicking. `lib/audio` may touch Web Audio; only `hooks/` and
   `components/` may touch React.
4. **Browser audio "enhancements" stay off.** `echoCancellation`,
   `noiseSuppression` and `autoGainControl` are speech algorithms and actively
   damage guitar analysis. See the comment in `lib/listen/mic.ts`.
5. **Onset timestamps come from the worklet, never from the main thread.** They
   are what makes "38 ms late" a true statement.
6. **`slotsPerBar` is a field, not a constant.** The editor offers eighths, but
   4/12/16 already work end to end. Don't hardcode 8.
7. **Nothing is gated behind sign-in.** localStorage is the working copy;
   an account only adds sync.
8. **One voice per string.** Samples ring for up to 5 seconds; without the
   voice stealing in `sampler.ts` and `engine.ts`, a bar of eighths stacks ~48
   simultaneous notes into mush. Re-striking a string must damp the last one.
9. **Sampled tones fall back to the synth, never to silence.** A failed
   download must not leave a practice tool with no sound.
10. **The click never gets ducked with the guitar.** It sits outside
   `guitarGain` in the audio graph on purpose — muting the guitar for the mic
   must not take the metronome with it.
