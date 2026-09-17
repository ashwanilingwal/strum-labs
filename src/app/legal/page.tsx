import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { ChromeText } from "@/components/ui/ChromeText";

export const metadata = { title: "Copyright & licences · StrumLab" };

/**
 * Everything licensing-related in one place, written plainly. The reasoning
 * lives in the repo (LICENSE, samples SOURCE.txt files, lib/music/songs.ts);
 * this page is the user-facing summary of the same positions.
 */

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="caps-lg text-fg">{title}</h2>
    <div className="mt-2 space-y-3 text-sm leading-relaxed text-fg-muted">{children}</div>
  </section>
);

export default function Page() {
  return (
    <main className="block-dark min-h-dvh">
      <Nav />
      <div className="wrap px-4 pb-16 pt-4 sm:px-8">
        <header>
          <p className="caps text-fg-dim">The fine print, in plain words</p>
          <ChromeText className="mt-1 block text-[clamp(2rem,7vw,4.5rem)]">
            Copyright
          </ChromeText>
        </header>

        <div className="max-w-2xl">
          <Section title="Songs: what this site does and does not ship">
            <p>
              Chord progressions and song structures are musical building blocks — facts about a
              song, not protected expression. Courts have held that common progressions and
              harmonic rhythms cannot be owned (most recently in the 2023 verdict clearing Ed
              Sheeran&rsquo;s <em>Thinking Out Loud</em>). Every chord chart on this site rests on
              that principle, and full songs are charted front to back on it.
            </p>
            <p>
              The picking patterns are <strong>original practice arrangements</strong> written for
              this site — our own arpeggios over each song&rsquo;s real chords, built to teach the
              left and right hands. They are deliberately not note-for-note transcriptions of any
              recording: a recorded performance&rsquo;s exact notes remain protected expression, and
              teaching purpose does not exempt reproducing them.
            </p>
            <p>
              <strong>No lyrics appear anywhere on this site.</strong> Lyrics are fully protected
              text and require a publisher licence to display — which is why every legitimate
              lyrics site pays one. Section names like &ldquo;Verse 1&rdquo; are structure, not
              lyrics.
            </p>
          </Section>

          <Section title="The guitar sounds">
            <p>Three of the four tones are real recordings, each under its own licence:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Acoustic</strong> (steel-string) — FreePats FS Seagull, from samples by
                Gary Campion (FlameStudios), 2008. <strong>GPL-3.0-or-later.</strong> The full
                licence text ships beside the audio files.
              </li>
              <li>
                <strong>Classical</strong> (nylon) — FreePats Spanish classical guitar, recorded by
                roberto@zenvoid.org, 2008. <strong>CC0 1.0</strong> (public domain).
              </li>
              <li>
                <strong>Electric</strong> — FreePats Electric Guitar FSBS (clean), a direct-sampled
                Fender. <strong>CC0 1.0</strong> (public domain).
              </li>
            </ul>
            <p>
              The fourth tone is synthesised in the browser and involves no recordings at all. All
              sets come from the <a className="text-accent underline" href="https://freepats.zenvoid.org/">FreePats
              project</a>, reduced to the notes this site&rsquo;s chords can reach.
            </p>
          </Section>

          <Section title="The code">
            <p>
              StrumLab&rsquo;s source code is MIT-licensed. The one carve-out: the GPL-3 acoustic
              samples are bundled data, kept in their own directory and loaded like any other
              static asset — the ordinary mere-aggregation case, which is why the code&rsquo;s
              licence is unaffected. The fonts are Google Fonts faces under the Open Font License, bundled at build time and served from this site — no request goes to Google when you visit.
            </p>
          </Section>

          <Section title="Your audio">
            <p>
              Everything the microphone hears is analysed in your browser and discarded. No audio
              is recorded, stored, or sent anywhere — there is no server that could receive it.
              What the site does keep, and the optional account, are set out on the{" "}
              <Link href="/privacy" className="text-accent underline">privacy page</Link>.
            </p>
          </Section>

          <Section title="One honest caveat">
            <p>
              This page is a careful reading of where the lines sit, not legal advice. If you plan
              to build on this project commercially, have someone qualified read it too.
            </p>
          </Section>

          <Link href="/" className="btn mt-10 inline-flex">
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
