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
import { BackstagePanel, PanelAction } from "@/components/backstage/panel";
import { ScopeToggle } from "@/components/backstage/scope-toggle";
import { Stat } from "@/components/backstage/stat";
import { useBackstageAccess } from "@/components/backstage/access";
import { formatDateRange, formatRelative } from "@/components/backstage/format";
import type { LeaveRequestDTO } from "@/types/backstage";

export function LeaveTab() {
  const { canApprove } = useBackstageAccess();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeaveRequestDTO | null>(null);
  // Approvers (admin/HR) can switch to the whole team to view + edit anyone's leave.
  const [scope, setScope] = useState<"me" | "all">("me");
  const requests = useLeaveRequests(canApprove ? scope : "me");
  const allowance = useLeaveAllowance();
  const cancelMut = useCancelLeaveRequest();

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

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

      {showForm || editing ? (
        <LeaveRequestForm
          editing={editing ?? undefined}
          onSubmitted={closeForm}
          onCancel={closeForm}
        />
      ) : null}

      {/* Requests list */}
      <BackstagePanel
        number="02"
        title={canApprove && scope === "all" ? "TEAM LEAVE" : "MY LEAVE"}
        bodyClassName="p-0"
        action={
          <>
            {canApprove ? <ScopeToggle value={scope} onChange={setScope} /> : null}
            <PanelAction
              leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              Request leave
            </PanelAction>
          </>
        }
      >
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
                    {canApprove && scope === "all" ? (
                      <span className="text-[var(--text-1)]">{r.user.name} · </span>
                    ) : null}
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
                  {canApprove || r.status === "PENDING" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditing(r);
                      }}
                      className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    >
                      Edit
                    </button>
                  ) : null}
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
      </BackstagePanel>
    </div>
  );
}
