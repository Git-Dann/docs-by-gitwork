"use client";

import { GettingStartedCard } from "@/components/dashboard/getting-started-card";
import Link from "next/link";

import { useState } from "react";
import dynamic from "next/dynamic";
import PulseWidget from "@/components/dashboard/pulse-widget";
import CareWidget from "@/components/dashboard/care-widget";
import LaunchpadWidget from "@/components/dashboard/launchpad-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import TeamLeaveWidget from "@/components/dashboard/team-leave-widget";
import HrWidget from "@/components/dashboard/hr-widget";
import ExpensesWidget from "@/components/dashboard/expenses-widget";
import { DevOverview } from "@/components/dashboard/dev-overview";
import { OnYourDeskCard } from "@/components/dashboard/on-your-desk-card";
// Below-the-fold, admin-only, and the single heaviest dashboard card (~41KB).
// Lazy-load it so it never sits in the initial route bundle.
const AgenticWorkflowCard = dynamic(
  () => import("@/components/dashboard/agentic-workflow-card").then((m) => m.AgenticWorkflowCard),
  { ssr: false },
);
import { DailyRollup } from "@/components/tasks/daily-rollup";
import { BroadcastComposer } from "@/components/tasks/broadcast-composer";
import { can } from "@/components/dashboard/dashboard-config";
import { useAccount } from "@/hooks/use-account";
import { workspaceHasModule } from "@/lib/workspace-modules";
import { useClientList } from "@/hooks/use-proposals";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { isAtLeast, isSuperAdmin, isExternalRole } from "@/types/auth";
import { useViewAs } from "@/lib/view-as";
import { cn } from "@/lib/format";
import { SkeletonBlock } from "@/components/ui/motion/skeleton";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { HqTodayBand } from "@/components/dashboard/hq-today-band";

export type WidgetSize = "sm" | "md" | "lg";

type WidgetBand = "feed" | "summary";

type GridEntry = {
  component: React.ComponentType<{ size: WidgetSize; index: number }>;
  /** "feed" tiles are tall (list/inbox content); "summary" tiles are short. */
  band: WidgetBand;
  /**
   * A tile that only earns its place when the workspace actually uses the feature.
   * The GRID decides, not the widget: `BentoBand` renders an unconditional bordered
   * wrapper per entry, so a widget returning null would leave a 220px empty card
   * where the tile should be.
   */
  requires?: "launchpad" | "google";
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
  // Gmail and Calendar are client-work feeds, so they come with Portal. Someone who runs
  // the team rather than client work (People & office) doesn't get them (Nov 2026).
  { component: GmailWidget,     band: "feed",    size: "md", module: "clients", requires: "google" },
  { component: CalendarWidget,  band: "feed",    size: "md", module: "clients", requires: "google" },
  { component: PulseWidget,     band: "summary", size: "sm", module: "pulse" },
  { component: CareWidget,      band: "summary", size: "sm", module: "support" },
  { component: ProposalsWidget, band: "summary", size: "sm", module: "proposals" },
  // Gated on `clients` (it reads the Portal client list), and the component itself
  // returns null when no client has a Launchpad — so the tile is absent rather than
  // reporting a healthy-looking 0 for a workspace that has never used the feature.
  { component: LaunchpadWidget, band: "summary", size: "sm", module: "clients", requires: "launchpad" },
  // For leave approvers and HR. The server scopes both to Gitwork staff for an approver
  // who isn't an Admin.
  { component: TeamLeaveWidget, band: "summary", size: "sm", module: "backstage.approve" },
  { component: ExpensesWidget,  band: "summary", size: "sm", module: "backstage.expenses" },
  { component: HrWidget,        band: "summary", size: "sm", module: "hr.manage" },
];

type NumberedTile = GridEntry & { number: number };

/**
 * One band of bento tiles on a 6-column grid. Rows of three tiles span 2
 * columns each; a final row of two spans 3 each and a lone tile spans all 6 —
 * so every row is completely filled and no blank cells are ever left.
 */
/**
 * Foundry HQ for someone outside Gitwork.
 *
 * The internal dashboard is a standup, a client roster, staffing alerts and an inbox —
 * every one of which is either about people a guest does not work with or a prompt they
 * cannot answer. So this is not a trimmed version of it: it renders ONLY the tiles for
 * modules a Super Admin actually switched on, and says plainly when that is none.
 *
 * `widgets` is already filtered by the caller, so this component cannot show a tile the
 * guest has no permission for even if someone adds one to the GRID later.
 */
