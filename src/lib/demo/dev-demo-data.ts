/**
 * Canned data for the standalone Foundry dev-experience demo (`/demo/dev`).
 *
 * This module powers a self-contained, no-auth, no-DB demo of the developer's
 * Foundry surfaces (dashboard, task board, Gantt, "On Your Desk" drawer). A
 * client-side fetch interceptor (see `demo-dev-experience.tsx`) resolves the
 * app's real data-fetchers against `resolveDemoApi()`, so the genuine components
 * render exactly as they do in production — just against sample data.
 *
 * Everything is built relative to *now* so the "today" line, overdue badges and
 * standup state stay sensible whenever the demo is opened. It only ever runs on
 * the client (the demo content is mounted post-hydration), so `new Date()` here
 * is safe and never causes SSR/CSR drift.
 */

import { RECORDED_NORTHWIND_CHECKS } from "@/lib/demo/demo-pulse-recorded";
import { RECORDED_CADENZA_CHECKS, RECORDED_CADENZA_CODE_HEALTH, RECORDED_CADENZA_SCORE, RECORDED_CADENZA_TECH_STACK } from "@/lib/demo/demo-pulse-recorded-cadenza";
import { RECORDED_FAIRWAY_CHECKS, RECORDED_FAIRWAY_SCORE, RECORDED_FAIRWAY_TECH_STACK } from "@/lib/demo/demo-pulse-recorded-fairway";
import { DEMO_CODE_HEALTH, DEMO_PORTFOLIO_REPORTS } from "@/lib/demo/demo-code-health";
import { byUrgency, summariseRepo, workItemsFor } from "@/lib/code-portfolio";
import { applyFindingCounts, buildProjects, sortProjects, decodeTargetKey, targetKey, type PulseProject } from "@/lib/pulse-projects";
import { openFindingCounts, findingFingerprint } from "@/lib/pulse-findings";
import type { CodeHealthReport } from "@/types/code-health";
import { buildSummaryBoard, type SummaryClientInput } from "@/lib/client-summary";
import type {
  TaskDTO,
  TaskStatus,
  TaskPriority,
  MyDayDTO,
  TaskAttentionDTO,
} from "@/types/tasks";
import type { GanttBlock, GanttMilestone } from "@/components/tasks/gantt-chart";
import type { ClientDetailRecord } from "@/types/client";
import type { WikiDTO } from "@/server/wiki";
import { GITWORK } from "@/lib/gitwork";
import { DEFAULT_INTAKE_CATEGORIES } from "@/lib/wiki-intake-categories";
import { getDefaultLaunchpadStructure } from "@/lib/launchpad/default-template";
import { applyItemPatch, computeCompleteness } from "@/lib/launchpad/structure";
import {
  addCustomItem,
  newCustomItemId,
  removeCustomItem,
  updateCustomItem,
} from "@/lib/launchpad/custom-items";
import { LAUNCHPAD_FILE_MAX_PER_ITEM, sanitizeLaunchpadFilename } from "@/lib/launchpad/files";
import { renderLegalDoc } from "@/lib/launchpad/legal/render";
import { comparisonLimitError, parseComparisonContent } from "@/lib/wiki-comparisons";
import type { WikiComparison } from "@/types/wiki-comparisons";
import { demoSheets, resolveDemoSheets } from "@/lib/demo/demo-sheets";
import { resolveDemoDrive } from "@/lib/demo/demo-drive";
import type { LaunchpadDTO, LaunchpadItemState, LaunchpadStructure } from "@/types/launchpad";
import type { WikiMonitorHistoryPoint } from "@/server/wiki-monitors";
import type { PulseScanDiff, ScanDiffItem } from "@/types/pulse";
import { DEFAULT_NOTICE_CONTENT } from "@/lib/devsignal/processing-notice";
import { resolveDemoPlatform } from "@/lib/demo/demo-platform";
import { resolveDemoStaff } from "@/lib/demo/demo-staff";

// ─── Demo identity ────────────────────────────────────────────────────────────

const DEV = { id: "demo-dev", name: "Alex Rivera", avatarUrl: null };
const DEV_EMAIL = "alex@gitwork.co.uk";

/** Static session for the demo's nested SessionProvider (fixed expiry — no Date). */
export const demoSession = {
  user: {
    id: DEV.id,
    name: DEV.name,
    email: DEV_EMAIL,
    image: null,
    role: "DEVELOPER",
    // `devsignal` is admin-only in production; granted here so the DevSignal demo
    // renders (demos showcase UI regardless of role). Harmless to other demos.
    // `support.manage` for the same reason: without it the Care demo has no checkbox
    // column, no bulk bar, no channels/settings screen and no triage controls — a
    // deliberately crippled view of the product. Mutations are no-ops here anyway,
    // since the interceptor answers every /api/* call with canned data.
    permissions: ["clients", "proposals", "codeclear", "devsignal", "support", "support.manage", "backstage"],
  },
  expires: "2099-01-01T00:00:00.000Z",
};

// ─── Date helpers (relative to now) ─────────────────────────────────────────────

const DAY = 86_400_000;
function atDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

