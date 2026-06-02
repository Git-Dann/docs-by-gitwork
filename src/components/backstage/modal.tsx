"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

// Shared Backstage dialog — matches the platform modal pattern (overlay +
// centered panel + hairline header with a close affordance). The caller supplies
// its own <form> (body + footer) as children so submit wiring stays simple.
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="proposal-form-theme my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[14px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[14px] border-b border-[var(--border-2)] bg-white px-6 py-4">
          <div className="min-w-0">
            {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
            <h2 className="mt-0.5 truncate text-lg font-semibold text-[var(--text-1)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
