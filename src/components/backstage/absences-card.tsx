"use client";

import { useState } from "react";
import { UserMinusIcon } from "@heroicons/react/24/outline";
import { useTodayAbsences } from "@/hooks/use-backstage";
import { AbsencesModal } from "@/components/backstage/absences-modal";

// Top-band Backstage card — shows how many people are out today and opens the
// mark-absence modal. Bespoke (not the shared navigational Card) because it
// opens a modal in place rather than routing to a BackstageArea.
export function AbsencesCard({ number }: { number: string }) {
  const [open, setOpen] = useState(false);
  const today = useTodayAbsences();
  const count = today.data?.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-[150px] flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white text-left transition hover:border-[var(--brand-300)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-2)] px-4">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{number}</span>
            {` // ABSENCES`}
          </span>
          <UserMinusIcon className="h-3.5 w-3.5 text-[var(--text-4)] transition group-hover:text-[var(--brand-600)]" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1 p-4">
          <p className="flex items-baseline gap-1.5">
            <span
              className="text-[34px] leading-none text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {count}
            </span>
            <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
              out today
            </span>
          </p>
          <p className="text-xs text-[var(--text-3)]">
            {count > 0 ? "Mark someone away or ill" : "Mark someone away or ill today"}
          </p>
        </div>
      </button>
      <AbsencesModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
