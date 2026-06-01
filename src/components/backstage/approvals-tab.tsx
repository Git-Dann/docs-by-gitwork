"use client";

import { useState } from "react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import {
  useApproveLeaveRequest,
  useExpenses,
  useLeaveRequests,
  useRejectLeaveRequest,
  useReviewExpense,
} from "@/hooks/use-backstage";
import { StatusPill } from "@/components/backstage/status-pill";
import { ReceiptViewer } from "@/components/backstage/receipt-viewer";
import { BackstagePanel } from "@/components/backstage/panel";
import {
  formatDateRange,
  formatDay,
  formatMoney,
  formatRelative,
} from "@/components/backstage/format";
import type { ExpenseDTO } from "@/types/backstage";

export function ApprovalsTab() {
  const pendingLeave = useLeaveRequests("team", "PENDING");
  const pendingExpenses = useExpenses("team", "SUBMITTED");
  const approve = useApproveLeaveRequest();
  const reject = useRejectLeaveRequest();
  const review = useReviewExpense();
  const [viewingReceipt, setViewingReceipt] = useState<ExpenseDTO | null>(null);

  return (
    <div className="space-y-6">
      <BackstagePanel
        number="01"
        title="LEAVE REQUESTS · PENDING"
        bodyClassName="p-0"
        action={
          pendingLeave.data ? (
            <span
              className="text-[11px] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pendingLeave.data.length}
            </span>
          ) : null
        }
      >
        {pendingLeave.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>
        ) : (pendingLeave.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-3)]">
            Nothing pending.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
              {(pendingLeave.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)]">
                      {r.user.name} ·{" "}
                      <span className="font-normal text-[var(--text-3)]">
                        {formatDateRange(r.startDate, r.endDate, {
                          halfDayStart: r.halfDayStart,
                          halfDayEnd: r.halfDayEnd,
                        })}{" "}
                        · {r.workingDays} {r.workingDays === 1 ? "day" : "days"} · {r.type.toLowerCase()}
                      </span>
                    </p>
                    {r.reason ? (
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">{r.reason}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">
                      Filed {formatRelative(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => approve.mutate({ id: r.id })}
                      className="rounded-[6px] bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => {
                        const note = window.prompt("Optional rejection note");
                        reject.mutate({ id: r.id, note: note ?? undefined });
                      }}
                      className="rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </BackstagePanel>

      <BackstagePanel
        number="02"
        title="EXPENSES · AWAITING REVIEW"
        bodyClassName="p-0"
        action={
          pendingExpenses.data ? (
            <span
              className="text-[11px] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pendingExpenses.data.length}
            </span>
          ) : null
        }
      >
        {pendingExpenses.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>
        ) : (pendingExpenses.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-3)]">
            Nothing pending.
          </div>
        ) : (
            <ul className="divide-y divide-[var(--border-2)]">
              {(pendingExpenses.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)]">
                      {e.user.name} ·{" "}
                      <span className="font-normal text-[var(--text-3)]">
                        {formatMoney(e.amount, e.currency)} · {e.category.toLowerCase()}
                        {e.vendor ? ` · ${e.vendor}` : ""}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">
                      {formatDay(e.occurredOn)} · filed {formatRelative(e.createdAt)}
                    </p>
                    {e.notes ? (
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">{e.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {e.hasReceipt ? (
                      <button
                        type="button"
                        onClick={() => setViewingReceipt(e)}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        <PhotoIcon className="h-3.5 w-3.5" />
                        Receipt
                      </button>
                    ) : (
                      <StatusPill status="no-receipt" />
                    )}
                    <button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: e.id, status: "REIMBURSED" })}
                      className="rounded-[6px] bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Reimburse
                    </button>
                    <button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: e.id, status: "APPROVED" })}
                      className="rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => {
                        const note = window.prompt("Optional rejection note");
                        review.mutate({ id: e.id, status: "REJECTED", note: note ?? undefined });
                      }}
                      className="rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </BackstagePanel>

      {viewingReceipt ? (
        <ReceiptViewer
          expense={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
        />
      ) : null}
    </div>
  );
}
