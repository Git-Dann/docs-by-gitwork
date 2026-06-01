"use client";

import { useState } from "react";
import { CalendarDaysIcon, PlusIcon } from "@heroicons/react/24/outline";
import {
  useCancelLeaveRequest,
  useLeaveAllowance,
  useLeaveRequests,
} from "@/hooks/use-backstage";
import { LeaveRequestForm } from "@/components/backstage/leave-request-form";
import { StatusPill } from "@/components/backstage/status-pill";
import { formatDateRange, formatRelative } from "@/components/backstage/format";

export function LeaveTab() {
  const [showForm, setShowForm] = useState(false);
  const requests = useLeaveRequests("me");
  const allowance = useLeaveAllowance();
  const cancelMut = useCancelLeaveRequest();

  return (
    <div className="space-y-6">
      {/* Allowance summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Allocated"
          value={allowance.data?.allocated ?? "—"}
          suffix="days/year"
        />
        <SummaryCard
          label="Used"
          value={allowance.data?.used ?? "—"}
          suffix="days"
        />
        <SummaryCard
          label="Pending"
          value={allowance.data?.pending ?? "—"}
          suffix="days"
        />
        <SummaryCard
          label="Remaining"
          value={allowance.data?.remaining ?? "—"}
          suffix="days"
          accent
        />
      </div>

      {/* Header + new button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-1)]">My leave</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-[6px] bg-[var(--brand-600)] px-3 py-2 text-sm font-medium text-white shadow-[var(--shadow-xs)] transition hover:bg-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Request leave
        </button>
      </div>

      {showForm ? (
        <LeaveRequestForm
          onSubmitted={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {/* Requests list */}
      <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
        {requests.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>
        ) : (requests.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarDaysIcon className="h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-3)]">No leave booked yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {formatDateRange(r.startDate, r.endDate, {
                      halfDayStart: r.halfDayStart,
                      halfDayEnd: r.halfDayEnd,
                    })}{" "}
                    <span className="font-normal text-[var(--text-3)]">
                      · {r.workingDays} {r.workingDays === 1 ? "day" : "days"} · {r.type.toLowerCase()}
                    </span>
                  </p>
                  {r.reason ? (
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">{r.reason}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-[var(--text-4)]">
                    Filed {formatRelative(r.createdAt)}
                    {r.approvedBy ? ` · approved by ${r.approvedBy.name}` : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} />
                  {r.status === "PENDING" || r.status === "APPROVED" ? (
                    <button
                      type="button"
                      onClick={() => cancelMut.mutate(r.id)}
                      disabled={cancelMut.isPending}
                      className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number | string;
  suffix: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand)] p-4"
          : "rounded-[10px] border border-[var(--border-2)] bg-white p-4"
      }
    >
      <p className="text-xs uppercase tracking-wide text-[var(--text-4)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-1)]">
        {value} <span className="text-sm font-normal text-[var(--text-3)]">{suffix}</span>
      </p>
    </div>
  );
}
