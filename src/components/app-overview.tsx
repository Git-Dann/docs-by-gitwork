"use client";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CodeClearWidget from "@/components/dashboard/codeclear-widget";
import StudyWidget from "@/components/dashboard/study-widget";
import CareWidget from "@/components/dashboard/care-widget";
import BackstageWidget from "@/components/dashboard/backstage-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import TasksWidget from "@/components/dashboard/tasks-widget";
import { DevOverview } from "@/components/dashboard/dev-overview";
import { DailyRollup } from "@/components/tasks/daily-rollup";
import { useAccount } from "@/hooks/use-account";
import { isAtLeast } from "@/types/auth";

export type WidgetSize = "sm" | "md" | "lg";

type GridEntry = {
  component: React.ComponentType<{ size: WidgetSize }>;
  cols: 1 | 2 | 3;
  rows: 1 | 2 | 3;
  size: WidgetSize;
};

const ROW_HEIGHT = 220;

const GRID: GridEntry[] = [
  { component: PulseWidget,     cols: 2, rows: 1, size: "md" },
  { component: CodeClearWidget, cols: 1, rows: 1, size: "sm" },
  { component: StudyWidget,     cols: 1, rows: 1, size: "sm" },
  { component: CareWidget,      cols: 1, rows: 1, size: "sm" },
  { component: BackstageWidget, cols: 1, rows: 1, size: "sm" },
  { component: TasksWidget,     cols: 1, rows: 1, size: "sm" },
  { component: ProposalsWidget, cols: 2, rows: 2, size: "lg" },
  { component: ClientsWidget,   cols: 1, rows: 2, size: "md" },
  { component: GmailWidget,     cols: 1, rows: 2, size: "md" },
  { component: CalendarWidget,  cols: 2, rows: 2, size: "lg" },
];

export function AppOverview() {
  const account = useAccount();

  // Wait for role/permissions so a restricted developer never flashes the full
  // agency grid before their task-focused view loads.
  if (account.isPending) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const role = account.data?.role;
  const permissions = account.data?.permissions ?? [];
  const isAdmin = isAtLeast(role ?? "", "ADMIN");
  // A restricted developer = the Developer role, or anyone without "see all clients".
  const isDeveloper = !isAdmin && (role === "DEVELOPER" || !permissions.includes("seeAllClients"));
  const canPublishRollup = isAdmin || permissions.includes("tasks.publish");

  if (isDeveloper) {
    return <DevOverview />;
  }

  return (
    <div className="space-y-4">
      {/* DevOps lead: end-of-day roll-up sits above the agency overview. */}
      {canPublishRollup ? <DailyRollup /> : null}

      {/*
        Mobile: flex-col — widgets stack vertically, minHeight gives each sensible space.
        lg+: grid kicks in with the 3-col layout and fixed row heights.
        The page header is rendered by AppShell (same as every other module page).
      */}
      <div
        className="flex flex-col gap-3 lg:grid lg:gap-3"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: `${ROW_HEIGHT}px`,
          gridAutoFlow: "dense",
        }}
      >
        {GRID.map(({ component: Widget, cols, rows, size }, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
            style={{
              gridColumn: `span ${cols}`,
              gridRow: `span ${rows}`,
              minHeight: rows === 1 ? ROW_HEIGHT : ROW_HEIGHT * rows + (rows - 1) * 12,
            }}
          >
            <Widget size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