function GuestOverview({
  widgets,
  firstName,
  longDate,
}: {
  widgets: GridEntry[];
  firstName: string;
  longDate: string;
}) {
  const feeds = widgets.filter((w) => w.band === "feed").map((w, i) => ({ ...w, number: i + 1 }));
  const summaries = widgets
    .filter((w) => w.band === "summary")
    .map((w, i) => ({ ...w, number: feeds.length + i + 1 }));

  return (
    <div className="space-y-6">
      <div>
        <p className="widget-data-label text-[var(--text-4)]">{longDate}</p>
        <h2 className="mt-1 font-serif text-[28px] leading-tight text-[var(--text-1)]">
          {firstName ? `Welcome, ${firstName}.` : "Welcome."}
        </h2>
      </div>

      {widgets.length === 0 ? (
        // Not an error state — nobody has granted anything yet, and the guest cannot
        // fix that themselves, so it says who can rather than what went wrong.
        <div className="widget-card">
          <div className="widget-header">
            <span>01 // NOTHING SHARED YET</span>
          </div>
          <div className="widget-body">
            <p className="text-sm leading-6 text-[var(--text-3)]">
              Your account is set up, but nothing has been shared with it yet. Whoever
              invited you can switch on the products you need — ask them and refresh this
              page.
            </p>
          </div>
        </div>
      ) : (
        <>
          {feeds.length > 0 ? <BentoBand tiles={feeds} band="feed" /> : null}
          {summaries.length > 0 ? <BentoBand tiles={summaries} band="summary" /> : null}
        </>
      )}
    </div>
  );
}

// Literal class names so Tailwind emits them.
const XL_SPAN: Record<number, string> = { 1: "xl:col-span-6", 2: "xl:col-span-3", 3: "xl:col-span-2" };
const LG_SPAN: Record<number, string> = { 1: "lg:col-span-6", 2: "lg:col-span-3" };

