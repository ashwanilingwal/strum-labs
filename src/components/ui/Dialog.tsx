"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A small centred dialog (bottom sheet on a phone) in the house style: the
 * light block, a flat card, a title in caps, plain copy, buttons underneath.
 * Escape closes it, and the key is swallowed at the capture phase so a
 * parent that also listens for Escape (the settings sheet) doesn't close too.
 *
 * Rendered through a portal onto <body>: opened from inside the settings
 * sheet it otherwise inherits the sheet's stacking context and scroll box,
 * and a "fixed, full-screen" dialog ends up clipped inside a side panel.
 */
export function Dialog({
  title, icon, onClose, children, actions,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  /** The buttons. The FIRST focusable one receives focus when the dialog opens. */
  actions: ReactNode;
}) {
  const bodyRef = useRef<HTMLElement>(null);
  const id = `dialog-${title.replace(/\W+/g, "-").toLowerCase()}`;

  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <section
        ref={bodyRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="block-light card-flat relative w-full max-w-sm p-5 sm:p-6"
      >
        {icon ? <span aria-hidden="true" className="block text-center text-4xl">{icon}</span> : null}
        <h2 id={id} className="caps-lg mt-3 text-center text-fg">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">{actions}</div>
      </section>
    </div>,
    document.body,
  );
}
