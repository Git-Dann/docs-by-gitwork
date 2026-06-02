"use client";

import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import {
  useExpenses,
  useLeaveAllowance,
  useLeaveRequests,
} from "@/hooks/use-backstage";
import { CalendarTab } from "@/components/backstage/calendar-tab";
import { useBackstageAccess } from "@/components/backstage/access";

export type BackstageArea = "leave" | "expenses" | "approvals";

// Backstage landing — a bento grid of navigational cards (HQ dashboard pattern,
// see app-overview.tsx + DESIGN.md) over the full team calendar. Cards show a
// headline figure and open their area on click; the calendar stays visible. No tabs.
export function BackstageOverview({ onOpen }: { onOpen: (area: BackstageArea) => void }) {
  const { canApprove, canManageExpenses } = useBackstageAccess();

  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LeaveCard number={num()} onOpen={onOpen} />
        {canManageExpenses ? <ExpensesCard number={num()} onOpen={onOpen} /> : null}
        {canApprove ? <ApprovalsCard number={num()} onOpen={onOpen} /> : null}
      </div>
      <CalendarTab number={num()} />
    </div>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────
function Card({
  number,
  title,
  area,
  onOpen,
  children,
}: {
  number: string;
  title: string;
  area: BackstageArea;
  onOpen: (area: BackstageArea) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(area)}
      className="group flex min-h-[150px] flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white text-left transition hover:border-[var(--brand-300)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-2)] px-4">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--text-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-600)]" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1 p-4">{children}</div>
    </button>
  );
}

function Figure({ value, unit }: { value: number | string; unit: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-[34px] leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </span>
      <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
        {unit}
      </span>
    </p>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────
function LeaveCard({ number, onOpen }: { number: string; onOpen: (a: BackstageArea) => void }) {
  const allowance = useLeaveAllowance();
  const pending = allowance.data?.pending ?? 0;
  return (
    <Card number={number} title="LEAVE" area="leave" onOpen={onOpen}>
      <Figure value={allowance.data?.remaining ?? "—"} unit="days left" />
      <p className="flex items-center gap-1 text-xs text-[var(--text-3)]">
        <ClockIcon className="h-3.5 w-3.5" />
        {pending > 0 ? `${pending} pending` : "Book & track your leave"}
      </p>
    </Card>
  );
}

function ExpensesCard({ number, onOpen }: { number: string; onOpen: (a: BackstageArea) => void }) {
  const mine = useExpenses("me", "SUBMITTED");
  const count = mine.data?.length ?? 0;
  return (
    <Card number={number} title="EXPENSES" area="expenses" onOpen={onOpen}>
      <BanknotesIcon className="h-7 w-7 text-[var(--brand-500)]" />
      <p className="mt-1 text-sm font-medium text-[var(--text-1)]">
        {count > 0 ? `${count} awaiting review` : "Submit an expense"}
      </p>
      <p className="text-xs text-[var(--text-3)]">Receipts &amp; reimbursements</p>
    </Card>
  );
}

function ApprovalsCard({ number, onOpen }: { number: string; onOpen: (a: BackstageArea) => void }) {
  const pendingLeave = useLeaveRequests("all", "PENDING");
  const pendingExpenses = useExpenses("all", "SUBMITTED");
  const total = (pendingLeave.data?.length ?? 0) + (pendingExpenses.data?.length ?? 0);
  return (
    <Card number={number} title="APPROVALS" area="approvals" onOpen={onOpen}>
      <Figure value={total} unit={total === 1 ? "to review" : "to review"} />
      <p className="flex items-center gap-1 text-xs text-[var(--text-3)]">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        {total > 0 ? "Needs your sign-off" : "All clear"}
      </p>
    </Card>
  );
}
