"use client";

import Link from "next/link";
import { useLeaveRequests, useStaffingAlerts } from "@/hooks/use-backstage";
import { formatDateRange } from "@/components/backstage/format";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonWidget } from "@/components/ui/motion/skeleton";

/**
 * `NN // TEAM LEAVE` on Foundry HQ, for leave approvers: what's waiting on them and who's
 * off next. The server scopes both, so a staff-only approver (People & office) sees Gitwork
 * staff here and never developers.
 */
export default function TeamLeaveWidget({ index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");
  const leave = useLeaveRequests("team", "PENDING");
  const alerts = useStaffingAlerts();

  if (leave.isPending || alerts.isPending) return <SkeletonWidget />;

  // Leave only: expenses have their own tile (ExpensesWidget).
  const waiting = leave.data?.length ?? 0;
  const nextOff = (alerts.data?.alerts ?? [])
    .flatMap((a) => (a.kind === "leave" ? [a] : []))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-1)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // TEAM LEAVE`}
        </span>
        <Link href="/app/backstage?area=approvals" className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          Approvals
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[34px] leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
            {waiting}
          </span>
          <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
            {waiting === 1 ? "leave request to approve" : "leave requests to approve"}
          </span>
        </p>
        <div className="min-h-0 flex-1 overflow-hidden">
          <p className="widget-data-label text-[var(--text-4)]">Off next</p>
          {nextOff.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-3)]">Nobody booked in the next 30 days.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {nextOff.map((a) => (
                <li key={`${a.user.id}:${a.startDate}`} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-[var(--text-1)]" title={a.user.name}>
                    {a.user.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--text-3)]">{formatDateRange(a.startDate, a.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
