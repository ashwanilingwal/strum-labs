"use client";

import { useState, type ReactNode } from "react";

/**
 * A titled section that starts closed.
 *
 * The settings sheet grew past a screen and a half, so everything that is not
 * the pattern editor now hides behind one of these. Sound and listening are
 * things you set once and forget; the editor is what you came in for.
 */

export function Disclosure({
  title, summary, defaultOpen = false, children,
}: {
  title: string;
  /** Shown on the closed row, so the section is legible without opening it. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="caps-lg min-w-0 flex-1 text-fg">{title}</span>
        {summary ? <span className="caps shrink-0 text-fg-dim">{summary}</span> : null}
        <span
          aria-hidden="true"
          className="shrink-0 text-fg-dim transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>
      {open ? <div className="border-t border-line pb-1 pt-1">{children}</div> : null}
    </div>
  );
}
