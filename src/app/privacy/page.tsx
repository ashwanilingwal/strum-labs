import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { ChromeText } from "@/components/ui/ChromeText";
import { DownloadMyData } from "@/components/privacy/DownloadMyData";

export const metadata = { title: "Privacy · StrumLab" };

/**
 * The privacy notice UK GDPR / EU GDPR Article 13 asks for, written the way
 * /legal is written. Every sentence here describes what the code actually
 * does — if a data flow changes (analytics, a new provider, a new stored
 * field) this page changes in the same commit. There is deliberately no
 * cookie-consent banner: the only cookies are the sign-in session, which is
 * strictly necessary and exempt from consent, and there is nothing else to
 * consent to. Asking anyway would be theatre.
 */

const CONTROLLER = {
  name: "Ashwani Lingwal",
  email: "ashwanilingwal98@gmail.com",
  updated: "16 September 2026",
};

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
            Privacy
          </ChromeText>
        </header>

        <div className="max-w-2xl">
          <Section title="The short version">
            <ul className="list-disc space-y-1 pl-5">
              <li>No analytics, no advertising, no tracking cookies, no third-party scripts.</li>
              <li>Your practice — patterns, settings, level results — lives in this browser.</li>
              <li>
                The microphone is analysed on your device, in real time, and never recorded or
                sent anywhere.
              </li>
              <li>
                Signing in is optional. If you do, your Google email and name make an account,
                and a copy of your practice is kept on our database so it follows you between
                devices. You can delete all of it yourself, any time.
              </li>
            </ul>
          </Section>

          <Section title="Who is responsible">
            <p>
              StrumLab is run by {CONTROLLER.name}, who is the &ldquo;controller&rdquo; of any
              personal data described on this page. Questions, requests and complaints:{" "}
              <a className="text-accent underline" href={`mailto:${CONTROLLER.email}`}>
                {CONTROLLER.email}
              </a>
              . This notice was last updated on {CONTROLLER.updated}.
            </p>
          </Section>

          <Section title="What stays in your browser">
            <p>
              StrumLab stores its working state in your browser&rsquo;s local storage under the key{" "}
              <code>strumlab:v1</code>: the strumming patterns you build, your sound and listening
              settings, which level you are on and how each attempt went, the measured noise
              level of your room, when the state was last saved, and whether you have dismissed
              the first-visit notice. None of it identifies you, and none of it is read by us —
              it exists so the app remembers what you were doing.
            </p>
            <p>
              This is storage the app needs to do what you asked it to, which is why no consent
              banner asks about it (the UK PECR and EU ePrivacy rules exempt strictly necessary
              storage). To remove it, clear this site&rsquo;s data in your browser settings, or use
              the download button below first if you want to keep a copy.
            </p>
          </Section>

          <Section title="The microphone">
            <p>
              The app asks for the microphone only when you press play with listening switched
              on, and your browser asks you before granting it. What it hears is turned into
              timing and chord readings inside the page as it happens; the audio itself is never
              recorded, stored or transmitted, and there is no server that could receive it.
              Revoke the permission in your browser&rsquo;s address bar whenever you like.
            </p>
          </Section>

          <Section title="The optional account">
            <p>
              Nothing in StrumLab requires an account. If you choose to sign in with Google, we
              receive from Google the email address, display name and profile picture on your
              Google account and use them to create your StrumLab account. We then keep one
              record per player: your account details, and the same practice state described
              above, so it can be restored on another device. That is the whole list. We do not
              send marketing, share the data, or use it for anything but keeping your practice in
              sync.
            </p>
            <p>
              The legal basis is that this is the service you asked for when you signed in
              (UK GDPR and EU GDPR Article 6(1)(b)). The data is held for as long as your account
              exists and deleted when you delete it.
            </p>
            <p>
              Two companies process it on our behalf: <strong>Supabase</strong> hosts the
              database and handles sign-in sessions, and <strong>Google</strong> performs the
              sign-in itself under its own privacy policy. Where either processes data outside
              the UK or EU, the transfer is covered by their standard contractual clauses and the
              UK addendum to them.
            </p>
            <p>
              While you are signed in, Supabase sets a session cookie so the app knows it is you.
              That cookie is strictly necessary for signing in and is the only cookie StrumLab
              ever sets; if you never sign in, no cookie is set at all.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              You can ask to see the data we hold about you, have it corrected, deleted, or
              handed over in a portable form, and you can object to or restrict its use. Most of
              that you can do yourself:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Take a copy</strong> — the button below downloads everything StrumLab
                holds in this browser as one JSON file; the synced copy in an account is the same
                document.
              </li>
              <li>
                <strong>Delete your account</strong> — Play &rarr; settings &rarr; Account &rarr;
                Delete account. It removes the account and the synced copy immediately.
              </li>
              <li>
                <strong>Anything else</strong> — email {CONTROLLER.email}. We answer within a
                month.
              </li>
            </ul>
            <div className="pt-1">
              <DownloadMyData />
            </div>
            <p>
              If you think we have handled your data badly you can complain to the UK
              Information Commissioner&rsquo;s Office (
              <a className="text-accent underline" href="https://ico.org.uk/">ico.org.uk</a>) or to the
              data protection authority in your EU country. We would rather hear from you first.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If StrumLab ever starts collecting anything new, this page and the date at the top
              change in the same release, and where the law requires it we will ask before doing
              so rather than after.
            </p>
          </Section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="btn inline-flex">
              Back to the start
            </Link>
            <Link href="/legal" className="btn inline-flex">
              Copyright &amp; licences
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
