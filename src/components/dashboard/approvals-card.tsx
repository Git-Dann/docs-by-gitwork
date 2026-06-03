"use client";

import Link from "next/link";
import { CheckIcon, XMarkIcon, ArrowRightIcon } from "@heroicons/react/16/solid";
import { cn, formatCurrency, formatDate } from "@/lib/format";
import {
  useLeaveRequests,
  useExpenses,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useReviewExpense,
} from "@/hooks/use-backstage";
import type { LeaveType } from "@/types/backstage";

const LEAVE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick",
  UNPAID: "Unpaid",
  OTHER: "Leave",
};

const CAP = 4;

function ActionBtns({
  onApprove,
  onReject,
  disabled,
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onApprove(); }}
        disabled={disabled}
        title="Approve"
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-emerald-300 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReject(); }}
        disabled={disabled}
        title="Reject"
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ApprovalsCard() {
  const leaveQuery = useLeaveRequests("all", "PENDING");
  const expensesQuery = useExpenses("all", "SUBMITTED");
  const approveLeave = useApproveLeaveRequest();
  const rejectLeave = useRejectLeaveRequest();
  const reviewExpense = useReviewExpense();

  const leave = leaveQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const busy = approveLeave.isPending || rejectLeave.isPending || reviewExpense.isPending;
  const total = leave.length + expenses.length;
  const loading = leaveQuery.isLoading || expensesQuery.isLoading;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // APPROVALS"}
        </span>
        <Link
          href="/app/backstage"
          className="widget-header__status inline-flex items-center gap-1 transition-colors hover:text-[var(--brand-700)]"
        >
          {total > 0 ? `${total} pending` : "Backstage"} <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="widget-body space-y-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : total === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">Nothing awaiting approval. All clear.</p>
        ) : (
          <>
            {leave.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Leave
                </p>
                {leave.slice(0, CAP).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{l.user.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-4)]">
                        {LEAVE_LABEL[l.type]} · {formatDate(l.startDate)}–{formatDate(l.endDate)} · {l.workingDays}d
                      </p>
                    </div>
                    <ActionBtns
                      disabled={busy}
                      onApprove={() => approveLeave.mutate({ id: l.id })}
                      onReject={() => rejectLeave.mutate({ id: l.id })}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {expenses.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Expenses
                </p>
                {expenses.slice(0, CAP).map((x) => (
                  <div key={x.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">
                        {x.user.name} · <span className="tabular-nums">{formatCurrency(x.amount, x.currency)}</span>
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-4)]">
                        {x.vendor ? `${x.vendor} · ` : ""}{x.category.toLowerCase()}
                      </p>
                    </div>
                    <ActionBtns
                      disabled={busy}
                      onApprove={() => reviewExpense.mutate({ id: x.id, status: "APPROVED" })}
                      onReject={() => reviewExpense.mutate({ id: x.id, status: "REJECTED" })}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {total > CAP ? (
              <Link href="/app/backstage" className={cn("block text-center text-[11px] font-medium text-[var(--brand-700)] hover:underline")}>
                Review all in Backstage →
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
