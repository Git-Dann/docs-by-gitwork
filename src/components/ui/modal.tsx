/**
 * Accessible modal dialog primitive (Phase 2b-ii).
 *
 * The shared shell for every dialog in the app: backdrop, centered panel, and the a11y the
 * hand-rolled modals were missing — `role="dialog"` + `aria-modal`, **Escape to close**, a
 * **focus trap** (Tab/Shift+Tab cycle within the panel), **focus restore** to the trigger on
 * close, body scroll-lock, and backdrop-click to dismiss.
 *
 * Renders nothing when `open` is false. Pass your own header/body/footer as children (or use the
 * optional `title` to get the standard widget-header with a close button).
 */

"use client";

import { useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  panelClassName,
  labelledById,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Width/extra classes for the panel. Defaults to a medium dialog. */
  panelClassName?: string;
  /** Point aria-labelledby at your own heading when not using `title`. */
  labelledById?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Keep a stable ref to `onClose` so the focus/keydown effect only re-runs when
  // `open` changes — NOT on every render (which would happen if `onClose` were an
  // inline arrow function in the parent, causing the focus to jump back to the first
  // input after every keystroke).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]); // ← only `open` — onClose is read from the ref above

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop + centering layer in one element so taps on the dimmed area dismiss.
          (A separate absolute backdrop underneath a transparent flex layer never received
          the tap — the flex layer sat on top and swallowed it.) Only a click on the layer
          itself closes; clicks inside the panel bubble up but are ignored via the target check. */}
      <div
        className="app-dialog-backdrop absolute inset-0 flex items-start justify-center p-4 sm:items-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "modal-title" : labelledById}
          tabIndex={-1}
          className={`app-dialog-panel relative mt-10 overflow-hidden outline-none sm:mt-0 ${panelClassName ?? "w-full max-w-xl"}`}
        >
          {title ? (
            <div className="widget-header">
              <span id="modal-title" className="widget-header-label">
                {title}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                aria-label="Close"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
