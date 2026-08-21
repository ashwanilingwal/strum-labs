import Link from "next/link";
import { ChromeText } from "@/components/ui/ChromeText";
import { MotifField } from "@/components/ui/MotifField";
import { Nav } from "@/components/ui/Nav";

/**
 * The cover. One wordmark, one sentence, one way in.
 *
 * Deliberately the only page that does nothing — everything else in StrumLab is
 * a working surface, and a landing page that tries to also be a working surface
 * is neither.
 */

const BULLETS = [
  { k: "Build", v: "Set the up and down strokes on an eighth-note grid, one chord per bar." },
  { k: "Play", v: "A metronome that never drifts, with the chords played back on real recordings." },
  { k: "Listen", v: "Turn the microphone on and it scores every strum — early, late, or missed." },
];

export default function Page() {
  return (
    <main className="block-dark flex min-h-dvh flex-col">
      <Nav />

      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-8">
        <MotifField />
        <div className="relative z-10 flex flex-col items-center">
        <ChromeText className="text-[clamp(3.5rem,16vw,13rem)]">StrumLab</ChromeText>
        <p className="caps mt-6 text-fg-dim">A strumming trainer that listens back</p>
        <Link href="/play" className="btn btn-lit mt-10 !px-8 !py-3 !text-sm">
          Start practising
        </Link>
        </div>
      </section>

      <section className="block-light px-4 py-12 sm:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          {BULLETS.map((b) => (
            <div key={b.k}>
              <h2 className="font-display text-3xl leading-none text-chrome-700">{b.k}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{b.v}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-5xl">
          <div className="rule" />
          <p className="caps mt-4 text-fg-dim">
            Guitar recordings CC0 · FreePats · nothing leaves your browser
          </p>
        </div>
      </section>
    </main>
  );
}
