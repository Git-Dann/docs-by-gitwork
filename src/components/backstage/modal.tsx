"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";

/**
 * The Backstage form dialog.
 *
 * ⚠️ This used to be a SECOND, hand-rolled modal. Its own comment claimed it
 * "matches the platform modal pattern", and it did not: it was a bare div with a
 * click-outside handler and **no `role="dialog"`, no `aria-modal`, no Escape, no
 * focus trap and no focus restore** — while 34 other files use the accessible
 * `<Modal>` in `ui/modal.tsx` that exists precisely to replace hand-rolled ones.
 * It also drew a `rounded-[14px]` panel where DESIGN.md's modal radius is 10px,
 * so the leave and expense forms were visibly a different dialog from every
 * other one in Foundry.
 *
 * It is a thin wrapper now: the shared primitive supplies the backdrop, panel,
 * radius, shadow and all of the a11y, and this keeps only the eyebrow +
 * large-title header the two forms are built around. Callers did not change.
 *
 * ⚠️ `app-dialog-fixed` stays on the panel (§46): a short leave form and a long
 * expense form must open at the same size. The scroll region below it is what
 * makes that safe, and `dialog-fixed-height.test.ts` sweeps for it.
 */
const TITLE_ID = "backstage-modal-title";

export function BackstageModal({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      labelledById={TITLE_ID}
      panelClassName="proposal-form-theme app-dialog-fixed w-full max-w-2xl"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-2)] px-6 py-4">
        <div className="min-w-0">
          {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
          <h2 id={TITLE_ID} className="mt-0.5 truncate text-lg font-semibold text-[var(--text-1)]">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[6px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      {/* ⚠️ The scroll region, and it is not optional. `app-dialog-fixed` makes the
          panel `overflow: hidden`, so a body with no scroller puts everything past
          80vh out of reach — strictly worse than the resizing the clamp replaced.
          `min-h-0` is the load-bearing half: a flex item's automatic minimum size
          is its content, so without it the region refuses to shrink and pushes the
          caller's footer out of the panel (§52.3).

          Dropping this was a real regression in the first cut of this rewrite, on
          two live forms, caught by `dialog-fixed-height.test.ts` noticing its own
          panel count had fallen. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Modal>
  );
}
