"use client";

import Link from "next/link";
import {
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/solid";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import type { WidgetSize } from "@/components/app-overview";
import type { StaffingAlert } from "@/types/backstage";
import { formatDateRange, formatDay } from "@/components/backstage/format";

export default function BackstageWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useStaffingAlerts();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const alerts = data?.alerts ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          05 // BACKSTAGE
        </span>
        <Link
          href="/app/backstage"
          className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]"
        >
          Open
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <CalendarDaysIcon className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-xs text-[#475569]">
                No team-availability alerts in the next {data?.windowDays ?? 30} days.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {alerts.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <AlertRow alert={a} />
                </li>
              ))}
              {alerts.length > 8 ? (
                <li className="text-center text-xs text-[#94A3B8]">
                  +{alerts.length - 8} more
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: StaffingAlert }) {
  if (alert.kind === "leave") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5">
        <CalendarDaysIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#0F172A]">
            <span className="font-medium">{alert.user.name}</span>{" "}
            <span className="text-[#475569]">on leave</span>{" "}
            <span className="text-[#475569]">
              · {formatDateRange(alert.startDate, alert.endDate)}
            </span>
          </p>
        </div>
      </div>
    );
  }
  if (alert.kind === "holiday") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5">
        <GlobeAltIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#0F172A]">
            <span className="font-medium">{alert.country} holiday</span>{" "}
            <span className="text-[#475569]">· {alert.name}</span>{" "}
            <span className="text-[#475569]">· {formatDay(alert.date)}</span>
          </p>
          <p className="truncate text-[10px] text-[#94A3B8]">
            {alert.affectedMembers.length > 0
              ? `Affects: ${alert.affectedMembers.map((m) => m.name).join(", ")}`
              : "Consider client comms / availability"}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-red-200 bg-red-50 px-2.5 py-1.5">
      <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#0F172A]">
          <span className="font-medium">Conflict</span>{" "}
          <span className="text-[#475569]">
            · {alert.users.map((u) => u.name).join(" + ")} off on {formatDay(alert.date)}
          </span>
        </p>
      </div>
    </div>
  );
}