/** "YYYY-MM" of the month `offset` months from now — for the Metrics fixture. */
function demoPeriod(offset: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** ISO for today at a fixed local hour:minute (for calendar events). */
function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
/** Midnight UTC of the date `days` from now (for standup workDate). */
function dateOnly(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

// ─── Clients ────────────────────────────────────────────────────────────────────

const CLIENTS = [
  { id: "cl-northwind", name: "Northwind Studio", slug: "northwind" },
  { id: "cl-cadenza", name: "Cadenza", slug: "cadenza" },
  { id: "cl-bigwedge", name: "Fairway Nine", slug: "fairway-nine" },
] as const;

const byClient = Object.fromEntries(CLIENTS.map((c) => [c.slug, c])) as Record<
  string,
  (typeof CLIENTS)[number]
>;

// ─── Task factory ────────────────────────────────────────────────────────────────

let orderSeq = 0;
function mkTask(
  partial: {
    id: string;
    title: string;
    clientSlug: keyof typeof byClient;
    status: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    description?: string | null;
    completedAt?: string | null;
    startedAt?: string | null;
    subtaskCount?: number;
    subtaskDoneCount?: number;
    commentCount?: number;
    /** The category (feature block) it is planned in — Northwind's Gantt blocks. */
    block?: { id: string; name: string } | null;
    /** Planned work nobody has picked up yet. */
    unassigned?: boolean;
    /** Days ago it was last touched (default yesterday). */
    touchedDaysAgo?: number;
  },
): TaskDTO {
  const client = byClient[partial.clientSlug];
  return {
    id: partial.id,
    workspaceId: "demo-ws",
    client: { id: client.id, name: client.name, slug: client.slug },
    assignees: partial.unassigned ? [] : [{ id: DEV.id, name: DEV.name, avatarUrl: DEV.avatarUrl }],
    createdBy: { id: DEV.id, name: DEV.name, avatarUrl: DEV.avatarUrl },
    featureBlock: partial.block ?? null,
    parentId: null,
    title: partial.title,
    description: partial.description ?? null,
    acceptanceCriteria: null,
    status: partial.status,
    priority: partial.priority ?? "MEDIUM",
    label: null,
    orderKey: (orderSeq += 100),
    dueDate: partial.dueDate ?? null,
    startedAt: partial.startedAt ?? null,
    completedAt: partial.completedAt ?? null,
    archivedAt: null,
    blockedReason: null,
    blockedAt: null,
    blockedResponse: null,
    blockedResponseAt: null,
    commentCount: partial.commentCount ?? 0,
    subtaskCount: partial.subtaskCount ?? 0,
    subtaskDoneCount: partial.subtaskDoneCount ?? 0,
    attachmentCount: 0,
    metadata: null,
    scribeSource: null,
    createdAt: atDays(-14),
    updatedAt: atDays(-(partial.touchedDaysAgo ?? 1)),
  };
}

/** The master task list — powers the board, dashboard "My Tasks", standup + attention. */
export const demoBoardTasks: TaskDTO[] = [
  mkTask({ id: "t1", title: "Harden webhook retry handling", clientSlug: "northwind", status: "DOING", priority: "HIGH", dueDate: atDays(2), startedAt: atDays(-1), commentCount: 3, subtaskCount: 4, subtaskDoneCount: 1, description: "Add idempotent retry handling for dropped delivery webhooks." }),
  mkTask({ id: "t2", title: "Fix mobile nav overflow on iOS Safari", clientSlug: "cadenza", status: "DOING", priority: "HIGH", dueDate: atDays(-1), startedAt: atDays(-2), commentCount: 1 }),
  mkTask({ id: "t3", title: "Booking calendar timezone bug", clientSlug: "fairway-nine", status: "DOING", priority: "MEDIUM", dueDate: atDays(-2), startedAt: atDays(-3), commentCount: 5, subtaskCount: 2, subtaskDoneCount: 2 }),
  mkTask({ id: "t4", title: "Add rounds-played analytics endpoint", clientSlug: "fairway-nine", status: "IN_REVIEW", priority: "MEDIUM", dueDate: atDays(1), commentCount: 2 }),
  mkTask({ id: "t5", title: "Accessibility pass on onboarding forms", clientSlug: "cadenza", status: "IN_REVIEW", priority: "LOW", dueDate: atDays(2) }),
  mkTask({ id: "t6", title: "Migrate image uploads to R2", clientSlug: "northwind", status: "TODO", priority: "MEDIUM", dueDate: atDays(5), subtaskCount: 3 }),
  mkTask({ id: "t7", title: "Cache PGA leaderboard responses", clientSlug: "fairway-nine", status: "TODO", priority: "MEDIUM", dueDate: atDays(3) }),
  mkTask({ id: "t8", title: "Onboarding email drip copy", clientSlug: "cadenza", status: "TODO", priority: "LOW", dueDate: atDays(7) }),
  mkTask({ id: "t9", title: "Dark-mode audit across dashboard", clientSlug: "northwind", status: "BACKLOG", priority: "LOW" }),
  mkTask({ id: "t10", title: "Refactor auth middleware", clientSlug: "fairway-nine", status: "BACKLOG", priority: "MEDIUM" }),
  mkTask({ id: "t11", title: "Ship v2 pricing page", clientSlug: "cadenza", status: "DONE", priority: "HIGH", completedAt: todayAt(9, 40) }),
  mkTask({ id: "t12", title: "Add e2e tests for onboarding", clientSlug: "northwind", status: "DONE", priority: "MEDIUM", completedAt: todayAt(11, 15) }),
  // Planned work nobody has picked up — what My Day's "From the plan" offers before a dev
  // creates something new (the October 2026 audit: planned tasks sat unassigned while the
  // same work was logged as fresh tasks outside the plan).
  mkTask({ id: "t13", title: "Saved searches with email alerts", clientSlug: "northwind", status: "TODO", priority: "HIGH", dueDate: atDays(4), block: { id: "b2", name: "Search & discovery" }, unassigned: true }),
  mkTask({ id: "t14", title: "Search results relevance tuning", clientSlug: "northwind", status: "TODO", priority: "MEDIUM", block: { id: "b2", name: "Search & discovery" }, unassigned: true }),
  mkTask({ id: "t15", title: "Weekly usage chart on the analytics dashboard", clientSlug: "northwind", status: "BACKLOG", priority: "MEDIUM", dueDate: atDays(9), block: { id: "b3", name: "Analytics dashboard" }, unassigned: true }),
  mkTask({ id: "t16", title: "CSV export for analytics reports", clientSlug: "northwind", status: "BACKLOG", priority: "LOW", block: { id: "b3", name: "Analytics dashboard" }, unassigned: true, touchedDaysAgo: 34 }),
  mkTask({ id: "t17", title: "Haptics on primary mobile actions", clientSlug: "northwind", status: "BACKLOG", priority: "LOW", block: { id: "b4", name: "Mobile polish" }, unassigned: true, touchedDaysAgo: 41 }),
  mkTask({ id: "t18", title: "Offline mode for saved lists", clientSlug: "northwind", status: "TODO", priority: "MEDIUM", block: { id: "b4", name: "Mobile polish" }, unassigned: true, touchedDaysAgo: 28 }),
  // …and the same-day log that grew beside it: real work, filed in no category.
  mkTask({ id: "t19", title: "Search filters: date range picker", clientSlug: "northwind", status: "DONE", completedAt: atDays(-3) }),
  mkTask({ id: "t20", title: "Fix search result paging on mobile", clientSlug: "northwind", status: "DONE", completedAt: atDays(-5) }),
  mkTask({ id: "t21", title: "Analytics dashboard loading skeletons", clientSlug: "northwind", status: "DONE", completedAt: atDays(-8) }),
];

const mine = demoBoardTasks.filter((t) => t.assignees.some((a) => a.id === DEV.id));
const doing = mine.filter((t) => t.status === "DOING" || t.status === "IN_REVIEW");
const doneToday = mine.filter((t) => t.status === "DONE");
const upcoming = mine.filter((t) => t.status === "TODO" || t.status === "BACKLOG");
const fromPlan = demoBoardTasks.filter((t) => t.assignees.length === 0 && t.featureBlock && t.status !== "DONE");
const overdue = demoBoardTasks.filter(
  (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE",
);

// ─── My Day (standup) ────────────────────────────────────────────────────────────

function isMondayNow(): boolean {
  return new Date().getDay() === 1;
}

const demoMyDay: MyDayDTO = {
  date: dateOnly(0),
  isMonday: isMondayNow(),
  update: {
    id: "du-1",
    workDate: dateOnly(0),
    amPushedAt: todayAt(9, 12), // morning standup pushed…
    pmPushedAt: null, // …end-of-day still pending (realistic "STANDUP PENDING")
    weekPlan: null,
    note: null,
  },
  suggestedWeekPlan:
    "Land webhook retries for Northwind, clear the Cadenza a11y review, and close the Fairway Nine timezone bug.",
  // Keep the My Day card compact — the full sets still power the board + attention.
  doing: doing.slice(0, 2),
  done: doneToday.slice(0, 1),
  upcoming: upcoming.slice(0, 3),
  fromPlan,
  fromPlanTotal: fromPlan.length,
};

// ─── Attention aggregate ─────────────────────────────────────────────────────────

const demoAttention: TaskAttentionDTO = {
  overdue,
  overdueCount: overdue.length,
  doing,
  doingCount: doing.length,
  dueSoonCount: demoBoardTasks.filter((t) => {
    if (!t.dueDate || t.status === "DONE") return false;
    const d = new Date(t.dueDate).getTime();
    const now = Date.now();
    return d >= now && d <= now + 3 * DAY;
  }).length,
};

// ─── Account ─────────────────────────────────────────────────────────────────────

const demoAccount = {
  account: {
    id: DEV.id,
    email: DEV_EMAIL,
    name: DEV.name,
    avatarUrl: "",
    role: "DEVELOPER",
    permissions: demoSession.user.permissions,
    showDevRates: false,
  },
};

// ─── Calendar (today) ────────────────────────────────────────────────────────────

const demoCalendar = {
  connected: true,
  events: [
    {
      id: "ev1",
      summary: "Northwind — Sprint planning",
      start: todayAt(10, 0),
      end: todayAt(10, 30),
      attendees: ["priya@northwind.co", "alex@gitwork.co.uk", "sam@gitwork.co.uk"],
      location: null,
      meetLink: "https://meet.google.com/demo-north",
    },
    {
      id: "ev2",
      summary: "Gitwork design review",
      start: todayAt(14, 0),
      end: todayAt(15, 0),
      attendees: ["marco@gitwork.co.uk", "alex@gitwork.co.uk"],
      location: null,
      meetLink: null,
    },
    {
      id: "ev3",
      summary: "Cadenza weekly sync",
      start: todayAt(16, 30),
      end: todayAt(17, 0),
      attendees: ["dana@cadenza.io", "alex@gitwork.co.uk"],
      location: null,
      meetLink: "https://meet.google.com/demo-speak",
    },
  ],
};

// ─── Gmail ───────────────────────────────────────────────────────────────────────

const demoGmail = {
  connected: true,
  messages: [
    { id: "m1", subject: "Re: webhook signature mismatch", from: "Priya Shah <priya@northwind.co>", snippet: "Thanks — the retry flow looks right. One question on…", date: atDays(0), unread: true },
    { id: "m2", subject: "Design tokens v3 — handoff", from: "Marco Bianchi <marco@gitwork.co.uk>", snippet: "Pushed the updated tokens, ready when you are.", date: atDays(0), unread: true },
    { id: "m3", subject: "Lunch before the design review?", from: "Sam Okafor <sam@gitwork.co.uk>", snippet: "Fancy grabbing something at 12:30?", date: atDays(0), unread: true },
    { id: "m4", subject: "[Fairway Nine] Staging deploy succeeded", from: "GitHub Actions <ci@github.com>", snippet: "Deployment to staging completed in 4m 12s.", date: atDays(-1), unread: false },
    { id: "m5", subject: "Your weekly Gitwork digest", from: "Foundry <no-reply@gitwork.co.uk>", snippet: "12 tasks moved, 3 shipped, 2 meetings summarised.", date: atDays(-1), unread: false },
  ],
};

// ─── Desk: Scribe action items ──────────────────────────────────────────────────

const demoActionItems = {
  items: [
    { id: "ai1", title: "Send Priya the updated webhook flow diagram", text: "Send Priya the updated webhook flow diagram after standup.", meetingId: "mtg1", meetingTitle: "Northwind — Sprint planning", meetingStartedAt: atDays(-1), clientSlug: "northwind", clientName: "Northwind Studio", hasTask: false },
    { id: "ai2", title: "Confirm timezone handling with Fairway Nine", text: "Confirm the booking timezone edge cases with the Fairway Nine team.", meetingId: "mtg2", meetingTitle: "Fairway Nine weekly", meetingStartedAt: atDays(-2), clientSlug: "fairway-nine", clientName: "Fairway Nine", hasTask: true },
    { id: "ai3", title: "Draft pricing copy for review", text: "Draft the v2 pricing page copy for Dana to review.", meetingId: "mtg3", meetingTitle: "Cadenza weekly sync", meetingStartedAt: atDays(-3), clientSlug: "cadenza", clientName: "Cadenza", hasTask: false },
  ],
};

// ─── Desk: Slack activity ────────────────────────────────────────────────────────

const demoSlack = {
  configured: true,
  reason: "ok" as const,
  messages: [
    { id: "s1", author: "Priya", text: "Deploy to staging looks good ✅ — going to smoke-test the search flow now.", ts: atDays(0), clientName: "Northwind Studio", clientSlug: "northwind" },
    { id: "s2", author: "Dana", text: "Can we ship the pricing page today? Marketing wants it live for the campaign.", ts: atDays(0), clientName: "Cadenza", clientSlug: "cadenza" },
    { id: "s3", author: "Tom", text: "Leaderboard cache is live 🎉 response times down from 900ms to 40ms.", ts: atDays(0), clientName: "Fairway Nine", clientSlug: "fairway-nine" },
    { id: "s4", author: "Priya", text: "Left a couple of comments on the webhook PR when you get a sec.", ts: atDays(0), clientName: "Northwind Studio", clientSlug: "northwind" },
  ],
};

// ─── Clients list ────────────────────────────────────────────────────────────────

const demoClients = {
  clients: CLIENTS.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
};

// ─── Gantt (project timeline) ────────────────────────────────────────────────────

export const demoGanttBlocks: GanttBlock[] = [
  {
    id: "b1",
    name: "Foundations & auth",
    startDate: atDays(-32),
    endDate: atDays(-6),
    color: "emerald",
    progress: 100,
    tasks: [
      { title: "Project scaffolding", done: true },
      { title: "Auth + session", done: true },
      { title: "CI/CD pipeline", done: true },
    ],
  },
  {
    id: "b2",
    name: "Search & discovery",
    startDate: atDays(-7),
    endDate: atDays(18),
    color: "blue",
    progress: 55,
    tasks: [
      { title: "Search index", done: true },
      { title: "Filters & facets", done: false },
      { title: "Autocomplete", done: false },
    ],
  },
  {
    id: "b3",
    name: "Analytics dashboard",
    startDate: atDays(10),
    endDate: atDays(40),
    color: "violet",
    progress: 10,
    tasks: [
      { title: "Rounds-played endpoint", done: false },
      { title: "Charts + filters", done: false },
    ],
  },
  {
    id: "b4",
    name: "Mobile polish",
    startDate: atDays(25),
    endDate: atDays(55),
    color: "amber",
    progress: 0,
    tasks: [
      { title: "iOS Safari nav fixes", done: false },
      { title: "Offline handling", done: false },
    ],
  },
];

export const demoGanttMilestones: GanttMilestone[] = [
  { id: "ms1", name: "Beta launch", date: atDays(20), color: "blue" },
  { id: "ms2", name: "Public launch", date: atDays(52), color: "rose" },
];

// ─── Design system (Northwind brand tokens) ─────────────────────────────────────

const demoDesignTokens = {
  clientName: "Northwind Studio",
  version: "1.0",
  generatedAt: atDays(-6),
  brandVoice: "Stories worth staying in for.",
  colours: {
    primary: [
      { name: "Midnight", hex: "#0B1020", rgb: "rgb(11, 16, 32)", role: "primary", usage: "Primary surfaces, headers and key emphasis." },
      { name: "Aurora Teal", hex: "#14B8A6", rgb: "rgb(20, 184, 166)", role: "primary", usage: "Primary actions, links and highlights." },
    ],
    secondary: [
      { name: "Signal Coral", hex: "#FF5D5D", rgb: "rgb(255, 93, 93)", role: "accent", usage: "Playful accents and 'live' indicators." },
      { name: "Amber", hex: "#F59E0B", rgb: "rgb(245, 158, 11)", role: "accent", usage: "Badges and warnings." },
    ],
    neutrals: [
      { name: "Ink", hex: "#0F172A", role: "neutral", usage: "Body text on light surfaces." },
      { name: "Slate", hex: "#475569", role: "neutral", usage: "Secondary text and borders." },
      { name: "Mist", hex: "#E2E8F0", role: "neutral", usage: "Dividers and card borders." },
      { name: "Cloud", hex: "#F8FAFC", role: "neutral", usage: "Page and card backgrounds." },
    ],
  },
  gradients: [
    { name: "Aurora", css: "linear-gradient(135deg, #14B8A6 0%, #0B1020 100%)", usage: "Hero bands and feature spots." },
  ],
  typography: {
    displayFont: "Clash Display",
    bodyFont: "Inter",
    systemFallback: "system-ui, -apple-system, sans-serif",
    monoFont: "JetBrains Mono",
    scale: [
      { role: "display", fontFamily: "Clash Display", fontWeight: 600, fontSize: "44px", lineHeight: 1.05, letterSpacing: "-0.02em", usage: "Hero headlines.", sample: "Watch what moves you" },
      { role: "h1", fontFamily: "Clash Display", fontWeight: 600, fontSize: "32px", lineHeight: 1.1, usage: "Page titles." },
      { role: "h2", fontFamily: "Clash Display", fontWeight: 500, fontSize: "24px", lineHeight: 1.2, usage: "Section headings." },
      { role: "body", fontFamily: "Inter", fontWeight: 400, fontSize: "16px", lineHeight: 1.5, usage: "Body copy." },
      { role: "label", fontFamily: "Inter", fontWeight: 500, fontSize: "13px", lineHeight: 1.3, textTransform: "uppercase", letterSpacing: "0.06em", usage: "Labels and eyebrows." },
      { role: "caption", fontFamily: "Inter", fontWeight: 400, fontSize: "12px", lineHeight: 1.4, usage: "Captions and metadata." },
    ],
  },
  spacing: { base: 8, scale: { "1": "8px", "2": "16px", "3": "24px", "4": "32px", "6": "48px", "8": "64px" } },
  radius: { none: "0px", sm: "6px", md: "10px", lg: "16px", xl: "24px", full: "9999px" },
  shadows: [
    { name: "sm", css: "0 1px 2px rgba(11,16,32,0.08)", usage: "Cards at rest." },
    { name: "md", css: "0 6px 20px -8px rgba(11,16,32,0.18)", usage: "Raised cards and menus." },
    { name: "lg", css: "0 20px 40px -12px rgba(11,16,32,0.28)", usage: "Modals and overlays." },
  ],
  buttons: [
    { name: "Primary", background: "#14B8A6", textColour: "#04231F", hoverBackground: "#0E9488", surfaces: ["light", "dark"], usage: "Primary action, one per view." },
    { name: "Secondary", background: "transparent", textColour: "#0F172A", border: "1px solid #CBD5E1", surfaces: ["light"], usage: "Secondary actions." },
    { name: "Ghost", background: "transparent", textColour: "#14B8A6", surfaces: ["light", "dark"], usage: "Low-emphasis / inline actions." },
  ],
  badges: [
    { label: "Live", background: "#FF5D5D", textColour: "#FFFFFF", group: "status" },
    { label: "New", background: "#14B8A6", textColour: "#04231F", group: "status" },
    { label: "Beta", background: "#F59E0B", textColour: "#241703", group: "status" },
  ],
  logoRules: {
    clearSpace: "Keep clear space equal to the height of the 'N' logomark on all sides.",
    minSizes: { horizontal: "120px", logomark: "24px" },
    rules: ["Don't recolour the logomark", "Don't stretch or rotate", "Don't place on low-contrast imagery without the scrim"],
  },
  cssVariables:
    ":root {\n  --colour-primary: #14B8A6;\n  --colour-ink: #0F172A;\n  --colour-midnight: #0B1020;\n  --radius-md: 10px;\n  --font-display: 'Clash Display';\n  --font-body: 'Inter';\n}",
};

const demoDesignSystem = {
  exists: true,
  enabled: true,
  showFoundryBranding: true,
  guidelinesEnabled: true,
  tokens: demoDesignTokens,
  status: "ACTIVE",
  updatedAt: atDays(-3),
  updatedBy: "Alex Rivera",
  share: { enabled: false, token: null, url: null },
};

// ─── Client wiki (WikiDTO) ───────────────────────────────────────────────────────

/** Build a plausible monitor history strip: mostly UP, a couple of blips. */
function monitorHistory(baseLatency: number, blips: number[] = []): WikiMonitorHistoryPoint[] {
  const pts: WikiMonitorHistoryPoint[] = [];
  for (let i = 44; i >= 0; i--) {
    const blip = blips.includes(i);
    pts.push({
      status: blip ? (i % 2 === 0 ? "DEGRADED" : "DOWN") : "UP",
      latencyMs: blip ? baseLatency * 4 : baseLatency + Math.round((i % 5) * 6),
      checkedAt: new Date(Date.now() - i * 30 * 60_000).toISOString(),
    });
  }
  return pts;
}

const WIKI_CLIENT = CLIENTS[0]; // Northwind Studio

// ─── Demo Launchpad ───────────────────────────────────────────────────────────
// Built from the REAL default structure rather than an invented fixture, so
// /demo/portal exercises the actual modules, helpers and legal generators. §42.8's
// lesson: a design validated against made-up data is a design validated against
// nothing — the Care row redesign passed on invented senders and was unreadable on
// the real inbox.

const DEMO_LAUNCHPAD_MODULES = ["website", "ios"];

function demoLaunchpadItem(
  itemId: string,
  status: LaunchpadItemState["status"],
  extra: Partial<LaunchpadItemState> = {},
): LaunchpadItemState {
  return {
    itemId,
    status,
    link: null,
    note: null,
    ownedByClient: null,
    updatedBy: "Priya Shah",
    updatedAt: atDays(-3),
    ...extra,
  };
}

/** A part-way-through kit — the state a real client is in for most of a project. */
const DEMO_LAUNCHPAD_ITEMS: LaunchpadItemState[] = [
  demoLaunchpadItem("brand_assets", "PROVIDED", {
    link: "https://drive.google.com/drive/folders/northwind-brand",
    files: [
      {
        id: "lpf-demo-logo",
        filename: "northwind-logo-pack.pdf",
        mime: "application/pdf",
        size: 1_842_000,
        uploadedByKind: "client",
        uploadedByName: "Priya Shah",
        uploadedAt: atDays(-4),
      },
    ],
  }),
  // A requirement added for THIS client only (§43.5) — provided by an upload alone.
  demoLaunchpadItem("custom-demo-insurance", "PROVIDED", {
    files: [
      {
        id: "lpf-demo-insurance",
        filename: "PI-certificate-2026.pdf",
        mime: "application/pdf",
        size: 248_000,
        uploadedByKind: "client",
        uploadedByName: "Priya Shah",
        uploadedAt: atDays(-2),
      },
    ],
  }),
  demoLaunchpadItem("existing_accounts_access", "PROVIDED"),
  demoLaunchpadItem("tone_and_content", "NEEDED", {
    note: "Copy deck is with their marketing agency — chased 11 Aug.",
  }),
  demoLaunchpadItem("domain_and_dns", "PROVIDED", { ownedByClient: true }),
  demoLaunchpadItem("hosting_registrar_access", "PROVIDED", { ownedByClient: true }),
  demoLaunchpadItem("analytics_account", "NEEDED", { ownedByClient: true }),
  demoLaunchpadItem("website_content", "NEEDED"),
  demoLaunchpadItem("cms_credentials", "NA", { note: "New build — no CMS to migrate from." }),
  demoLaunchpadItem("apple_developer_account", "NEEDED", {
    ownedByClient: true,
    note: "D-U-N-S application submitted 8 Aug, Apple quote ~2 weeks.",
  }),
  demoLaunchpadItem("ios_app_icon", "NEEDED"),
  demoLaunchpadItem("ios_screenshots", "NEEDED"),
  demoLaunchpadItem("ios_privacy_answers", "NEEDED"),
  demoLaunchpadItem("ios_age_rating", "PROVIDED"),
  demoLaunchpadItem("ios_iap_setup", "NA", { note: "Free app, no in-app purchases." }),
];

const DEMO_LAUNCHPAD_ANSWERS = {
  legal_entity_name: "Northwind Studio Ltd",
  company_number: "09876543",
  registered_address: "42 Deansgate, Manchester, M3 2AY",
  primary_contact: "Priya Shah",
  primary_contact_email: "priya@northwindstudio.co.uk",
  credential_channel: "1Password shared vault",
  brand_assets_link: "https://www.figma.com/file/northwind-brand-kit",
  ios_app_name: "Northwind",
  ios_subtitle: "Stories worth your evening",
  payment_provider: "stripe",
  accessibility_target: "aa",
  cookie_consent_approach: "banner_consent",
};

const DEMO_PRIVACY_ANSWERS = {
  company_name: "Northwind Studio Ltd",
  trading_name: "Northwind",
  registered_address: "42 Deansgate, Manchester, M3 2AY",
  website_url: "https://northwindstudio.co.uk",
  contact_email: "privacy@northwindstudio.co.uk",
  company_number: "09876543",
  effective_date: "1 September 2026",
  data_collected: "Name\nEmail address\nViewing history\nIP address",
  purposes: "To provide your account and watchlist\nTo recommend titles\nTo send service emails",
  processors: "Fasthosts (hosting)\nStripe (payments)\nResend (email)",
  retention_period: "For as long as you have an account, then 6 years for tax records",
  international_transfers: "yes",
  uses_cookies: true,
  children: false,
};

/** The real default template plus one per-client requirement, so the demo shows
 *  the "This client only" Edit/Remove row on an actual custom item. */
const demoLaunchpadStructure: LaunchpadStructure =
  addCustomItem(
    getDefaultLaunchpadStructure(),
    "foundations",
    {
      label: "Professional indemnity certificate",
      helper: "Your current PI insurance certificate — the retailer contract asks us to hold a copy.",
      ownedByClient: true,
    },
    "custom-demo-insurance",
  ) ?? getDefaultLaunchpadStructure();

/** One doc in each state, so the demo shows all three badges + the red banner. */
const demoLaunchpad: LaunchpadDTO = {
  enabled: true,
  assigned: true,
  templateId: "lp-tmpl-demo",
  templateName: "Gitwork Launchpad",
  structure: demoLaunchpadStructure,
  enabledModules: DEMO_LAUNCHPAD_MODULES,
  answers: DEMO_LAUNCHPAD_ANSWERS,
  items: DEMO_LAUNCHPAD_ITEMS,
  docs: [
    {
      docKey: "cookie",
      title: "Cookie policy",
      answers: {},
      body: renderLegalDoc("cookie", {}).body,
      edited: false,
      status: "TEMPLATE",
      approvedAt: null,
      approvedByEmail: null,
      updatedAt: atDays(-6),
    },
    {
      docKey: "terms",
      title: "Terms & conditions",
      answers: { company_name: "Northwind Studio Ltd", sells_products: true },
      body: renderLegalDoc("terms", {
        company_name: "Northwind Studio Ltd",
        sells_products: true,
      }).body,
      edited: true,
      status: "EDITED",
      approvedAt: null,
      approvedByEmail: null,
      updatedAt: atDays(-2),
    },
    {
      docKey: "privacy",
      title: "Privacy policy",
      answers: DEMO_PRIVACY_ANSWERS,
      body: renderLegalDoc("privacy", DEMO_PRIVACY_ANSWERS).body,
      edited: false,
      status: "APPROVED",
      approvedAt: atDays(-1),
      approvedByEmail: "priya@northwindstudio.co.uk",
      updatedAt: atDays(-1),
    },
  ],
  completeness: computeCompleteness(
    demoLaunchpadStructure,
    DEMO_LAUNCHPAD_MODULES,
    DEMO_LAUNCHPAD_ITEMS,
    DEMO_LAUNCHPAD_ANSWERS,
  ),
  updatedAt: atDays(-1),
};

/**
 * The wiki's timeline, built from the shared Gantt fixture.
 *
 * Adds the completion/start stamps RoundUp derives "what we did this week" from. The
 * Gantt fixture carries only `{title, done}`, so without this the demo would render
 * RoundUp as "nothing delivered" — a demo that cannot express the feature cannot
 * verify it (§43.3), and here it would have looked like a bug in the derivation.
 *
 * Deterministic rather than random: done tasks are stamped backwards from today so some
 * land inside the seven-day window and some in the week before (which is what makes the
 * "+N on the week before" comparison real), and the first unfinished task of any
 * part-built block is marked started, so "ON NOW" is populated and at least one block
 * genuinely spans two Venn regions.
 */
function wikiTimelineFromGantt(): WikiDTO["timeline"] {
  // ⚠️ Undated blocks are dropped here for the same reason `loadWikiTimeline` drops
  // them: `WikiTimelineBlock` dates are non-null because the wiki timeline only ever
  // carries blocks it could place in time. `GanttBlock` allows null now (a linked
  // client's work is routinely undated), so this narrowing is what keeps the demo
  // honest about which of the two shapes it is producing.
  const blocks = demoGanttBlocks
    .filter((b): b is typeof b & { startDate: string; endDate: string } =>
      Boolean(b.startDate && b.endDate),
    )
    .map((block, bi) => {
    let doneSeen = 0;
    let startedOne = false;
    const tasks = block.tasks.map((t) => {
      if (t.done) {
        // 2, 6, 10 … days back, shifted per block — straddling the boundary on purpose.
        const daysBack = 2 + bi * 3 + doneSeen * 4;
        doneSeen += 1;
        return {
          title: t.title,
          done: true,
          completedAt: atDays(-daysBack),
          startedAt: atDays(-(daysBack + 3)),
        };
      }
      if (!startedOne && block.progress > 0 && block.progress < 100) {
        startedOne = true;
        return { title: t.title, done: false, completedAt: null, startedAt: atDays(-2) };
      }
      return { title: t.title, done: false, completedAt: null, startedAt: null };
    });
    const doneCount = tasks.filter((t) => t.done).length;
    const doingCount = tasks.filter((t) => t.startedAt && !t.done).length;
    return {
      id: block.id,
      name: block.name,
      startDate: block.startDate,
      endDate: block.endDate,
      estimated: false,
      color: block.color ?? null,
      progress: block.progress,
      tasks,
      statusCounts: {
        BACKLOG: tasks.length - doneCount - doingCount,
        TODO: 0,
        DOING: doingCount,
        IN_REVIEW: 0,
        UI_DONE: 0,
        DONE: doneCount,
      },
    };
  });
  return {
    blocks,
    milestones: demoGanttMilestones as WikiDTO["timeline"]["milestones"],
    // ⚠️ Live work attached to no phase — the exact shape that made RoundUp render an
    // empty "ON NOW" on GAIA Bloom while two tasks were in progress. A demo without it
    // cannot express the bug and therefore cannot verify the fix (§42.15).
    unassigned: [
      { title: "Role-specific copy under Resources", done: false, completedAt: null, startedAt: atDays(-2) },
      { title: "Share resources at three levels", done: false, completedAt: null, startedAt: atDays(-1) },
      { title: "School admin access to the library", done: false, completedAt: null, startedAt: null },
      { title: "Learner resources view", done: false, completedAt: null, startedAt: null },
    ],
  };
}

/**
 * Comparisons — two tables chosen for the two scales the section has to look right at: a
 * three-plan release table (fits the card, with group bands and a featured column) and a
 * twelve-column competitor table (scrolls, with the feature column pinned). A demo with
 * only the small one would never show the scroller, the edge cue or the phone's
 * compare-two view (§43.3).
 */
function demoComparison(
  id: string,
  title: string,
  description: string,
  orderKey: number,
  columns: { title: string; subtitle?: string; highlight?: boolean }[],
  rows: (string | [string, ...string[]] | { group: string })[],
): WikiComparison {
  const cols = columns.map((c, i) => ({ id: `${id}-c${i + 1}`, ...c }));
  const value = (v: string) =>
    v === "y" ? { state: "yes" } : v === "n" ? { state: "no" } : v === "p" ? { state: "partial" } : v === "" ? { state: "none" } : { state: "text", text: v };
  const parsed = parseComparisonContent(
    cols,
    rows.map((r, i) =>
      typeof r === "object" && !Array.isArray(r)
        ? { id: `${id}-r${i + 1}`, kind: "group", label: r.group, cells: {} }
        : {
            id: `${id}-r${i + 1}`,
            kind: "row",
            label: Array.isArray(r) ? r[0] : r,
            cells: Object.fromEntries(
              (Array.isArray(r) ? r.slice(1) : []).map((v, ci) => [cols[ci]?.id ?? "", value(v)]),
            ),
          },
    ),
  );
  return { id, title, description, orderKey, ...parsed, updatedAt: "2026-10-19T09:00:00.000Z" };
}

const demoComparisons: WikiComparison[] = [
  demoComparison(
    "cmp-plans",
    "What's in each plan — v2.0",
    "The member app's three plans after the October release.",
    0,
    [
      { title: "Free", subtitle: "£0" },
      { title: "Premium", subtitle: "£6.99/mo", highlight: true },
      { title: "Pro", subtitle: "£12.99/mo" },
    ],
    [
      { group: "Booking" },
      ["Book classes", "y", "y", "y"],
      ["Waitlist auto-join", "n", "y", "y"],
      ["Book for a friend", "n", "p", "y"],
      ["Advance booking window", "3 days", "14 days", "30 days"],
      { group: "Training" },
      ["Workout library", "p", "y", "y"],
      ["Personal plans", "n", "y", "y"],
      ["Coach messaging", "n", "n", "y"],
      { group: "Account" },
      ["Family members", "1", "2", "5"],
      ["Priority support", "n", "p", "y"],
    ],
  ),
  demoComparison(
    "cmp-market",
    "Northwind vs the market",
    "Where the member app stands against the studios' usual alternatives.",
    1,
    [
      { title: "Northwind", highlight: true },
      { title: "ClassPass" },
      { title: "Mindbody" },
      { title: "Glofox" },
      { title: "TeamUp" },
      { title: "Momence" },
      { title: "Arbox" },
      { title: "Zingfit" },
      { title: "Peloton" },
      { title: "Strava" },
      { title: "Fitbod" },
      { title: "Gymshark Training" },
    ],
    [
      ["Class booking", "y", "y", "y", "y", "y", "y", "y", "y", "p", "n", "n", "n"],
      ["Native iOS & Android", "y", "y", "y", "y", "p", "p", "y", "p", "y", "y", "y", "y"],
      ["Waitlists", "y", "y", "y", "y", "y", "y", "y", "y", "n", "n", "n", "n"],
      ["Apple Watch", "y", "n", "n", "n", "n", "n", "n", "n", "y", "y", "y", "p"],
      ["Workout plans", "y", "n", "p", "p", "n", "n", "p", "n", "y", "p", "y", "y"],
      ["Studio branding", "y", "n", "p", "y", "p", "y", "y", "y", "n", "n", "n", "n"],
      ["Family accounts", "y", "n", "p", "p", "n", "n", "p", "n", "y", "y", "n", "n"],
      ["Monthly price", "£6.99", "£19+", "£129+", "£110+", "£99", "£79", "£89", "Quote", "£12.99", "£8.99", "£12.99", "Free"],
    ],
  ),
];

const demoWiki: WikiDTO = {
  id: "wiki-northwind",
  clientId: WIKI_CLIENT.id,
  clientName: WIKI_CLIENT.name,
  clientSlug: WIKI_CLIENT.slug,
  website: "https://northwind.co",
  contact: { name: "Priya Shah", email: "priya@northwind.co", phone: "+44 20 7946 0102" },
  shareToken: "demo-share-token",
  shareEnabled: true,
  platforms: ["IOS", "ANDROID", "WEB"],
  pageShares: {},
  hiddenSections: [],
  pages: [
    {
      id: "wp-ia",
      type: "IA_GUIDE",
      title: "Information Architecture",
      sortOrder: 1,
      updatedAt: atDays(-3),
      content:
        "# Information Architecture\n\nHow the Northwind platform is organised, top to bottom.\n\n## Primary navigation\n\n- **Home** — personalised feed + continue-watching rail\n- **Browse** — catalogue by category, with filters\n- **Search** — full-text across titles, people and collections\n- **My Library** — saved items, downloads, history\n- **Account** — profile, preferences, devices\n\n## Content model\n\nEverything hangs off three core entities: **Title**, **Collection** and **Person**. A Title belongs to zero-or-more Collections and credits many People.\n\n## Deep links\n\nEvery Title and Collection has a stable shareable URL (`/t/{id}`, `/c/{id}`) used by marketing and push notifications.",
    },
    {
      id: "wp-dev",
      type: "DEV_API_GUIDE",
      title: "Developer Guide",
      sortOrder: 2,
      updatedAt: atDays(-2),
      content:
        "# Developer Guide\n\nGetting set up on the Northwind codebase.\n\n## Prerequisites\n\n- Node 20+, pnpm 9+\n- Access to the `northwind` GitHub org\n- A staging API key (ask in **#northwind-dev**)\n\n## Local setup\n\n1. `pnpm install`\n2. Copy `.env.example` → `.env.local` and fill in the staging keys\n3. `pnpm dev` — app on `localhost:3000`, Storybook on `:6006`\n\n## Branching\n\n`main` is protected and auto-deploys to staging. Feature branches → PR → **squash merge**. Keep PRs under ~400 lines where you can.\n\n## Testing\n\n`pnpm test` (Vitest) for units, `pnpm e2e` (Playwright) before any release.",
    },
    {
      id: "wp-arch",
      type: "ARCHITECTURE",
      title: "Architecture",
      sortOrder: 3,
      updatedAt: atDays(-6),
      content:
        "# Architecture\n\n## Overview\n\nNext.js app + a Node API, backed by Postgres and Redis, fronted by a CDN. Media is served from object storage with signed URLs.\n\n## Services\n\n- **web** — Next.js (SSR + client), the app you're reading this in\n- **api** — REST + webhooks, owns the database\n- **workers** — background jobs (encoding, emails, analytics roll-ups)\n\n## Data stores\n\n- **Postgres** — source of truth\n- **Redis** — sessions, rate limits, hot caches\n- **Object storage (R2)** — media + user uploads\n\n## Third parties\n\nMux (video), Algolia (search), Resend (email), Segment (analytics).",
    },
    {
      id: "wp-runbook",
      type: "RUNBOOK",
      title: "Runbook",
      sortOrder: 4,
      updatedAt: atDays(-4),
      content:
        "# Runbook\n\nWhat to do when things break.\n\n## Site is down\n\n1. Check the **Monitors** tab — which probe is red?\n2. Check the CDN + host status pages\n3. Roll back the last deploy if it correlates: `deploy rollback --last`\n\n## Video won't play\n\n1. Check the **Monitors** — is the API probe green?\n2. Check the Mux status page for encoding incidents\n3. Confirm the CDN is serving the media manifest (302 → signed URL)\n\n## Escalation\n\nPage the on-call dev in **#northwind-oncall**. If unresolved in 30 min, escalate to Gitwork.",
    },
    {
      id: "wp-data",
      type: "DATA_MODEL",
      title: "Data Model",
      sortOrder: 5,
      updatedAt: atDays(-8),
      content:
        "# Data Model\n\nCore tables and how they relate.\n\n## User\n\n`id · email · name · role · createdAt`. Has many **Devices**, **WatchEvents** and **Favorites**.\n\n## Title\n\n`id · slug · name · synopsis · runtimeMins · releasedAt`. Belongs to many **Collections**, credits many **People**.\n\n## Collection\n\n`id · slug · name · titleCount`. Groups Titles into curated rails (e.g. \"New releases\", \"Because you watched…\").\n\n## WatchEvent\n\n`id · userId · titleId · positionSecs · at` — powers continue-watching and analytics.",
    },
  ],
  changelog: [
    // One release still waiting for approval, on two platforms, so the approve bar and the
    // "Pending 1" count can be seen — a demo of only approved releases cannot show them.
    { id: "cl0a", platform: "IOS", version: "3.3.0", title: "Watch parties", body: "- Watch together with up to 8 friends\n- Live reactions on the timeline", releasedAt: null, createdAt: atDays(0), status: "PENDING" },
    { id: "cl0b", platform: "ANDROID", version: "3.3.0", title: "Watch parties", body: "- Watch together with up to 8 friends\n- Live reactions on the timeline\n- Picture-in-picture during a party", releasedAt: null, createdAt: atDays(0), status: "PENDING" },
    { id: "cl1", platform: "IOS", version: "3.2.0", title: "Offline downloads", body: "- Download titles for offline viewing\n- Smarter storage management\n- Fixes for AirPlay handoff", releasedAt: atDays(-2), createdAt: atDays(-3), status: "APPROVED" },
    { id: "cl2", platform: "ANDROID", version: "3.2.0", title: "Offline downloads", body: "- Download titles for offline viewing\n- Chromecast reliability improvements", releasedAt: atDays(-2), createdAt: atDays(-3), status: "APPROVED" },
    { id: "cl3", platform: "WEB", version: "2.8.1", title: "Faster search", body: "- New search index, ~3x faster results\n- Keyboard navigation in the results list", releasedAt: atDays(-9), createdAt: atDays(-10), status: "APPROVED" },
    { id: "cl4", platform: "IOS", version: "3.1.0", title: "New player controls", body: "- Redesigned scrubber\n- Playback speed control", releasedAt: atDays(-24), createdAt: atDays(-25), status: "APPROVED" },
  ],
  // Mirrors the real Wedge board's two shapes so both are verifiable here: genuine
  // requests extracted from feedback, and the unnamed rows a failed classifier
  // produces (§53). A demo carrying only the healthy shape cannot express the bug,
  // and so cannot verify the fix (§42.15).
  // A healthy feed — the banner is verified separately against the failing shape.
  courseFeed: {
    lastRunAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    lastSuccessAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    failingSince: null,
    lastError: null,
    lastCreated: 2,
    lastStatusSyncAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    alertedDownAt: null,
  },
  courseRequests: [
    {
      id: "cr-1",
      courseName: "Caernarfon Golf Club",
      country: "United Kingdom",
      status: "ADDED",
      notes: "From Big Wedge Golf (16 Jun 2026):\nCourse map jumps after hole 9.",
      sourceConversationId: "conv-1",
      sentAt: null,
      createdAt: "2026-08-05T14:13:04.682Z",
      updatedAt: "2026-08-18T13:23:28.107Z",
    },
    {
      id: "cr-2",
      courseName: "Brechin Golf Course",
      country: "United Kingdom",
      status: "SENT",
      notes: "From Big Wedge Golf (15 Jun 2026):\nCourse map is incorrect.",
      sourceConversationId: "conv-2",
      sentAt: "2026-08-18T13:39:06.015Z",
      createdAt: "2026-08-05T14:13:04.697Z",
      updatedAt: "2026-08-18T13:39:06.016Z",
    },
    {
      id: "cr-3",
      courseName: "Wyboston Lakes Golf",
      country: "United Kingdom",
      status: "NEW",
      notes: "From Big Wedge Golf (12 Jun 2026):\nMissing course in my area.",
      sourceConversationId: "conv-3",
      sentAt: null,
      createdAt: "2026-08-05T14:13:04.711Z",
      updatedAt: "2026-08-05T14:13:04.711Z",
    },
    // Unnamed — general app feedback the classifier never labelled. Renders to the
    // client as "Untitled Course".
    {
      id: "cr-4",
      courseName: "",
      country: null,
      status: "NEW",
      notes: "From Big Wedge Golf (28 Jun 2026):\nIs there a plan to add an Apple Watch app",
      sourceConversationId: "conv-4",
      sentAt: null,
      createdAt: "2026-09-16T13:00:14.944Z",
      updatedAt: "2026-09-16T13:00:14.944Z",
    },
    {
      id: "cr-5",
      courseName: "",
      country: null,
      status: "NEW",
      notes: "From Big Wedge Golf (19 Jun 2026):\nI lost all my game records.",
      sourceConversationId: "conv-5",
      sentAt: null,
      createdAt: "2026-09-16T13:00:14.988Z",
      updatedAt: "2026-09-16T13:00:14.988Z",
    },
  ],
  // The wiki timeline reuses the shared Gantt shape; the two are separately typed, so
  // bridge them here rather than duplicate the data.
  //
  // ⚠️ This used to be `as unknown as WikiDTO["timeline"]`. That cast is precisely how
  // the demo's blocks came to be missing `statusCounts` while `tsc` said nothing, and
  // Delivery threw on first render (§49.2). It is a real typed mapping now, so a field
  // the DTO gains and the demo does not is a compile error rather than a blank panel.
  timeline: wikiTimelineFromGantt(),
  designSystem: { tokens: demoDesignTokens, logoUrl: null, showFoundryBranding: true, guidelinesEnabled: true },
  monitors: {
    enabled: true,
    monitors: [
      {
        id: "mon1", name: "Marketing site", type: "HTTP", target: "https://northwind.co", method: "GET",
        expectedStatus: 200, keyword: null, degradedMs: 800, enabled: true, intervalMinutes: 5,
        status: "UP", checkedAt: atDays(0), latencyMs: 142, statusCode: 200, error: null,
        uptime: { d1: 100, d7: 99.9, d30: 99.8 }, avgLatencyMs: 150, history: monitorHistory(140), stale: false,
      },
      {
        id: "mon2", name: "API", type: "HTTP", target: "https://api.northwind.co/health", method: "GET",
        expectedStatus: 200, keyword: "ok", degradedMs: 500, enabled: true, intervalMinutes: 5,
        status: "UP", checkedAt: atDays(0), latencyMs: 88, statusCode: 200, error: null,
        uptime: { d1: 100, d7: 99.98, d30: 99.9 }, avgLatencyMs: 92, history: monitorHistory(90, [6, 7]), stale: false,
      },
      {
        id: "mon3", name: "Web app", type: "HTTP", target: "https://app.northwind.co", method: "GET",
        expectedStatus: 200, keyword: null, degradedMs: 1200, enabled: true, intervalMinutes: 5,
        status: "DEGRADED", checkedAt: atDays(0), latencyMs: 1340, statusCode: 200, error: null,
        uptime: { d1: 99.2, d7: 99.5, d30: 99.6 }, avgLatencyMs: 410, history: monitorHistory(300, [0, 1, 2]), stale: false,
      },
    ],
  },
  team: [
    { name: "Alex Rivera", initials: "AR", avatarUrl: null, bio: "Frontend & design system" },
    { name: "Marco Bianchi", initials: "MB", avatarUrl: null, bio: "Backend & infra" },
    { name: "Sam Okafor", initials: "SO", avatarUrl: null, bio: "iOS lead" },
  ],
  productTeam: [
    { name: "Dan Lindsay", initials: "DL", avatarUrl: null, bio: null },
    { name: "Harry Brown", initials: "HB", avatarUrl: null, bio: null },
    { name: "Syed Ali", initials: "SA", avatarUrl: null, bio: null },
  ],
  headerLinks: {
    platformName: "Web app",
    productionUrl: "https://app.northwind.co",
    stagingUrl: "https://staging.northwind.co",
  },
  // ⚠️ Seeded with the REAL shape, not a tidy one: Loom walkthroughs (what
  // actually gets dropped in here), titles of one, two and four lines, a plain
  // link with no preview, and a file. A fixture where every title is the same
  // length cannot show the ragged-card defect and so cannot verify the fix.
  documents: {
    enabled: true,
    documents: [
      { id: "wd1", title: "Added a loader to the Generate Summaries button on the Application Table.", kind: "LINK", url: "https://www.loom.com/share/a1b2c3d4e5f6", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:00:00.000Z" },
      { id: "wd2", title: "Preventing Past Date Interview Requests", kind: "LINK", url: "https://www.loom.com/share/b2c3d4e5f6a1", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:01:00.000Z" },
      { id: "wd3", title: "Recruiter Pre-Screen Concurrency Warning Explained", kind: "LINK", url: "https://www.loom.com/share/c3d4e5f6a1b2", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:02:00.000Z" },
      { id: "wd4", title: "Rollout", kind: "LINK", url: "https://www.loom.com/share/d4e5f6a1b2c3", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:03:00.000Z" },
      { id: "wd5", title: "Download Single candidate cv with candidate name and Bulk Candidate CVs with company name and date of export", kind: "LINK", url: "https://www.loom.com/share/e5f6a1b2c3d4", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:04:00.000Z" },
      { id: "wd6", title: "Brand guidelines", kind: "LINK", url: "https://docs.google.com/document/d/abc123/edit", host: "docs.google.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:05:00.000Z" },
      { id: "wd7", title: "Displayed application statuses on the Application Stats page in the same order as the board", kind: "LINK", url: "https://www.loom.com/share/f6a1b2c3d4e5", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:06:00.000Z" },
      { id: "wd8", title: "Onboarding pack", kind: "FILE", url: null, host: null, fileName: "northwind-onboarding.pdf", fileSize: 842_113, addedAt: "2026-09-29T09:07:00.000Z" },
      { id: "wd9", title: "Removed candidate scores, notes, and chatbot from the Candidate Portal.", kind: "LINK", url: "https://www.loom.com/share/a1b2c3d4e5f7", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:08:00.000Z" },
      { id: "wd10", title: "Display the Gender column in the Marketing Candidate table and properly display it on export", kind: "LINK", url: "https://www.loom.com/share/b2c3d4e5f6a2", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:09:00.000Z" },
      { id: "wd11", title: "Statement of work", kind: "FOUNDRY", url: "/docs/demo-token", host: null, fileName: null, fileSize: null, addedAt: "2026-09-29T09:10:00.000Z" },
      { id: "wd12", title: "Added functionality to edit the campaign slug from Campaign Settings, including validation and redirects", kind: "LINK", url: "https://www.loom.com/share/c3d4e5f6a1b3", host: "loom.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:11:00.000Z" },
      { id: "wd13", title: "Design review", kind: "LINK", url: "https://www.figma.com/design/xyz/Console", host: "figma.com", fileName: null, fileSize: null, addedAt: "2026-09-29T09:12:00.000Z" },
    ],
  },
  codeHandover: {
    enabled: true,
    modules: [
      {
        id: "cm1",
        name: "Receiver",
        description: "Firmware for the receiver unit — flash via PlatformIO.",
        versions: [
          {
            id: "cv1b", label: "v1.2.0", notes: "Add low-power sleep between polls.", isCurrent: true, createdAt: atDays(-3),
            files: [
              { id: "f1", filename: "main.cpp", language: "cpp", content: "#include <Arduino.h>\n\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  // receive + decode\n}\n" },
              { id: "f2", filename: "config.h", language: "cpp", content: "#define CHANNEL 7\n#define SLEEP_MS 500\n" },
            ],
          },
          {
            id: "cv1a", label: "v1.1.0", notes: "Initial handover.", isCurrent: false, createdAt: atDays(-30),
            files: [{ id: "f3", filename: "main.cpp", language: "cpp", content: "// v1.1 receiver\nvoid setup() {}\nvoid loop() {}\n" }],
          },
        ],
      },
      {
        id: "cm2",
        name: "Sender",
        description: "Firmware for the sender unit.",
        versions: [
          {
            id: "cv2", label: "v1.0.0", notes: null, isCurrent: true, createdAt: atDays(-30),
            files: [{ id: "f4", filename: "sender.ino", language: "cpp", content: "void setup() {}\nvoid loop() { /* transmit */ }\n" }],
          },
        ],
      },
    ],
  },
  // Two client users, so Settings → Access shows the list and its "Copy details" action.
  users: [
    { id: "wu-priya", email: "priya@northwind.co", name: "Priya Nair", createdAt: atDays(-40) },
    { id: "wu-ops", email: "ops@northwind.co", name: null, createdAt: atDays(-6) },
  ],
  launchpad: demoLaunchpad,
  intakeEnabled: true,
  intakeCategories: DEFAULT_INTAKE_CATEGORIES,
  intakeCategoriesAreDefault: true,
  // Every stage is represented on purpose. The whole point of the tracker is that a
  // request follows the dev board, so a demo showing only NEW and TRIAGED would verify
  // the CSS and nothing else — the §43.3 lesson. `taskStatus` is what the live loader
  // reads off the linked task; `stage` is derived from it by deriveRequestStage.
  intakeItems: [
    { id: "wi1", type: "FEEDBACK", title: "Add a “continue watching” rail to the home screen", description: "Surface the last 10 partially-watched titles at the top of Home.", priority: "MEDIUM", status: "TRIAGED", requestedBy: "Priya Shah", externalRef: null, label: "FRONTEND", categoryId: null, categoryLabel: null, externalUrl: null, attachmentUrls: [], source: "wiki", taskId: null, taskStatus: null, stage: "REVIEWING", hasImage: false, imageFilename: null, device: null, osVersion: null, createdAt: atDays(-4), updatedAt: atDays(-2), comments: [] },
    { id: "wi2", type: "BUG", title: "AirPlay handoff drops audio on iOS 18", description: "Video continues but audio cuts out when handing off to Apple TV.", priority: "HIGH", status: "NEW", requestedBy: "Priya Shah", externalRef: null, label: null, categoryId: null, categoryLabel: null, externalUrl: null, attachmentUrls: [], source: "wiki", taskId: null, taskStatus: null, stage: "NEW", hasImage: false, imageFilename: null, device: "iPhone 15 Pro", osVersion: "iOS 18.1", createdAt: atDays(-1), updatedAt: atDays(-1), comments: [] },
    { id: "wi3", type: "TASK", title: "Let a household share one subscription across 4 profiles", description: "Finance have signed off the pricing. Needs profile switching in the account area.", priority: "HIGH", status: "PROMOTED", requestedBy: "Marcus Webb", externalRef: "LIN-4471", label: "BACKEND", categoryId: null, categoryLabel: null, externalUrl: "https://linear.app/example/issue/LIN-4471", attachmentUrls: [], source: "api", taskId: "t-demo-3", taskStatus: "DOING", stage: "IN_PROGRESS", hasImage: false, imageFilename: null, device: null, osVersion: null, createdAt: atDays(-11), updatedAt: atDays(-1), comments: [{ id: "wc1", authorKind: "TEAM", authorName: "Harry Bell", body: "Picked this up this morning — profile switching is in, the billing split is next.", mentions: [], createdAt: atDays(-1), editedAt: null, deleted: false, hasImage: false, imageFilename: null, canEdit: true, canDelete: true }, { id: "wc2", authorKind: "CLIENT", authorName: "Marcus Webb", body: "Great — @Harry Bell can the split land before the finance review on Friday?", mentions: [{ id: "team:u-harry", name: "Harry Bell", kind: "TEAM" }], createdAt: atDays(0), editedAt: null, deleted: false, hasImage: false, imageFilename: null, canEdit: false, canDelete: true }, { id: "wc3", authorKind: "CLIENT", authorName: "Marcus Webb", body: "", mentions: [], createdAt: atDays(0), editedAt: null, deleted: true, hasImage: false, imageFilename: null, canEdit: false, canDelete: false }] },
    { id: "wi4", type: "DESIGN", title: "Episode cards are unreadable in bright sunlight", description: "The grey-on-grey metadata line fails contrast outdoors.", priority: "MEDIUM", status: "PROMOTED", requestedBy: "Priya Shah", externalRef: null, label: "UI_UX", categoryId: null, categoryLabel: null, externalUrl: null, attachmentUrls: [], source: "wiki", taskId: "t-demo-4", taskStatus: "DONE", stage: "DONE", hasImage: false, imageFilename: null, device: "iPad Air", osVersion: "iPadOS 18.0", createdAt: atDays(-19), updatedAt: atDays(-3), comments: [] },
    { id: "wi5", type: "BUG", title: "Search returns nothing for titles with an apostrophe", description: "“Grey’s Anatomy” returns 0 results; “Greys Anatomy” works.", priority: "HIGH", status: "PROMOTED", requestedBy: "Marcus Webb", externalRef: null, label: "BACKEND", categoryId: null, categoryLabel: null, externalUrl: null, attachmentUrls: [], source: "wiki", taskId: "t-demo-5", taskStatus: "BACKLOG", stage: "SCHEDULED", hasImage: false, imageFilename: null, device: null, osVersion: null, createdAt: atDays(-6), updatedAt: atDays(-5), comments: [] },
    { id: "wi6", type: "FEEDBACK", title: "Downloads should keep working on a plane", description: "Offline playback asks to sign in again once the device loses signal.", priority: "LOW", status: "CLOSED", requestedBy: "Priya Shah", externalRef: null, label: null, categoryId: null, categoryLabel: null, externalUrl: null, attachmentUrls: [], source: "wiki", taskId: null, taskStatus: null, stage: "CLOSED", hasImage: false, imageFilename: null, device: null, osVersion: null, createdAt: atDays(-27), updatedAt: atDays(-20), comments: [] },
  ],
  deliveryEnabled: true,
  roundupEnabled: true,
  // A LINKED support section with two months of figures, so the trend badges have
  // something to compare against — a demo with one month would render every trend as an
  // em-dash and prove nothing about the part most likely to be wrong (a duration where
  // DOWN is good).
  /**
   * Today's standups. Deliberately three different shapes, because a fixture
   * where every dev looks the same cannot show the rules: one PM push (Done
   * today leads), one AM push (In progress leads), and one who pushed with
   * nothing to report — which must still appear, since "pushed an empty update"
   * is a fact and hiding it would make the card disagree with the roster.
   */
  standups: {
    today: {
      workDate: atDays(0),
      devs: [
        {
          userId: "u-priya",
          name: "Priya Shah",
          amPushedAt: atDays(0),
          pmPushedAt: atDays(0),
          inProgress: [{ id: "t1", title: "Autocomplete tuning", parentTitle: "Search & discovery" }],
          inReview: [{ id: "t2", title: "Filters & facets", parentTitle: null }],
          doneToday: [{ id: "t3", title: "Search index rebuild", parentTitle: null }],
        },
        {
          userId: "u-tom",
          name: "Tom Mercer",
          amPushedAt: atDays(0),
          pmPushedAt: null,
          inProgress: [{ id: "t4", title: "Payments webhook retries", parentTitle: "Payments" }],
          inReview: [],
          doneToday: [],
        },
        {
          userId: "u-sofia",
          name: "Sofia Oyelaran",
          amPushedAt: atDays(0),
          pmPushedAt: null,
          inProgress: [],
          inReview: [],
          doneToday: [],
        },
      ],
    },
    // History, deliberately in two shapes: a day saved at push time (what was
    // reported, all three groups), and a day pushed BEFORE snapshots existed —
    // where only "Done that day" can be established from the board, so the card
    // has to say so rather than show an empty "In progress" as if it were true.
    history: [
      {
        workDate: atDays(-1),
        devs: [
          {
            userId: "u-priya",
            name: "Priya Shah",
            amPushedAt: atDays(-1),
            pmPushedAt: atDays(-1),
            inProgress: [{ id: "t1", title: "Autocomplete tuning", parentTitle: "Search & discovery" }],
            inReview: [],
            doneToday: [{ id: "t5", title: "Results page skeleton", parentTitle: null }],
            source: "reported",
          },
          {
            userId: "u-tom",
            name: "Tom Mercer",
            amPushedAt: atDays(-1),
            pmPushedAt: atDays(-1),
            inProgress: [],
            inReview: [{ id: "t6", title: "Stripe customer sync", parentTitle: "Payments" }],
            doneToday: [{ id: "t7", title: "Refund edge cases", parentTitle: "Payments" }],
            source: "reported",
          },
        ],
      },
      {
        workDate: atDays(-4),
        devs: [
          {
            userId: "u-priya",
            name: "Priya Shah",
            amPushedAt: atDays(-4),
            pmPushedAt: atDays(-4),
            inProgress: [],
            inReview: [],
            doneToday: [{ id: "t8", title: "Search analytics events", parentTitle: null }],
            source: "history",
          },
        ],
      },
    ],
  },
  // Metrics in the state the section is built for: a monthly Care source, six months of
  // history so the sparklines and trends have something real to draw, one metric hidden
  // (internal view shows it struck through; the client's copy never carries it) and the
  // first three featured on the dashboard card.
  metrics: {
    enabled: true,
    source: "care",
    sourceLabel: "Care analytics — Fellas Loaded",
    mode: "monthly",
    period: demoPeriod(-1),
    previousPeriod: demoPeriod(-2),
    capturedAt: atDays(-3),
    historyPeriods: [-6, -5, -4, -3, -2, -1].map(demoPeriod),
    needsRefresh: false,
    metrics: [
      { key: "users.active", label: "Active users", value: 4812, unit: null, group: "Users", previous: 4410, hidden: false, featured: true, history: [3200, 3510, 3890, 4105, 4410, 4812] },
      { key: "subs.active", label: "Active subscriptions", value: 1240, unit: null, group: "Subscriptions", previous: 1198, hidden: false, featured: true, history: [980, 1012, 1080, 1150, 1198, 1240] },
      { key: "subs.mrr", label: "Monthly revenue", value: 11408, unit: "£", group: "Subscriptions", previous: 11021, hidden: false, featured: true, history: [8820, 9310, 9935, 10580, 11021, 11408] },
      { key: "subs.cancelled", label: "Cancellations", value: 38, unit: null, group: "Subscriptions", previous: 44, hidden: false, featured: false, history: [51, 47, 49, 41, 44, 38] },
      { key: "users.new", label: "New users", value: 1320, unit: null, group: "Users", previous: 1405, hidden: false, featured: false, history: [990, 1104, 1210, 1288, 1405, 1320] },
      { key: "eng.sessions", label: "Sessions", value: 38210, unit: null, group: "Engagement", previous: 35940, hidden: false, featured: false, history: [27100, 29400, 31800, 33650, 35940, 38210] },
      { key: "eng.orders", label: "Orders placed", value: 6124, unit: null, group: "Engagement", previous: 5980, hidden: false, featured: false, history: [4410, 4720, 5105, 5530, 5980, 6124] },
      { key: "eng.per_user", label: "Sessions per active user", value: 7.94, unit: null, group: "Engagement", previous: 8.15, hidden: false, featured: false, history: [8.47, 8.38, 8.17, 8.2, 8.15, 7.94] },
      { key: "debug.queue_depth", label: "Queue depth", value: 3, unit: null, group: null, previous: 7, hidden: true, featured: false, history: [null, null, 5, 9, 7, 3] },
    ],
    // The month still running, with the hidden metric in it too — the client's copy must
    // drop it from here as well as from the whole-month figures.
    monthToDate: {
      period: demoPeriod(0),
      capturedAt: atDays(0),
      metrics: [
        { key: "users.active", label: "Active users", value: 2960, unit: null, group: "Users", hidden: false },
        { key: "users.new", label: "New users", value: 812, unit: null, group: "Users", hidden: false },
        { key: "eng.sessions", label: "Sessions", value: 24150, unit: null, group: "Engagement", hidden: false },
        { key: "eng.orders", label: "Orders placed", value: 3870, unit: null, group: "Engagement", hidden: false },
        // Three metrics in one card, the way Big Wedge's Subscriptions card renders.
        { key: "subs.active", label: "Active subscriptions", value: 1251, unit: null, group: "Subscriptions", hidden: false, card: { id: "subs", title: "Subscriptions", part: "Total" } },
        { key: "subs.monthly", label: "Monthly subscriptions", value: 1004, unit: null, group: "Subscriptions", hidden: false, card: { id: "subs", title: "Subscriptions", part: "Monthly" } },
        { key: "subs.yearly", label: "Yearly subscriptions", value: 247, unit: null, group: "Subscriptions", hidden: false, card: { id: "subs", title: "Subscriptions", part: "Yearly" } },
        { key: "subs.mrr", label: "Monthly revenue", value: 11502, unit: "£", group: "Subscriptions", money: true, hidden: false },
        { key: "debug.queue_depth", label: "Queue depth", value: 2, unit: null, group: null, hidden: true },
      ],
    },
    apiEndpoint: null,
    hasApiToken: false,
  },
  // Two shared meetings. The second has every action done, the first has one open — the
  // dashboard card counts across both.
  meetings: {
    enabled: true,
    meetings: [
      {
        id: "mtg-2",
        title: "Northwind × Gitwork — fortnightly review",
        startedAt: atDays(-2),
        summary:
          "Search is in review and on track for the end of the month. Payments retries are in progress; the client confirmed Stripe test keys are live.\n\nThe team agreed to **ship search behind a flag** first and open it to all users after a week of monitoring.",
        decisions: [
          "Ship search behind a feature flag before the full rollout",
          "Move the Android release to after the payments work",
        ],
        actions: [
          { id: "a-1", title: "Send the production Stripe webhook secret", owner: "Priya (Northwind)", done: false },
          { id: "a-2", title: "Share the search analytics dashboard", owner: "Tom Mercer", done: true },
          { id: "a-3", title: "Book the launch-readiness call", owner: "Sofia Oyelaran", done: false },
        ],
      },
      {
        id: "mtg-1",
        title: "Kick-off: search & discovery",
        startedAt: atDays(-16),
        summary: "Scope for search and discovery agreed. Filters and facets come first; autocomplete follows.",
        decisions: ["Use the existing product feed as the search index source"],
        actions: [
          { id: "a-4", title: "Grant read access to the product feed", owner: "Priya (Northwind)", done: true },
        ],
      },
    ],
  },
  // Drive is on and linked, read as a teammate whose sign-in works.
  drive: { enabled: true, linked: true, reader: { name: "Dan Lindsay", ready: true } },
  // Three platforms, deliberately one renewing inside a fortnight (amber on the card) and
  // one with no renewal date at all.
  clientPlatforms: {
    enabled: true,
    platforms: [
      {
        id: "plat-web",
        name: "Northwind web app",
        platformType: "Next.js",
        url: "https://northwind.co",
        stagingUrl: "https://staging.northwind.co",
        repoUrl: "https://github.com/northwind/web",
        links: [{ label: "Status page", url: "https://status.northwind.co" }],
        renewsOn: atDays(9),
        renewalNote: "Domain (northwind.co)",
      },
      {
        id: "plat-ios",
        name: "Northwind for iPhone",
        platformType: "App Store",
        url: "https://apps.apple.com/gb/app/northwind/id000000000",
        stagingUrl: null,
        repoUrl: null,
        links: [],
        renewsOn: atDays(54),
        renewalNote: "Apple developer account",
      },
      {
        id: "plat-admin",
        name: "Admin panel",
        platformType: "Admin Panel",
        url: "https://admin.northwind.co",
        stagingUrl: null,
        repoUrl: null,
        links: [],
        renewsOn: null,
        renewalNote: null,
      },
    ],
  },
  support: {
    enabled: true,
    linked: true,
    current: {
      month: "2026-09",
      totalTickets: 38,
      resolvedCount: 34,
      openCount: 4,
      resolutionRate: 89.5,
      avgFirstResponseMs: 1000 * 60 * 74,
      medianFirstResponseMs: 1000 * 60 * 41,
      avgResolutionMs: 1000 * 60 * 60 * 9,
      medianResolutionMs: 1000 * 60 * 60 * 5,
      slaCompliancePct: 92,
      categories: [
        { label: "Technical issues", count: 17 },
        { label: "Account queries", count: 11 },
        { label: "Cancellations", count: 6 },
        { label: "Other", count: 4 },
      ],
    },
    previous: {
      month: "2026-08",
      totalTickets: 45,
      resolvedCount: 38,
      openCount: 7,
      resolutionRate: 84.4,
      avgFirstResponseMs: 1000 * 60 * 96,
      medianFirstResponseMs: 1000 * 60 * 58,
      avgResolutionMs: 1000 * 60 * 60 * 11,
      medianResolutionMs: 1000 * 60 * 60 * 7,
      slaCompliancePct: 86,
      categories: [],
    },
    daysAllowance: 5,
    daysUsed: 3,
  },
  // Every board type, with a real two-level node map — a demo that only carried a bar
  // chart would verify the CSS and nothing else (§43.3). The node board is deliberately
  // shaped like the case this was built for: one thing at the centre, lots hanging off it.
  /**
   * All FOUR pricing kinds, plus two live blind spots — a metered line with no driver
   * and a stepped line capped at its top band. A demo that only carried well-formed
   * lines would verify the CSS and nothing else (§43.3); these are the two states the
   * page's honesty rules exist for.
   */
  /**
   * Two estimates, chosen to exercise the page's two honesty rules: the second has every
   * phase capped, so its larger teams read "no faster than 2 developers"; and it has no
   * agreed start date, so the page must say it is planning from next Monday. A demo
   * carrying only a well-behaved estimate would verify the CSS and nothing else (§43.3).
   */
  comparisons: { enabled: true, comparisons: demoComparisons },
  sheets: demoSheets,
  estimates: {
    enabled: true,
    estimates: [
      {
        id: "est-v1",
        title: "Version 1 — member app",
        summary:
          "Accounts, booking, payments and push notifications on iOS and Android, with the admin dashboard the front desk uses.",
        startDate: "2026-11-02",
        teamSizes: [1, 2, 3, 4],
        recommendedTeam: 2,
        coordination: "TYPICAL",
        contingencyPct: 20,
        phases: [
          { id: "ph-1", name: "Discovery", effortDays: 5, maxDevs: 1 },
          { id: "ph-2", name: "Design", effortDays: 15, maxDevs: 2 },
          { id: "ph-3", name: "Build", effortDays: 60, maxDevs: null },
          { id: "ph-4", name: "Testing", effortDays: 12, maxDevs: 2 },
          { id: "ph-5", name: "Store launch", effortDays: 3, maxDevs: 1 },
        ],
        orderKey: 0,
        updatedAt: "2026-10-12T09:00:00.000Z",
      },
      {
        id: "est-loyalty",
        title: "Loyalty add-on",
        summary: "Points, rewards and a referral link, added to the live app.",
        startDate: null,
        teamSizes: [1, 2, 3],
        recommendedTeam: null,
        coordination: "HIGH",
        contingencyPct: 30,
        phases: [
          { id: "ph-a", name: "Rules & design", effortDays: 4, maxDevs: 1 },
          { id: "ph-b", name: "Build", effortDays: 14, maxDevs: 2 },
          { id: "ph-c", name: "Release", effortDays: 2, maxDevs: 1 },
        ],
        orderKey: 1,
        updatedAt: "2026-10-12T09:00:00.000Z",
      },
    ],
  },
  costs: {
    enabled: true,
    currency: "GBP",
    headlineUsers: 5000,
    notes:
      "Figures are the list price of each service at today's rates. They exclude VAT and any Gitwork retainer.",
    updatedAt: "2026-09-18T09:00:00.000Z",
    items: [
      {
        id: "cost-hosting",
        name: "App hosting",
        vendor: "Fasthosts VPS",
        kind: "FLAT",
        amountMonthly: 48,
        amountAnnual: 480,
        unitLabel: null,
        includedUnits: null,
        unitPrice: null,
        unitsPerUser: null,
        tiers: [],
        notes: "Two instances behind the load balancer.",
        included: true,
        orderKey: 0,
      },
      {
        id: "cost-db",
        name: "Database & storage",
        vendor: "Supabase",
        kind: "STEPPED",
        amountMonthly: null,
        amountAnnual: null,
        unitLabel: null,
        includedUnits: null,
        unitPrice: null,
        unitsPerUser: null,
        tiers: [
          { id: "t1", upToUsers: 1000, amountMonthly: 25, label: "Pro", orderKey: 0 },
          { id: "t2", upToUsers: 10000, amountMonthly: 120, label: "Team", orderKey: 1 },
          { id: "t3", upToUsers: 100000, amountMonthly: 599, label: "Scale", orderKey: 2 },
        ],
        notes: "Enterprise pricing above 100k users is quoted, not published.",
        included: true,
        orderKey: 1,
      },
      {
        id: "cost-seats",
        name: "Admin seats",
        vendor: "Foundry",
        kind: "PER_USER",
        amountMonthly: 0.4,
        amountAnnual: 4,
        unitLabel: null,
        includedUnits: null,
        unitPrice: null,
        unitsPerUser: null,
        tiers: [],
        notes: null,
        included: true,
        orderKey: 2,
      },
      {
        id: "cost-email",
        name: "Transactional email",
        vendor: "Resend",
        kind: "METERED",
        amountMonthly: 18,
        amountAnnual: null,
        unitLabel: "emails",
        includedUnits: 50000,
        unitPrice: 0.0004,
        unitsPerUser: 6,
        tiers: [],
        notes: null,
        included: true,
        orderKey: 3,
      },
      /**
       * Three providers priced as OPTIONS — the comparison case this exists for.
       * Same unit (1k tokens) and the same per-user volume on all three, because a
       * comparison where the assumptions differ is not one. Excluded, so none of
       * them touches the total until the client picks.
       */
      {
        id: "cost-opt-haiku",
        name: "Claude Haiku 4.5",
        vendor: "Anthropic",
        kind: "METERED",
        amountMonthly: 0,
        amountAnnual: null,
        unitLabel: "k tokens",
        includedUnits: null,
        unitPrice: 0.0012,
        unitsPerUser: 40,
        tiers: [],
        notes: "Assumes 40k tokens per user per month across summarise + search.",
        included: false,
        orderKey: 5,
      },
      {
        id: "cost-opt-sonnet",
        name: "Claude Sonnet 4.6",
        vendor: "Anthropic",
        kind: "METERED",
        amountMonthly: 0,
        amountAnnual: null,
        unitLabel: "k tokens",
        includedUnits: null,
        unitPrice: 0.009,
        unitsPerUser: 40,
        tiers: [],
        notes: "Same 40k tokens per user. Stronger on long documents.",
        included: false,
        orderKey: 6,
      },
      {
        id: "cost-opt-selfhost",
        name: "Self-hosted Llama",
        vendor: "Own GPU box",
        kind: "FLAT",
        amountMonthly: 420,
        amountAnnual: 4620,
        unitLabel: null,
        includedUnits: null,
        unitPrice: null,
        unitsPerUser: null,
        tiers: [],
        notes: "Fixed whatever the volume — cheapest only above roughly 9k users.",
        included: false,
        orderKey: 7,
      },
      {
        id: "cost-ai",
        name: "AI assistant",
        vendor: "Anthropic",
        kind: "METERED",
        amountMonthly: 0,
        amountAnnual: null,
        unitLabel: "tokens",
        includedUnits: null,
        unitPrice: null,
        unitsPerUser: null,
        tiers: [],
        notes: "Usage per user still being measured from the beta.",
        included: true,
        orderKey: 4,
      },
    ],
  },
  insights: {
    enabled: true,
    boards: [
      {
        id: "ib-node",
        kind: "node",
        title: "How the product fits together",
        caption:
          "The app at the centre, and everything it talks to. Anything we do not own outright is shown on its own branch.",
        core: "Northwind app",
        branches: [
          { id: "n1", label: "Playback", color: "blue", note: null, link: null, leaves: [
            { id: "n1a", label: "HLS streaming", note: null, link: null },
            { id: "n1b", label: "Offline downloads", note: null, link: null },
            { id: "n1c", label: "AirPlay & Chromecast", note: null, link: null },
            { id: "n1d", label: "Subtitles", note: null, link: null },
          ] },
          { id: "n2", label: "Identity", color: "violet", note: null, link: null, leaves: [
            { id: "n2a", label: "Household profiles", note: null, link: null },
            { id: "n2b", label: "Sign-in with Apple", note: null, link: null },
          ] },
          { id: "n3", label: "Billing", color: "emerald", note: null, link: null, leaves: [
            { id: "n3a", label: "Stripe", note: null, link: null },
            { id: "n3b", label: "App Store IAP", note: null, link: null },
            { id: "n3c", label: "Play Billing", note: null, link: null },
          ] },
          { id: "n4", label: "Catalogue", color: "amber", note: null, link: null, leaves: [
            { id: "n4a", label: "Search index", note: null, link: null },
            { id: "n4b", label: "Editorial rails", note: null, link: null },
          ] },
          { id: "n5", label: "Analytics", color: "rose", note: null, link: null, leaves: [] },
        ],
        createdAt: atDays(-14),
        updatedAt: atDays(-2),
      },
      {
        id: "ib-bar",
        kind: "bar",
        title: "Where the build time went",
        caption: "Days of engineering time by area, across the first two phases.",
        unit: "d",
        points: [
          { id: "p1", label: "Playback", value: 34, color: "blue", note: null },
          { id: "p2", label: "Identity", value: 12, color: "violet", note: null },
          { id: "p3", label: "Billing", value: 21, color: "emerald", note: null },
          { id: "p4", label: "Catalogue", value: 16, color: "amber", note: null },
        ],
        createdAt: atDays(-10),
        updatedAt: atDays(-10),
      },
      {
        id: "ib-pie",
        kind: "pie",
        title: "Where people watch",
        caption: "Share of playback minutes by platform, last 30 days.",
        unit: null,
        points: [
          { id: "q1", label: "iOS", value: 46, color: "blue", note: null },
          { id: "q2", label: "Android", value: 31, color: "violet", note: null },
          { id: "q3", label: "Web", value: 17, color: "emerald", note: null },
          { id: "q4", label: "TV", value: 6, color: "amber", note: null },
        ],
        createdAt: atDays(-8),
        updatedAt: atDays(-8),
      },
      {
        id: "ib-venn",
        kind: "venn",
        title: "What each plan includes",
        caption: "Where the two paid tiers overlap, and what only one of them carries.",
        sets: [
          { key: "A", label: "Standard", color: "blue" },
          { key: "B", label: "Premium", color: "violet" },
        ],
        items: [
          { id: "v1", label: "Ad-free playback", region: "AB", note: null },
          { id: "v2", label: "Two profiles", region: "A", note: null },
          { id: "v3", label: "Six profiles", region: "B", note: null },
          { id: "v4", label: "4K & HDR", region: "B", note: null },
          { id: "v5", label: "Offline downloads", region: "AB", note: null },
        ],
        createdAt: atDays(-6),
        updatedAt: atDays(-6),
      },
    ],
  },
  blockers: [
    { taskId: "t-blocked-1", title: "Wire up the new search index", blockedReason: "We need the Algolia admin API key for the production index before we can cut over. Can you add it to the shared vault?", blockedAt: atDays(-2), category: "Search & discovery", blockedResponse: null, blockedResponseAt: null },
  ],
  updatedAt: atDays(0),
};

// ─── Client portal detail (ClientDetailRecord) ──────────────────────────────────
// The live "Wiki →" link lives on this page's header; the demo enters the wiki from here.

const demoClientDetail: ClientDetailRecord = {
  client: {
    id: WIKI_CLIENT.id,
    name: WIKI_CLIENT.name,
    slug: WIKI_CLIENT.slug,
    createdAt: atDays(-120),
    updatedAt: atDays(0),
    source: "MANUAL",
    status: "ACTIVE",
    // ClientListItem extras
    proposalCount: 2,
    googleDriveFolderUrl: "https://drive.google.com/drive/folders/demo-northwind",
    clickupUrl: null,
    hasCareClient: true,
    repoUrls: ["https://github.com/northwind/app"],
    devCount: 2,
    pulseHealthScore: 86,
    pulseScanId: "scan-northwind",
    health: { level: "green", reasons: ["No overdue tasks", "Pulse health 86"] },
    leadSource: null, leadStage: null, leadFollowUpAt: null, leadValue: null,
    leadValueCurrency: null, resumeAt: null, pauseNote: null,
    engagementType: null, endDate: null,
    // ClientDetailFields
    website: "https://northwind.co",
    addressLine1: "18 Rivington Street", addressLine2: null, city: "London",
    county: null, postcode: "EC2A 3DZ", country: "United Kingdom",
    notes: "Streaming platform — web + mobile. Phase 2 focus: search & analytics.",
    primaryContactName: "Priya Shah",
    primaryContactEmail: "priya@northwind.co",
    primaryContactPhone: "+44 20 7946 0102",
    invoiceEmail: null,
    slackChannelId: "C0NORTHWIND",
    slackInternalChannelId: "C0NORTHWIND", slackInternalChannelName: "northwind-internal",
    slackExternalChannelId: null, slackExternalChannelName: null, slackProvisionError: null,
    legalCompanyName: null, companyNumber: null, vatNumber: null,
    billingAddressLine1: null, billingAddressLine2: null, billingCity: null,
    billingCounty: null, billingPostcode: null, billingCountry: null,
    bank: null,
    onboardingId: null, retainerDays: null, retainerDaysUsed: null,
    productTeamUserIds: [],
  },
  lifecycle: [
    { id: "lc1", label: "Onboarded", detail: "Client created from onboarding", at: atDays(-120), status: "done" },
    { id: "lc2", label: "Kickoff", detail: "Phase 1 scoped", at: atDays(-112), status: "done" },
    { id: "lc3", label: "Beta launch", detail: "Scheduled", at: atDays(20), status: "waiting" },
  ],
  platforms: [
    {
      id: "pf1", clientId: WIKI_CLIENT.id, name: "Production web", platformType: "WEB",
      url: "https://app.northwind.co", stagingUrl: "https://staging.northwind.co",
      repoUrl: "https://github.com/northwind/app", hasUsername: false, hasPassword: false,
      logins: [], notes: null, previewImageUrl: null, featuredInWiki: true, links: [], renewsOn: atDays(9).slice(0, 10), renewalNote: "Domain (northwind.co)", createdAt: atDays(-110), updatedAt: atDays(-4),
    },
    {
      id: "pf2", clientId: WIKI_CLIENT.id, name: "iOS app", platformType: "IOS",
      url: "https://apps.apple.com/app/northwind", stagingUrl: null,
      repoUrl: "https://github.com/northwind/ios", hasUsername: false, hasPassword: false,
      logins: [], notes: null, previewImageUrl: null, featuredInWiki: false, links: [], renewsOn: null, renewalNote: null, createdAt: atDays(-90), updatedAt: atDays(-9),
    },
  ],
  designs: [
    {
      id: "ds1", clientId: WIKI_CLIENT.id, name: "Northwind — Figma", url: "https://figma.com/file/demo",
      notes: "Design system + screens", previewImageUrl: null, createdAt: atDays(-100), updatedAt: atDays(-7),
    },
  ],
  proposals: [
    { id: "pr1", title: "Northwind — Phase 2 SOW", clientName: WIKI_CLIENT.name, status: "ACCEPTED", updatedAt: atDays(-30), documentType: "SOW", documentNumber: "SOW-024", sectionCount: 8 },
    { id: "pr2", title: "Analytics dashboard proposal", clientName: WIKI_CLIENT.name, status: "SENT", updatedAt: atDays(-6), documentType: "PROPOSAL", documentNumber: "PRO-041", sectionCount: 6 },
  ],
  proofDocuments: [],
  documentLinks: [
    { id: "dl1", clientId: WIKI_CLIENT.id, name: "Brand guidelines (Google Doc)", url: "https://docs.google.com/document/d/demo-northwind-brand", notes: "Logo, colour, tone", createdAt: atDays(-88), updatedAt: atDays(-20) },
    { id: "dl2", clientId: WIKI_CLIENT.id, name: "Phase 2 spec (Notion)", url: "https://www.notion.so/demo-northwind-phase-2", notes: null, createdAt: atDays(-40), updatedAt: atDays(-8) },
  ],
  pulseScans: [
    { id: "scan-northwind", projectName: "northwind.co", healthScore: 86, status: "COMPLETED", createdAt: atDays(-5) },
  ],
  supportClient: { id: "sc1", name: WIKI_CLIENT.name, slug: WIKI_CLIENT.slug },
  placements: [
    { id: "pl1", candidateId: "cand1", candidateName: "Alex Rivera", clientName: WIKI_CLIENT.name, projectName: "Northwind web", startDate: atDays(-110), endDate: null, allocationPercent: 100, notes: null, updatedAt: atDays(-3) },
    { id: "pl2", candidateId: "cand2", candidateName: "Marco Bianchi", clientName: WIKI_CLIENT.name, projectName: "Northwind mobile", startDate: atDays(-70), endDate: null, allocationPercent: 60, notes: null, updatedAt: atDays(-3) },
  ],
  studies: [],
  touchpoints: [],
};

// Scribe — dummy meeting notes for the client detail's "Meeting notes" panel.
const demoClientMeetings = {
  calendarConnected: true,
  candidates: [],
  query: null,
  meetings: [
    {
      id: "mtg1",
      clientId: WIKI_CLIENT.id,
      calendarEventId: "ev-north-1",
      meetingCode: "abc-defg-hij",
      conferenceRecordName: null,
      title: "Northwind × Gitwork — Sprint planning",
      startedAt: atDays(-1),
      endedAt: atDays(-1),
      attendees: ["priya@northwind.co", "alex@gitwork.co.uk", "marco@gitwork.co.uk"],
      status: "SUMMARISED",
      summary:
        "Reviewed sprint progress. Search & discovery is on track for beta; the webhook retry work needs one more day. Agreed to prioritise the analytics endpoint next so the client dashboard can go live alongside beta.",
      decisions: [
        "Ship search behind a feature flag for the beta cohort first.",
        "Analytics endpoint moves ahead of mobile polish in priority.",
      ],
      modelUsed: "gemini",
      createdAt: atDays(-1),
      updatedAt: atDays(-1),
      actionItems: [
        { id: "ai-1", title: "Send Priya the updated webhook flow diagram", text: "Send Priya the updated webhook flow diagram after standup.", owner: "Alex Rivera", done: false, taskId: null },
        { id: "ai-2", title: "Spec the rounds-played analytics endpoint", text: "Write a short spec for the analytics endpoint and share for review.", owner: "Marco Bianchi", done: false, taskId: null },
      ],
    },
    {
      id: "mtg2",
      clientId: WIKI_CLIENT.id,
      calendarEventId: "ev-north-2",
      meetingCode: "klm-nopq-rst",
      conferenceRecordName: null,
      title: "Northwind — Design review",
      startedAt: atDays(-4),
      endedAt: atDays(-4),
      attendees: ["priya@northwind.co", "marco@gitwork.co.uk"],
      status: "SUMMARISED",
      summary:
        "Walked through the new browse and search screens. Client happy with the direction; minor tweaks to the filter chips and empty states. Dark-mode audit to follow.",
      decisions: ["Adopt the new filter-chip pattern across the app.", "Empty states get an illustration + a primary action."],
      modelUsed: "gemini",
      createdAt: atDays(-4),
      updatedAt: atDays(-4),
      actionItems: [
        { id: "ai-3", title: "Apply filter-chip tweaks", text: "Update the filter chips per the review notes.", owner: "Marco Bianchi", done: true, taskId: null },
      ],
    },
    {
      id: "mtg3",
      clientId: WIKI_CLIENT.id,
      calendarEventId: "ev-north-3",
      meetingCode: "uvw-xyz-123",
      conferenceRecordName: null,
      title: "Northwind — Weekly sync",
      startedAt: atDays(-8),
      endedAt: atDays(-8),
      attendees: ["priya@northwind.co", "ops@northwind.co", "alex@gitwork.co.uk"],
      status: "SUMMARISED",
      summary:
        "Status update across all workstreams. Foundations complete; search & discovery is the current focus after a scope change. No blockers.",
      decisions: ["Weekly syncs move to Thursdays."],
      modelUsed: "gemini",
      createdAt: atDays(-8),
      updatedAt: atDays(-8),
      actionItems: [],
    },
  ],
};
const demoSlackActivity = {
  configured: true,
  channelName: "northwind-internal",
  summary: null,
  generatedAt: null,
  reason: "ok",
  messages: [
    { id: "sa1", author: "Priya", text: "Deploy to staging looks good ✅", ts: atDays(0) },
    { id: "sa2", author: "Tom", text: "Search index rebuilt overnight — much faster.", ts: atDays(0) },
    // Tom twice, so the per-dev grouping has something to collapse, and an
    // unresolved author, so the "unattributed" label is actually exercised — a
    // fixture where every author is distinct and named cannot show either.
    { id: "sa3", author: "Tom", text: "Older note nobody should see as the latest.", ts: atDays(-3) },
    { id: "sa4", author: "Teammate", text: "Bumped the staging cert.", ts: atDays(-1) },
  ],
};


// ─── Docs (dev-visible document types only: HANDOVER / REPORT / BRIEF / OTHER) ────

const demoProposals = {
  proposals: [
    { id: "d1", title: "Northwind — API handover", clientName: "Northwind Studio", status: "ACCEPTED", updatedAt: atDays(-2), documentType: "HANDOVER", documentNumber: "HAND-014", ownerName: "Alex Rivera", sectionCount: 7 },
    { id: "d2", title: "Cadenza — Sprint 8 report", clientName: "Cadenza", status: "SENT", updatedAt: atDays(-1), documentType: "REPORT", documentNumber: "REP-032", ownerName: "Alex Rivera", sectionCount: 5 },
    { id: "d3", title: "Fairway Nine — Booking integration brief", clientName: "Fairway Nine", status: "DRAFT", updatedAt: atDays(0), documentType: "BRIEF", documentNumber: "BRF-021", ownerName: "Marco Bianchi", sectionCount: 4 },
    { id: "d4", title: "Northwind — Search rollout report", clientName: "Northwind Studio", status: "APPROVED", updatedAt: atDays(-6), documentType: "REPORT", documentNumber: "REP-031", ownerName: "Alex Rivera", sectionCount: 6 },
    { id: "d5", title: "Cadenza — Component library handover", clientName: "Cadenza", status: "IN_REVIEW", updatedAt: atDays(-3), documentType: "HANDOVER", documentNumber: "HAND-013", ownerName: "Marco Bianchi", sectionCount: 9 },
    { id: "d6", title: "Fairway Nine — Data export notes", clientName: "Fairway Nine", status: "DRAFT", updatedAt: atDays(-4), documentType: "OTHER", documentNumber: null, ownerName: "Alex Rivera", sectionCount: 3 },
  ],
};

/** Build a full, renderable document (for the Docs preview) from a list item.
 *  Uses only non-financial section types (dev docs: handovers/reports/briefs/notes). */
// A cover section for the demo docs (real docs always have one; the demo omitted it, so the
// builder/preview/present never showed the themed cover). sortOrder -1 keeps it first.
function demoCoverSection(item: (typeof demoProposals.proposals)[number]) {
  const label = (item.documentType ?? "DOCUMENT").replace(/_/g, " ");
  return {
    key: "cover",
    title: "Cover",
    sortOrder: -1,
    isVisible: true,
    data: {
      proposalTitle: item.title.replace(/^.*—\s*/, "").trim() || item.title,
      productName: item.clientName,
      clientName: item.clientName,
      subtitle: label,
      date: item.updatedAt,
      confidentiality: "Confidential. Prepared for the client named above.",
      confidentialityMode: "EXTERNAL",
      coverStyle: "light",
      brandLockup: "GITWORK",
    },
  };
}

/** Realistic, type-aware section sets for the demo docs (report / brief / handover / notes). */
function demoSectionsFor(item: (typeof demoProposals.proposals)[number]) {
  const topic = item.title.replace(/^.*—\s*/, "").trim() || item.title;
  const client = item.clientName;
  const cover = demoCoverSection(item);

  if (item.documentType === "REPORT") {
    return [
      cover,
      { key: "introduction", title: "Overview", sortOrder: 0, isVisible: true, data: {
        statement: `${topic} — what shipped, the numbers behind it, and what's next for ${client}.`,
        summary: "Prepared for the weekly delivery review. Figures come straight from the board and product analytics for the reporting period.", graphic: "" } },
      { key: "kpi_strip", title: "At a glance", sortOrder: 1, isVisible: true, data: { items: [
        { value: "14", label: "Shipped", context: "merged this period" },
        { value: "92%", label: "Sprint goal", context: "of planned scope" },
        { value: "2.1d", label: "Cycle time", context: "down from 2.8d" },
        { value: "0", label: "Regressions", context: "in production" } ] } },
      { key: "heading", title: "What shipped", sortOrder: 2, isVisible: true, data: { eyebrow: "Delivery", text: "What shipped", level: 2 } },
      { key: "prose", title: "Highlights", sortOrder: 3, isVisible: true, data: { content:
        `The headline work this period:\n\n- **Core flow live** — ${topic} is in production behind a feature flag, rolled out to 20% of traffic.\n- **Performance** — trimmed the slowest endpoint from 940ms to 210ms p95 by adding the missing index and caching the hot read.\n- **Instrumentation** — every step now emits an event, so we can see drop-off in the funnel rather than guessing.\n\nNothing slipped that affected the client-facing date.` } },
      { key: "data_table", title: "Metrics", sortOrder: 4, isVisible: true, data: {
        columns: ["Metric", "This period", "Last period", "Δ"], rows: [
          ["Velocity (pts)", "42", "38", "+4"],
          ["Cycle time (days)", "2.1", "2.8", "−0.7"],
          ["Review turnaround", "4h", "7h", "−3h"],
          ["Escaped defects", "0", "2", "−2"] ] } },
      { key: "callout", title: "Highlight", sortOrder: 5, isVisible: true, data: { tone: "info", headline: "Ahead on the launch metric",
        body: `Early data on ${topic} is beating the target we set at kick-off — conversion on the new flow is up 11% against the old one. We'll hold the flag at 20% for another week before widening.` } },
      { key: "heading", title: "Next", sortOrder: 6, isVisible: true, data: { eyebrow: "Looking ahead", text: "What's next", level: 2 } },
      { key: "checklist", title: "Planned next", sortOrder: 7, isVisible: true, data: { polarity: "INCLUDE",
        intro: "Top of the backlog for the next period:", items: [
          "Widen the rollout to 100% once the week-long soak is clean",
          "Add the two edge-case states surfaced in QA",
          "Backfill the analytics dashboard so the client can self-serve these numbers" ] } },
      { key: "cta_next_steps", title: "Questions", sortOrder: 8, isVisible: true, data: {
        headline: "Questions on this report?", body: "Reply in the client channel or raise it at the next review — happy to dig into any number here." } },
    ];
  }

  if (item.documentType === "BRIEF") {
    return [
      cover,
      { key: "introduction", title: "Overview", sortOrder: 0, isVisible: true, data: {
        statement: `A short brief scoping ${topic} for ${client} — the outcome we're after, how we'll approach it, and what's in and out of scope.`,
        summary: "Written to get everyone aligned before we start, and to give the client a single page to sign off.", graphic: "" } },
      { key: "objectives", title: "Goals", sortOrder: 1, isVisible: true, data: { items: [
        { id: "g1", title: "One booking, no double-entry", description: "A booking made anywhere is reflected everywhere within seconds.", icon: "bolt" },
        { id: "g2", title: "No overbooking", description: "Availability is authoritative — the integration can never sell the same slot twice.", icon: "shield" },
        { id: "g3", title: "Operable by the client", description: "Failures are visible and recoverable without a call to us.", icon: "cog" } ] } },
      { key: "heading", title: "Approach", sortOrder: 2, isVisible: true, data: { eyebrow: "How we'll work", text: "Approach", level: 2 } },
      { key: "process_steps", title: "Plan", sortOrder: 3, isVisible: true, data: {
        steps: [{ label: "Discovery" }, { label: "Contract & mapping" }, { label: "Build" }, { label: "Integration test" }, { label: "Launch" }],
        highlightLast: true, arrows: true, layout: "row" } },
      { key: "prose", title: "Scope & constraints", sortOrder: 4, isVisible: true, data: { content:
        `We'll integrate against the existing provider API rather than build a booking engine from scratch — faster to ship and less to maintain.\n\n**Constraints**\n\n- The provider rate-limits to 600 req/min, so sync is event-driven, not polled.\n- Historical bookings before go-live are out of scope for the first release.\n- All times are stored in UTC and rendered in the venue's local zone.` } },
      { key: "callout", title: "Dependency", sortOrder: 5, isVisible: true, data: { tone: "warning", headline: "One dependency to unblock",
        body: "We need production API credentials and a webhook endpoint allow-listed by the provider before build starts. That's the critical-path item — everything else can proceed in parallel." } },
      { key: "checklist", title: "In scope", sortOrder: 6, isVisible: true, data: { polarity: "INCLUDE",
        intro: "This release covers:", items: [
          "Two-way availability + booking sync",
          "Webhook ingestion with signature verification",
          "A reconciliation job that catches missed events",
          "An admin view of sync health" ] } },
      { key: "cta_next_steps", title: "Sign-off", sortOrder: 7, isVisible: true, data: {
        headline: "Happy with this?", body: "Approve the brief in-page and we'll book discovery for early next week." } },
    ];
  }

  if (item.documentType === "HANDOVER") {
    return [
      cover,
      { key: "introduction", title: "Overview", sortOrder: 0, isVisible: true, data: {
        statement: `This handover covers everything the ${client} team needs to own ${topic} without a call.`,
        summary: "Structured so a new engineer can get productive on day one — how it's built, how to run it, and where the sharp edges are.", graphic: "" } },
      { key: "heading", title: "What's included", sortOrder: 1, isVisible: true, data: { eyebrow: "Contents", text: "What's included", level: 2 } },
      { key: "objectives", title: "Contents", sortOrder: 2, isVisible: true, data: { items: [
        { id: "c1", title: "Architecture & setup", description: "How the pieces fit together and how to run it locally.", icon: "bolt" },
        { id: "c2", title: "Usage & conventions", description: "How to consume it, and the patterns to follow.", icon: "shield" },
        { id: "c3", title: "Operations", description: "Publishing, versioning, and what to do when something breaks.", icon: "cog" } ] } },
      { key: "prose", title: "How it's structured", sortOrder: 3, isVisible: true, data: { content:
        `Everything lives in one monorepo package, published to your private registry on every tagged release.\n\n- **Tokens** are the source of truth — colours, spacing and type scale are generated, never hand-edited.\n- **Components** are documented in Storybook; each has usage notes and do/don't examples.\n- **Versioning** is semver: a breaking prop change is a major bump, additive props are minor.` } },
      { key: "data_table", title: "Component inventory", sortOrder: 4, isVisible: true, data: {
        columns: ["Component", "Status", "Storybook", "Notes"], rows: [
          ["Button", "Stable", "✓", "5 variants, icon slots"],
          ["Input / Field", "Stable", "✓", "Includes validation states"],
          ["Modal", "Stable", "✓", "Focus-trapped, ESC to close"],
          ["DataTable", "Beta", "✓", "Sorting done, virtualisation pending"],
          ["DatePicker", "Beta", "partial", "Range mode still in review"] ] } },
      { key: "callout", title: "Note", sortOrder: 5, isVisible: true, data: { tone: "info", headline: "Two components are still Beta",
        body: "DataTable and DatePicker are usable and in production, but their props may still change before 1.0 — pin the version if you depend on them." } },
      { key: "checklist", title: "Handover checklist", sortOrder: 6, isVisible: true, data: { polarity: "INCLUDE",
        intro: "Before we close this out:", items: [
          "Registry access granted to your team",
          "Storybook deployed and linked in the README",
          "CI publishing pipeline handed over",
          "Figma library shared with edit access" ] } },
      { key: "faq", title: "FAQ", sortOrder: 7, isVisible: true, data: { intro: "The things people ask first.", items: [
        { question: "How do I upgrade safely?", answer: "Read the CHANGELOG for the target version, bump, and run the visual-regression suite in Storybook before merging." },
        { question: "Can I override a token?", answer: "At the theme level, yes. Per-component overrides are discouraged — raise it and we'll add a variant instead." } ] } },
      { key: "cta_next_steps", title: "Questions", sortOrder: 8, isVisible: true, data: {
        headline: "Questions after today?", body: "Post in the shared channel — this doc stays the source of truth and is kept up to date." } },
    ];
  }

  // OTHER — lightweight working notes.
  return [
    cover,
    { key: "introduction", title: "Overview", sortOrder: 0, isVisible: true, data: {
      statement: `Working notes on ${topic} for ${client} — a reference, not a formal deliverable.`,
      summary: "Captured so the next person doesn't have to rediscover any of this.", graphic: "" } },
    { key: "prose", title: "Notes", sortOrder: 1, isVisible: true, data: { content:
      `The export runs nightly at 02:00 UTC and drops a CSV per table into the client's SFTP.\n\n- Files are named \`{table}_{YYYYMMDD}.csv\` and gzipped.\n- A manifest file lists row counts so the client can verify a complete transfer.\n- Failed runs alert the on-call channel and retry once after 30 minutes.` } },
    { key: "data_table", title: "Exported fields", sortOrder: 2, isVisible: true, data: {
      columns: ["Field", "Type", "Notes"], rows: [
        ["id", "uuid", "Stable primary key"],
        ["created_at", "timestamp", "ISO-8601, UTC"],
        ["status", "enum", "One of: active, paused, closed"],
        ["amount_cents", "integer", "Minor units — divide by 100"] ] } },
    { key: "callout", title: "Note", sortOrder: 3, isVisible: true, data: { tone: "info", headline: "PII is excluded by design",
      body: "The export deliberately omits email and payment details. If the client needs those, it's a separate, access-reviewed feed — don't add columns here." } },
    { key: "cta_next_steps", title: "Questions", sortOrder: 4, isVisible: true, data: {
      headline: "Need a field added?", body: "Raise it in the channel — changes to the export schema go through a quick review first." } },
  ];
}

function buildDemoDoc(item: (typeof demoProposals.proposals)[number]) {
  return {
    id: item.id,
    workspaceId: "demo-ws",
    ownerId: "demo-dev",
    documentType: item.documentType,
    status: item.status,
    title: item.title,
    clientName: item.clientName,
    clientId: null,
    version: "v1.0",
    documentNumber: item.documentNumber ?? null,
    isShared: true,
    labels: [],
    metadata: { client: item.clientName, owner: item.ownerName ?? "Alex Rivera", version: "v1.0", productSignOff: false, techSignOff: false, approvalChecked: false },
    exportSettings: {},
    updatedAt: item.updatedAt,
    createdAt: atDays(-30),
    sections: demoSectionsFor(item),
    costLineItems: [],
    timelinePhases: [],
    assets: [],
    links: [],
    ctas: [],
  };
}

/** A full, realistic API-handover document (the demo's flagship doc). */
function buildApiHandoverDoc(item: (typeof demoProposals.proposals)[number]) {
  return {
    id: item.id,
    workspaceId: "demo-ws",
    ownerId: "demo-dev",
    documentType: item.documentType,
    status: item.status,
    title: item.title,
    clientName: item.clientName,
    clientId: null,
    version: "v1.0",
    documentNumber: item.documentNumber ?? "HAND-014",
    isShared: true,
    labels: ["api", "handover"],
    metadata: { client: item.clientName, owner: item.ownerName ?? "Alex Rivera", version: "v1.0", productSignOff: true, techSignOff: true, approvalChecked: true },
    exportSettings: {},
    updatedAt: item.updatedAt,
    createdAt: atDays(-14),
    sections: [
      demoCoverSection(item),
      {
        key: "introduction", title: "Overview", description: "What this document covers.", sortOrder: 0, isVisible: true,
        data: {
          statement: "This document hands over the Northwind public API — everything your team needs to run against it, integrate with it, and operate it without a call.",
          summary: "It covers environments, authentication, the core endpoints, webhooks, rate limits and the common gotchas, plus a handover checklist.",
          graphic: "",
        },
      },
      {
        key: "heading", title: "Getting started", sortOrder: 1, isVisible: true,
        data: { eyebrow: "Reference", text: "Getting started", level: 2 },
      },
      {
        id: "sec-base-urls", key: "prose", title: "Base URLs & environments", sortOrder: 2, isVisible: true,
        data: {
          content:
            "The API is versioned under `/v1`. There are two environments:\n\n- **Production** — `https://api.northwind.co/v1`\n- **Staging** — `https://api.staging.northwind.co/v1`\n\nAll requests and responses are JSON (`Content-Type: application/json`). Timestamps are ISO-8601 in UTC. Use **staging** for integration testing — it's reset nightly and safe to hammer.",
        },
      },
      {
        id: "sec-auth", key: "prose", title: "Authentication", sortOrder: 3, isVisible: true,
        data: {
          content:
            "Authenticate with a **bearer token** in the `Authorization` header:\n\n`Authorization: Bearer nw_live_xxx`\n\nTokens are issued per-integration from the Northwind dashboard (Settings → API keys). Live keys are prefixed `nw_live_`, test keys `nw_test_`. **Never** ship a live key in a mobile or web client — proxy through your backend.",
        },
      },
      {
        key: "callout", title: "Rate limits", sortOrder: 4, isVisible: true,
        data: {
          tone: "info",
          headline: "Rate limits",
          body: "600 requests/min per token. When you exceed it you'll get a 429 with a Retry-After header (seconds) — back off and retry. Bulk reads should page rather than poll tightly.",
        },
      },
      {
        id: "sec-endpoints", key: "prose", title: "Core endpoints", sortOrder: 5, isVisible: true,
        data: {
          content:
            "The resources you'll use most:\n\n- `GET /v1/titles` — list catalogue titles (paginated, `?cursor=` + `?limit=`)\n- `GET /v1/titles/{id}` — a single title with credits and artwork\n- `GET /v1/collections` — curated rails (New releases, Because you watched…)\n- `GET /v1/search?q=` — full-text search across titles, people and collections\n- `POST /v1/watch-events` — record a playback position (powers continue-watching)\n\nList endpoints are **cursor-paginated**: follow `next_cursor` until it's null.",
        },
      },
      {
        id: "sec-webhooks", key: "prose", title: "Webhooks", sortOrder: 6, isVisible: true,
        data: {
          content:
            "Subscribe to events in the dashboard. We POST a signed JSON payload to your endpoint:\n\n- `title.published` · `title.updated` · `title.removed`\n- `collection.updated`\n\nEvery delivery includes an `X-Northwind-Signature` header (HMAC-SHA256 of the raw body with your signing secret) — **verify it** before trusting the payload. We retry failed deliveries with exponential backoff for 24h.",
        },
      },
      {
        key: "faq", title: "Gotchas & FAQ", sortOrder: 7, isVisible: true,
        data: {
          intro: "The things that trip people up.",
          items: [
            { question: "Why am I getting 404s on staging for a title that exists in prod?", answer: "Staging is reset nightly from a curated subset — not every prod title exists there. Use the staging catalogue for test IDs." },
            { question: "How do I handle a 429?", answer: "Read the Retry-After header (seconds) and retry after that delay. Don't retry immediately in a tight loop." },
            { question: "Webhook signatures don't match — why?", answer: "You must HMAC the RAW request body, before any JSON parsing/re-serialisation. Re-serialised bodies change whitespace and break the signature." },
            { question: "Are IDs stable?", answer: "Yes — title and collection IDs are stable and safe to store. Slugs can change, so key off IDs." },
          ],
        },
      },
      {
        id: "sec-checklist", key: "prose", title: "Handover checklist", sortOrder: 8, isVisible: true,
        data: {
          content:
            "Before we close this out, confirm:\n\n- [x] Staging API key issued to your team\n- [x] Postman collection shared in **#northwind-dev**\n- [x] Webhook endpoint registered + signature verification tested\n- [ ] Production key issued (on go-live)\n- [ ] On-call rota confirmed for launch week",
        },
      },
      {
        key: "parties", title: "The parties", sortOrder: 8.5, isVisible: true,
        data: {
          intro: "This handover is made between:",
          parties: [
            { id: "pty-1", name: "Gitwork Group Ltd", role: "Supplier", organization: "Gitwork Group Ltd", email: "accounts@gitwork.co.uk", signatureRequired: true },
            { id: "pty-2", name: "Northwind Studio", role: "Client", organization: "Northwind Studio Ltd", email: "ops@northwind.co", signatureRequired: true },
            { id: "pty-3", name: "Priya Raman", role: "Technical contact", organization: "In a personal capacity", email: "priya@northwind.co", signatureRequired: false },
          ],
        },
      },
      {
        key: "signatures", title: "Sign-off", sortOrder: 9, isVisible: true,
        data: {
          intro: "Each person signing below confirms they are authorised to sign in the capacity shown.",
          note: "This document may be signed electronically. An electronic signature applied through a recognised signing platform has the same effect as a wet ink signature. Once all parties have signed, each party should keep a copy.",
          blocks: [
            { id: "sig-1", partyName: GITWORK.legalName, signatoryName: "Alex Rivera", signatoryRole: "Delivery Lead", signatoryEmail: "", signatureDate: "", details: [`Company no. ${GITWORK.companyNumber}`, "Salford Quays, Manchester"] },
            { id: "sig-2", partyName: "Northwind Studio", signatoryName: "", signatoryRole: "Head of Product", signatoryEmail: "", signatureDate: "", details: ["Company no. 09183477", "Shoreditch, London"] },
            { id: "sig-3", partyName: "Priya Raman", signatoryName: "", signatoryRole: "", signatoryEmail: "", signatureDate: "", personal: true, details: ["In her personal capacity, as technical contact"] },
          ],
        },
      },
      {
        key: "cta_next_steps", title: "Handover complete", sortOrder: 10, isVisible: true,
        data: {
          headline: "Questions after today?",
          body: "Post in #northwind-dev or ping Alex Rivera — this doc stays the source of truth and is kept up to date.",
        },
      },
    ],
    costLineItems: [],
    timelinePhases: [],
    assets: [],
    links: [],
    ctas: [],
  };
}

const demoDocsById: Record<string, unknown> = Object.fromEntries(
  demoProposals.proposals.map((p) => {
    const doc = p.id === "d1" ? buildApiHandoverDoc(p) : buildDemoDoc(p);
    // The editor's outline + scroll-spy key off each section's id (section.id ?? section.key).
    // These demo section literals omit ids, so a doc with several same-key blocks (e.g. multiple
    // `prose`) would collide on "prose" and all highlight/track together. Give each section a
    // unique id here. (Live docs always carry unique DB ids, so this only affects the demo.)
    if (doc && typeof doc === "object" && Array.isArray((doc as { sections?: unknown }).sections)) {
      const d = doc as { sections: Array<Record<string, unknown>> };
      d.sections = d.sections.map((s, i) => ({ id: `${p.id}-s${i}-${String(s.key)}`, ...s }));
    }
    return [p.id, doc];
  }),
);

/** Full renderable document for the Docs preview page, by id (falls back to d1). */
export function getDemoDoc(id: string): unknown {
  return demoDocsById[id] ?? demoDocsById["d1"] ?? null;
}

/** Collab snapshot stub for the doc editor (`/api/documents/{id}/snapshot`). */
function demoDocSnapshot(id: string): unknown {
  const doc = demoDocsById[id] as { title?: string; documentType?: string; documentNumber?: string | null } | undefined;
  return {
    document: { id, title: doc?.title ?? "Document", documentType: doc?.documentType ?? "HANDOVER", documentNumber: doc?.documentNumber ?? null },
    comments: [],
    versions: [],
    presence: [],
    relations: { parent: null, children: [] },
    activity: [],
    summary: { totalViews: 0, lastViewedAt: null, totalComments: 0, totalVersions: 0, activeEditors: 0 },
  };
}

// ─── Tasks: feature blocks + milestones (per-client tasks page) ──────────────────

const demoFeatureBlocks = demoGanttBlocks.map((b, i) => ({
  id: b.id,
  clientId: WIKI_CLIENT.id,
  name: b.name,
  description: null,
  startDate: b.startDate,
  endDate: b.endDate,
  orderKey: (i + 1) * 100,
  color: b.color ?? null,
  taskCount: b.tasks.length,
  doneCount: b.tasks.filter((t) => t.done).length,
  progress: b.progress,
}));

const demoMilestones = demoGanttMilestones.map((m) => ({
  id: m.id,
  clientId: WIKI_CLIENT.id,
  name: m.name,
  date: m.date,
  description: null,
  color: m.color ?? null,
}));

// ─── Care (support triage) ───────────────────────────────────────────────────────

const demoSupportClients = {
  clients: [
    { id: "sup-northwind", name: "Northwind Studio", slug: "northwind", status: "active", unreadCount: 3, supportDaysPerMonth: 5, supportDaysUsed: 2 },
    { id: "sup-cadenza", name: "Cadenza", slug: "cadenza", status: "active", unreadCount: 1, supportDaysPerMonth: 3, supportDaysUsed: 1 },
  ],
};

/**
 * The Care demo used to answer `{ messages: [] }`, `{ members: [] }`, `{ connections: [] }` and
 * `{ notes: [] }` for every request — so the whole record side of the module was unreachable: no
 * transcript, no assignee options, no send path, no notes. That made it a poor sales demo AND a
 * useless verification surface for the one screen that most needed rendering, since `/app/care` is
 * auth-gated with no staging.
 *
 * Threads are written as real support exchanges (an inbound, our reply, a follow-up) so the
 * transcript, the Replied state and the reply gating all have something true to render.
 */
const demoSupportMembers = [
  { id: "sup-m1", name: "Harry Beckett", email: "harry@example.com" },
  { id: "sup-m2", name: "Sian Lloyd", email: "sian@example.com" },
  { id: "sup-m3", name: "Alex Rivera", email: "alex@example.com" },
];

/**
 * One connection per source the fixtures use, so `canSend` and "Open in channel" both resolve.
 *
 * ⚠️ Deliberately NOT one per source: there is no `gmail` connection, while `cv2` and `cv4` are
 * gmail conversations. That is the real Fellas shape — a Gmail connector replaced by IMAP, its
 * conversations left behind — and it is what the channel filter has to survive. Built from
 * connections alone the dropdown loses "Gmail" while gmail rows stay in the table, visible and
 * unfilterable; built from the union it does not.
 */
const demoSupportConnections = [
  { id: "sup-cn1", clientId: "sup-northwind", source: "imap", status: "connected", label: "support@northwind.co", scraperConfig: {}, lastSyncedAt: atDays(0) },
  { id: "sup-cn2", clientId: "sup-northwind", source: "discord", status: "connected", label: "Northwind community", scraperConfig: {}, lastSyncedAt: atDays(0) },
  { id: "sup-cn3", clientId: "sup-northwind", source: "app_reviews", status: "connected", label: "App Store · Northwind", scraperConfig: {}, lastSyncedAt: atDays(0) },
];

const demoMessagesByConversation: Record<string, unknown[]> = {
  cv1: [
    { id: "msg-1a", conversationId: "cv1", direction: "inbound", authorLabel: "App Store · ★★☆☆☆", body: "Love the app but search takes ages on my iPhone 11 — anything over about 200 saved items and it hangs for four or five seconds before the results come in. Everything else feels quick, it's just search.", createdAt: atDays(0) },
  ],
  cv2: [
    { id: "msg-2a", conversationId: "cv2", direction: "inbound", authorLabel: "priya@northwind.co", body: "Hi — a few of our users have asked about a dark mode, mostly the ones on the shop floor doing evening shifts. Is that something on the roadmap, or should we look at a workaround on our side?\n\nThanks,\nPriya", createdAt: atDays(-1) },
    { id: "msg-2b", conversationId: "cv2", direction: "outbound", authorLabel: "Gitwork Support", body: "Hi Priya,\n\nIt is on the roadmap — the token work behind it landed last month, so what's left is the switch itself rather than a re-theme. Realistically that puts it in the next release cycle rather than this one.\n\nIn the meantime the app follows the OS setting on iOS 17+, so anyone on a recent phone can get most of the way there today.\n\nI'll come back to you the moment it has a date.\n\nBest,\nHarry", createdAt: atDays(0) },
  ],
  cv3: [
    { id: "msg-3a", conversationId: "cv3", direction: "inbound", authorLabel: "@dev_sam", body: "The retry section of the webhook docs doesn't say what the backoff actually is. Is it fixed-interval or exponential, and how many attempts before you give up? We're deciding whether we need our own queue in front of it.", createdAt: atDays(-1) },
  ],
  cv4: [
    { id: "msg-4a", conversationId: "cv4", direction: "inbound", authorLabel: "ops@northwind.co", body: "The download bug is gone — appreciate the fast turnaround.", createdAt: atDays(-3) },
    { id: "msg-4b", conversationId: "cv4", direction: "outbound", authorLabel: "Gitwork Support", body: "Glad to hear it, and thanks for the clear report — the stack trace you attached is what made it a ten-minute fix rather than an afternoon.\n\nClosing this off, but reopen it any time if it resurfaces.", createdAt: atDays(-2) },
  ],
  cv5: [
    { id: "msg-5a", conversationId: "cv5", direction: "inbound", authorLabel: "u/cadenza_fan", body: "Would be great to share a playlist with friends without exporting it first. Even a read-only link would do — right now I screenshot the list and send that, which is obviously daft.", createdAt: atDays(0) },
  ],
  cv6: [
    { id: "msg-6a", conversationId: "cv6", direction: "inbound", authorLabel: "YT comment", body: "App crashes when I open settings on my Pixel. Android 12, latest version from the Play Store. Happens every time, straight after the settings screen starts to animate in.", createdAt: atDays(-1) },
  ],
};

const demoNotesByConversation: Record<string, unknown[]> = {
  cv2: [
    { id: "note-2a", conversationId: "cv2", authorId: "sup-m1", body: "Dark mode is behind the token refactor — do not promise a date until design sign-off.", createdAt: atDays(-1) },
  ],
  cv6: [
    { id: "note-6a", conversationId: "cv6", authorId: "sup-m2", body: "Third Pixel crash report this week. Grouping them before we raise it.", createdAt: atDays(-1) },
    { id: "note-6b", conversationId: "cv6", authorId: "sup-m1", body: "Reproduced on a Pixel 6 — it's the settings transition, not settings itself.", createdAt: atDays(0) },
  ],
};

const demoConversationsByClient: Record<string, unknown[]> = {
  "sup-northwind": [
    { id: "cv1", clientId: "sup-northwind", source: "app_reviews", customerLabel: "App Store · ★★☆☆☆", subject: "Search is slow on older phones", preview: "Love the app but search takes ages on my iPhone 11…", receivedAt: atDays(0), unread: true, tags: ["performance"], sentiment: "negative", status: "new", priority: "high", issueType: "Bug", noteCount: 0 , lastInboundAt: atDays(0), lastOutboundAt: undefined, lastMessageAt: atDays(0), replyState: "awaiting_reply" },
    { id: "cv2", clientId: "sup-northwind", source: "gmail", customerLabel: "priya@northwind.co", subject: "Can we add a dark theme?", preview: "A few users have asked about a dark mode…", receivedAt: atDays(0), unread: true, tags: ["feature-request"], sentiment: "neutral", status: "open", priority: "normal", noteCount: 1, assigneeId: "sup-m1", lastInboundAt: atDays(-1), lastOutboundAt: atDays(0), lastMessageAt: atDays(0), replyState: "replied" },
    { id: "cv3", clientId: "sup-northwind", source: "discord", customerLabel: "@dev_sam", subject: "Webhook docs unclear", preview: "The retry section doesn't say what the backoff is…", receivedAt: atDays(-1), unread: true, tags: ["docs"], sentiment: "neutral", status: "open", priority: "low", noteCount: 0 , lastInboundAt: atDays(-1), lastOutboundAt: undefined, lastMessageAt: atDays(-1), replyState: "awaiting_reply" },
    { id: "cv4", clientId: "sup-northwind", source: "gmail", customerLabel: "ops@northwind.co", subject: "Thanks for the quick fix!", preview: "The download bug is gone — appreciate the fast turnaround.", receivedAt: atDays(-2), unread: false, tags: [], sentiment: "positive", status: "closed", priority: "normal", closedAt: atDays(-2), noteCount: 0 , lastInboundAt: atDays(-3), lastOutboundAt: atDays(-2), lastMessageAt: atDays(-2), replyState: "replied" },
  ],
  "sup-cadenza": [
    { id: "cv5", clientId: "sup-cadenza", source: "reddit", customerLabel: "u/cadenza_fan", subject: "Feature idea: shared playlists", preview: "Would be great to share a playlist with friends…", receivedAt: atDays(0), unread: true, tags: ["feature-request"], sentiment: "positive", status: "new", priority: "normal", noteCount: 0 , lastInboundAt: atDays(0), lastOutboundAt: undefined, lastMessageAt: atDays(0), replyState: "awaiting_reply" },
    { id: "cv6", clientId: "sup-cadenza", source: "youtube", customerLabel: "YT comment", subject: "Crash on Android 12", preview: "App crashes when I open settings on my Pixel…", receivedAt: atDays(-1), unread: false, tags: ["bug", "android"], sentiment: "negative", status: "open", priority: "urgent", issueType: "Crash", noteCount: 2, assigneeId: "sup-m2", lastInboundAt: atDays(-1), lastOutboundAt: undefined, lastMessageAt: atDays(-1), replyState: "awaiting_reply" },
  ],
};


/**
 * Care queue counts, DERIVED from the conversation fixtures above rather than hand-written.
 *
 * Hand-written totals drift the moment a fixture changes, and a demo that contradicts itself is
 * worse than one with no numbers — it teaches the reader not to trust the figures.
 */
/** Just the fields the counters and the list filter read — not the whole DTO. */
type DemoConv = {
  clientId: string; status: string; priority: string; assigneeId?: string;
  replyState: string; lastInboundAt?: string; lastOutboundAt?: string; lastMessageAt?: string;
  source: string; subject: string; preview?: string; customerLabel: string;
};
/**
 * Apply a conversation list query to the fixtures — the same filters `listConversations` applies in
 * SQL (status, replyState, unassigned, priority, source, q, sort).
 *
 * Without this the demo answered every request with the whole fixture list, so the view tabs, the
 * channel filter, the search box and the sort control were all inert and the tab counts disagreed
 * with the rows below them. Keep it in step with `SAVED_VIEWS` — it is what makes /demo/care a
 * usable verification surface for a module whose real screens are auth-gated.
 */
function filterDemoConversations(clientId: string, search?: URLSearchParams): DemoConv[] {
  let rows = [...((demoConversationsByClient[clientId] ?? []) as DemoConv[])];
  if (!search) return rows;

  // The wire format is `listSupportConversations`'s, not a guess: `status` is COMMA-JOINED (not
  // repeated params) and `unassigned` is the string "1". Reading them as repeated params and as
  // "true" silently matched nothing, so the awaiting tab rendered its own empty state while its
  // badge read 2 — which is exactly the class of demo lie this function exists to remove.
  const status = (search.get("status") ?? "").split(",").filter(Boolean);
  if (status.length) rows = rows.filter((c) => status.includes(c.status ?? ""));

  const replyState = search.get("replyState");
  if (replyState) rows = rows.filter((c) => c.replyState === replyState);

  if (search.get("unassigned") === "1") rows = rows.filter((c) => !c.assigneeId);
  // "me" is the demo session's own id; no fixture is assigned to it, which is correct — the
  // "Assigned to me" tab reads 0 and shows nothing, rather than reading 0 and showing everything.
  const assigneeId = search.get("assigneeId");
  if (assigneeId) rows = rows.filter((c) => c.assigneeId === assigneeId);

  const priority = search.get("priority");
  if (priority) rows = rows.filter((c) => c.priority === priority);

  const source = search.get("source");
  if (source) rows = rows.filter((c) => c.source === source);

  const q = search.get("q")?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((c) =>
      [c.subject, c.preview, c.customerLabel].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }

  if (search.get("sort") === "oldest_inbound") {
    rows.sort((a, b) => (a.lastInboundAt ?? "").localeCompare(b.lastInboundAt ?? ""));
  } else {
    rows.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }
  return rows;
}

function demoQueueCounts(clientId: string) {
  const rows = (demoConversationsByClient[clientId] ?? []) as DemoConv[];
  const active = rows.filter((c) => c.status === "new" || c.status === "open");
  const awaitingRows = active.filter((c) => c.replyState === "awaiting_reply");
  const oldest = awaitingRows
    .map((c) => c.lastInboundAt)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
  return {
    awaiting: awaitingRows.length,
    replied: active.filter((c) => c.replyState === "replied").length,
    assignedMe: 0,
    unassigned: awaitingRows.filter((c) => !c.assigneeId).length,
    urgent: active.filter((c) => c.priority === "urgent").length,
    open: active.length,
    snoozed: rows.filter((c) => c.status === "snoozed").length,
    closed: rows.filter((c) => c.status === "closed" || c.status === "ignored").length,
    all: rows.length,
    oldestAwaitingAt: oldest,
    // Which channels the conversations actually came from — what the cockpit's channel filter is
    // built from, alongside the live connections.
    sources: Object.entries(
      rows.reduce<Record<string, number>>((acc, c) => {
        acc[c.source] = (acc[c.source] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Backstage (leave calendar only) ─────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const BACKSTAGE_MEMBERS = [
  { id: "user-marco", name: "Marco Bianchi", email: "marco@gitwork.co.uk", avatarUrl: null, role: "Developer", countryCode: "GB", assignedClientIds: [] },
  { id: "user-alex", name: "Alex Rivera", email: "alex@gitwork.co.uk", avatarUrl: null, role: "Developer", countryCode: "GB", assignedClientIds: [] },
  { id: "user-sam", name: "Sam Okafor", email: "sam@gitwork.co.uk", avatarUrl: null, role: "Developer", countryCode: "GB", assignedClientIds: [] },
];

/** Approved-leave bars for a given day-of-month (seed: Marco 9–11 annual, Alex 17 half-day sick, Sam 23–24 annual). */
function leaveBarsFor(dom: number): unknown[] {
  const bars: unknown[] = [];
  if (dom >= 9 && dom <= 11) {
    bars.push({ leaveRequestId: "lr-marco", userId: "user-marco", userName: "Marco Bianchi", type: "ANNUAL", halfDayStart: false, halfDayEnd: false, isStartOfLeave: dom === 9, isEndOfLeave: dom === 11, isHalfDayHere: false });
  }
  if (dom === 17) {
    bars.push({ leaveRequestId: "lr-alex", userId: "user-alex", userName: "Alex Rivera", type: "SICK", halfDayStart: true, halfDayEnd: false, isStartOfLeave: true, isEndOfLeave: true, isHalfDayHere: true });
  }
  if (dom >= 23 && dom <= 24) {
    bars.push({ leaveRequestId: "lr-sam", userId: "user-sam", userName: "Sam Okafor", type: "ANNUAL", halfDayStart: false, halfDayEnd: false, isStartOfLeave: dom === 23, isEndOfLeave: dom === 24, isHalfDayHere: false });
  }
  return bars;
}

/** Build the current month's 6×7 calendar grid (Monday-start) with seed leave + one observance. */
function buildCalendarMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const first = new Date(Date.UTC(year, month, 1));
  const firstDow = (first.getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = Date.UTC(year, month, 1 - firstDow);
  const todayIso = isoDate(new Date());
  const weeks: unknown[] = [];
  for (let w = 0; w < 6; w++) {
    const week: unknown[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridStart + (w * 7 + d) * DAY);
      const iso = isoDate(cell);
      const dow = cell.getUTCDay();
      const inMonth = cell.getUTCMonth() === month;
      const dom = cell.getUTCDate();
      const holidays = inMonth && dom === 15 ? [{ date: iso, name: "Team offsite", type: "observance", country: "GB" }] : [];
      week.push({
        date: iso,
        isCurrentMonth: inMonth,
        isToday: iso === todayIso,
        isWeekend: dow === 0 || dow === 6,
        holidays,
        leave: inMonth ? leaveBarsFor(dom) : [],
      });
    }
    weeks.push(week);
  }
  return { year, month: month + 1, weeks, members: BACKSTAGE_MEMBERS, holidayCountries: ["GB"] };
}

const demoCalendarMonth = buildCalendarMonth();

// Desk "around the team" holidays + staffing alerts (added when On Your Desk gained
// the dual-clocks / around-the-team strip + staffing overview).
const demoDeskHolidays = {
  gb: { name: "Summer bank holiday", date: atDays(20), inDays: 20 },
  pk: { name: "Independence Day", date: atDays(12), inDays: 12 },
};

const demoStaffingAlerts = {
  windowDays: 30,
  generatedAt: atDays(0),
  alerts: [
    { kind: "leave", startDate: atDays(7), endDate: atDays(9), type: "ANNUAL", user: { id: "user-marco", name: "Marco Bianchi" } },
    { kind: "holiday", date: atDays(12), name: "Independence Day", country: "PK", affectedMembers: [{ id: "user-sam", name: "Sam Okafor" }] },
    { kind: "conflict", date: atDays(14), users: [{ id: "user-sam", name: "Sam Okafor" }, { id: "user-alex", name: "Alex Rivera" }] },
  ],
};

// ─── DevSignal (developer vetting) demo data ────────────────────────────────────

const demoDevSignalStageResults = [
  {
    id: "ds-st-1",
    stageId: "application_intake",
    stageName: "Application intake",
    stageVersion: "intake-v1",
    status: "PASS",
    weight: 5,
    subScores: [
      { key: "completeness", label: "Data completeness", score: 90, maxScore: 100 },
      { key: "eligibility", label: "Eligibility", score: 100, maxScore: 100 },
    ],
    rawSignals: null,
    evidence: [{ type: "candidate", label: "Application record", sourceRef: "ds-cand-1" }],
    flags: [{ severity: "info", code: "consent_not_captured", message: "Structured consent record not yet captured." }],
    durationMs: 12,
    humanOverride: false,
    overrideReason: null,
    startedAt: "2026-07-06T10:00:00.000Z",
    finishedAt: "2026-07-06T10:00:00.000Z",
  },
  {
    id: "ds-st-2",
    stageId: "online_footprint",
    stageName: "Online footprint analysis",
    stageVersion: "gh-v3",
    status: "PASS",
    weight: 20,
    subScores: [
      { key: "technical_depth", label: "Technical depth", score: 82, maxScore: 100, rationale: "6 languages, avg health 71" },
      { key: "code_quality", label: "Code quality", score: 74, maxScore: 100, rationale: "docs 55%, tests 60%, CI 48%" },
      { key: "delivery_readiness", label: "Delivery readiness", score: 78, maxScore: 100, rationale: "recent activity 66%" },
    ],
    rawSignals: null,
    evidence: [{ type: "github_profile", label: "GitHub profile", value: "octocat", url: "https://github.com/octocat", sourceRef: "github-analysis:gh-v3" }],
    flags: [{ severity: "warn", code: "footprint_red_flag", message: "Limited visible CI coverage." }],
    durationMs: 2400,
    humanOverride: false,
    overrideReason: null,
    startedAt: "2026-07-06T10:00:03.000Z",
    finishedAt: "2026-07-06T10:00:05.000Z",
  },
  {
    id: "ds-st-3",
    stageId: "coding_challenge",
    stageName: "Timed coding challenge",
    stageVersion: "challenge-v1",
    status: "PASS",
    weight: 30,
    subScores: [
      { key: "test_performance", label: "Test performance", score: 100, maxScore: 100, rationale: "4/4 tests passed" },
      { key: "delivery_under_time", label: "Delivery under time", score: 88, maxScore: 100, rationale: "540s of 1500s" },
      { key: "process", label: "Process", score: 75, maxScore: 100, rationale: "3 test runs, 0 focus losses" },
    ],
    rawSignals: null,
    evidence: [{ type: "challenge", label: "Normalise invoice totals", sourceRef: "js-normalise-invoices" }],
    flags: [{ severity: "info", code: "high_paste_ratio", message: "High paste ratio (82%) — expected with AI assistance; note for the live follow-up." }],
    durationMs: 540000,
    humanOverride: false,
    overrideReason: null,
    startedAt: "2026-07-06T10:05:00.000Z",
    finishedAt: "2026-07-06T10:14:00.000Z",
  },
  {
    id: "ds-st-4",
    stageId: "video_assessment",
    stageName: "Video assessment",
    stageVersion: "video-v1",
    status: "PASS",
    weight: 5,
    subScores: [
      { key: "completeness", label: "completeness", score: 80, maxScore: 100 },
      { key: "role_relevance", label: "role relevance", score: 85, maxScore: 100 },
      { key: "specificity", label: "specificity", score: 70, maxScore: 100 },
      { key: "clarity", label: "clarity", score: 82, maxScore: 100 },
      { key: "structure", label: "structure", score: 78, maxScore: 100 },
    ],
    rawSignals: null,
    evidence: [],
    flags: [],
    durationMs: 1800,
    humanOverride: false,
    overrideReason: null,
    startedAt: "2026-07-06T10:15:00.000Z",
    finishedAt: "2026-07-06T10:15:02.000Z",
  },
  {
    id: "ds-st-5",
    stageId: "leadership_interview",
    stageName: "Leadership interview",
    stageVersion: "interview-v1",
    status: "PENDING_HUMAN",
    weight: 20,
    subScores: [],
    rawSignals: null,
    evidence: [],
    flags: [{ severity: "warn", code: "awaiting_interview", message: "Interview not yet recorded." }],
    durationMs: null,
    humanOverride: false,
    overrideReason: null,
    startedAt: null,
    finishedAt: null,
  },
];

const demoDevSignalBreakdown = {
  formulaVersion: "devsignal-score-v1",
  configVersion: "v1",
  pipelineVersion: "devsignal-pipeline-v1",
  finalScore: 84,
  weightedScore: 84,
  cappedByStageId: null,
  cap: null,
  blockingFailures: [],
  humanReviewRequired: true,
  stages: [
    { stageId: "application_intake", status: "PASS", included: true, reason: "scored", rawStageScore: 95, weight: 5, effectiveWeight: 5, contribution: 5.9 },
    { stageId: "online_footprint", status: "PASS", included: true, reason: "scored", rawStageScore: 78, weight: 20, effectiveWeight: 20, contribution: 19.5 },
    { stageId: "coding_challenge", status: "PASS", included: true, reason: "scored", rawStageScore: 88, weight: 30, effectiveWeight: 30, contribution: 33.0 },
    { stageId: "video_assessment", status: "PASS", included: true, reason: "scored", rawStageScore: 79, weight: 5, effectiveWeight: 5, contribution: 4.9 },
    { stageId: "leadership_interview", status: "PENDING_HUMAN", included: false, reason: "status PENDING_HUMAN — redistribute", rawStageScore: 0, weight: 20, effectiveWeight: 0, contribution: 0 },
  ],
};

const demoDevSignalDetail = {
  id: "ds-1",
  workspaceId: "demo-ws",
  clientId: null,
  candidateId: "ds-cand-1",
  candidateName: "Octavia Catelyn",
  candidateGithubHandle: "octocat",
  pipelineVersion: "devsignal-pipeline-v1",
  configVersion: "v1",
  status: "PENDING_HUMAN",
  decision: "APPROVED_FOR_STAGING",
  decisionReason: null,
  finalScore: 84,
  scoreBreakdown: demoDevSignalBreakdown,
  bestMatchSummary: {
    label: "REVIEW_RECOMMENDED",
    labelDisplay: "Review recommended",
    strengths: ["Application intake", "Online footprint analysis", "Timed coding challenge"],
    vetted: false,
  },
  flags: [{ severity: "info", code: "high_paste_ratio", message: "High paste ratio (82%) — expected with AI assistance." }],
  publicToken: "demo-token-octocat",
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  promotedToCode: false,
  promotedToCodeAt: null,
  startedAt: "2026-07-06T10:00:00.000Z",
  finishedAt: "2026-07-06T10:15:02.000Z",
  createdAt: "2026-07-06T09:58:00.000Z",
  updatedAt: "2026-07-06T10:15:02.000Z",
  stageResults: demoDevSignalStageResults,
  outcomeLinks: [],
};

const demoDevSignalAssessments = [
  {
    id: "ds-1",
    workspaceId: "demo-ws",
    clientId: null,
    candidateId: "ds-cand-1",
    candidateName: "Octavia Catelyn",
    candidateGithubHandle: "octocat",
    pipelineVersion: "devsignal-pipeline-v1",
    configVersion: "v1",
    status: "PENDING_HUMAN",
    decision: "APPROVED_FOR_STAGING",
    decisionReason: null,
    finalScore: 84,
    scoreBreakdown: demoDevSignalBreakdown,
    bestMatchSummary: { label: "REVIEW_RECOMMENDED", labelDisplay: "Review recommended", strengths: [], vetted: false },
    flags: [],
    promotedToCode: false,
    promotedToCodeAt: null,
    startedAt: "2026-07-06T10:00:00.000Z",
    finishedAt: "2026-07-06T10:15:02.000Z",
    createdAt: "2026-07-06T09:58:00.000Z",
    updatedAt: "2026-07-06T10:15:02.000Z",
  },
  {
    id: "ds-2",
    workspaceId: "demo-ws",
    clientId: null,
    candidateId: "ds-cand-2",
    candidateName: "Marcus Bright",
    candidateGithubHandle: "mbright",
    pipelineVersion: "devsignal-pipeline-v1",
    configVersion: "v1",
    status: "COMPLETED",
    decision: "APPROVED_FOR_CODE",
    decisionReason: "Promoted into Code",
    finalScore: 91,
    scoreBreakdown: null,
    bestMatchSummary: { label: "BEST_MATCH", labelDisplay: "Best match", strengths: [], vetted: true },
    flags: [],
    promotedToCode: true,
    promotedToCodeAt: "2026-07-06T14:00:00.000Z",
    startedAt: "2026-07-05T09:00:00.000Z",
    finishedAt: "2026-07-05T09:20:00.000Z",
    createdAt: "2026-07-05T08:55:00.000Z",
    updatedAt: "2026-07-06T14:00:00.000Z",
  },
  {
    id: "ds-3",
    workspaceId: "demo-ws",
    clientId: null,
    candidateId: "ds-cand-3",
    candidateName: "Priya Anand",
    candidateGithubHandle: "priya-dev",
    pipelineVersion: "devsignal-pipeline-v1",
    configVersion: "v1",
    status: "DRAFT",
    decision: "NONE",
    decisionReason: null,
    finalScore: null,
    scoreBreakdown: null,
    bestMatchSummary: null,
    flags: [],
    promotedToCode: false,
    promotedToCodeAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-07-07T08:30:00.000Z",
    updatedAt: "2026-07-07T08:30:00.000Z",
  },
  {
    id: "ds-4",
    workspaceId: "demo-ws",
    clientId: null,
    candidateId: "ds-cand-4",
    candidateName: "Jamie Chen",
    candidateGithubHandle: "jchen-dev",
    pipelineVersion: "devsignal-pipeline-v1",
    configVersion: "v1",
    status: "RUNNING",
    decision: "NONE",
    decisionReason: null,
    finalScore: null,
    scoreBreakdown: null,
    bestMatchSummary: null,
    flags: [],
    promotedToCode: false,
    promotedToCodeAt: null,
    startedAt: "2026-07-08T11:20:00.000Z",
    finishedAt: null,
    createdAt: "2026-07-08T11:18:00.000Z",
    updatedAt: "2026-07-08T11:22:00.000Z",
  },
  {
    id: "ds-5",
    workspaceId: "demo-ws",
    clientId: null,
    candidateId: "ds-cand-5",
    candidateName: "Sam Torres",
    candidateGithubHandle: "storres",
    pipelineVersion: "devsignal-pipeline-v1",
    configVersion: "v1",
    status: "COMPLETED",
    decision: "REJECTED",
    decisionReason: "Coding challenge tests failed; footprint showed no delivery history.",
    finalScore: 46,
    scoreBreakdown: null,
    bestMatchSummary: { label: "NOT_A_MATCH", labelDisplay: "Not a match", strengths: [], vetted: false },
    flags: [],
    promotedToCode: false,
    promotedToCodeAt: null,
    startedAt: "2026-07-04T09:00:00.000Z",
    finishedAt: "2026-07-04T09:22:00.000Z",
    createdAt: "2026-07-04T08:55:00.000Z",
    updatedAt: "2026-07-04T15:00:00.000Z",
  },
];

const demoDevSignalNewAssessment = {
  ...demoDevSignalDetail,
  id: "ds-new",
  candidateName: "New candidate",
  status: "DRAFT",
  decision: "NONE",
  finalScore: null,
  scoreBreakdown: null,
  bestMatchSummary: null,
  publicToken: "demo-token-new",
  stageResults: [],
};

const demoDevSignalAnalytics = {
  total: 5,
  byStatus: { PENDING_HUMAN: 1, COMPLETED: 2, DRAFT: 1, RUNNING: 1 },
  byDecision: { APPROVED_FOR_STAGING: 1, APPROVED_FOR_CODE: 1, NONE: 2, REJECTED: 1 },
  promotedToCode: 1,
  averageFinalScore: 74,
  outcomeLinks: 1,
  modelStatus: { status: "provisional" as const, n: 12, overallValidity: 0.38 },
  funnel: [
    { key: "invited", label: "Invited", n: 5 },
    { key: "consented", label: "Consented", n: 5 },
    { key: "challenge", label: "Challenge", n: 4 },
    { key: "video", label: "Intro", n: 3 },
    { key: "identity", label: "Identity", n: 3 },
    { key: "submitted", label: "Submitted", n: 3 },
  ],
};

const demoDevSignalConfig = {
  id: "ds-cfg-1",
  clientId: null,
  name: "Default",
  version: "v1",
  isDefault: true,
  enabledStages: [
    "application_intake",
    "profile_connections",
    "video_assessment",
    "coding_challenge",
    "online_footprint",
    "identity_verification",
    "leadership_interview",
    "score_report",
  ],
  stageOrder: [
    "application_intake",
    "profile_connections",
    "video_assessment",
    "coding_challenge",
    "online_footprint",
    "identity_verification",
    "leadership_interview",
    "score_report",
  ],
  stageWeights: {
    application_intake: 5,
    profile_connections: 10,
    video_assessment: 5,
    coding_challenge: 30,
    online_footprint: 20,
    identity_verification: 10,
    leadership_interview: 20,
    score_report: 0,
  },
  blockingRules: { identity_verification: true },
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

// Minimal candidate for the detail's outcome-links placement picker.
const demoDevSignalCandidate = {
  id: "ds-cand-1",
  name: "Octavia Catelyn",
  githubHandle: "octocat",
  placements: [
    {
      id: "ds-pl-1",
      candidateId: "ds-cand-1",
      clientId: "demo-c1",
      clientName: "Northwind",
      projectName: "Billing rebuild",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: null,
      allocationPercent: 100,
      notes: null,
      clientPlatformId: null,
      clientPlatformName: null,
      clientPlatformRepoUrl: null,
      repoPaths: [],
      repoBranch: null,
      lastScopedScanAt: null,
      lastScopedScanRunId: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ],
};

// Candidate-facing /vet/[token] flow (the 8-step funnel) — served to the demo
// so the full candidate experience is walkable. The coding challenge ships its
// real hidden tests so the in-browser Web Worker runner actually executes.
const demoVetSession = {
  token: "demo-token-octocat",
  status: "DRAFT",
  submitted: false,
  candidate: {
    name: "Octavia Catelyn",
    email: "octavia@example.com",
    githubHandle: "octocat",
    location: "Manchester, UK",
    timezone: "Europe/London",
    primaryStack: "React / TypeScript",
    yearsExperience: 6,
    linkedinUrl: null,
    portfolioUrl: null,
    availability: "Full-time",
  },
  consentGiven: true,
  notice: { version: "v1", ...DEFAULT_NOTICE_CONTENT },
  githubConnected: true,
  challenge: {
    id: "js-normalise-invoices",
    title: "Normalise invoice totals",
    language: "javascript",
    difficulty: "junior",
    functionName: "invoiceTotal",
    starterCode: "function invoiceTotal(lineItems) {\n  // your code here\n}\n",
    timeLimitSec: 1500,
    testCount: 4,
    tests: [
      { name: "empty", args: [[]], expected: 0, hidden: false },
      { name: "single no tax", args: [[{ qty: 2, unitPrice: 10, taxRate: 0 }]], expected: 20, hidden: false },
      { name: "single with tax", args: [[{ qty: 1, unitPrice: 100, taxRate: 0.2 }]], expected: 120, hidden: false },
      {
        name: "multi rounds",
        args: [[{ qty: 3, unitPrice: 9.99, taxRate: 0.2 }, { qty: 1, unitPrice: 5, taxRate: 0.05 }]],
        expected: 41.21,
        hidden: true,
      },
    ],
  },
  challengeSubmitted: false,
  videoQuestion:
    "Tell us about a recent project you shipped: what problem it solved, the trickiest technical decision you made, and how you'd approach it differently next time.",
  videoSubmitted: false,
  identitySubmitted: false,
  expired: false,
};

// ─── Pulse (AI project validation) — 3 seeded reports ──────────────────────────
type DemoPulseCheckRow = {
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE" | "ERROR" | "SKIPPED" | "NOT_APPLICABLE";
  detail: string;
  evidence?: string | null;
  confidence?: string;
};

function demoPulseChecks(scanId: string, rows: DemoPulseCheckRow[]) {
  return rows.map((r, i) => ({
    id: `${scanId}-chk-${i}`,
    scanId,
    category: r.category,
    checkKey: r.checkKey,
    label: r.label,
    status: r.status,
    detail: r.detail,
    evidence: (r.evidence ?? null) as string | null,
    sortOrder: i,
    createdAt: atDays(-3),
    confidence: (r.confidence ?? "HIGH") as "HIGH" | "MEDIUM" | "LOW",
    confidenceReason: null,
    trustBucket: "CONFIRMED" as const,
  }));
}

function makeDemoScan(o: {
  id: string;
  projectName: string;
  clientId?: string | null;
  clientName?: string | null;
  inputType: "URL" | "GITHUB_REPO";
  inputUrl?: string | null;
  inputGithubRepo?: string | null;
  platform?: string | null;
  healthScore: number;
  previousHealthScore?: number | null;
  techStack: string[];
  at: string;
  checks: ReturnType<typeof demoPulseChecks>;
  llmAnalysis: unknown;
  codeHealth?: CodeHealthReport | null;
}) {
  return {
    id: o.id,
    workspaceId: "demo-ws",
    clientId: o.clientId ?? null,
    clientName: o.clientName ?? null,
    projectName: o.projectName,
    inputType: o.inputType,
    inputUrl: o.inputUrl ?? null,
    inputGithubRepo: o.inputGithubRepo ?? null,
    inputDescription: null,
    platform: o.platform ?? null,
    status: "COMPLETED",
    scanVersion: "2.0",
    startedAt: o.at,
    completedAt: o.at,
    checksCompletedAt: o.at,
    healthScore: o.healthScore,
    previousHealthScore: o.previousHealthScore ?? null,
    techStack: o.techStack,
    llmAnalysis: o.llmAnalysis,
    discoveryKit: null,
    codeInsights: null,
    codeHealth: o.codeHealth ?? null,
    deployInsights: null,
    browserInsights: null,
    visualInsights: null,
    aiError: null,
    competitorUrls: null,
    competitorData: null,
    targetMarkets: ["GB"],
    detectedMarkets: ["GB"],
    complianceScorecard: null,
    scoreBreakdown: null,
    pricingBands: null,
    shareToken: null,
    isShared: false,
    errorCode: null,
    errorMessage: null,
    generatedProposalId: null,
    linkedStudyId: null,
    linkedStarterId: null,
    checks: o.checks,
    createdAt: o.at,
    updatedAt: o.at,
  };
}

// Report 1 — Northwind Studio: healthy SaaS (green, 86, improving).
const demoScanNorthwind = makeDemoScan({
  id: "scan-northwind",
  projectName: "northwind.co",
  clientId: WIKI_CLIENT.id,
  clientName: "Northwind Studio",
  inputType: "URL",
  inputUrl: "https://app.northwind.co",
  platform: "Vercel",
  healthScore: 86,
  previousHealthScore: 79,
  techStack: ["Next.js", "React", "TypeScript", "PostgreSQL", "Tailwind CSS", "Vercel"],
  at: atDays(-5),
  // A real scan's checks (renamed to Northwind), so the page is seen at its real size.
  checks: demoPulseChecks("scan-northwind", RECORDED_NORTHWIND_CHECKS as DemoPulseCheckRow[]),
  llmAnalysis: {
    projectClassification: { type: "SaaS", subtype: "B2B streaming analytics", confidence: "HIGH", signals: ["Authenticated app shell", "Usage-based dashboards", "Multi-tenant routing"], verticalInsights: ["Publish an uptime/status page to build enterprise trust", "Add SSO (SAML/OIDC) to unlock larger accounts", "Expose an audit log for security-conscious buyers"] },
    executiveSummary: "Northwind is a well-built, production-grade SaaS. Security, infrastructure and SEO are strong; the main opportunities are deepening test coverage and a handful of polish items before the next enterprise push.",
    healthNarrative: "An 86 puts Northwind in the healthy tier and up 7 points since the last scan — driven by the new security headers and error monitoring. Nothing here is blocking; the remaining items are quality and scale-readiness.",
    strengths: [
      { title: "Solid security posture", detail: "HTTPS, HSTS and a full set of security headers, with authenticated sessions on secure cookies." },
      { title: "Fast and observable", detail: "Sub-2s LCP on 4G and Sentry monitoring across the stack means regressions get caught early." },
      { title: "Discoverable", detail: "Complete metadata, Open Graph and a valid sitemap — good marketing-site hygiene." },
    ],
    criticalGaps: [
      { category: "Code Quality", gap: "Test coverage sits around 52%", impact: "Refactors and new features risk silent regressions in untested edges.", urgency: "MEDIUM" },
      { category: "Accessibility", gap: "A couple of low-contrast interactive states", impact: "Minor WCAG AA misses that enterprise procurement checklists often flag.", urgency: "MEDIUM" },
    ],
    buildOpportunities: [
      { title: "Single sign-on (SSO)", description: "Add SAML/OIDC to open up larger, security-conscious accounts.", estimatedEffort: "M", businessValue: "HIGH", category: "Authentication" },
      { title: "Public status page", description: "An automated uptime/status page to reinforce reliability during sales.", estimatedEffort: "S", businessValue: "MEDIUM", category: "Trust & Brand" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Harden & polish", duration: "2–3 weeks", goals: ["Lift core-flow test coverage past 70%", "Fix the AA contrast misses", "Add explicit image dimensions"] },
      { phase: 2, title: "Enterprise-ready", duration: "4–6 weeks", goals: ["Ship SSO", "Add an audit log", "Publish a status page"] },
    ],
    techDebt: [
      { area: "Testing", description: "Thin coverage on secondary flows and error paths.", severity: "MEDIUM" },
    ],
    proposalHook: "Northwind is already healthy — a short hardening sprint plus SSO would make it genuinely enterprise-ready.",
    productionBlockers: [],
    productionReadinessChecklist: [
      { category: "Security", item: "HTTPS & security headers", status: "DONE", notes: "Full set in place." },
      { category: "Observability", item: "Error monitoring", status: "DONE", notes: "Sentry across web + API." },
      { category: "Code Quality", item: "Automated test coverage", status: "PARTIAL", notes: "~52%; core flows only." },
      { category: "Accessibility", item: "WCAG AA contrast", status: "PARTIAL", notes: "Two states just under AA." },
    ],
    techStackAnalysis: {
      assessment: "A modern, well-chosen Next.js + PostgreSQL stack on Vercel — appropriate for the scale and easy to hire for.",
      detectedStack: null,
      recommendations: [
        { area: "Auth", current: "Session cookies", recommended: "Add OIDC/SAML SSO", reason: "Unlocks enterprise procurement.", priority: "HIGH" },
        { area: "Testing", current: "Unit + a few E2E", recommended: "Playwright on core journeys", reason: "Protects refactors as the team grows.", priority: "MEDIUM" },
      ],
      missingForProduction: [],
    },
    aiMaturityScore: 3,
  },
});

// Report 2 — Cadenza: a repo scan with real gaps (a real scan's checks, renamed).
const demoScanCadenza = makeDemoScan({
  id: "scan-cadenza",
  projectName: "cadenza (github)",
  clientId: null,
  clientName: "Cadenza",
  inputType: "GITHUB_REPO",
  inputGithubRepo: "cadenza-app/cadenza",
  platform: "Render",
  codeHealth: RECORDED_CADENZA_CODE_HEALTH,
  healthScore: RECORDED_CADENZA_SCORE,
  previousHealthScore: RECORDED_CADENZA_SCORE - 4,
  techStack: RECORDED_CADENZA_TECH_STACK,
  at: atDays(-2),
  // A real repository scan's checks (renamed to Cadenza), so the repo scan is seen at its real size.
  checks: demoPulseChecks("scan-cadenza", RECORDED_CADENZA_CHECKS as DemoPulseCheckRow[]),
  llmAnalysis: {
    projectClassification: { type: "SaaS", subtype: "Music collaboration tool", confidence: "MEDIUM", signals: ["React front end with an Express API", "Account-based access with admin screens", "MongoDB models"], verticalInsights: ["Version history is a strong retention feature", "Presence indicators help real-time collaboration", "Offline-friendly sync would differentiate"] },
    executiveSummary: "Cadenza's code is small and readable, but the service around it isn't production-hardened: 80 of its pinned libraries have published vulnerabilities (9 critical), there is no error tracking, no health endpoint, no graceful shutdown and no tests. Most of this is quick to close.",
    healthNarrative: `At ${RECORDED_CADENZA_SCORE} Cadenza scores well on what it has, up 4 since the last scan. The score hides the gaps that matter for a live service: vulnerable dependencies, no tests and no operational layer.`,
    strengths: [
      { title: "Sound basics", detail: "A committed lockfile, pinned versions, HttpOnly and SameSite cookies, and no stack traces returned to the client." },
      { title: "Readable code", detail: "Low complexity across the codebase, with a handful of long screen components the only real debt." },
    ],
    criticalGaps: [
      { category: "Dependencies", gap: "80 libraries with published vulnerabilities", impact: "Nine are critical, including the database driver; known exploits apply at the versions in the lockfile.", urgency: "CRITICAL" },
      { category: "Observability", gap: "No error tracking or structured logging", impact: "Production failures go unnoticed until a user reports them, and logs can't be filtered by request.", urgency: "HIGH" },
      { category: "Code Quality", gap: "No automated tests", impact: "Every change to checkout-style flows is verified by hand, so regressions ship.", urgency: "HIGH" },
    ],
    buildOpportunities: [
      { title: "Dependency upgrade sprint", description: "Upgrade the critical and high advisories first, then switch on Dependabot to keep them current.", estimatedEffort: "S", businessValue: "HIGH", category: "Security" },
      { title: "Operational baseline", description: "Error tracking, a health endpoint, SIGTERM handling and request ids.", estimatedEffort: "S", businessValue: "HIGH", category: "Observability" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Production hardening", duration: "1–2 weeks", goals: ["Clear the critical advisories", "Add error tracking", "Add a health endpoint and graceful shutdown", "Cap request body sizes"] },
      { phase: 2, title: "Confidence to change", duration: "2–4 weeks", goals: ["Tests on the core journeys", "Tag releases", "Split the longest screen components"] },
    ],
    techDebt: [
      { area: "Dependencies", description: "A large backlog of vulnerable library versions across both lockfiles.", severity: "HIGH" },
      { area: "Duplication", description: "Copied blocks across 23 files, mostly in the screen components.", severity: "MEDIUM" },
    ],
    proposalHook: "Cadenza is one short hardening sprint away from being production-ready — the gaps are well understood and quick to close.",
    productionBlockers: [
      { category: "Dependencies", blocker: "Critical library vulnerabilities", why: "Known exploits apply at the pinned versions.", urgency: "CRITICAL" },
      { category: "Observability", blocker: "No error tracking", why: "You can't see or triage production failures.", recommendedService: "Sentry", urgency: "HIGH" },
    ],
    productionReadinessChecklist: [
      { category: "Dependencies", item: "No known vulnerabilities", status: "MISSING", notes: "80 vulnerable, 9 critical." },
      { category: "Observability", item: "Error tracking", status: "MISSING", notes: "Nothing wired." },
      { category: "Infrastructure", item: "Health endpoint and graceful shutdown", status: "MISSING", notes: "Neither found." },
      { category: "Code Quality", item: "Automated tests", status: "MISSING", notes: "No test code found." },
      { category: "Security", item: "Session cookies", status: "DONE", notes: "HttpOnly and SameSite set." },
    ],
    techStackAnalysis: {
      assessment: "A conventional React and Express stack on MongoDB; the choices are fine, but the operational layer (monitoring, health checks, upgrades) hasn't been built out yet.",
      detectedStack: null,
      recommendations: [
        { area: "Monitoring", current: "None", recommended: "Sentry", reason: "Production visibility is the single biggest win here.", priority: "HIGH" },
        { area: "Dependencies", current: "Pinned, never upgraded", recommended: "Dependabot with weekly batches", reason: "Keeps the advisory backlog from growing back.", priority: "HIGH" },
      ],
      missingForProduction: ["Error tracking", "Health endpoint", "Automated tests", "Dependency upgrades"],
    },
    aiMaturityScore: 2,
  },
});

// Report 3 — Fairway Nine: the weakest of the three (a real scan's checks, renamed).
const demoScanFairway = makeDemoScan({
  id: "scan-fairway",
  projectName: "fairwaynine.co.uk",
  clientId: null,
  clientName: "Fairway Nine",
  inputType: "URL",
  inputUrl: "https://fairwaynine.co.uk",
  platform: "Azure App Service",
  healthScore: RECORDED_FAIRWAY_SCORE,
  previousHealthScore: RECORDED_FAIRWAY_SCORE + 4,
  techStack: RECORDED_FAIRWAY_TECH_STACK,
  at: atDays(-1),
  // A real website scan's checks (renamed to Fairway Nine).
  checks: demoPulseChecks("scan-fairway", RECORDED_FAIRWAY_CHECKS as DemoPulseCheckRow[]),
  llmAnalysis: {
    projectClassification: { type: "Service Business", subtype: "Golf club", confidence: "HIGH", signals: ["Course status and green fees pages", "Membership sections", "Club policies"], verticalInsights: ["A fast mobile green-fee booking flow directly lifts revenue", "Structured data for the course improves local search", "Members expect an accessible, readable site"] },
    executiveSummary: "Fairway Nine's site works and is on HTTPS, but it sends no security headers at all, advertises its server versions, sets session cookies without Secure, and fails basic accessibility on every page read. None of it is hard to fix, and it has slipped since the last scan.",
    healthNarrative: `At ${RECORDED_FAIRWAY_SCORE} the site is the weakest of the three and down 4 points. The biggest wins (headers, cookie flags, a page language and alt text) are configuration changes rather than a rebuild.`,
    strengths: [
      { title: "HTTPS done properly", detail: "A valid certificate and an HTTP to HTTPS redirect." },
      { title: "Nothing exposed", detail: "No .env, .git, backups or admin pages served to the public." },
    ],
    criticalGaps: [
      { category: "Security", gap: "No security headers", impact: "No CSP, HSTS, X-Frame-Options or X-Content-Type-Options, so the browser has no instructions to protect visitors.", urgency: "HIGH" },
      { category: "Security", gap: "Session cookies without Secure or SameSite", impact: "The session cookie can travel over plain HTTP and in cross-site requests.", urgency: "HIGH" },
      { category: "Accessibility", gap: "No page language and missing alt text", impact: "All 15 pages read lack <html lang>, and screen readers get no description of images.", urgency: "HIGH" },
    ],
    buildOpportunities: [
      { title: "Header and cookie hardening", description: "Add the standard security headers and Secure/SameSite cookies at the web server.", estimatedEffort: "S", businessValue: "HIGH", category: "Security" },
      { title: "Accessibility pass", description: "Page language, alt text, named dialogs and meta descriptions across the site.", estimatedEffort: "S", businessValue: "MEDIUM", category: "Mobile & Accessibility" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Stabilise & secure", duration: "1 week", goals: ["Add security headers", "Secure the session cookies", "Hide server version banners", "Disable TRACE"] },
      { phase: 2, title: "Readable for everyone", duration: "1–2 weeks", goals: ["Set the page language", "Add alt text and dialog names", "Write meta descriptions", "Update the privacy policy"] },
    ],
    techDebt: [
      { area: "Server configuration", description: "Default IIS and ASP.NET response headers, including version banners.", severity: "HIGH" },
      { area: "Content", description: "Pages without descriptions or a declared language.", severity: "MEDIUM" },
    ],
    proposalHook: "Fairway Nine has fast, high-impact wins available today — a one-week stabilise sprint would lift it clear of the other two.",
    productionBlockers: [
      { category: "Security", blocker: "No security headers", why: "Visitors get none of the browser's built-in protections.", urgency: "HIGH" },
    ],
    productionReadinessChecklist: [
      { category: "Security", item: "Security headers", status: "MISSING", notes: "None set." },
      { category: "Security", item: "HTTPS", status: "DONE", notes: "Valid certificate with redirect." },
      { category: "Security", item: "Session cookie flags", status: "MISSING", notes: "No Secure or SameSite." },
      { category: "Accessibility", item: "Page language and alt text", status: "MISSING", notes: "Absent on every page read." },
      { category: "Legal & Compliance", item: "Privacy policy", status: "PARTIAL", notes: "Present; no date and no right of access." },
    ],
    techStackAnalysis: {
      assessment: "An ASP.NET site on IIS. The platform is fine for a club site; the issues are configuration the host was left with, not the choice of stack.",
      detectedStack: null,
      recommendations: [
        { area: "Web server", current: "IIS defaults", recommended: "Security headers and cookie flags in web.config", reason: "Immediate protection with no code change.", priority: "HIGH" },
        { area: "Content", current: "No language or descriptions", recommended: "A template-level accessibility pass", reason: "Fixes every page at once.", priority: "MEDIUM" },
      ],
      missingForProduction: ["Security headers", "Secure cookies", "Page language", "Image alt text"],
    },
    aiMaturityScore: 1,
  },
});

// The /pulse/features example reports need a middling and a weak result. Real lite scans of
// small sites and repos land at 80 or above, so the public examples keep these two hand-written
// scans (score 63 and 48); /demo/pulse uses the recorded scans above.
// Example (public) — Cadenza: promising SaaS with gaps (amber, 63, improving).
const exampleScanCadenza = makeDemoScan({
  id: "scan-cadenza",
  projectName: "cadenza (github)",
  clientId: null,
  clientName: "Cadenza",
  inputType: "GITHUB_REPO",
  inputGithubRepo: "cadenza-app/cadenza",
  platform: "Render",
  codeHealth: DEMO_CODE_HEALTH,
  healthScore: 63,
  previousHealthScore: 58,
  techStack: ["React", "Vite", "Node.js", "Express", "PostgreSQL", "Render"],
  at: atDays(-2),
  checks: demoPulseChecks("scan-cadenza", [
    { category: "Security", checkKey: "https_enforced", label: "HTTPS enforced", status: "PASS", detail: "TLS valid; HSTS not yet set." },
    { category: "Security", checkKey: "security_headers", label: "Security headers", status: "WARN", detail: "Missing CSP and X-Frame-Options." },
    { category: "Secrets & Keys", checkKey: "exposed_secrets", label: "Exposed secrets", status: "PASS", detail: "No API keys or tokens found in the client bundle." },
    { category: "Authentication", checkKey: "auth_present", label: "Authentication", status: "PASS", detail: "JWT auth with refresh tokens." },
    { category: "Performance", checkKey: "bundle_size", label: "JS bundle size", status: "WARN", detail: "Main bundle ~480KB gzipped — code-splitting would help." },
    { category: "Observability", checkKey: "error_monitoring", label: "Error monitoring", status: "FAIL", detail: "No error tracking wired — failures are invisible in production." },
    { category: "SEO", checkKey: "meta_tags", label: "Meta tags & Open Graph", status: "WARN", detail: "Home page only; app routes lack metadata." },
    { category: "Infrastructure", checkKey: "backups", label: "Database backups", status: "WARN", detail: "No automated backup schedule detected." },
    { category: "Legal & Compliance", checkKey: "privacy_policy", label: "Privacy policy", status: "FAIL", detail: "No privacy policy or cookie notice found." },
    { category: "Code Quality", checkKey: "ci_pipeline", label: "CI pipeline", status: "PASS", detail: "GitHub Actions runs lint and tests on PRs." },
    { category: "Code Quality", checkKey: "typescript", label: "Type safety", status: "WARN", detail: "Mixed JS/TS; several files still untyped." },
  ]),
  llmAnalysis: {
    projectClassification: { type: "SaaS", subtype: "Music collaboration tool", confidence: "HIGH", signals: ["Real-time editing", "Project/workspace model", "Account-based access"], verticalInsights: ["Add presence indicators for collaborators", "Version history is a strong retention feature", "Offline-friendly sync would differentiate"] },
    executiveSummary: "Cadenza is a promising product with a clean core, but it isn't production-hardened: no error monitoring, missing security headers, and no privacy policy. These are quick wins that would move the score sharply.",
    healthNarrative: "At 63 Cadenza sits in the moderate tier, up 5 since last scan. The fundamentals are sound; the gaps are operational readiness rather than architecture.",
    strengths: [
      { title: "Clean authentication", detail: "JWT with refresh tokens, and no secrets leaked into the client bundle." },
      { title: "CI in place", detail: "Lint and tests already run on every pull request." },
    ],
    criticalGaps: [
      { category: "Observability", gap: "No error monitoring in production", impact: "Production failures go unnoticed until a user reports them.", urgency: "CRITICAL" },
      { category: "Legal & Compliance", gap: "No privacy policy or cookie notice", impact: "Non-compliant with UK/EU requirements for a live product handling accounts.", urgency: "HIGH" },
      { category: "Security", gap: "Missing security headers (CSP, X-Frame-Options)", impact: "Leaves the app open to clickjacking and injection classes.", urgency: "HIGH" },
    ],
    buildOpportunities: [
      { title: "Wire error monitoring", description: "Add Sentry across client and server for real-time failure visibility.", estimatedEffort: "S", businessValue: "HIGH", category: "Observability" },
      { title: "Code-split the bundle", description: "Route-based splitting to cut first-load JS and speed up the editor.", estimatedEffort: "M", businessValue: "MEDIUM", category: "Performance" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Production hardening", duration: "1–2 weeks", goals: ["Add error monitoring", "Ship security headers", "Publish privacy & cookie policy", "Enable automated DB backups"] },
      { phase: 2, title: "Performance & polish", duration: "2–4 weeks", goals: ["Code-split the editor", "Finish the TS migration", "Add metadata to app routes"] },
    ],
    techDebt: [
      { area: "Type safety", description: "Mixed JS/TS codebase — untyped files invite runtime bugs.", severity: "MEDIUM" },
      { area: "Resilience", description: "No database backup schedule.", severity: "HIGH" },
    ],
    proposalHook: "Cadenza is one short hardening sprint away from being production-ready — the gaps are well understood and quick to close.",
    productionBlockers: [
      { category: "Observability", blocker: "No error monitoring", why: "You can't see or triage production failures.", recommendedService: "Sentry", urgency: "CRITICAL" },
      { category: "Legal & Compliance", blocker: "No privacy policy", why: "Required before handling user accounts in the UK/EU.", urgency: "HIGH" },
    ],
    productionReadinessChecklist: [
      { category: "Observability", item: "Error monitoring", status: "MISSING", notes: "Nothing wired." },
      { category: "Security", item: "Security headers", status: "MISSING", notes: "No CSP / X-Frame-Options." },
      { category: "Legal & Compliance", item: "Privacy policy", status: "MISSING", notes: "Not present." },
      { category: "Infrastructure", item: "Database backups", status: "MISSING", notes: "No schedule detected." },
      { category: "Authentication", item: "Auth & sessions", status: "DONE", notes: "JWT + refresh tokens." },
    ],
    techStackAnalysis: {
      assessment: "A capable React/Node stack; the choices are fine, but the operational layer (monitoring, backups, headers) hasn't been built out yet.",
      detectedStack: null,
      recommendations: [
        { area: "Monitoring", current: "None", recommended: "Sentry", reason: "Production visibility is the single biggest win here.", priority: "HIGH" },
        { area: "Language", current: "Mixed JS/TS", recommended: "Finish the TypeScript migration", reason: "Removes a whole class of runtime bugs.", priority: "MEDIUM" },
      ],
      missingForProduction: ["Error monitoring", "Security headers", "Automated backups", "Privacy policy"],
    },
    aiMaturityScore: 2,
  },
});

// Example (public) — Fairway Nine: at-risk (red, 48, regressed).
const exampleScanFairway = makeDemoScan({
  id: "scan-fairway",
  projectName: "fairwaynine.co.uk",
  clientId: null,
  clientName: "Fairway Nine",
  inputType: "URL",
  inputUrl: "https://fairwaynine.co.uk",
  platform: "Shared hosting",
  healthScore: 48,
  previousHealthScore: 52,
  techStack: ["WordPress", "PHP", "jQuery", "MySQL"],
  at: atDays(-1),
  checks: demoPulseChecks("scan-fairway", [
    { category: "Security", checkKey: "https_enforced", label: "HTTPS enforced", status: "WARN", detail: "TLS present but HTTP is not redirected to HTTPS." },
    { category: "Security", checkKey: "security_headers", label: "Security headers", status: "FAIL", detail: "No security headers set at all." },
    { category: "Security", checkKey: "software_updates", label: "Platform up to date", status: "FAIL", detail: "CMS and two plugins are several versions behind." },
    { category: "Performance", checkKey: "lcp", label: "Largest Contentful Paint", status: "FAIL", detail: "LCP 5.8s on 4G — heavy unoptimised images." },
    { category: "Performance", checkKey: "render_blocking", label: "Render-blocking assets", status: "WARN", detail: "Multiple blocking scripts in the head." },
    { category: "Accessibility", checkKey: "alt_text", label: "Image alt text", status: "FAIL", detail: "Most gallery and course images have no alt text." },
    { category: "SEO", checkKey: "meta_tags", label: "Meta tags", status: "WARN", detail: "Duplicate titles across several pages." },
    { category: "Observability", checkKey: "error_monitoring", label: "Error monitoring", status: "FAIL", detail: "No monitoring; outages are only noticed by customers." },
    { category: "Mobile & Accessibility", checkKey: "mobile_friendly", label: "Mobile friendly", status: "WARN", detail: "Booking form overflows on small screens." },
    { category: "Legal & Compliance", checkKey: "privacy_policy", label: "Privacy policy", status: "PASS", detail: "Privacy and cookie policy present." },
  ]),
  llmAnalysis: {
    projectClassification: { type: "Service Business", subtype: "Golf tee-time booking", confidence: "HIGH", signals: ["Course info pages", "Tee-time booking form", "Local business schema"], verticalInsights: ["A faster mobile booking flow directly lifts conversions", "Structured data for courses improves local search", "Image-heavy site — optimisation is the fastest win"] },
    executiveSummary: "Fairway Nine is at risk: an ageing WordPress stack with no security headers, out-of-date software, very slow pages and broken accessibility. It works, but it's fragile and under-performing — and it's slipped since the last scan.",
    healthNarrative: "At 48 the site is in the at-risk tier and down 4 points, mostly from newly out-of-date plugins and slower pages. The good news: the biggest wins (images, updates, headers) are fast and high-impact.",
    strengths: [
      { title: "Compliant on privacy", detail: "Privacy and cookie policies are present and linked." },
    ],
    criticalGaps: [
      { category: "Security", gap: "Out-of-date CMS and plugins", impact: "Known vulnerabilities in unpatched software are the top cause of small-site breaches.", urgency: "CRITICAL" },
      { category: "Performance", gap: "5.8s LCP from unoptimised images", impact: "Slow load directly costs booking conversions, especially on mobile.", urgency: "HIGH" },
      { category: "Accessibility", gap: "Missing image alt text throughout", impact: "Fails basic WCAG and hurts SEO on an image-heavy site.", urgency: "HIGH" },
    ],
    buildOpportunities: [
      { title: "Image optimisation pass", description: "Compress, resize and lazy-load imagery to cut LCP dramatically.", estimatedEffort: "S", businessValue: "HIGH", category: "Performance" },
      { title: "Rebuild the booking flow", description: "A fast, mobile-first tee-time booking flow to lift conversions.", estimatedEffort: "L", businessValue: "HIGH", category: "Mobile & Accessibility" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Stabilise & secure", duration: "1 week", goals: ["Update CMS and plugins", "Force HTTPS", "Add security headers", "Optimise the heaviest images"] },
      { phase: 2, title: "Convert better", duration: "3–5 weeks", goals: ["Rebuild the mobile booking flow", "Fix alt text and titles", "Add error monitoring"] },
    ],
    techDebt: [
      { area: "Platform", description: "Ageing WordPress + jQuery stack on shared hosting; hard to scale.", severity: "HIGH" },
      { area: "Assets", description: "Large unoptimised images across the site.", severity: "HIGH" },
    ],
    proposalHook: "Fairway Nine has fast, high-impact wins available today — a one-week stabilise sprint would move it out of the red immediately.",
    productionBlockers: [
      { category: "Security", blocker: "Out-of-date software", why: "Unpatched CMS/plugins are actively exploited.", urgency: "CRITICAL" },
    ],
    productionReadinessChecklist: [
      { category: "Security", item: "Software up to date", status: "MISSING", notes: "CMS + 2 plugins behind." },
      { category: "Security", item: "Force HTTPS", status: "PARTIAL", notes: "TLS present, no redirect." },
      { category: "Performance", item: "Optimised images", status: "MISSING", notes: "Heavy, unoptimised." },
      { category: "Accessibility", item: "Image alt text", status: "MISSING", notes: "Largely absent." },
      { category: "Legal & Compliance", item: "Privacy policy", status: "DONE", notes: "Present and linked." },
    ],
    techStackAnalysis: {
      assessment: "A dated WordPress/jQuery stack on shared hosting. Fine for a brochure site, but it's the root cause of the performance and maintenance issues; a modern rebuild would pay off if bookings matter.",
      detectedStack: null,
      recommendations: [
        { area: "Platform", current: "WordPress + shared hosting", recommended: "Managed hosting + a caching/CDN layer", reason: "Immediate stability and speed gains.", priority: "HIGH" },
        { area: "Booking", current: "Plugin form", recommended: "Purpose-built mobile booking flow", reason: "Directly drives revenue for a booking business.", priority: "MEDIUM" },
      ],
      missingForProduction: ["Up-to-date software", "Security headers", "Image optimisation", "Error monitoring"],
    },
    aiMaturityScore: 1,
  },
});

const demoPulseScansById: Record<string, unknown> = {
  "scan-northwind": demoScanNorthwind,
  "scan-cadenza": demoScanCadenza,
  "scan-fairway": demoScanFairway,
};

/**
 * The three demo scans as the /pulse/features example reports (strong, middling, weak).
 * Renamed onto `.example` names so a public page never gives a real domain a made-up score.
 */
export function examplePulseReportScans(): Record<string, unknown> {
  const rename = (scan: object, projectName: string, url: string | null, repo: string | null): unknown => ({
    ...scan,
    projectName,
    clientId: null,
    clientName: null,
    inputUrl: url,
    inputGithubRepo: repo,
  });
  return {
    strong: rename(demoScanNorthwind, "northwind.example", "https://app.northwind.example", null),
    middling: rename(exampleScanCadenza, "cadenza (GitHub repo)", null, "example/cadenza"),
    weak: rename(exampleScanFairway, "fairwaynine.example", "https://fairwaynine.example", null),
  };
}

/** The demo code portfolio, built by the same pure functions the real loader uses. */
function demoCodePortfolio() {
  const repos = DEMO_PORTFOLIO_REPORTS.map((r) =>
    summariseRepo(r.report, {
      scanId: r.scanId,
      projectName: r.projectName,
      clientName: r.clientName,
      history: r.history.map((score, i) => ({ at: atDays(-7 * (r.history.length - 1 - i)), score })),
    }),
  ).sort(byUrgency);
  return { repos, items: DEMO_PORTFOLIO_REPORTS.flatMap((r) => workItemsFor(r.report)), unmeasured: [] };
}

const demoPulseScanList = [
  { id: "scan-fairway", workspaceId: "demo-ws", clientId: null, clientName: "Fairway Nine", projectName: "fairwaynine.co.uk", inputType: "URL", inputUrl: "https://fairwaynine.co.uk", inputGithubRepo: null, status: "COMPLETED", healthScore: RECORDED_FAIRWAY_SCORE, generatedProposalId: null, createdAt: atDays(-1), updatedAt: atDays(-1) },
  { id: "scan-cadenza", workspaceId: "demo-ws", clientId: null, clientName: "Cadenza", projectName: "cadenza (github)", inputType: "GITHUB_REPO", inputUrl: null, inputGithubRepo: "cadenza-app/cadenza", status: "COMPLETED", healthScore: RECORDED_CADENZA_SCORE, generatedProposalId: null, createdAt: atDays(-2), updatedAt: atDays(-2) },
  { id: "scan-northwind", workspaceId: "demo-ws", clientId: WIKI_CLIENT.id, clientName: "Northwind Studio", projectName: "northwind.co", inputType: "URL", inputUrl: "https://app.northwind.co", inputGithubRepo: null, status: "COMPLETED", healthScore: 86, generatedProposalId: null, createdAt: atDays(-5), updatedAt: atDays(-5) },
  // Earlier scans of the same site, so the demo has a project history and a trend to show.
  { id: "scan-northwind-prev", workspaceId: "demo-ws", clientId: WIKI_CLIENT.id, clientName: "Northwind Studio", projectName: "northwind.co", inputType: "URL", inputUrl: "https://app.northwind.co", inputGithubRepo: null, status: "COMPLETED", healthScore: 80, generatedProposalId: null, createdAt: atDays(-33), updatedAt: atDays(-33) },
  { id: "scan-northwind-first", workspaceId: "demo-ws", clientId: WIKI_CLIENT.id, clientName: "Northwind Studio", projectName: "northwind.co", inputType: "URL", inputUrl: "https://app.northwind.co/", inputGithubRepo: null, status: "COMPLETED", healthScore: 71, generatedProposalId: null, createdAt: atDays(-61), updatedAt: atDays(-61) },
  { id: "scan-cadenza-prev", workspaceId: "demo-ws", clientId: null, clientName: "Cadenza", projectName: "cadenza (github)", inputType: "GITHUB_REPO", inputUrl: null, inputGithubRepo: "cadenza-app/cadenza", status: "COMPLETED", healthScore: RECORDED_CADENZA_SCORE - 4, generatedProposalId: null, createdAt: atDays(-30), updatedAt: atDays(-30) },
  { id: "scan-fairway-prev", workspaceId: "demo-ws", clientId: null, clientName: "Fairway Nine", projectName: "fairwaynine.co.uk", inputType: "URL", inputUrl: "https://fairwaynine.co.uk", inputGithubRepo: null, status: "COMPLETED", healthScore: RECORDED_FAIRWAY_SCORE + 4, generatedProposalId: null, createdAt: atDays(-20), updatedAt: atDays(-20) },
];

/**
 * What changed since the previous scan of the same target.
 *
 * Deliberately includes the `unverified` bucket, because that is the half of
 * the story most tools do not tell: two findings from last time that this scan
 * cannot confirm or clear. A demo that only ever shows fixes teaches the reader
 * that a shrinking issue list means progress — which is exactly the reading
 * `scan-diff.ts` exists to stop.
 */
const demoScanDiff: PulseScanDiff = {
  previousScanId: "scan-northwind-prev",
  previousCompletedAt: "2026-07-30T09:14:00.000Z",
  previousScore: 80,
  currentScore: 86,
  currentCompletedAt: null,
  summary: "2 fixed, 1 got worse, 1 new issue, and 2 Pulse could not check this time.",
  scoreChange: 6,
  fixed: [
    { checkKey: "security_headers_csp", label: "Content-Security-Policy present", category: "Security", status: "PASS", prevStatus: "FAIL" },
    { checkKey: "https_redirect", label: "HTTP redirects to HTTPS", category: "Security", status: "PASS", prevStatus: "WARN" },
  ],
  regressed: [
    { checkKey: "sitemap_present", label: "sitemap.xml reachable", category: "SEO", status: "FAIL", prevStatus: "PASS" },
  ],
  newIssues: [
    { checkKey: "cookie_consent_prior", label: "Consent taken before non-essential cookies", category: "Legal & Compliance", status: "WARN" },
  ],
  unverified: [
    {
      checkKey: "supabase_rls_enforced",
      label: "Row-level security enforced",
      category: "Security",
      status: null,
      prevStatus: "FAIL",
      reason: "CHECK_ABSENT",
      detail:
        "This control did not run in the current scan, so the finding from last time is neither confirmed nor cleared. It is still outstanding until something proves otherwise.",
    },
    {
      checkKey: "has_tests",
      label: "Automated tests present",
      category: "Code Quality",
      status: "NOT_TESTED",
      prevStatus: "WARN",
      reason: "CHECK_DISABLED",
      detail:
        "This control is switched off in workspace settings, so the finding from last time was not re-tested. Turning a check off does not resolve what it found.",
    },
  ],
};

/**
 * The Cadenza and Fairway diffs, built from their recorded rows so every label, category and
 * current status is the one the scan page shows. Previous statuses are the demo's story.
 */
function recordedDiffItem(rows: { checkKey: string; label: string; category: string; status: string }[], checkKey: string, prevStatus: ScanDiffItem["status"]): ScanDiffItem {
  const r = rows.find((x) => x.checkKey === checkKey);
  if (!r) throw new Error(`demo diff: ${checkKey} is not in the recorded scan`);
  return { checkKey, label: r.label, category: r.category, status: r.status as ScanDiffItem["status"], prevStatus };
}

const demoScanDiffCadenza: PulseScanDiff = {
  previousScanId: "scan-cadenza-prev",
  previousCompletedAt: "2026-09-28T09:00:00.000Z",
  previousScore: RECORDED_CADENZA_SCORE - 4,
  currentScore: RECORDED_CADENZA_SCORE,
  currentCompletedAt: null,
  summary: "2 fixed, 1 got worse, 1 new issue, and 1 Pulse could not check this time.",
  scoreChange: 4,
  fixed: [
    recordedDiffItem(RECORDED_CADENZA_CHECKS, "web_dependency_pinning", "WARN"),
    recordedDiffItem(RECORDED_CADENZA_CHECKS, "svc_session_cookie_flags", "FAIL"),
  ],
  regressed: [recordedDiffItem(RECORDED_CADENZA_CHECKS, "clean_duplication_cross_file", "PASS")],
  newIssues: [(({ prevStatus: _p, ...rest }) => rest)(recordedDiffItem(RECORDED_CADENZA_CHECKS, "svc_express_body_limit", "WARN"))],
  unverified: [
    {
      ...(({ prevStatus: _p, ...rest }) => rest)(recordedDiffItem(RECORDED_CADENZA_CHECKS, "branch_protection", "FAIL")),
      prevStatus: "FAIL",
      reason: "PROBE_INCONCLUSIVE",
      detail: "This scan could not read the branch rules, so the finding from last time is neither confirmed nor cleared.",
    },
  ],
};

const demoScanDiffFairway: PulseScanDiff = {
  previousScanId: "scan-fairway-prev",
  previousCompletedAt: "2026-10-08T09:00:00.000Z",
  previousScore: RECORDED_FAIRWAY_SCORE + 4,
  currentScore: RECORDED_FAIRWAY_SCORE,
  currentCompletedAt: null,
  summary: "1 fixed, 2 got worse, 1 new issue, and 1 Pulse could not check this time.",
  scoreChange: -4,
  fixed: [recordedDiffItem(RECORDED_FAIRWAY_CHECKS, "http_redirect", "FAIL")],
  regressed: [
    recordedDiffItem(RECORDED_FAIRWAY_CHECKS, "secure_cookie_attributes", "PASS"),
    recordedDiffItem(RECORDED_FAIRWAY_CHECKS, "crawl_html_lang", "PASS"),
  ],
  newIssues: [(({ prevStatus: _p, ...rest }) => rest)(recordedDiffItem(RECORDED_FAIRWAY_CHECKS, "api_trace_method", "WARN"))],
  unverified: [
    {
      ...(({ prevStatus: _p, ...rest }) => rest)(recordedDiffItem(RECORDED_FAIRWAY_CHECKS, "dmarc_record", "WARN")),
      prevStatus: "WARN",
      reason: "PROBE_INCONCLUSIVE",
      detail: "The DNS lookup did not complete this time, so the finding from last time is neither confirmed nor cleared.",
    },
  ],
};

const demoScanDiffs: Record<string, PulseScanDiff> = {
  "scan-cadenza": demoScanDiffCadenza,
  "scan-fairway": demoScanDiffFairway,
};

const demoPulseStats = {
  totalScans: 3,
  completedScans: 3,
  avgHealthScore: Math.round((86 + RECORDED_CADENZA_SCORE + RECORDED_FAIRWAY_SCORE) / 3),
  awaitingFollowUp: 2,
  totalCriticalGaps: 8,
  // Every score is 75 or above, so all three are green: tiers come from the recorded scores.
  healthTiers: {
    green: [86, RECORDED_CADENZA_SCORE, RECORDED_FAIRWAY_SCORE].filter((x) => x >= 75).length,
    amber: [86, RECORDED_CADENZA_SCORE, RECORDED_FAIRWAY_SCORE].filter((x) => x >= 50 && x < 75).length,
    red: [86, RECORDED_CADENZA_SCORE, RECORDED_FAIRWAY_SCORE].filter((x) => x < 50).length,
  },
  recentScans: demoPulseScanList,
};

const demoPulsePortfolio = [
  { key: "client:northwind", clientId: WIKI_CLIENT.id, label: "Northwind Studio", scanCount: 3, latestScanId: "scan-northwind", latestScore: 86, latestStatus: "COMPLETED", lastScannedAt: atDays(-5), delta: 7, sparkline: [71, 74, 79, 86], worstScore: 86, monitor: { active: true, alerting: false }, running: false },
  { key: "client:cadenza", clientId: null, label: "Cadenza", scanCount: 2, latestScanId: "scan-cadenza", latestScore: RECORDED_CADENZA_SCORE, latestStatus: "COMPLETED", lastScannedAt: atDays(-2), delta: 4, sparkline: [RECORDED_CADENZA_SCORE - 4, RECORDED_CADENZA_SCORE], worstScore: RECORDED_CADENZA_SCORE - 4, monitor: null, running: false },
  { key: "client:fairway", clientId: null, label: "Fairway Nine", scanCount: 2, latestScanId: "scan-fairway", latestScore: RECORDED_FAIRWAY_SCORE, latestStatus: "COMPLETED", lastScannedAt: atDays(-1), delta: -4, sparkline: [RECORDED_FAIRWAY_SCORE + 4, RECORDED_FAIRWAY_SCORE], worstScore: RECORDED_FAIRWAY_SCORE, monitor: { active: true, alerting: true }, running: false },
];

// ─── Resolver used by the fetch interceptor ─────────────────────────────────────

/**
 * Map an `/api/...` pathname (query stripped) to its demo payload. Returns an
 * empty object for anything unmapped so no fetcher errors or hangs during the demo.
 */
/**
 * Demo Launchpad writes, applied through the REAL `applyItemPatch` / `computeCompleteness`
 * so the demo exercises the actual status machine rather than a mock of it. That is
 * the whole value of driving `/demo/portal` to verify a gated screen — a fake that
 * always returns success verifies the CSS and nothing else.
 *
 * State is module-level and resets on reload, which is correct for a demo.
 */
let demoLaunchpadState: LaunchpadDTO | null = null;

function demoLaunchpadNow(): LaunchpadDTO {
  demoLaunchpadState ??= demoLaunchpad;
  return demoLaunchpadState;
}

function recomputeDemoLaunchpad(next: LaunchpadDTO): LaunchpadDTO {
  const updated: LaunchpadDTO = {
    ...next,
    completeness: computeCompleteness(
      next.structure,
      next.enabledModules,
      next.items,
      next.answers,
    ),
  };
  demoLaunchpadState = updated;
  return updated;
}

/** Handle one demo Launchpad request. Returns undefined when the path isn't ours. */
function resolveDemoLaunchpad(
  pathname: string,
  init?: { method?: string; body?: unknown },
): unknown {
  const current = demoLaunchpadNow();
  const body =
    typeof init?.body === "string"
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};

  // Per-client requirements, through the REAL custom-item rules.
  const custom = /\/launchpad\/custom-items(?:\/([^/]+))?$/.exec(pathname);
  if (custom) {
    const itemId = custom[1] ? decodeURIComponent(custom[1]) : null;
    const input = body as {
      moduleId?: string;
      label?: string;
      helper?: string | null;
      ownedByClient?: boolean | null;
    };
    const next = !itemId
      ? addCustomItem(
          current.structure,
          input.moduleId ?? "",
          { label: input.label ?? "", helper: input.helper, ownedByClient: input.ownedByClient },
          newCustomItemId(current.structure),
        )
      : init?.method === "DELETE"
        ? removeCustomItem(current.structure, itemId)
        : updateCustomItem(current.structure, itemId, input);
    // The demo interceptor always answers 200, so a refused edit returns the kit
    // unchanged rather than an `error` the caller would read as a success.
    if (!next) return { launchpad: current };
    return { launchpad: recomputeDemoLaunchpad({ ...current, structure: next }) };
  }

  // Files on a requirement. The demo keeps metadata only (a download link 404s on
  // the demo — there is no server behind it; the client has already run the real
  // upload verdict on the bytes) but runs the REAL status rule.
  const files = /\/launchpad\/items\/([^/]+)\/files(?:\/([^/]+))?$/.exec(pathname);
  if (files) {
    const itemId = decodeURIComponent(files[1]);
    const fileId = files[2] ? decodeURIComponent(files[2]) : null;
    const existing = current.items.find((i) => i.itemId === itemId);
    let list = existing?.files ?? [];
    if (init?.method === "DELETE" && fileId) {
      list = list.filter((f) => f.id !== fileId);
    } else {
      const file = init?.body instanceof FormData ? init.body.get("file") : null;
      if (!(file instanceof File) || list.length >= LAUNCHPAD_FILE_MAX_PER_ITEM) {
        return { launchpad: current };
      }
      list = [
        ...list,
        {
          id: `lpf-demo-${Date.now()}`,
          filename: sanitizeLaunchpadFilename(file.name),
          mime: file.type || "application/octet-stream",
          size: file.size,
          uploadedByKind: "team",
          uploadedByName: "Priya Shah",
          uploadedAt: atDays(0),
        },
      ];
    }
    const values = applyItemPatch(
      {
        status: existing?.status ?? "NEEDED",
        link: existing?.link ?? null,
        note: existing?.note ?? null,
        ownedByClient: existing?.ownedByClient ?? null,
      },
      {},
      { fileCount: list.length, filesChanged: true },
    );
    const nextItem: LaunchpadItemState = {
      itemId,
      ...values,
      updatedBy: "Priya Shah",
      updatedAt: atDays(0),
      files: list,
    };
    const items = existing
      ? current.items.map((i) => (i.itemId === itemId ? nextItem : i))
      : [...current.items, nextItem];
    return { launchpad: recomputeDemoLaunchpad({ ...current, items }) };
  }

  const match = /\/launchpad(?:\/(items|docs)\/([^/]+))?(?:\/(modules|answers))?$/.exec(pathname);
  if (!match) return undefined;
  const [, kind, id] = match;

  if (kind === "items" && id) {
    const itemId = decodeURIComponent(id);
    const existing = current.items.find((i) => i.itemId === itemId);
    const nextValues = applyItemPatch(
      {
        status: existing?.status ?? "NEEDED",
        link: existing?.link ?? null,
        note: existing?.note ?? null,
        ownedByClient: existing?.ownedByClient ?? null,
      },
      body as Parameters<typeof applyItemPatch>[1],
      { fileCount: existing?.files?.length ?? 0 },
    );
    const nextItem: LaunchpadItemState = {
      ...existing,
      itemId,
      ...nextValues,
      updatedBy: "Priya Shah",
      updatedAt: atDays(0),
    };
    const items = existing
      ? current.items.map((i) => (i.itemId === itemId ? nextItem : i))
      : [...current.items, nextItem];
    return { launchpad: recomputeDemoLaunchpad({ ...current, items }) };
  }

  if (kind === "docs" && id) {
    const docs = current.docs.map((d) => {
      if (d.docKey !== id) return d;
      if (typeof body.approved === "boolean") {
        return {
          ...d,
          status: body.approved ? ("APPROVED" as const) : d.edited ? ("EDITED" as const) : ("TEMPLATE" as const),
          approvedAt: body.approved ? atDays(0) : null,
          approvedByEmail: body.approved ? "priya@northwindstudio.co.uk" : null,
        };
      }
      const answers = { ...d.answers, ...((body.answers as object) ?? {}) };
      const bodyText = typeof body.body === "string" ? body.body : null;
      const rendered = renderLegalDoc(d.docKey, answers);
      return {
        ...d,
        answers,
        body: bodyText ? bodyText : rendered.body,
        edited: Boolean(bodyText),
        status: bodyText ? ("EDITED" as const) : ("TEMPLATE" as const),
        approvedAt: null,
        approvedByEmail: null,
      };
    });
    return { launchpad: recomputeDemoLaunchpad({ ...current, docs }) };
  }

  if (pathname.endsWith("/modules")) {
    const enabledModules = Array.isArray(body.enabledModules)
      ? (body.enabledModules as string[])
      : current.enabledModules;
    return { launchpad: recomputeDemoLaunchpad({ ...current, enabledModules }) };
  }

  if (pathname.endsWith("/answers")) {
    const answers = { ...current.answers, ...((body.answers as object) ?? {}) };
    return { launchpad: recomputeDemoLaunchpad({ ...current, answers }) };
  }

  return { launchpad: current };
}

// ─── Client summary board ────────────────────────────────────────────────────────

/**
 * Seeded so the board can actually be READ in the demo: one client in each bucket,
 * one hidden, a fresh note and a stale one.
 *
 * ⚠️ A fixture of six healthy clients would verify the CSS and nothing else (§43.3) —
 * the ordering, the "no signal" bucket and the stale-note marking are the parts most
 * likely to be wrong, so each has a row that exercises it. The verdicts are NOT
 * written here: `buildSummaryBoard` derives them from these figures on every read,
 * exactly as the server does.
 */
const demoSummaryClients: SummaryClientInput[] = [
  {
    id: "cl-northwind",
    slug: "northwind",
    name: "Northwind Studio",
    hidden: false,
    devCount: 3,
    deliveredThisWeek: 4,
    inFlight: 3,
    planned: 11,
    note: "Search release slipped a week — their content team is late on copy.",
    detail:
      "Facets and autocomplete are built and behind a flag. The blocker is 40-odd category descriptions we asked for on the 2nd; their marketing lead is on leave until Monday. If it lands next week we hold the launch date, if not it moves a fortnight. Nothing is blocked on us.",
    noteAt: atDays(-2),
  },
  {
    id: "cl-cadenza",
    slug: "cadenza",
    name: "Cadenza",
    hidden: false,
    devCount: 2,
    deliveredThisWeek: 0,
    inFlight: 0,
    planned: 6,
    note: "All on track, nothing to flag.",
    detail: null,
    // Deliberately old: this is the case the stale marker exists for — prose that
    // reads as current sitting beside figures that say otherwise.
    noteAt: atDays(-21),
  },
  {
    id: "cl-bigwedge",
    slug: "fairway-nine",
    name: "Fairway Nine",
    hidden: false,
    devCount: 2,
    deliveredThisWeek: 6,
    inFlight: 2,
    planned: 8,
    note: null,
    detail: null,
    noteAt: null,
  },
  {
    id: "cl-orrery",
    slug: "orrery",
    name: "Orrery Health",
    hidden: false,
    devCount: 0,
    deliveredThisWeek: 0,
    inFlight: 0,
    planned: 0,
    note: null,
    detail: null,
    noteAt: null,
  },
  {
    id: "cl-lantern",
    slug: "lantern",
    name: "Lantern Logistics",
    hidden: false,
    devCount: 1,
    deliveredThisWeek: 2,
    inFlight: 1,
    planned: 4,
    note: "Retainer renewed to March.",
    detail: null,
    noteAt: atDays(-5),
  },
  {
    id: "cl-freeway",
    slug: "freeway",
    name: "Freeway",
    hidden: true,
    devCount: 1,
    deliveredThisWeek: 1,
    inFlight: 1,
    planned: 2,
    note: null,
    detail: null,
    noteAt: null,
  },
];

/**
 * GET the board, or PATCH one card. Writes go through the SAME rules as the server —
 * the note's stamp moves with its text and is cleared with it — so the demo can show
 * a note going stale-free, not merely re-render.
 */
function resolveDemoSummary(pathname: string, init?: { method?: string; body?: unknown }) {
  if (pathname === "/api/clients/summary") {
    const board = buildSummaryBoard(demoSummaryClients, new Date());
    // Distinct people, deliberately LESS than the sum of the per-client counts (9) —
    // a fixture where the two agree cannot show the difference the real query exists
    // to get right.
    return { ...board, devTotal: 6, generatedAt: atDays(0) };
  }
  const match = /^\/api\/clients\/summary\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  const row = demoSummaryClients.find((c) => c.id === match[1]);
  if (!row) return { error: "No such client in this workspace" };
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as {
    note?: string | null;
    hidden?: boolean;
  };
  if (body.note !== undefined) {
    const trimmed = body.note?.trim() ?? "";
    row.note = trimmed === "" ? null : trimmed;
    row.noteAt = row.note ? atDays(0) : null;
  }
  if (body.hidden !== undefined) row.hidden = body.hidden;
  return { ok: true };
}

// ── Pulse findings (demo) ─────────────────────────────────────────────────────
// Writes are applied to an in-memory copy, so triage on /demo/pulse behaves like the
// real page for the session. Northwind starts with one finding on the board and one
// accepted, so every stage of the list has something in it.
const demoFindingStore = new Map<string, { states: import("@/lib/pulse-findings").FindingState[]; tasks: import("@/lib/pulse-findings").FindingTask[] }>();

function demoFindingSeed(scanId: string) {
  const scan = (demoPulseScansById as Record<string, typeof demoScanNorthwind>)[scanId] ?? demoScanNorthwind;
  const warns = scan.checks.filter((c) => c.status === "WARN").map((c) => c.checkKey);
  const states: import("@/lib/pulse-findings").FindingState[] = [];
  const tasks: import("@/lib/pulse-findings").FindingTask[] = [];
  // One finding on the board and one accepted risk per scan, chosen from that scan's own warnings.
  const seeds: Record<string, { task: string; title: string; assignee: string; accept: string; note: string }> = {
    "scan-northwind": { task: warns[0], title: "[Pulse] finding", assignee: "Alex Rivera", accept: warns[1], note: "Marketing site only; no user data on these pages." },
    "scan-cadenza": { task: "svc_error_tracking", title: "[Pulse] The service reports errors to a tracker", assignee: "Marco Bianchi", accept: "has_typescript", note: "Staying on JavaScript this year; revisit with the next major release." },
    "scan-fairway": { task: "hsts_header", title: "[Pulse] HSTS header", assignee: "Alex Rivera", accept: "cdn_detected", note: "Local club site; traffic is too small to justify a CDN." },
  };
  const seed = seeds[scanId];
  const has = (key: string | undefined) => Boolean(key && warns.includes(key));
  if (seed && has(seed.task) && has(seed.accept)) {
    const id = `demo-pulse-task-${scanId}`;
    states.push({ checkKey: seed.task, decision: null, note: null, taskId: id, decidedByName: null, decidedAt: null });
    tasks.push({ id, status: "DOING", title: seed.title, assigneeName: seed.assignee, clientSlug: scanId === "scan-northwind" ? WIKI_CLIENT.slug : null });
    states.push({ checkKey: seed.accept, decision: "ACCEPTED_RISK", note: seed.note, taskId: null, decidedByName: "Alex Rivera", decidedAt: atDays(-1) });
  }
  if (scanId === "scan-northwind" && warns[2]) {
    // Dismissed as not a real issue on an earlier scan, about a different report: back in Open.
    states.push({ checkKey: warns[2], decision: "FALSE_POSITIVE", note: "The banner is set by the CDN, not the page.", taskId: null, decidedByName: "Alex Rivera", decidedAt: atDays(-30), fingerprint: "00000000", decisionStatus: "WARN", passedSinceDecision: false });
  }
  return { states, tasks };
}

function demoPulseFindings(scanId: string, isTask: boolean, init?: { method?: string; body?: unknown }) {
  const store = demoFindingStore.get(scanId) ?? demoFindingSeed(scanId);
  demoFindingStore.set(scanId, store);
  const scan = (demoPulseScansById as Record<string, typeof demoScanNorthwind>)[scanId] ?? demoScanNorthwind;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Record<string, unknown> = {};
  try { body = typeof init?.body === "string" ? JSON.parse(init.body) : {}; } catch { body = {}; }
  const checkKey = typeof body.checkKey === "string" ? body.checkKey : "";
  const upsert = (patch: Partial<import("@/lib/pulse-findings").FindingState>) => {
    const i = store.states.findIndex((st) => st.checkKey === checkKey);
    const base = i >= 0 ? store.states[i] : { checkKey, decision: null, note: null, taskId: null, decidedByName: null, decidedAt: null };
    const next = { ...base, ...patch };
    if (i >= 0) store.states[i] = next; else store.states.push(next);
  };
  if (isTask && method === "POST" && checkKey) {
    const id = `demo-pulse-task-${store.tasks.length + 2}`;
    const slug = CLIENTS.find((c) => c.id === scan.clientId)?.slug ?? null;
    store.tasks.push({ id, status: "TODO", title: `[Pulse] ${checkKey}`, assigneeName: null, clientSlug: slug });
    upsert({ taskId: id });
    return { taskId: id, created: true, targetKey: targetKey(scan), clientId: scan.clientId, ...store };
  }
  if (method === "PUT" && checkKey) {
    const decision = body.decision === "ACCEPTED_RISK" || body.decision === "FALSE_POSITIVE" ? body.decision : null;
    const check = scan.checks.find((c) => c.checkKey === checkKey);
    upsert({
      decision, note: decision && typeof body.note === "string" ? body.note : null, decidedByName: "Alex Rivera", decidedAt: new Date().toISOString(),
      fingerprint: decision && check ? findingFingerprint(check) : null, decisionStatus: decision && check ? check.status : null, passedSinceDecision: false,
    });
  }
  return { targetKey: targetKey(scan), clientId: scan.clientId, ...store };
}

/** Each demo project's open findings, by the same rule and the same in-memory decisions as its scan page. */
function demoWithOpenFindings(projects: PulseProject[]): PulseProject[] {
  return sortProjects(projects.map((p) => {
    const scan = p.latestCompletedScanId ? (demoPulseScansById as Record<string, typeof demoScanNorthwind>)[p.latestCompletedScanId] : undefined;
    if (!scan || !p.latestCompletedScanId) return p;
    const store = demoFindingStore.get(p.latestCompletedScanId) ?? demoFindingSeed(p.latestCompletedScanId);
    demoFindingStore.set(p.latestCompletedScanId, store);
    return applyFindingCounts(p, openFindingCounts(scan.checks, store.states, store.tasks));
  }));
}

export function resolveDemoApi(
  pathname: string,
  search?: URLSearchParams,
  init?: { method?: string; body?: unknown },
): unknown {
  switch (pathname) {
    case "/api/account":
      return demoAccount;
    case "/api/clients":
      return demoClients;
    case "/api/tasks/standup":
      return demoMyDay;
    case "/api/tasks/attention":
      return demoAttention;
    case "/api/integrations/calendar":
      return demoCalendar;
    case "/api/integrations/gmail":
      return demoGmail;
    case "/api/desk/action-items":
      return demoActionItems;
    case "/api/desk/slack":
      return demoSlack;
    case "/api/desk/holidays":
      return demoDeskHolidays;
    case "/api/auth/session":
      return demoSession;
  }
  // Drive — the team's (by slug) and the client's (by share token) read the same fixture.
  if (/^\/api\/(clients\/[^/]+|wiki\/[^/]+)\/drive$/.test(pathname)) return resolveDemoDrive(search);
  if (pathname === "/api/staff" || pathname.startsWith("/api/staff/")) {
    const result = resolveDemoStaff(pathname, init);
    if (result !== undefined) return result;
  }
  if (pathname.startsWith("/api/platform/")) {
    const result = resolveDemoPlatform(pathname, init, search);
    if (result !== undefined) return result;
  }
  if (pathname.startsWith("/api/clients/summary")) {
    const result = resolveDemoSummary(pathname, init);
    if (result !== undefined) return result;
  }
  // Launchpad — reads and writes, applied through the real status machine.
  // Wiki → Meetings share picker. GET only: the shared ones come from the wiki fixture,
  // plus one unshared call, so the picker shows both states rather than an empty list.
  if (/^\/api\/clients\/[^/]+\/wiki\/meetings$/.test(pathname) && (init?.method ?? "GET") === "GET") {
    return {
      meetings: [
        ...demoWiki.meetings.meetings.map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt, shared: true })),
        { id: "mtg-internal", title: "Internal: Northwind sprint planning", startedAt: atDays(-6), shared: false },
      ].sort((a, b) => (a.startedAt ?? "") < (b.startedAt ?? "") ? 1 : -1),
    };
  }
  // Monitors → "From this client's Platforms". Two URLs nothing watches yet, so the
  // one-click suggestions render (the catch-all's `{}` would hide the block entirely).
  if (/^\/api\/clients\/[^/]+\/wiki\/monitors\/suggestions$/.test(pathname)) {
    return {
      suggestions: [
        { name: "Admin panel", target: "https://admin.northwind.co/" },
        { name: "Status page", target: "https://status.northwind.co/" },
      ],
    };
  }
  if (pathname.includes("/launchpad")) {
    const result = resolveDemoLaunchpad(pathname, init);
    if (result !== undefined) return result;
  }
  // Requests → @mention roster, and replies. A reply is appended to the fixture so the
  // refetch that follows shows it — a demo where posting changes nothing verifies the
  // CSS and nothing else (§43.3).
  if (/^\/api\/(clients\/[^/]+\/wiki|wiki\/[^/]+)\/mentionables$/.test(pathname)) {
    return {
      people: [
        { id: "client:u-marcus", name: "Marcus Webb", kind: "CLIENT" },
        { id: "client:u-priya", name: "Priya Shah", kind: "CLIENT" },
        { id: "team:u-harry", name: "Harry Bell", kind: "TEAM" },
        { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM" },
        { id: "team:u-lena", name: "Lena Hartmann", kind: "TEAM" },
      ],
      slack: { connected: true, channelName: "ext-northwind-gitwork" },
    };
  }
  {
    const m = /^\/api\/(?:clients\/[^/]+\/wiki|wiki\/[^/]+)\/intake-items\/([^/]+)\/comments$/.exec(pathname);
    if (m && init?.method === "POST") {
      const item = demoWiki.intakeItems.find((i) => i.id === decodeURIComponent(m[1]));
      const payload = JSON.parse(String(init.body ?? "{}")) as { body?: string; mentionIds?: string[] };
      const names: Record<string, { name: string; kind: "TEAM" | "CLIENT" }> = {
        "client:u-marcus": { name: "Marcus Webb", kind: "CLIENT" },
        "client:u-priya": { name: "Priya Shah", kind: "CLIENT" },
        "team:u-harry": { name: "Harry Bell", kind: "TEAM" },
        "team:u-sam": { name: "Sam Okafor", kind: "TEAM" },
        "team:u-lena": { name: "Lena Hartmann", kind: "TEAM" },
      };
      const comment = {
        id: `wc-${Date.now()}`,
        authorKind: "TEAM" as const,
        authorName: "You",
        body: (payload.body ?? "").trim(),
        mentions: (payload.mentionIds ?? [])
          .filter((id) => names[id])
          .map((id) => ({ id, ...names[id] })),
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        hasImage: false,
        imageFilename: null,
        // Your own reply — so Edit/Delete can be tried on it straight away.
        canEdit: true,
        canDelete: true,
      };
      item?.comments.push(comment);
      return comment;
    }
  }
  // Edit / delete a reply, and attach a screenshot to one. Applied to the fixture, and
  // gated on the reply's own canEdit/canDelete exactly like the real routes, so the demo
  // shows a reply you may not touch staying untouched.
  {
    const m = /^\/api\/(?:clients\/[^/]+\/wiki|wiki\/[^/]+)\/intake-items\/([^/]+)\/comments\/([^/]+)(\/image)?$/.exec(pathname);
    if (m && init?.method && init.method !== "GET") {
      const item = demoWiki.intakeItems.find((i) => i.id === decodeURIComponent(m[1]));
      const comment = item?.comments.find((c) => c.id === decodeURIComponent(m[2]));
      if (!comment) return { error: "Reply not found" };
      if (m[3] && init.method === "POST") {
        if (!comment.canEdit) return comment;
        const file = init.body instanceof FormData ? init.body.get("file") : null;
        Object.assign(comment, { hasImage: true, imageFilename: file instanceof File ? file.name : "screenshot.png" });
        return comment;
      }
      if (init.method === "PATCH" && comment.canEdit) {
        const payload = JSON.parse(String(init.body ?? "{}")) as { body?: string };
        Object.assign(comment, { body: (payload.body ?? comment.body).trim(), editedAt: new Date().toISOString() });
      }
      if (init.method === "DELETE" && comment.canDelete) {
        Object.assign(comment, {
          body: "",
          mentions: [],
          deleted: true,
          editedAt: null,
          hasImage: false,
          imageFilename: null,
          canEdit: false,
          canDelete: false,
        });
      }
      return comment;
    }
  }
  // Sheets — every internal Sheets write is applied to the fixture (src/lib/demo/demo-sheets.ts).
  {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = (typeof init?.body === "string" ? JSON.parse(init.body) : init?.body) as
      | Record<string, unknown>
      | undefined;
    const handled = resolveDemoSheets(pathname, method, body);
    if (handled !== undefined) return handled;
  }
  // Comparisons — writes are applied to the fixture, so an edit survives the refetch that
  // follows it. A demo where saving changes nothing verifies the CSS and nothing else (§43.3).
  {
    const m = /^\/api\/clients\/[^/]+\/wiki\/comparisons(?:\/([^/]+))?$/.exec(pathname);
    if (m) {
      const method = (init?.method ?? "GET").toUpperCase();
      const body = (typeof init?.body === "string" ? JSON.parse(init.body) : init?.body) as
        | Record<string, unknown>
        | undefined;
      const section = demoWiki.comparisons;
      const write = (target: WikiComparison, b: Record<string, unknown>): WikiComparison => {
        const content = parseComparisonContent(b.columns, b.rows);
        if (comparisonLimitError(content)) return target;
        return {
          ...target,
          title: typeof b.title === "string" ? b.title : target.title,
          description: typeof b.description === "string" ? b.description : null,
          ...content,
          updatedAt: new Date().toISOString(),
        };
      };
      if (!m[1]) {
        if (method === "PATCH" && body) section.enabled = body.enabled === true;
        if (method === "PUT" && Array.isArray(body?.order)) {
          const order = body.order as string[];
          section.comparisons.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        }
        if (method === "POST" && body) {
          const created = write(
            {
              id: `cmp-${Date.now().toString(36)}`,
              title: "",
              description: null,
              columns: [],
              rows: [],
              orderKey: section.comparisons.length,
              updatedAt: "",
            },
            body,
          );
          section.comparisons.push(created);
          return { comparison: created, section };
        }
        return section;
      }
      const i = section.comparisons.findIndex((c) => c.id === m[1]);
      if (i === -1) return { deleted: false };
      if (method === "DELETE") {
        section.comparisons.splice(i, 1);
        return { deleted: true };
      }
      if (method === "PATCH" && body) section.comparisons[i] = write(section.comparisons[i], body);
      return section.comparisons[i];
    }
  }
  // Client wiki — GET /api/clients/{slug}/wiki (exact; sub-paths are mutations → benign).
  if (/^\/api\/clients\/[^/]+\/wiki$/.test(pathname)) {
    return {
      ...demoWiki,
      launchpad: demoLaunchpadNow(),
      // A copy: the fixture is mutated by writes, and React Query's structural sharing would
      // otherwise compare the cache against the very object that changed and see no change.
      comparisons: JSON.parse(JSON.stringify(demoWiki.comparisons)) as WikiDTO["comparisons"],
      sheets: JSON.parse(JSON.stringify(demoSheets)) as WikiDTO["sheets"],
    };
  }
  // Client portal detail sub-reads (before the generic /api/clients/{slug} case).
  if (/^\/api\/clients\/[^/]+\/slack-activity$/.test(pathname)) {
    return demoSlackActivity;
  }
  if (/^\/api\/clients\/[^/]+\/meetings$/.test(pathname)) {
    return demoClientMeetings;
  }
  if (/^\/api\/clients\/[^/]+\/design-system$/.test(pathname)) {
    return demoDesignSystem;
  }
  // Single client — GET /api/clients/{slug} (exact; not a sub-resource).
  if (/^\/api\/clients\/[^/]+$/.test(pathname)) {
    return demoClientDetail;
  }

  // Docs.
  if (pathname === "/api/proposals") return demoProposals;
  if (pathname === "/api/templates") return { templates: [] };
  if (pathname === "/api/snippets") return { snippets: [] };
  // De-brand the demo document render: blank the letterhead so covers/headers show the client, not
  // the Gitwork/Foundry marks (companyName "" is the de-brand signal read by cover.tsx). The live
  // product leaves branding unset and keeps the Gitwork defaults.
  if (pathname === "/api/workspace/branding")
    return { branding: { companyName: "", companyFooter: { left: [], right: [] } } };
  {
    const pm = pathname.match(/^\/api\/proposals\/([^/?#]+)$/);
    if (pm) return { proposal: getDemoDoc(pm[1]) };
  }
  {
    const sm = pathname.match(/^\/api\/documents\/([^/?#]+)\/snapshot$/);
    if (sm) return demoDocSnapshot(sm[1]);
  }

  // Tasks — feature blocks + milestones (per-client tasks page).
  if (pathname === "/api/feature-blocks") return demoFeatureBlocks;
  if (pathname === "/api/milestones") return demoMilestones;
  // Push-to-Slack composer prefs (so the modal renders with sensible defaults).
  if (pathname === "/api/tasks/push-prefs")
    return { detail: "TITLES", statusGroups: ["DOING", "DONE"], excludedCategoryIds: [], defaultNote: null };

  // Care (support triage).
  if (pathname === "/api/support/clients") return demoSupportClients;
  {
    const conv = pathname.match(/^\/api\/support\/clients\/([^/]+)\/conversations$/);
    if (conv) return { conversations: filterDemoConversations(conv[1], search), nextCursor: null };
  }
  {
    const counts = pathname.match(/^\/api\/support\/clients\/([^/]+)\/conversations\/counts$/);
    if (counts) return { counts: demoQueueCounts(counts[1]) };
  }
  // Care home's one-request roll-up for every client.
  if (pathname === "/api/support/queue-summaries") {
    const summaries: Record<string, ReturnType<typeof demoQueueCounts>> = {};
    for (const id of Object.keys(demoConversationsByClient)) summaries[id] = demoQueueCounts(id);
    return { summaries };
  }
  {
    const conns = pathname.match(/^\/api\/support\/clients\/([^/]+)\/connections$/);
    if (conns) return { connections: demoSupportConnections.filter((c) => c.clientId === conns[1]) };
  }
  if (/^\/api\/support\/clients\/[^/]+\/members$/.test(pathname)) return { members: demoSupportMembers };
  {
    const msgs = pathname.match(/^\/api\/support\/clients\/[^/]+\/conversations\/([^/]+)\/messages$/);
    if (msgs) return { messages: demoMessagesByConversation[msgs[1]] ?? [] };
  }
  {
    const notes = pathname.match(/^\/api\/support\/clients\/[^/]+\/conversations\/([^/]+)\/notes$/);
    if (notes) return { notes: demoNotesByConversation[notes[1]] ?? [] };
  }

  // Backstage — calendar only.
  if (pathname === "/api/backstage/calendar") return demoCalendarMonth;
  if (pathname === "/api/backstage/calendar/connections") return { selfConnected: false, members: [] };
  if (pathname === "/api/backstage/calendar/team-events") return { events: [] };
  if (pathname === "/api/backstage/calendar/timeline") return { blocks: [], milestones: [] };
  if (pathname === "/api/backstage/absences") return []; // AbsenceDTO[] — iterated in CalendarTab
  if (pathname === "/api/backstage/absences/covers") return []; // CoverAssignmentDTO[] — ClientDevelopersSection
  if (pathname === "/api/backstage/leave") return [];
  if (pathname === "/api/backstage/alerts") return demoStaffingAlerts;
  // BackstageMember[] — the task form's assignee picker reads it with `.filter`, so an
  // unmapped `{}` crashed every "New task" in the demo.
  if (pathname === "/api/backstage/team")
    return [
      {
        id: DEV.id,
        name: DEV.name,
        email: DEV_EMAIL,
        avatarUrl: DEV.avatarUrl,
        role: "DEVELOPER",
        countryCode: "GB",
        assignedClientIds: CLIENTS.map((c) => c.id),
      },
    ];

  // Pulse (AI project validation) — 3 seeded reports.
  if (pathname === "/api/pulse/scans") return { scans: demoPulseScanList };
  if (pathname === "/api/pulse/code-portfolio") return demoCodePortfolio();
  if (pathname === "/api/pulse/projects") return { projects: demoWithOpenFindings(buildProjects(demoPulseScanList as unknown as import("@/types/pulse").PulseScanListItem[])) };
  {
    const pp = pathname.match(/^\/api\/pulse\/projects\/([^/]+)$/);
    if (pp) {
      const key = decodeTargetKey(pp[1]);
      const scans = (demoPulseScanList as unknown as import("@/types/pulse").PulseScanListItem[]).filter((sc) => targetKey(sc) === key).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return scans.length ? { project: demoWithOpenFindings(buildProjects(scans))[0], scans } : { project: null, scans: [] };
    }
  }
  if (pathname === "/api/pulse/stats") return demoPulseStats;
  if (pathname === "/api/pulse/portfolio") return { portfolio: demoPulsePortfolio };
  if (pathname === "/api/pulse/leads") return { leads: demoPulseLeads(Date.now()) };
  {
    const lp = pathname.match(/^\/api\/pulse\/leads\/([^/]+)\/preview$/);
    if (lp) {
      const lead = demoPulseLeads(Date.now()).find((l) => l.id === lp[1]) ?? demoPulseLeads(Date.now())[0];
      return {
        id: lead.id, email: lead.email, name: lead.name, business: lead.business, source: lead.source,
        createdAt: lead.createdAt, targetUrl: lead.targetUrl, healthScore: lead.healthScore,
        checks: demoLeadChecks,
      };
    }
  }
  if (pathname === "/api/pulse/monitors") return { monitors: demoPulseMonitors(Date.now()) };
  if (pathname === "/api/workspace/pulse-embed") return demoPulseEmbedConfig;
  if (/^\/api\/pulse\/scans\/[^/]+\/history$/.test(pathname)) return { history: [] };
  {
    const dm = pathname.match(/^\/api\/pulse\/scans\/([^/]+)\/diff$/);
    if (dm) return { diff: demoScanDiffs[dm[1]] ?? demoScanDiff };
  }
  if (/^\/api\/pulse\/scans\/[^/]+\/benchmarks$/.test(pathname)) return { benchmarks: null };
  {
    const fm = pathname.match(/^\/api\/pulse\/scans\/([^/]+)\/findings(\/task)?$/);
    if (fm) return demoPulseFindings(fm[1], Boolean(fm[2]), init);
  }
  {
    const ps = pathname.match(/^\/api\/pulse\/scans\/([^/]+)$/);
    if (ps) return { scan: demoPulseScansById[ps[1]] ?? demoScanNorthwind };
  }

  // `/api/tasks` (list) — after the more specific /api/tasks/* cases above.
  if (pathname === "/api/tasks" || pathname.startsWith("/api/tasks?")) {
    return demoBoardTasks;
  }
  if (pathname.startsWith("/api/tasks/")) {
    // Any per-task write (move/update) — benign success; the list re-fetch above
    // returns the unchanged canned data.
    return { ok: true };
  }

  // DevSignal (developer vetting). The interceptor is method-agnostic, so the
  // list endpoint returns BOTH `items` (GET list) and `assessment` (POST create)
  // so either hook reads the field it wants.
  if (pathname === "/api/devsignal/assessments") {
    return { items: demoDevSignalAssessments, assessment: demoDevSignalNewAssessment };
  }
  if (pathname === "/api/devsignal/analytics/assessments") return { analytics: demoDevSignalAnalytics };
  if (pathname === "/api/devsignal/pipeline-configs") return { items: [demoDevSignalConfig] };
  if (pathname === "/api/devsignal/outcome-links") return { link: { id: "demo-link" } };
  // Detail GET + any per-assessment mutation (run / decision / interview / promote).
  if (/^\/api\/devsignal\/assessments\/[^/]+(\/(run|decision|interview|promote-to-code))?$/.test(pathname)) {
    return { assessment: demoDevSignalDetail };
  }
  // Candidate detail — only the DevSignal detail's outcome-links picker uses this.
  if (/^\/api\/codeclear\/candidates\/[^/]+$/.test(pathname)) {
    return { candidate: demoDevSignalCandidate };
  }

  // Public candidate /vet flow (the 8-step funnel). Challenge/video/identity and
  // data-rights requests are benign successes; consent + session GET + intake/
  // connect return the mock session.
  if (/^\/api\/vet\/[^/]+\/(challenge|video|identity|request)$/.test(pathname)) return { ok: true };
  if (/^\/api\/vet\/[^/]+\/consent$/.test(pathname)) return { session: demoVetSession };
  if (/^\/api\/vet\/[^/]+(\/connect)?$/.test(pathname)) return { session: demoVetSession };

  // ⚠️ The catch-all `{}` is why an unmapped endpoint is NOT harmless here. A hook
  // that reads a field off the response (`.then((r) => r.unread)`) gets `undefined`,
  // and React Query treats an undefined query result as an error — so every demo page
  // that mounts the app shell logged "Query data cannot be undefined" forever, with
  // the notification bell stuck in an error state. Map the endpoint rather than
  // letting it fall through.
  if (pathname === "/api/notifications/unread-count") return { unread: 0 };
  if (/^\/api\/documents\/[^/]+\/signature-requests$/.test(pathname)) return { requests: [] };

  return {};
}


// ─── Pulse leads (public scanner) ─────────────────────────────────────────────
// One per report state, so the demo shows what each looks like on the leads list.
function demoPulseLeads(now: number) {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  return [
    {
      id: "lead-sent", email: "sam@northwind.test", name: "Sam Okafor", business: "Northwind Studio",
      targetUrl: "https://northwind.test/", healthScore: 72, source: "gitwork.co.uk", criticalCount: 2,
      createdAt: ago(95), importedScanId: "demo-northwind", importedScanStatus: "COMPLETED",
      report: { state: "sent" as const, sentAt: ago(91), error: null },
    },
    {
      id: "lead-preparing", email: "priya@lumen.test", name: "Priya Anand", business: "Lumen Health",
      targetUrl: "https://www.lumen.test/", healthScore: 88, source: "production-ready", criticalCount: 0,
      createdAt: ago(2), importedScanId: "demo-lumen", importedScanStatus: "RUNNING",
      report: { state: "preparing" as const, sentAt: null, error: null },
    },
    {
      id: "lead-failed", email: "ops@harbour.test", name: null, business: null,
      targetUrl: "https://harbour.test/", healthScore: 41, source: "gitwork.co.uk", criticalCount: 6,
      createdAt: ago(60 * 26), importedScanId: null, importedScanStatus: null,
      report: { state: "failed" as const, sentAt: null, error: "No report was sent; it was probably interrupted by a server restart." },
    },
    // Enough more to need a second page.
    ...[
      ["Maya Chen", "Fernleaf", "fernleaf.test", 83], ["Tom Hughes", "Brightwater Legal", "brightwater.test", 67],
      ["Aisha Bello", "Kora Foods", "korafoods.test", 91], ["Liam Walsh", "Peak Lettings", "peaklettings.test", 58],
      ["Nina Kowalski", "Saltmarsh", "saltmarsh.test", 76], ["Owen Price", "Ridgeline Bikes", "ridgeline.test", 49],
      ["Grace Mensah", "Atlas Physio", "atlasphysio.test", 88], ["Ravi Shah", "Copper Kettle", "copperkettle.test", 71],
      ["Ellie Ford", "Tidewater", "tidewater.test", 64],
    ].map(([name, business, site, score], i) => ({
      id: `lead-x${i}`, email: `${String(name).split(" ")[0].toLowerCase()}@${site}`, name: String(name), business: String(business),
      targetUrl: `https://${site}/`, healthScore: Number(score), source: i % 3 === 0 ? "production-ready" : "gitwork.co.uk", criticalCount: i % 4,
      createdAt: ago(60 * 24 * (i + 2)), importedScanId: `demo-x${i}`, importedScanStatus: "COMPLETED",
      report: { state: "sent" as const, sentAt: ago(60 * 24 * (i + 2) - 6), error: null },
    })),
  ];
}

const demoLeadChecks = [
  { checkKey: "csp_header", category: "Security", label: "Content-Security-Policy", status: "FAIL", detail: "No Content-Security-Policy header." },
  { checkKey: "privacy_policy", category: "Legal & Compliance", label: "Privacy Policy", status: "FAIL", detail: "No privacy policy link found on the page." },
  { checkKey: "x_frame_options", category: "Security", label: "X-Frame-Options header", status: "WARN", detail: "No X-Frame-Options header and no CSP frame-ancestors directive." },
  { checkKey: "sitemap_xml", category: "SEO", label: "sitemap.xml", status: "WARN", detail: "No sitemap found at /sitemap.xml or declared in robots.txt." },
  { checkKey: "hsts_header", category: "Security", label: "HSTS header", status: "PASS", detail: "max-age=31536000" },
  { checkKey: "ssl_valid", category: "Security", label: "SSL certificate", status: "PASS", detail: "Valid, expires in 74 days." },
  { checkKey: "meta_description", category: "SEO", label: "Meta description", status: "INCONCLUSIVE", detail: "The page renders with JavaScript, so its content isn't in the page source." },
];

// ─── Pulse → Monitors / Growth (demo) ────────────────────────────────────────
// Added for the Pulse nav's Monitors and Growth pages. Fictional projects.
function demoPulseMonitors(now: number) {
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const base = { inputType: "URL", inputGithubRepo: null, webhookSecret: "", alertThreshold: 10, webhookUrl: "", lastDigestAt: null };
  return [
    { ...base, id: "mon-northwind", projectName: "Northwind Studio", inputUrl: "https://northwind.example", lastScanId: "scan-northwind", lastHealthScore: 72, isActive: true, frequency: "WEEKLY", lastRunAt: ago(30), createdAt: ago(900), digestEmails: ["ops@northwind.example"] },
    { ...base, id: "mon-cadenza", projectName: "Cadenza", inputUrl: "https://cadenza.example", lastScanId: "scan-cadenza", lastHealthScore: RECORDED_CADENZA_SCORE, isActive: true, frequency: "DAILY", lastRunAt: ago(5), createdAt: ago(400), digestEmails: [] },
  ];
}

const demoPulseEmbedConfig = {
  enabled: true,
  freeCheckKeys: null,
  bookingUrl: "https://gitwork.co.uk/contact",
  turnstileSiteKey: null,
  turnstileConfigured: true,
};
