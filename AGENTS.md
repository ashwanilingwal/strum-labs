<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# StrumLab

A browser guitar trainer: build strumming patterns, drill them against a
metronome that listens back through the microphone, tune, play songs, and run
graded technique games. Everything runs client-side; there is no backend
except optional Supabase sync.

This file is the map. It is written so a fresh session can make a surgical
change without reading the rest of the tree or any prior conversation. If you
change the architecture, change this file in the same commit.

## Routes

| Route | What it is | Component |
| --- | --- | --- |
| `/` | Cover — wordmark, one sentence, one button, legal link | `app/page.tsx` |
| `/play` | The practice screen. Three modes: Chords, Patterns, Exercises | `components/StrumLab.tsx` |
| `/learn` | Chord library + saved patterns as tabs (`?tab=`) | `components/learn/Learn.tsx` |
| `/songs` | Follow-along song player, fingerpick or strum, live pace | `components/SongPlayer.tsx` |
| `/tuner` | Tuner (its own time-domain DSP) | `components/Tuner.tsx` |
| `/legal` | Every licensing position in plain words | `app/legal/page.tsx` |
| `/soundcheck` | Hidden: measures the master bus. Run after audio changes | `app/soundcheck/page.tsx` |
| `/auth/callback` | Supabase OAuth landing (only server-rendered route) | `app/auth/callback/route.ts` |

Redirects (next.config.ts): `/chords` and `/patterns` → `/learn` tabs;
`/game` → `/play`.

## Layering — what may import what

```
lib/music     pure data + maths (chords, patterns, songs, exercises, tuning, theory)
lib/listen    pure DSP (fft, dsp, pitch, noteGame) + mic capture (mic.ts only file touching Web Audio here)
lib/feedback  how verdicts look/read — pure
lib/storage   localStorage store + revive + supabase sync — no React
lib/audio     Web Audio: engine (synth+graph), sampler, transport, perform, preview
hooks/        React ↔ engines: useStrumEngine, useSongEngine, useTuner, useNoteGame, useAccount
components/   React UI only. No timing decisions, no DSP, no literal colours.
```

Rules: `lib/music`, `lib/listen` (except mic.ts), `lib/feedback` import no
React and no Web Audio — they are testable with synthetic input, and every
detector threshold here was tuned by measuring, not guessing. Only `hooks/`
and `components/` may import React. Data files are the extension points:

| To add… | Edit only | Shows up in |
| --- | --- | --- |
| a chord | `lib/music/chords.ts` (one literal) | picker, library, matcher templates |
| a strum style / progression | `lib/music/library.ts` | practice picker (styles × progressions compose) |
| a pattern preset | `lib/music/pattern.ts` → `PRESET_SOURCE` | patterns tab |
| a song | `lib/music/songs.ts` → `SONGS` | song player (chords are facts; no lyrics, no note-for-note transcriptions — see /legal) |
| an exercise | `lib/music/exercises.ts` → `EXERCISES` | play screen's Exercises mode. ONE kind only: a listening game (`notes` targets, untimed). `level` is a difficulty TIER (Starter→Advanced), `family` the topic tag (spider, octaves, finger ladder…). Add to its tier; keep the array tier-sorted — Prev/Next walks it in order |
| a tuning | `lib/music/tuning.ts` → `TUNINGS` | tuner |
| a sampled instrument | `scripts/build-samples.py <id> <dir>` + one entry in `lib/audio/samples/index.ts` | tone selects. Licence files must travel with the audio |

## Where to change what

