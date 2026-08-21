#!/usr/bin/env python3
"""
Regenerate src/lib/audio/samples.ts and public/samples/guitar/ from the
FreePats Spanish classical guitar library.

Source (CC0 1.0, public domain):
  https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
  SpanishClassicalGuitar-SFZ+FLAC-20190618.7z

Run when the chord library gains notes outside the current range:
  python3 scripts/build-samples.py /path/to/SpanishClassicalGuitar-SFZ+FLAC-20190618

Only samples reachable from the chord library are copied, which is what keeps
this at ~2 MB instead of the full 5 MB set.
"""
import os, re, shutil, sys

TUNING = [40, 45, 50, 55, 59, 64]  # standard tuning, low E first
OUT_DIR = "public/samples/guitar"
OUT_TS = "src/lib/audio/samples.ts"


def chord_notes(path="src/lib/music/chords.ts"):
    src = open(path).read()
    notes = set()
    for m in re.finditer(r"frets: \[([-\d, ]+)\]", src):
        for i, fret in enumerate(int(x) for x in m.group(1).split(",")):
            if fret >= 0:
                notes.add(TUNING[i] + fret)
    return notes


def parse_sfz(path):
    text = open(path).read()
    regions = []
    for block in text.split("<region>")[1:]:
        d = dict(re.findall(r"(\w+)=([^\s]+)", block))
        if "key" in d:
            lo = hi = kc = int(d["key"])
        else:
            lo, hi, kc = int(d["lokey"]), int(d["hikey"]), int(d["pitch_keycenter"])
        regions.append((lo, hi, kc, d["sample"]))
    return regions


def main(base):
    sfz = next(f for f in os.listdir(base) if f.endswith(".sfz"))
    regions = parse_sfz(os.path.join(base, sfz))
    os.makedirs(OUT_DIR, exist_ok=True)

    mapping, copied = {}, set()
    for note in sorted(chord_notes()):
        match = [r for r in regions if r[0] <= note <= r[1]]
        if not match:
            print(f"  warning: no sample covers MIDI {note}", file=sys.stderr)
            continue
        _, _, centre, sample = match[0]
        dest = f"{centre}.flac"
        if dest not in copied:
            shutil.copy(os.path.join(base, sample), os.path.join(OUT_DIR, dest))
            copied.add(dest)
        mapping[note] = centre

    body = "\n".join(f"  {n}: {c}," for n, c in sorted(mapping.items()))
    open(OUT_TS, "w").write(HEADER + body + "\n" + FOOTER)
    size = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in copied)
    print(f"{len(copied)} files, {size / 1024 / 1024:.2f} MB, {len(mapping)} notes mapped")


HEADER = '''/**
 * Sampled guitar: which recording covers which note.
 *
 * Source: FreePats "Spanish classical guitar", recorded by roberto@zenvoid.org
 * in 2008 with an AKG Perception 120, released under Creative Commons CC0 1.0
 * (public domain - no attribution required, commercial use permitted).
 * https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
 *
 * Generated from that library's own .sfz key map, intersected with every note
 * the chord library can actually produce, so nothing unreachable ships. Each
 * entry maps a MIDI note to the pitch centre of the recording covering it;
 * where the two differ the sampler resamples by that interval (never more
 * than a semitone here).
 *
 * Files are FLAC and named by pitch centre. That is deliberate: FLAC is
 * lossless and, unlike MP3 or AAC, carries no encoder delay at the head of the
 * file. In a timing trainer, a few milliseconds of silent padding before every
 * attack is not an acceptable cost.
 *
 * Regenerate with scripts/build-samples.py if the chord library gains notes
 * outside the current range.
 */

/** MIDI note -> pitch centre of the sample covering it. */
export const SAMPLE_FOR_NOTE: Record<number, number> = {
'''

FOOTER = '''};

export const SAMPLE_BASE_URL = "/samples/guitar";

export function sampleUrl(centreMidi: number): string {
  return `${SAMPLE_BASE_URL}/${centreMidi}.flac`;
}

/** Every distinct file, for preloading. */
export const SAMPLE_CENTRES: number[] = Array.from(
  new Set(Object.values(SAMPLE_FOR_NOTE)),
).sort((a, b) => a - b);
'''

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
