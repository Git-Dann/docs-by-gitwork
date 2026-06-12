"use client";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CareWidget from "@/components/dashboard/care-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import { DevOverview } from "@/components/dashboard/dev-overview";
import { OnYourDeskCard } from "@/components/dashboard/on-your-desk-card";
import { DailyRollup } from "@/components/tasks/daily-rollup";
import { can } from "@/components/dashboard/dashboard-config";
import { useAccount } from "@/hooks/use-account";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { isAtLeast } from "@/types/auth";
import { useViewAs } from "@/lib/view-as";

export type WidgetSize = "sm" | "md" | "lg";

type GridEntry = {
  component: React.ComponentType<{ size: WidgetSize }>;
  cols: 1 | 2 | 3;
  rows: 1 | 2 | 3;
  size: WidgetSize;
  /** Module permission required to see this widget (undefined = always shown). */
  module?: string;
};

const ROW_HEIGHT = 220;

// 6 widgets × their col spans = 1+2+4+2+2+4 = 15 slots = exactly 5 rows × 3 cols.
// Dropped from the bento (per Dan's feedback on the 911454a build):
//   - CodeClearWidget — dev-count is a Code-module concern, not a day-to-day signal
//   - StudyWidget — surface in Study module instead
//   - BackstageWidget — folded into <OnYourDeskCard>'s Upcoming section
// Pulse was shrunk from 2-wide to 1-wide so it pairs with Care on row 1.
const GRID: GridEntry[] = [
  { component: PulseWidget,     cols: 1, rows: 1, size: "sm", module: "pulse" },    // row 1: col 1
  { component: CareWidget,      cols: 2, rows: 1, size: "md", module: "support" },  // row 1: cols 2-3
  { component: ProposalsWidget, cols: 2, rows: 2, size: "lg", module: "proposals" },// rows 2-3: cols 1-2
  { component: ClientsWidget,   cols: 1, rows: 2, size: "md", module: "clients" },  // rows 2-3: col 3
  { component: GmailWidget,     cols: 1, rows: 2, size: "md" },                     // rows 4-5: col 1
  { component: CalendarWidget,  cols: 2, rows: 2, size: "lg" },                     // rows 4-5: cols 2-3
];

function greetingPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function AppOverview() {
  const account = useAccount();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const { viewAs, effectivePermissions } = useViewAs(isAdmin);

  // Wait for role/permissions so a restricted developer never flashes the full
  // agency grid before their task-focused view loads.
  if (account.isPending) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const role = account.data?.role ?? "";
  const realPermissions = account.data?.permissions ?? [];

  // effectivePermissions is null when viewing as Super Admin (full access).
  // Otherwise it's the preview role/user's permissions array.
  const previewPerms = effectivePermissions; // from useViewAs
  const resolvedPermissions = previewPerms ?? realPermissions;


  // Show developer view when previewing as Developer, or when actually a restricted dev.
  const isDeveloper = isAdmin
    ? viewAs === "DEVELOPER"
    : role === "DEVELOPER" || !realPermissions.includes("seeAllClients");

  if (isDeveloper) {
    return <DevOverview />;
  }

  // Full unrestricted view: real Super Admin (isAdmin, no preview, empty permissions array).
  const showAll = isAdmin && previewPerms === null && realPermissions.length === 0;

  const acct = { role, permissions: resolvedPermissions };
  const canApprove = showAll || can(acct, "backstage.approve") || can(acct, "backstage.expenses");
  const canSeeTasks = showAll || can(acct, "clients");
  const canSeeSignoff = showAll || can(acct, "proposals");
  const canPublishRollup = showAll || can(acct, "tasks.publish");
  const widgets = GRID.filter((g) => showAll || !g.module || resolvedPermissions.includes(g.module));
  const hasBackstage = showAll || resolvedPermissions.includes("backstage");

  const firstName = (account.data?.name ?? "").trim().split(/\s+/)[0];
  const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="space-y-5">
      {/* Context strip — date · greeting · who's off (subtle, not a second title) */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-4)]">
        <span style={{ fontFamily: "var(--font-mono)" }}>{longDate}</span>
        {firstName ? <span>· {greetingPart()}, {firstName}</span> : null}
        {hasBackstage ? <WhoIsOffToday /> : null}
      </div>

      {/* 01 + 02 sit side by side: "On your desk" is the personal to-do (auto-
          hides when empty); "Daily roll-up" is the DevOps lead's publishing UI
          for tasks.publish holders (Shahab; admins bypass). When the roll-up
          isn't visible to the viewer, "On your desk" spans the full row. */}
      <div className={canPublishRollup ? "grid gap-3 lg:grid-cols-2" : ""}>
        <OnYourDeskCard
          canApprove={canApprove}
          canSeeTasks={canSeeTasks}
          canSeeSignoff={canSeeSignoff}
        />
        {canPublishRollup ? <DailyRollup /> : null}
      </div>

      {/* 03+ // Module bento — filtered to the user's access. */}
      <div
        className="flex flex-col gap-3 lg:grid lg:gap-3"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: `${ROW_HEIGHT}px`,
          gridAutoFlow: "dense",
        }}
      >
        {widgets.map(({ component: Widget, cols, rows, size }, i) => {
          const cellHeight = rows === 1 ? ROW_HEIGHT : ROW_HEIGHT * rows + (rows - 1) * 12;
          return (
          <div
            key={i}
            className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
            style={{
              gridColumn: `span ${cols}`,
              gridRow: `span ${rows}`,
              // Explicit height (not just min) so h-full works inside both flex-col and grid modes
              height: `${cellHeight}px`,
            }}
          >
            <Widget size={size} />
          </div>
          );
        })}
      </div>
    </div>
  );
}

/** "· N off today: names" — pulled from staffing alerts; renders nothing if all in. */
function WhoIsOffToday() {
  const { data } = useStaffingAlerts();
  const ymd = new Date().toISOString().slice(0, 10);
  const names = Array.from(
    new Set(
      (data?.alerts ?? [])
        .filter((a) => a.kind === "leave" && a.startDate.slice(0, 10) <= ymd && a.endDate.slice(0, 10) >= ymd)
        .map((a) => (a.kind === "leave" ? a.user.name : "")),
    ),
  ).filter(Boolean);
  if (names.length === 0) return null;
  return (
    <span>
      · <span className="font-medium text-[var(--text-3)]">{names.length} off today:</span> {names.join(", ")}
    </span>
  );
}
