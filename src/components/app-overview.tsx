"use client";

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
import { useClientList } from "@/hooks/use-proposals";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { isAtLeast, isSuperAdmin, isExternalRole } from "@/types/auth";
import { useViewAs } from "@/lib/view-as";

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
  { component: GmailWidget,     band: "feed",    size: "md", requires: "google" },
  { component: CalendarWidget,  band: "feed",    size: "md", requires: "google" },
  { component: PulseWidget,     band: "summary", size: "sm", module: "pulse" },
  { component: CareWidget,      band: "summary", size: "sm", module: "support" },
  { component: ProposalsWidget, band: "summary", size: "sm", module: "proposals" },
  // Gated on `clients` (it reads the Portal client list), and the component itself
  // returns null when no client has a Launchpad — so the tile is absent rather than
  // reporting a healthy-looking 0 for a workspace that has never used the feature.
  { component: LaunchpadWidget, band: "summary", size: "sm", module: "clients", requires: "launchpad" },
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
            // ⚠️ Was `bg-white` + a literal `rgba(0,0,0,0.08)` border. The dark remap
            // covers `bg-white` and rgba-black borders (see globals.css), but this card
            // ALSO wraps every HQ widget — so a token-correct widget still rendered on a
            // hardcoded white slab, which is why §42.13's Care tile "looked wrong in dark
            // mode" even after its own colours were fixed. Uses the surface tokens now.
            className="overflow-hidden rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)]"
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
  const clientList = useClientList();
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


  // Someone outside Gitwork: signs in with an email and password, and holds only what
  // a Super Admin switched on for them.
  const isExternal = isExternalRole(isAdmin && viewAs ? viewAs : role);

  // Show developer view when previewing as Developer, or when actually a restricted dev.
  const isDeveloper = isAdmin
    ? viewAs === "DEVELOPER"
    : role === "DEVELOPER" || !realPermissions.includes("seeAllClients");

  // Full unrestricted view: real Super Admin (isAdmin, no preview, empty permissions array).
  const showAll = isAdmin && previewPerms === null && realPermissions.length === 0;

  const acct = { role, permissions: resolvedPermissions };
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
        <DeckLink />
        {/* Super-Admin tools, moved off the sidebar (Aug 2026): neither is a
            product you work in daily, and both were taking a permanent rail row
            for one person. Same quiet text-link treatment as Decks. */}
        {isSuperAdmin(role) ? (
          <>
            <StripLink href="/app/analytics" label="Analytics" title="Delivery, output & AI usage" />
            <StripLink href="/app/starters" label="Starters" title="Prompt→Production library" />
          </>
        ) : null}
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

/**
 * "· DECK ↗" — a quiet way in to Deck, the slide editor (vendor/bento, served at
 * /deck). Deliberately a text link in the context strip rather than a bento tile:
 * it's in testing, and it opens its own window because the editor takes over the
 * whole page and saves to a file rather than the database.
 */
/** A context-strip text link, styled exactly like Decks so the strip reads as one set. */
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

function DeckLink() {
  // Decks are documents now, so this goes to Docs rather than opening a scratch
  // deck in a new window — one that saved to a file and never showed up in the
  // library. Same destination as every other document type.
  return (
    <Link
      href="/app/docs?type=DECK"
      title="Decks — slide decks live in Docs"
      className="font-medium uppercase tracking-[0.12em] text-[var(--text-4)] transition hover:text-[var(--brand-700)]"
      style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}
    >
      · Decks
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
