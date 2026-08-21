#!/usr/bin/env python3
"""
Build one sampled instrument for StrumLab from an SFZ library.

    python3 scripts/build-samples.py <instrument-id> <path-to-extracted-library>

e.g.
    python3 scripts/build-samples.py acoustic ~/dl/SpanishClassicalGuitar-SFZ+FLAC-20190618
    python3 scripts/build-samples.py electric ~/dl/EGuitarFSBS-clean-bridge-small-SFZ+FLAC-20260807

Writes:
    public/samples/<id>/<pitch-centre>.flac   only the notes chords can reach
    src/lib/audio/samples/<id>.ts             the generated note -> centre map

Adding an instrument is this command plus one line in src/lib/audio/samples/index.ts.
Nothing else in the app needs to know it exists.

Only samples the chord library can actually produce are copied, which is what
keeps each instrument around 2 MB instead of the full set.
"""
import os, re, shutil, sys

TUNING = [40, 45, 50, 55, 59, 64]  # standard tuning, low E first


def chord_notes(path="src/lib/music/chords.ts"):
    src = open(path).read()
    notes = set()
    for m in re.finditer(r"frets: \[([-\d, ]+)\]", src):
        for i, fret in enumerate(int(x) for x in m.group(1).split(",")):
            if fret >= 0:
                notes.add(TUNING[i] + fret)
    return notes


def parse_sfz(path):
    """Regions as (lokey, hikey, pitch_keycenter, relative sample path)."""
    regions = []
    for block in open(path).read().split("<region>")[1:]:
        d = dict(re.findall(r"(\w+)=(\S+)", block))
        if "key" in d:
            lo = hi = kc = int(d["key"])
        else:
            lo, hi, kc = int(d["lokey"]), int(d["hikey"]), int(d["pitch_keycenter"])
        regions.append((lo, hi, kc, d["sample"]))
    return regions


TEMPLATE = '''/**
 * GENERATED FILE - do not edit by hand.
 * Rebuild: python3 scripts/build-samples.py {id} <library-dir>
 *
 * {name}
 * {credit}
 * Licence: {licence}
 *
 * Maps every MIDI note the chord library can produce to the pitch centre of
 * the recording covering it. Where the two differ the sampler resamples by
 * that interval.
 */

export const {const}: Record<number, number> = {{
{body}
}};
'''


def main(inst, base):
    sfz_name = next(f for f in os.listdir(base) if f.endswith(".sfz"))
    regions = parse_sfz(os.path.join(base, sfz_name))

    out_dir = f"public/samples/{inst}"
    os.makedirs(out_dir, exist_ok=True)
    for stale in os.listdir(out_dir):
        if stale.endswith(".flac"):
            os.remove(os.path.join(out_dir, stale))

    mapping, copied = {}, set()
    for note in sorted(chord_notes()):
        match = [r for r in regions if r[0] <= note <= r[1]]
        if not match:
            print(f"  warning: no sample covers MIDI {note}", file=sys.stderr)
            continue
        _, _, centre, sample = match[0]
        dest = f"{centre}.flac"
        if dest not in copied:
            shutil.copy(os.path.join(base, sample), os.path.join(out_dir, dest))
            copied.add(dest)
        mapping[note] = centre

    # Provenance is read out of the library's own readme so it cannot drift.
    readme = next(
        (f for f in os.listdir(base) if f.lower() in ("readme.txt", "read_me.txt")), None
    )
    text = open(os.path.join(base, readme)).read() if readme else ""
    name = text.strip().splitlines()[0] if text else inst
    licence = "CC0 1.0 public domain" if "CC0" in text else "see library README"
    credit = next((l.strip() for l in text.splitlines() if "recorded" in l.lower() or "sampling" in l.lower()), "")

    body = "\n".join(f"  {n}: {c}," for n, c in sorted(mapping.items()))
    os.makedirs("src/lib/audio/samples", exist_ok=True)
    open(f"src/lib/audio/samples/{inst}.ts", "w").write(
        TEMPLATE.format(
            id=inst, name=name, credit=credit[:100], licence=licence,
            const=f"{inst.upper()}_NOTES", body=body,
        )
    )
    size = sum(os.path.getsize(os.path.join(out_dir, f)) for f in copied)
    print(f"{inst}: {len(copied)} files, {size/1024/1024:.2f} MB, {len(mapping)} notes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