function BentoBand({ tiles, band }: { tiles: NumberedTile[]; band: WidgetBand }) {
  const height = band === "feed" ? ROW_HEIGHT * 2 + TILE_GAP : ROW_HEIGHT;
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-6"
      style={{ gap: `${TILE_GAP}px` }}
    >
      {tiles.map(({ component: Widget, size, number }, i) => {
        // Three to a row from xl, two from lg, one below. Each row's last tiles stretch to
        // fill it (3→2 cols, 2→3, 1→6), so there is never a blank cell at either width.
        const xlRowStart = Math.floor(i / 3) * 3;
        const xlSpan = XL_SPAN[Math.min(3, tiles.length - xlRowStart)];
        const lgRowStart = Math.floor(i / 2) * 2;
        const lgSpan = LG_SPAN[Math.min(2, tiles.length - lgRowStart)];
        return (
          <div key={number} className={cn("min-w-0", lgSpan, xlSpan)}>
          <FadeIn delayMs={Math.min(i, 8) * 45}>
          <div
            // ⚠️ Was `bg-white` + a literal `rgba(0,0,0,0.08)` border. The dark remap
            // covers `bg-white` and rgba-black borders (see globals.css), but this card
            // ALSO wraps every HQ widget — so a token-correct widget still rendered on a
            // hardcoded white slab, which is why §42.13's Care tile "looked wrong in dark
            // mode" even after its own colours were fixed. Uses the surface tokens now.
            className="overflow-hidden rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)]"
            style={{ height: `${height}px` }}
          >
            <Widget size={size} index={number} />
          </div>
          </FadeIn>
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
  const clientList = useClientList();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const { viewAs, viewAsUser, effectivePermissions } = useViewAs(isAdmin);
  // "On your desk" self-hides on an empty desk; it reports its render state so
  // the dashboard numbering below stays gap-free (declared before any early
  // return to respect the rules of hooks).
  const [deskVisible, setDeskVisible] = useState(false);

  // Wait for role/permissions so a restricted developer never flashes the full
  // agency grid before their task-focused view loads.
  if (account.isPending) {
    return <SkeletonBlock />;
  }

  const role = account.data?.role ?? "";
  const realPermissions = account.data?.permissions ?? [];

  // effectivePermissions is null when viewing as Super Admin (full access).
  // Otherwise it's the preview role/user's permissions array.
  const previewPerms = effectivePermissions; // from useViewAs
  const resolvedPermissions = previewPerms ?? realPermissions;
  // The role HQ is drawn for. While previewing it's the previewed person's, never yours:
  // previewing Siân as a Super Admin used to keep the Admin bypass, so cards she can't see
  // (Agentic workflow, the Analytics and Starters links) appeared in the preview.
  const viewRole = previewPerms === null ? role : viewAs === "USER" ? viewAsUser?.role ?? "STAFF" : viewAs ?? role;


  // Someone outside Gitwork: signs in with an email and password, and holds only what
  // a Super Admin switched on for them.
  const isExternal = isExternalRole(viewRole);

  // Show developer view when previewing as Developer, or when actually a restricted dev.
  // "Not scoped to every client" only means a developer when they work on clients at all:
  // someone with no Portal (People & office) is not a developer and gets this grid.
  // The "view as Staff" preset has Portal without seeAllClients and has always been the
  // agency grid, so it's excluded.
  const isDeveloper =
    viewRole === "DEVELOPER" ||
    (viewAs !== "STAFF" &&
      !isAtLeast(viewRole, "ADMIN") &&
      resolvedPermissions.includes("clients") &&
      !resolvedPermissions.includes("seeAllClients"));

  // Full unrestricted view: real Super Admin (isAdmin, no preview, empty permissions array).
  const showAll = isAdmin && previewPerms === null && realPermissions.length === 0;

  const acct = { role: viewRole, permissions: resolvedPermissions };
  const canApprove = showAll || can(acct, "backstage.approve");
  const canSeeTasks = showAll || can(acct, "clients");
  const canSeeSignoff = showAll || can(acct, "proposals");
  const canManageClientRecords = showAll || can(acct, "clients.manage");
  // Visibility of the roll-up CARD + broadcast composer. Mirror the server's
  // canPublishTaskRollup = admin+ OR `tasks.publish` (see effective-user.ts) so
  // the card only renders when the roster fetch will actually succeed — a viewer
  // who can't read it must not see it 403 into an empty box. "Effective admin" is
  // "real role ADMIN+, not previewing down", so a preview reflects the previewed
  // person's access.
  const isEffectiveAdmin = previewPerms === null && isAtLeast(role, "ADMIN");
  const hasTaskPublish = resolvedPermissions.includes("tasks.publish");
  const canPublishRollup = isEffectiveAdmin || hasTaskPublish;
  // Visibility of the Publish / Publish-anyway BUTTONS — admins/super admins are
  // explicitly EXCLUDED (they monitor only). Publishing the client-grouped roll-up
  // is the DevOps lead's job (Shahab — explicit `tasks.publish`, non-admin).
  const canActuallyPublish = !isAdmin && hasTaskPublish;
  // The DevOps broadcast composer shares the roll-up's gate.
  const canBroadcast = canPublishRollup;
  // Same query key ClientsWidget uses, so this reads the cache rather than refetching.
  const anyLaunchpad = (clientList.data?.clients ?? []).some((c) => c.launchpad);
  // A guest has no Google account, so Gmail and Calendar can only render an error for
  // them. Neither carries a module permission, so nothing else would have filtered them.
  const widgets = GRID.filter(
    (g) =>
      (showAll || !g.module || resolvedPermissions.includes(g.module)) &&
      (g.requires !== "launchpad" || anyLaunchpad) &&
      (g.requires !== "google" || !isExternal),
  );
  const hasBackstage = showAll || resolvedPermissions.includes("backstage");

  const firstName = (account.data?.name ?? "").trim().split(/\s+/)[0];
  const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // ⚠️ Both branches sit HERE, below `widgets`, because that is what the guest view
  // renders. A guest also satisfies `isDeveloper` ("not an admin, not scoped to every
  // client"), so the guest test must come first — otherwise they land on DevOverview:
  // an internal AM/PM standup, a "My Clients" list and a publish roll-up, none of which
  // applies to someone outside the company.
  if (isExternal) {
    return <GuestOverview widgets={widgets} firstName={firstName} longDate={longDate} />;
  }

  if (isDeveloper) {
    return <DevOverview />;
  }


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
        {/* Super-Admin tools, moved off the sidebar (Aug 2026): neither is a
            product you work in daily, and both were taking a permanent rail row
            for one person. Quiet mono text links. (Deck moved to Settings → Labs, Oct 2026.) */}
        {isSuperAdmin(viewRole) && workspaceHasModule("analytics", account.data?.workspaceModules) ? (
          <StripLink href="/app/analytics" label="Analytics" title="Delivery, output & AI usage" />
        ) : null}
        {isSuperAdmin(viewRole) && workspaceHasModule("starters", account.data?.workspaceModules) ? (
          <StripLink href="/app/starters" label="Starters" title="Prompt→Production library" />
        ) : null}
      </div>

      {isEffectiveAdmin ? <GettingStartedCard /> : null}

      {/* What needs me now: a few figures, each a link to where it's dealt with. Every
          tile reads a query a card below already makes, and only shows to someone who
          can see that card. */}
      <HqTodayBand
        access={{
          tasks: canSeeTasks,
          rollup: canPublishRollup,
          care: showAll || resolvedPermissions.includes("support"),
          pulse: showAll || resolvedPermissions.includes("pulse"),
          calendar: canSeeTasks,
        }}
      />

      {/* Today band — "On your desk" (personal to-do, auto-hides when empty)
          and the DevOps lead's "Daily roll-up". Side-by-side only when both
          render; otherwise the present card fills the row. */}
      <div className={todayTwoUp ? "grid items-stretch gap-3 xl:grid-cols-2" : ""}>
        <div id="hq-desk" className={cn("scroll-mt-4", todayTwoUp && "h-full", !deskVisible && "contents")}>
        <OnYourDeskCard
          index={1}
          onVisibilityChange={setDeskVisible}
          canApprove={canApprove}
          canSeeTasks={canSeeTasks}
          canSeeSignoff={canSeeSignoff}
          className={todayTwoUp ? "h-full" : undefined}
        />
        </div>
        {hasRightColumn ? (
          <div id="hq-rollup" className="flex scroll-mt-4 flex-col gap-3">
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

      {canSeeTasks && canSeeSignoff && canManageClientRecords ? <AgenticWorkflowCard index={counter + 1} /> : null}
    </div>
  );
}

/** A context-strip text link, so the strip reads as one set. */
function StripLink({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <Link
      href={href}
      title={title}
      className="font-medium uppercase tracking-[0.12em] text-[var(--text-4)] transition hover:text-[var(--brand-700)]"
      style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}
    >
      · {label}
    </Link>
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
