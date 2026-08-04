"use client";

import { useState } from "react";
import { ArrowRightIcon, InboxArrowDownIcon, UserMinusIcon } from "@heroicons/react/24/outline";
import { useExpenses, useLeaveRequests, useTodayAbsences } from "@/hooks/use-backstage";
import { AbsencesModal } from "@/components/backstage/absences-modal";
import type { BackstageArea } from "@/components/backstage/backstage-overview";

/**
 * One card covering the two "state of the team right now" figures — what's
 * waiting on you to approve, and who's out today.
 *
 * These were two separate cards. Both are single-figure readouts about the team
 * today, so side by side in one frame they read as one thought instead of
 * padding the grid with a third box. Halves, not rows, so both figures stay
 * visible at a glance.
 *
 * It can't be a single button: the approvals half routes to a BackstageArea
 * while the absences half opens a modal in place. Each half is therefore its own
 * control, split by a hairline. The approvals half is omitted entirely for
 * non-approvers, in which case the absences half fills the card.
 */
export function TeamCard({
  number,
  canApprove,
  onOpen,
}: {
  number: string;
  canApprove: boolean;
  onOpen: (area: BackstageArea) => void;
}) {
  const [absencesOpen, setAbsencesOpen] = useState(false);

  const pendingLeave = useLeaveRequests("team", "PENDING");
  const pendingExpenses = useExpenses("team", "SUBMITTED");
  const absences = useTodayAbsences();

  const leaveCount = pendingLeave.data?.length ?? 0;
  const expenseCount = pendingExpenses.data?.length ?? 0;
  const waiting = leaveCount + expenseCount;
  const out = absences.data?.length ?? 0;

  return (
    <>
      <div className="flex min-h-[150px] flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
        <div className="flex h-9 shrink-0 items-center border-b border-[var(--border-2)] px-4">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{number}</span>
            {" // TEAM TODAY"}
          </span>
        </div>

        {/* Halves on any width ≥ the card's own min — they're short readouts, so
            they don't need to stack. divide-x gives the hairline between them. */}
        <div
          className={
            canApprove
              ? "grid flex-1 grid-cols-2 divide-x divide-[var(--border-2)]"
              : "flex flex-1"
          }
        >
          {canApprove ? (
            <button
              type="button"
              onClick={() => onOpen("approvals")}
              className="group flex flex-col justify-center gap-1 p-4 text-left transition hover:bg-[var(--surface-1)]"
            >
              <Figure value={waiting} unit="waiting" />
              <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                <InboxArrowDownIcon className="h-3.5 w-3.5 shrink-0" />
                {waiting === 0 ? "Nothing to approve" : "Review & approve"}
                <ArrowRightIcon className="h-3 w-3 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setAbsencesOpen(true)}
            className="group flex flex-1 flex-col justify-center gap-1 p-4 text-left transition hover:bg-[var(--surface-1)]"
          >
            <Figure value={out} unit="out today" />
            <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
              <UserMinusIcon className="h-3.5 w-3.5 shrink-0" />
              Mark away or ill
            </span>
          </button>
        </div>
      </div>

      <AbsencesModal open={absencesOpen} onClose={() => setAbsencesOpen(false)} />
    </>
  );
}

function Figure({ value, unit }: { value: number | string; unit: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className="text-[34px] leading-none text-[var(--text-1)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </span>
      <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
        {unit}
      </span>
    </p>
  );
}
