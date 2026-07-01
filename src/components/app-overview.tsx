"use client";

import { useState } from "react";
import PulseWidget from "@/components/dashboard/pulse-widget";
import CareWidget from "@/components/dashboard/care-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import { DevOverview } from "@/components/dashboard/dev-overview";
import { OnYourDeskCard } from "@/components/dashboard/on-your-desk-card";
import { AgenticWorkflowCard } from "@/components/dashboard/agentic-workflow-card";
import { DailyRollup } from "@/components/tasks/daily-rollup";
import { BroadcastComposer } from "@/components/tasks/broadcast-composer";
import { can } from "@/components/dashboard/dashboard-config";
import { useAccount } from "@/hooks/use-account";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { isAtLeast } from "@/types/auth";
import { useViewAs } from "@/lib/view-as";

export type WidgetSize = "sm" | "md" | "lg";

type WidgetBand = "feed" | "summary";

type GridEntry = {
  component: React.ComponentType<{ size: WidgetSize; index: number }>;
  /** "feed" tiles are tall (list/inbox content); "summary" tiles are short. */
  band: WidgetBand;
  size: WidgetSize;
  /** Module permission required to see this widget (undefined = always shown). */
  module?: string;
};

const ROW_HEIGHT = 220;
const TILE_GAP = 12;

// The bento renders in two bands so it always tiles cleanly, whatever the
// viewer's permissions filter out:
//   • feeds  (CLIENTS / MAIL / CALENDAR) — tall, feed-style content (client
//     list, mail inbox, upcoming meetings) that needs height to be readable.
//   • summaries (PULSE / CARE / DOCS) — short stat tiles.
// Each band lays its tiles on a 6-column grid and the final row stretches to
// fill the full width (3→2-span, 2→3-span, 1→6-span), so there is never a
// blank cell — and numbering stays sequential because the parent assigns it.
const GRID: GridEntry[] = [
  { component: ClientsWidget,   band: "feed",    size: "md", module: "clients" },
  { component: GmailWidget,     band: "feed",    size: "md" },
  { component: CalendarWidget,  band: "feed",    size: "md" },
  { component: PulseWidget,     band: "summary", size: "sm", module: "pulse" },
  { component: CareWidget,      band: "summary", size: "sm", module: "support" },
  { component: ProposalsWidget, band: "summary", size: "sm", module: "proposals" },
];

type NumberedTile = GridEntry & { number: number };

/**
 * One band of bento tiles on a 6-column grid. Rows of three tiles span 2
 * columns each; a final row of two spans 3 each and a lone tile spans all 6 —
 * so every row is completely filled and no blank cells are ever left.
 */
function BentoBand({ tiles, band }: { tiles: NumberedTile[]; band: WidgetBand }) {
  const height = band === "feed" ? ROW_HEIGHT * 2 + TILE_GAP : ROW_HEIGHT;
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-6"
      style={{ gap: `${TILE_GAP}px` }}
    >
      {tiles.map(({ component: Widget, size, number }, i) => {
        // Length of the (max-3) row this tile sits in → its column span.
        const rowStart = Math.floor(i / 3) * 3;
        const rowLen = Math.min(3, tiles.length - rowStart);
        const span = 6 / rowLen; // 3→2, 2→3, 1→6
        return (
          <div
            key={number}
            className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
            style={{ gridColumn: `span ${span}`, height: `${height}px` }}
          >
            <Widget size={size} index={number} />
          </div>
        );
      })}
    </div>
  );
}

function greetingPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function AppOverview() {
  const account = useAccount();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const { viewAs, effectivePermissions } = useViewAs(isAdmin);
  // "On your desk" self-hides on an empty desk; it reports its render state so
  // the dashboard numbering below stays gap-free (declared before any early
  // return to respect the rules of hooks).
  const [deskVisible, setDeskVisible] = useState(false);

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
  const canApprove = showAll || can(acct, "backstage.approve");
  const canSeeTasks = showAll || can(acct, "clients");
  const canSeeSignoff = showAll || can(acct, "proposals");
  const canManageClientRecords = showAll || can(acct, "clients.manage");
  // Visibility of the roll-up CARD (admins/super admins can monitor).
  const canPublishRollup = showAll || can(acct, "tasks.publish");
  // Visibility of the Publish / Publish-anyway BUTTONS — admins/super admins
  // are explicitly EXCLUDED here even though `tasks.publish` shows up in their
  // resolved permissions (admins inherit the full set). Publishing the roll-up
  // is the DevOps lead's job (Shahab — explicit `tasks.publish`, non-admin).
  const canActuallyPublish = !isAdmin && resolvedPermissions.includes("tasks.publish");
  // The DevOps broadcast composer — the lead's cross-client posting tool. Shown to
  // the lead (explicit tasks.publish, non-admin) and the unrestricted owner.
  const canBroadcast = showAll || canActuallyPublish;
  const widgets = GRID.filter((g) => showAll || !g.module || resolvedPermissions.includes(g.module));
  const hasBackstage = showAll || resolvedPermissions.includes("backstage");

  const firstName = (account.data?.name ?? "").trim().split(/\s+/)[0];
  const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // ── Sequential numbering, computed from what actually renders so there are
  //    never holes (01, 02, 03 …). The desk card is always slot 1 when shown;
  //    the roll-up follows; then the bento feeds, then the bento summaries. ──
  let counter = deskVisible ? 1 : 0;
  const rollupNumber = canPublishRollup ? (counter += 1) : 0;
  const broadcastNumber = canBroadcast ? (counter += 1) : 0;
  const feeds = widgets
    .filter((w) => w.band === "feed")
    .map((w) => ({ ...w, number: (counter += 1) }));
  const summaries = widgets
    .filter((w) => w.band === "summary")
    .map((w) => ({ ...w, number: (counter += 1) }));

  // The today band is two-up only when the desk card AND a right-column card
  // (roll-up and/or broadcast, stacked) are both present, else the lone card
  // spans full width — no half-empty row.
  const hasRightColumn = canPublishRollup || canBroadcast;
  const todayTwoUp = deskVisible && hasRightColumn;

  return (
    <div className="space-y-5">
      {/* Context strip — date · greeting · who's off (subtle, not a second title) */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-4)]">
        <span style={{ fontFamily: "var(--font-mono)" }}>{longDate}</span>
        {firstName ? <span>· {greetingPart()}, {firstName}</span> : null}
        {hasBackstage ? <WhoIsOffToday /> : null}
      </div>

      {/* Today band — "On your desk" (personal to-do, auto-hides when empty)
          and the DevOps lead's "Daily roll-up". Side-by-side only when both
          render; otherwise the present card fills the row. */}
      <div className={todayTwoUp ? "grid items-stretch gap-3 lg:grid-cols-2" : ""}>
        <OnYourDeskCard
          index={1}
          onVisibilityChange={setDeskVisible}
          canApprove={canApprove}
          canSeeTasks={canSeeTasks}
          canSeeSignoff={canSeeSignoff}
          className={todayTwoUp ? "h-full" : undefined}
        />
        {hasRightColumn ? (
          <div className="flex flex-col gap-3">
            {canPublishRollup ? <DailyRollup index={rollupNumber} canPublish={canActuallyPublish} /> : null}
            {canBroadcast ? <BroadcastComposer index={broadcastNumber} enabled /> : null}
          </div>
        ) : null}
      </div>

      {/* Module bento — two gap-free bands, filtered to the user's access. */}
      {(feeds.length > 0 || summaries.length > 0) && (
        <div className="space-y-3">
          {feeds.length > 0 && <BentoBand tiles={feeds} band="feed" />}
          {summaries.length > 0 && <BentoBand tiles={summaries} band="summary" />}
        </div>
      )}

      {canSeeTasks && canSeeSignoff && canManageClientRecords ? <AgenticWorkflowCard /> : null}
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
