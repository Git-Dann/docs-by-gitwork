"use client";

import Link from "next/link";
import {
  WrenchScrewdriverIcon,
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

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
          <WrenchScrewdriverIcon className="h-2.5 w-2.5" />
          Backstage
        </span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{alerts.length}</p>
          <p className="text-xs text-[var(--text-3)]">alerts · {data?.windowDays ?? 30}d</p>
        </div>
        <p className="text-center text-xs text-[var(--text-3)]">
          {alerts.length === 0 ? "All clear" : "Plan around team availability"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
          <WrenchScrewdriverIcon className="h-2.5 w-2.5" />
          Backstage · staffing alerts
        </span>
        <Link
          href="/app/backstage"
          className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
        >
          Open
        </Link>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <CalendarDaysIcon className="h-6 w-6 text-[var(--text-4)]" />
            <p className="text-xs text-[var(--text-3)]">
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
              <li className="text-center text-xs text-[var(--text-4)]">
                +{alerts.length - 8} more
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: StaffingAlert }) {
  if (alert.kind === "leave") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5">
        <CalendarDaysIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-1)]">
            <span className="font-medium">{alert.user.name}</span>{" "}
            <span className="text-[var(--text-3)]">on leave</span>{" "}
            <span className="text-[var(--text-3)]">
              · {formatDateRange(alert.startDate, alert.endDate)}
            </span>
          </p>
        </div>
      </div>
    );
  }
  if (alert.kind === "holiday") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5">
        <GlobeAltIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-1)]">
            <span className="font-medium">{alert.country} holiday</span>{" "}
            <span className="text-[var(--text-3)]">· {alert.name}</span>{" "}
            <span className="text-[var(--text-3)]">· {formatDay(alert.date)}</span>
          </p>
          <p className="truncate text-[10px] text-[var(--text-4)]">
            Affects: {alert.affectedMembers.map((m) => m.name).join(", ")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-red-200 bg-red-50 px-2.5 py-1.5">
      <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--text-1)]">
          <span className="font-medium">Conflict</span>{" "}
          <span className="text-[var(--text-3)]">
            · {alert.users.map((u) => u.name).join(" + ")} off on {formatDay(alert.date)}
          </span>
        </p>
      </div>
    </div>
  );
}
