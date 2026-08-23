"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The top rule: tiny wide-tracked caps with a hairline running between them.
 * It is the only chrome any page carries.
 *
 * While the metronome is running the links refuse to navigate. Leaving the page
 * mid-take tears down the audio graph and throws away the session you were
 * being scored on, and doing that because of a mis-tap is worse than a moment's
 * friction — so it says why instead.
 */

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/chords", label: "Chords" },
  { href: "/patterns", label: "Patterns" },
];

export function Nav({
  tone = "dark", blocked = false, onBlocked,
}: {
  tone?: "dark" | "light";
  /** True while the metronome is running. */
  blocked?: boolean;
  onBlocked?: (label: string) => void;
}) {
  const pathname = usePathname();
  return (
    <nav
      className={`wrap flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-8 ${tone === "light" ? "block-light" : ""}`}
      style={{ background: "transparent" }}
    >
      <Link href="/" className="caps shrink-0 transition hover:text-accent" style={{ color: "var(--fg)" }}>
        StrumLab
      </Link>
      {/* Always present, so the links sit hard right on a phone too. */}
      <span className="rule min-w-3 flex-1" />
      <div className="flex shrink-0 items-center gap-3 sm:gap-6">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-disabled={blocked && !active ? true : undefined}
              onClick={(e) => {
                if (!blocked || active) return;
                e.preventDefault();
                onBlocked?.(l.label);
              }}
              className="caps transition"
              style={{
                color: active ? "var(--accent)" : "var(--fg-dim)",
                opacity: blocked && !active ? 0.45 : 1,
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
