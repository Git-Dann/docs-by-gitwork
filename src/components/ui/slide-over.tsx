/**
 * Accessible right-anchored slide-over drawer.
 *
 * Sibling to <Modal/> (src/components/ui/modal.tsx) — same a11y scaffolding (role="dialog" +
 * aria-modal, Escape to close, focus trap, focus restore, body scroll-lock, backdrop dismiss) but
 * anchored full-height to the right edge. Used by the Docs editor's contextual block inspector.
 *
 * Renders nothing when `open` is false.
 */

"use client";

import { useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SlideOver({
  open,
  onClose,
  title,
  children,
  panelClassName,
  labelledById,
  dim = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Width/extra classes for the panel. Defaults to a medium drawer. */
  panelClassName?: string;
  labelledById?: string;
  /** Dim the page behind the drawer. Off for a non-modal contextual inspector (still
   *  click-outside-to-close, but the page stays bright and usable). */
  dim?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={-1}
        className={dim ? "app-dialog-backdrop absolute inset-0" : "absolute inset-0 bg-transparent"}
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex max-w-full">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "slideover-title" : labelledById}
          tabIndex={-1}
          className={`relative flex h-full flex-col overflow-hidden border-l border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-lg)] outline-none ${panelClassName ?? "w-[440px] max-w-[92vw]"}`}
        >
          {title ? (
            <div className="widget-header shrink-0">
              <span id="slideover-title" className="widget-header-label">
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
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
