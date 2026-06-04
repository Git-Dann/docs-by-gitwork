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
import { DevOverview } from "@/components/dashboard/dev-overview";
import { ATTENTION_CARDS } from "@/components/dashboard/dashboard-config";
import { useAccount } from "@/hooks/use-account";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { isAtLeast } from "@/types/auth";
import { useViewAs, VIEW_AS_PERMISSIONS } from "@/lib/view-as";

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

// 9 widgets × their col spans = 2+1+1+1+1+4+2+2+4 = 18 slots = exactly 6 rows × 3 cols.
// Any deviation (adding a stray 1×1) breaks the packing and causes widowed columns.
// Tasks is accessible via Portal — it stays off the bento to keep the grid clean.
const GRID: GridEntry[] = [
  { component: PulseWidget,     cols: 2, rows: 1, size: "md", module: "pulse" },     // row 1: cols 1-2
  { component: CodeClearWidget, cols: 1, rows: 1, size: "sm", module: "codeclear" }, // row 1: col 3
  { component: StudyWidget,     cols: 1, rows: 1, size: "sm", module: "study" },     // row 2: col 1
  { component: CareWidget,      cols: 1, rows: 1, size: "sm", module: "support" },   // row 2: col 2
  { component: BackstageWidget, cols: 1, rows: 1, size: "sm", module: "backstage" }, // row 2: col 3
  { component: ProposalsWidget, cols: 2, rows: 2, size: "lg", module: "proposals" }, // rows 3-4: cols 1-2
  { component: ClientsWidget,   cols: 1, rows: 2, size: "md", module: "clients" },   // rows 3-4: col 3
  { component: GmailWidget,     cols: 1, rows: 2, size: "md" },                      // rows 5-6: col 1
  { component: CalendarWidget,  cols: 2, rows: 2, size: "lg" },                      // rows 5-6: cols 2-3
];

function greetingPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function AppOverview() {
  const account = useAccount();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const { viewAs } = useViewAs(isAdmin);

  // Wait for role/permissions so a restricted developer never flashes the full
  // agency grid before their task-focused view loads.
  if (account.isPending) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const role = account.data?.role ?? "";
  const realPermissions = account.data?.permissions ?? [];

  // When an admin is previewing as another role, use that role's permissions.
  const effectivePermissions = isAdmin && viewAs ? VIEW_AS_PERMISSIONS[viewAs] : realPermissions;
  const effectiveIsAdmin = isAdmin && !viewAs;

  // Show developer view when previewing as Developer, or when actually a restricted dev.
  const isDeveloper = isAdmin
    ? viewAs === "DEVELOPER"
    : role === "DEVELOPER" || !realPermissions.includes("seeAllClients");

  // Admin preview: treat same as full admin access (same permissions, useful for UI comparison)
  // effectiveIsAdmin is already false when viewAs==="ADMIN", so the bento grid still shows
  // but all widgets are visible since ADMIN permissions cover every module.

  if (isDeveloper) {
    return <DevOverview />;
  }

  const acct = { role, permissions: effectivePermissions };
  const attention = ATTENTION_CARDS.filter((c) => c.when(acct));
  // Only render module widgets the user can actually reach.
  const widgets = GRID.filter((g) => effectiveIsAdmin || !g.module || effectivePermissions.includes(g.module));
  const hasBackstage = effectiveIsAdmin || effectivePermissions.includes("backstage");

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

      {/* Needs-attention row (role/permission gated) */}
      {attention.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {attention.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </div>
      ) : null}

      {/* Module bento — filtered to the user's access. */}
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
