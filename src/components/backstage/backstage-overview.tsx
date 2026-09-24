"use client";

import type { ReactNode } from "react";
import { ArrowRightIcon, BanknotesIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useExpenses, useLeaveAllowance } from "@/hooks/use-backstage";
import { useHandovers } from "@/hooks/use-handover";
import { CalendarTab } from "@/components/backstage/calendar-tab";
import { TeamCard } from "@/components/backstage/team-card";
import { useBackstageAccess } from "@/components/backstage/access";

/**
 * Written out in full because Tailwind only emits classes it can find as literal
 * text — a computed `xl:grid-cols-${n}` compiles fine and produces no CSS, so the
 * grid would silently fall back to two columns.
 */
const XL_COLS: Record<number, string> = {
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
};

export type BackstageArea = "leave" | "expenses" | "approvals" | "handover";

// Backstage landing — a bento grid of navigational cards (HQ dashboard pattern,
// see app-overview.tsx + DESIGN.md) over the full team calendar. Cards show a
// headline figure and open their area on click; the calendar stays visible. No tabs.
export function BackstageOverview({ onOpen }: { onOpen: (area: BackstageArea) => void }) {
  const { canManageExpenses, canApprove, isAdmin } = useBackstageAccess();

  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  /**
   * How many COLUMN UNITS the row actually occupies, so the grid is exactly as
   * wide as the cards that render.
   *
   * ⚠️ Two of these cards are permission-gated — Expenses is Super Admin and
   * Handover is Admin — so a hard-coded five columns leaves a one- or two-column
   * hole for everyone else, which is the gap the house card-grid rule exists to
   * prevent. Team counts as two because it spans two from `xl`.
   */
  const units = 1 + 2 + (canManageExpenses ? 1 : 0) + (isAdmin ? 1 : 0);

  /**
   * Between `sm` and `xl` the grid is two columns and every card is one unit, so
   * an ODD number of cards leaves a hole beside the last one.
   *
   * ⚠️ Measured, not reasoned: an Admin who is not a Super Admin renders three
   * cards and at 768px the last row came up 374px short. The card count is not
   * the unit count — Team is two units and one card — so this is its own sum.
   *
   * `max-xl` is load-bearing. Without it the span survives into the five-column
   * row and breaks the exact fit it exists to protect.
   */
  const cardCount = 2 + (canManageExpenses ? 1 : 0) + (isAdmin ? 1 : 0);
  const fillOddRow =
    cardCount % 2 === 1 ? "sm:max-xl:[&>*:last-child]:col-span-2" : "";

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${XL_COLS[units]} ${fillOddRow}`}>
        <LeaveCard number={num()} onOpen={onOpen} />
        {/* Approvals + absences share one card: both are single-figure "state of
            the team today" readouts, so two boxes was noise. The approvals half
            is the entry point to the ApprovalsTab, which was built but
            previously unreachable.

            It spans TWO columns from `xl`, which is what makes the row come out
            exact — it is already drawn as two halves, so it reads as a double
            tile rather than a stretched one. Below `xl` the grid is two columns
            and every card is one unit, so four cards make a clean 2x2; letting
            it span there would push it onto a row of its own and leave a hole
            beside Leave. */}
        <TeamCard number={num()} canApprove={canApprove} onOpen={onOpen} />
        {canManageExpenses ? <ExpensesCard number={num()} onOpen={onOpen} /> : null}
        {isAdmin ? <HandoverCard number={num()} onOpen={onOpen} /> : null}
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


/**
 * Handover — the count that matters is how much is still WAITING on somebody.
 * Total items would grow as a handover gets more thorough, which is backwards:
 * a well-written one should read as quiet.
 */
function HandoverCard({ number, onOpen }: { number: string; onOpen: (a: BackstageArea) => void }) {
  const list = useHandovers();
  const rows = list.data ?? [];
  const live = rows.filter((h) => h.status !== "ENDED");
  // Clients still to write up — the gap, not the total. A handover is "done"
  // when every client on it says something.
  const waiting = live.reduce((t, h) => t + Math.max(0, h.clientCount - h.writtenCount), 0);
  return (
    <Card number={number} title="HANDOVER" area="handover" onOpen={onOpen}>
      <Figure value={list.isLoading ? "—" : waiting} unit="to write up" />
      <p className="text-xs text-[var(--text-3)]">
        {live.length === 0
          ? "Nothing handed over"
          : `${live.length} live · clients still to write up`}
      </p>
    </Card>
  );
}
