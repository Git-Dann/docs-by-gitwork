"use client";

import type { ReactNode } from "react";
import { CalendarDaysIcon, DocumentTextIcon, InboxIcon } from "@heroicons/react/24/outline";
import {
  useExpenses,
  useLeaveAllowance,
  useLeaveRequests,
} from "@/hooks/use-backstage";
import { BackstagePanel } from "@/components/backstage/panel";
import { Stat } from "@/components/backstage/stat";
import { StatusPill } from "@/components/backstage/status-pill";
import { CalendarTab } from "@/components/backstage/calendar-tab";
import { useBackstageAccess } from "@/components/backstage/access";
import { formatDateRange, formatDay, formatMoney } from "@/components/backstage/format";
import type { BackstageTab } from "@/components/backstage/backstage-workspace";

const DAY_MS = 1000 * 60 * 60 * 24;

// Backstage landing dashboard. At-a-glance widgets — allowance, your live leave +
// expenses, and (for approvers) what's waiting on you. The full month grid keeps
// its own Calendar tab; deep actions live in the dedicated tabs.
export function OverviewTab({ onNavigate }: { onNavigate: (tab: BackstageTab) => void }) {
  const { canApprove, canManageExpenses } = useBackstageAccess();
  const allowance = useLeaveAllowance();

  // Sequential per-view numbering, skipping panels the user can't see.
  let n = 1;
  const next = () => String(++n).padStart(2, "0");

  return (
    <div className="space-y-6">
      <BackstagePanel number="01" title="MY ALLOWANCE">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Allocated" value={allowance.data?.allocated ?? "—"} suffix="days/yr" />
          <Stat label="Used" value={allowance.data?.used ?? "—"} suffix="days" />
          <Stat label="Pending" value={allowance.data?.pending ?? "—"} suffix="days" />
          <Stat label="Remaining" value={allowance.data?.remaining ?? "—"} suffix="days" accent />
        </div>
      </BackstagePanel>

      {canApprove ? <ApprovalsSummary number={next()} onNavigate={onNavigate} /> : null}

      <MyLeaveSummary number={next()} onNavigate={onNavigate} />

      {canManageExpenses ? <MyExpensesSummary number={next()} onNavigate={onNavigate} /> : null}

      <CalendarTab number={next()} />
    </div>
  );
}

// ── Outstanding approvals (admin/HR) ──────────────────────────────────────
function ApprovalsSummary({
  number,
  onNavigate,
}: {
  number: string;
  onNavigate: (tab: BackstageTab) => void;
}) {
  const pendingLeave = useLeaveRequests("all", "PENDING");
  const pendingExpenses = useExpenses("all", "SUBMITTED");
  const total = (pendingLeave.data?.length ?? 0) + (pendingExpenses.data?.length ?? 0);

  return (
    <BackstagePanel
      number={number}
      title="OUTSTANDING APPROVALS"
      bodyClassName="p-0"
      action={<CountChip n={total} />}
    >
      {pendingLeave.isLoading || pendingExpenses.isLoading ? (
        <Loading />
      ) : total === 0 ? (
        <Empty icon={<InboxIcon className="h-7 w-7 text-[var(--text-4)]" />} text="Nothing waiting on you." />
      ) : (
        <ul className="divide-y divide-[var(--border-2)]">
          {(pendingLeave.data ?? []).slice(0, 4).map((r) => (
            <Row
              key={`l-${r.id}`}
              title={r.user.name}
              detail={`${formatDateRange(r.startDate, r.endDate)} · ${r.type.toLowerCase()} leave`}
              pill={<StatusPill status={r.status} />}
            />
          ))}
          {(pendingExpenses.data ?? []).slice(0, 4).map((e) => (
            <Row
              key={`e-${e.id}`}
              title={e.user.name}
              detail={`${formatMoney(e.amount, e.currency)} · ${e.category.toLowerCase()}`}
              pill={<StatusPill status={e.status} />}
            />
          ))}
          <ViewAll label={`Review all ${total}`} onClick={() => onNavigate("approvals")} />
        </ul>
      )}
    </BackstagePanel>
  );
}

// ── My leave (current + pending) ──────────────────────────────────────────
function MyLeaveSummary({
  number,
  onNavigate,
}: {
  number: string;
  onNavigate: (tab: BackstageTab) => void;
}) {
  const mine = useLeaveRequests("me");
  const cutoff = Date.now() - DAY_MS;
  const live = (mine.data ?? []).filter(
    (r) => r.status === "PENDING" || (r.status === "APPROVED" && new Date(r.endDate).getTime() >= cutoff),
  );

  return (
    <BackstagePanel number={number} title="MY LEAVE" bodyClassName="p-0">
      {mine.isLoading ? (
        <Loading />
      ) : live.length === 0 ? (
        <Empty
          icon={<CalendarDaysIcon className="h-7 w-7 text-[var(--text-4)]" />}
          text="No upcoming or pending leave."
        />
      ) : (
        <ul className="divide-y divide-[var(--border-2)]">
          {live.slice(0, 4).map((r) => (
            <Row
              key={r.id}
              title={formatDateRange(r.startDate, r.endDate, {
                halfDayStart: r.halfDayStart,
                halfDayEnd: r.halfDayEnd,
              })}
              detail={`${r.workingDays} ${r.workingDays === 1 ? "day" : "days"} · ${r.type.toLowerCase()}`}
              pill={<StatusPill status={r.status} />}
            />
          ))}
          <ViewAll label="Open Leave" onClick={() => onNavigate("leave")} />
        </ul>
      )}
    </BackstagePanel>
  );
}

// ── My expenses (pending review) ──────────────────────────────────────────
function MyExpensesSummary({
  number,
  onNavigate,
}: {
  number: string;
  onNavigate: (tab: BackstageTab) => void;
}) {
  const mine = useExpenses("me");
  const pending = (mine.data ?? []).filter((e) => e.status === "SUBMITTED");

  return (
    <BackstagePanel number={number} title="MY EXPENSES" bodyClassName="p-0">
      {mine.isLoading ? (
        <Loading />
      ) : pending.length === 0 ? (
        <Empty
          icon={<DocumentTextIcon className="h-7 w-7 text-[var(--text-4)]" />}
          text="No expenses awaiting review."
        />
      ) : (
        <ul className="divide-y divide-[var(--border-2)]">
          {pending.slice(0, 4).map((e) => (
            <Row
              key={e.id}
              title={formatMoney(e.amount, e.currency)}
              detail={`${e.category.toLowerCase()}${e.vendor ? ` · ${e.vendor}` : ""} · ${formatDay(e.occurredOn)}`}
              pill={<StatusPill status={e.status} />}
            />
          ))}
          <ViewAll label="Open Expenses" onClick={() => onNavigate("expenses")} />
        </ul>
      )}
    </BackstagePanel>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────
function Row({ title, detail, pill }: { title: string; detail: string; pill: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{title}</p>
        <p className="truncate text-xs text-[var(--text-3)]">{detail}</p>
      </div>
      {pill}
    </li>
  );
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
      >
        {label} →
      </button>
    </li>
  );
}

function CountChip({ n }: { n: number }) {
  return (
    <span className="text-[11px] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
      {n}
    </span>
  );
}

function Loading() {
  return <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>;
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      {icon}
      <p className="text-sm text-[var(--text-3)]">{text}</p>
    </div>
  );
}
