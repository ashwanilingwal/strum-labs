"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The top rule: tiny wide-tracked caps with a hairline running between them,
 * lifted straight from the media-kit reference. It is the only chrome any page
 * carries — no header, no logo bar, no footer.
 */

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/chords", label: "Chords" },
  { href: "/patterns", label: "Patterns" },
];

export function Nav({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const pathname = usePathname();
  return (
    <nav className={`wrap flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-8 ${tone === "light" ? "block-light" : ""}`}
         style={{ background: "transparent" }}>
      <Link href="/" className="caps shrink-0 transition hover:text-accent" style={{ color: "var(--fg)" }}>
        StrumLab
      </Link>
      <span className="rule hidden min-w-6 flex-1 sm:block" />
      <div className="flex items-center gap-4 sm:gap-6">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="caps transition"
              style={{ color: active ? "var(--accent)" : "var(--fg-dim)" }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