### Sound
| To change | Open | Notes |
| --- | --- | --- |
| What a slot sounds like | `lib/audio/perform.ts` | One function; fingerpicking/drums land here |
| When things happen | `lib/audio/transport.ts` | Lookahead scheduler; supports `fromSlot` for mid-song starts |
| Synth / audio graph / duck | `lib/audio/engine.ts` | Karplus-Strong; `glide()` for all bus levels; limiter is the last node; `output` tap for diagnostics |
| Sampled playback / voice stealing | `lib/audio/sampler.ts` | `trim` per instrument in `samples/index.ts`; keep abs peak < 0.9 at the bus |
| One-shot previews | `lib/audio/preview.ts` | Books everything up front; `previewChord`, `previewPattern`, `previewNotes` (the exercise "Hear it" demo), `stopPreview()` |

### Listening
| To change | Open | Notes |
| --- | --- | --- |
| Mic setup | `lib/listen/mic.ts` | Worklet source inline; browser "enhancements" forced off |
| Strum onset + chord guess | `lib/listen/detector.ts` | Thresholds are named constants at the top, each with its measured rationale |
| Timing verdicts | `lib/listen/scoring.ts` | `TIGHT_MS`/`CLOSE_MS`, latency offset, bleed rejection |
| Pitch (tuner, note game) | `lib/listen/pitch.ts` | NSDF, time-domain; the FFT's 43 Hz bins cannot do this job |
| Note-game rules | `lib/listen/noteGame.ts` | Pure matcher: 60-cent tolerance, 4 steady frames, 700ms cooldown |
| Verdict wording/colour | `lib/feedback/presentation.ts` | `verdictVisual(grade, errorMs)` knows early from late |

### Screens
| To change | Open |
| --- | --- |
| Play screen shell + mode switch | `components/StrumLab.tsx` |
| Exercises mode (curriculum rail/sheet + games, optional pace click) | `components/ExerciseMode.tsx`, `components/NoteGameBody.tsx`, `hooks/useNoteGame.ts`, `hooks/useExerciseClick.ts` |
| Lane / live feedback / summary | `components/StrumLane.tsx`, `LiveFeedback.tsx`, `SessionSummary.tsx` |
| Transport bar | `components/TransportBar.tsx` |
| Settings sheet | `components/SettingsPanel.tsx` (+ `PracticePicker`, `PatternEditor`, `ChordPicker`) |
| Inline chord change | `components/ChordSheet.tsx` (edits one named bar, never "current") |
| Learn tabs | `components/learn/*` (`goPractise.ts` hands things to /play via `QUICK_ID`) |
| Song player | `components/SongPlayer.tsx`, `hooks/useSongEngine.ts` |
| Tuner | `components/Tuner.tsx`, `hooks/useTuner.ts` |
| Chord chart + overlays | `components/chart/` — transient state (sounding, pluck fingers, H/P arcs) goes through `ChartOverlay`, never into the chord data |

### Theme
Everything visual is semantic tokens in `app/globals.css` (`--fg`, `--accent`,
`--tight`…). Components never name a colour. `.block-light`/`.block-dark`
re-point the tokens for a whole subtree. The look is flat editorial in chrome
and gunmetal — steel gradients, ice-blue accent, sparkle/orb confetti
(`components/ui/MotifField.tsx`); the chrome lettering is `components/ui/ChromeText.tsx` (two stacked
copies; the hard gradient mid-stops are what read as metal). Re-skinning the
app is a one-file edit — it has survived two full palette swaps.

### Storage
`lib/storage/settings.ts` — `appStore` (localStorage via `useSyncExternalStore`),
`reviveState` is the trust boundary for anything from disk or cloud, `QUICK_ID`
is the reserved slot every picker writes to (never a saved pattern). Supabase
is optional: without env vars the sign-in UI simply doesn't render.

## Invariants

Break these and things fail in ways that are hard to trace back.

1. **React never decides when a sound happens.** The transport books notes
   against the AudioContext clock ahead of time; the screen catches up from a
   25ms interval that drains a queue.
2. **Never drive a UI loop from requestAnimationFrame.** rAF stops in hidden
   or throttled pages while the audio clock keeps going — a frozen playhead
   over a running metronome looks exactly like a dead app.
