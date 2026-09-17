"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

/**
 * The first-visit notice. It is a notice, not a consent request: nothing on
 * this site needs consent (see /privacy), so there is one button and it only
 * means "I've read this". It sits at the bottom edge without a backdrop and
 * blocks nothing — a banner that stops you using a site to agree to nothing
 * is the pattern the regulators complain about.
 *
 * Shown once per browser. The flag lives in local storage beside the app's
 * own state, and the server render assumes it is set so the card never
 * flashes for returning players before hydration.
 */

const KEY = "strumlab:v1:privacyNoticed";
const EVENT = "strumlab:privacyNoticed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function noticed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // No storage at all: nowhere to remember the dismissal, so don't nag.
    return true;
  }
}

export function PrivacyNotice() {
  const pathname = usePathname();
  const seen = useSyncExternalStore(subscribe, noticed, () => true);
  if (seen || pathname === "/privacy") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Ignored: the card goes away for this render either way.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-4">
      <section
        role="region"
        aria-label="Privacy notice"
        className="block-light card-flat pointer-events-auto w-full max-w-md p-4 shadow-2xl sm:p-5"
      >
        <p className="caps-lg text-fg">Nothing leaves your browser</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          StrumLab keeps your patterns and settings in this browser, and listens to the
          microphone only while you play — the audio is analysed here and never uploaded. No
          tracking, no ads. Signing in is optional and explained before it happens.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/privacy" className="caps text-accent underline underline-offset-4">
            Privacy notice
          </Link>
          <button type="button" className="btn btn-lit text-xs" onClick={dismiss}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}