3. **Patterns are only mutated through `normalise()`.** Nothing downstream
   defends against a ragged pattern.
4. **Browser audio "enhancements" stay off** (`echoCancellation`,
   `noiseSuppression`, `autoGainControl`) — they are speech algorithms and
   measurably damage guitar analysis.
5. **Onset timestamps come from the worklet, never the main thread.** They are
   what makes "38 ms late" a true statement.
6. **Never `setTargetAtTime` on a control bus** — it never reaches its target
   and left a −23 dB ghost of the click at "zero" volume. `engine.glide()`
   (linear ramp) only. Per-note fade-outs may keep it; their sources stop.
7. **One voice per string** (sampler + synth voice stealing) — samples ring
   ~5s, and without stealing a bar of eighths stacks ~48 notes into mush.
8. **Sampled tones fall back to the synth, never to silence.**
9. **The click never gets ducked with the guitar** — it sits outside
   `guitarGain` so mic-mode muting can't take the metronome down.
10. **Status never replaces content.** A prominent slot holds one kind of
    thing; when a signal drops, dim the last value and put liveness in a side
    pill. (The tuner and the count-in both violated this once.)
11. **Controls that would invalidate a take lock while the transport runs**,
    and say why. Stop and chord changes stay live.
12. **Stepper buttons resolve against the store**, not a render-time value —
    `setBpm(bpm + 1)` drops rapid clicks; use `nudgeBpm(delta)`.
13. **The play screen is an app shell** (fixed-height column, transport in
    flow). Sticky-footer-plus-measured-spacer was tried and fails silently in
    environments that never fire `resize`/`ResizeObserver`. Long scrolling
    pages (songs) may use sticky bottom bars — the app shell rule is for
    /play, whose content must never be covered.
14. **`slotsPerBar` is a field, not a constant** — 4/12/16 work end to end.
15. **Nothing is gated behind sign-in.** localStorage is the working copy.
16. **Store-backed UI under a Suspense boundary renders client-only**
    (`useHydrated` gate, see PatternsTab) — hydrating server HTML against
    localStorage state stalled the whole boundary with zero console output.
17. **Check 320px before calling a layout done.**
18. **Exercises are listening games, chords/progressions are play modes,
    songs are songs.** Do not re-mix the three worlds; a uniform UI per world
    was hard-won.

## Verifying changes

- `npx tsc --noEmit && npx eslint . && npm run build` — all three, always.
- Audio changes: open `/soundcheck`, press run, expect a full PASS board
  (loudness parity, no clipping, mute paths, click gaps ≈300ms).
- Detector/DSP changes: these modules are pure — test with synthetic input
  (node runs `.ts` directly) before trusting any in-browser impression.
- The dev server is `strumlab` in `.claude/launch.json` (port 3210, autoPort).
- **Embedded browser-pane quirks** (Claude Code preview): `ResizeObserver` and
  `window.resize` never fire and `innerWidth` can read 0 — never build layout
  that needs them, and measure with DOM rects, not viewport APIs. After heavy
  HMR the pane can "rot": pages render but React never attaches (no fiber
  keys, no console errors, all controls dead) and screenshots can go black.
  Recycle the pane (close last tab, `preview_start` again) before diagnosing
  any dead page as an app bug. Deleting routes while the dev server runs can
  corrupt `.next/dev/types` — restart the server, or `rm -rf .next/types` and
  rebuild.
- The microphone cannot be exercised in the pane. Anything mic-dependent gets
  its logic verified synthetically; the room test is the user's.

## Licensing constraints (short form — /legal has the words)

Chords, progressions, song structures: facts, shippable. Picking patterns:
must be original practice arrangements, never note-for-note transcriptions of
recordings. Lyrics: never, in any form. Audio: two sample sets CC0, the
steel-string acoustic is GPL-3 — its licence files must travel with the audio
directory, and per-instrument `SOURCE.txt` files are the provenance record.
