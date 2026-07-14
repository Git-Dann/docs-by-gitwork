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

import type {
  TaskDTO,
  TaskStatus,
  TaskPriority,
  MyDayDTO,
  TaskAttentionDTO,
} from "@/types/tasks";
import type { GanttBlock, GanttMilestone } from "@/components/tasks/gantt-chart";

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
    permissions: ["clients", "proposals", "codeclear", "devsignal", "support", "backstage"],
  },
  expires: "2099-01-01T00:00:00.000Z",
};

// ─── Date helpers (relative to now) ─────────────────────────────────────────────

const DAY = 86_400_000;
function atDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
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
  { id: "cl-speakify", name: "Speakify", slug: "speakify" },
  { id: "cl-bigwedge", name: "Big Wedge Golf", slug: "big-wedge-golf" },
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
  },
): TaskDTO {
  const client = byClient[partial.clientSlug];
  return {
    id: partial.id,
    workspaceId: "demo-ws",
    client: { id: client.id, name: client.name, slug: client.slug },
    assignees: [{ id: DEV.id, name: DEV.name, avatarUrl: DEV.avatarUrl }],
    createdBy: { id: DEV.id, name: DEV.name, avatarUrl: DEV.avatarUrl },
    featureBlock: null,
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
    commentCount: partial.commentCount ?? 0,
    subtaskCount: partial.subtaskCount ?? 0,
    subtaskDoneCount: partial.subtaskDoneCount ?? 0,
    attachmentCount: 0,
    metadata: null,
    scribeSource: null,
    createdAt: atDays(-14),
    updatedAt: atDays(-1),
  };
}

/** The master task list — powers the board, dashboard "My Tasks", standup + attention. */
export const demoBoardTasks: TaskDTO[] = [
  mkTask({ id: "t1", title: "Harden webhook retry handling", clientSlug: "northwind", status: "DOING", priority: "HIGH", dueDate: atDays(2), startedAt: atDays(-1), commentCount: 3, subtaskCount: 4, subtaskDoneCount: 1, description: "Add idempotent retry handling for dropped delivery webhooks." }),
  mkTask({ id: "t2", title: "Fix mobile nav overflow on iOS Safari", clientSlug: "speakify", status: "DOING", priority: "HIGH", dueDate: atDays(-1), startedAt: atDays(-2), commentCount: 1 }),
  mkTask({ id: "t3", title: "Booking calendar timezone bug", clientSlug: "big-wedge-golf", status: "DOING", priority: "MEDIUM", dueDate: atDays(-2), startedAt: atDays(-3), commentCount: 5, subtaskCount: 2, subtaskDoneCount: 2 }),
  mkTask({ id: "t4", title: "Add rounds-played analytics endpoint", clientSlug: "big-wedge-golf", status: "IN_REVIEW", priority: "MEDIUM", dueDate: atDays(1), commentCount: 2 }),
  mkTask({ id: "t5", title: "Accessibility pass on onboarding forms", clientSlug: "speakify", status: "IN_REVIEW", priority: "LOW", dueDate: atDays(2) }),
  mkTask({ id: "t6", title: "Migrate image uploads to R2", clientSlug: "northwind", status: "TODO", priority: "MEDIUM", dueDate: atDays(5), subtaskCount: 3 }),
  mkTask({ id: "t7", title: "Cache PGA leaderboard responses", clientSlug: "big-wedge-golf", status: "TODO", priority: "MEDIUM", dueDate: atDays(3) }),
  mkTask({ id: "t8", title: "Onboarding email drip copy", clientSlug: "speakify", status: "TODO", priority: "LOW", dueDate: atDays(7) }),
  mkTask({ id: "t9", title: "Dark-mode audit across dashboard", clientSlug: "northwind", status: "BACKLOG", priority: "LOW" }),
  mkTask({ id: "t10", title: "Refactor auth middleware", clientSlug: "big-wedge-golf", status: "BACKLOG", priority: "MEDIUM" }),
  mkTask({ id: "t11", title: "Ship v2 pricing page", clientSlug: "speakify", status: "DONE", priority: "HIGH", completedAt: todayAt(9, 40) }),
  mkTask({ id: "t12", title: "Add e2e tests for onboarding", clientSlug: "northwind", status: "DONE", priority: "MEDIUM", completedAt: todayAt(11, 15) }),
];

const doing = demoBoardTasks.filter((t) => t.status === "DOING" || t.status === "IN_REVIEW");
const doneToday = demoBoardTasks.filter((t) => t.status === "DONE");
const upcoming = demoBoardTasks.filter((t) => t.status === "TODO" || t.status === "BACKLOG");
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
    "Land webhook retries for Northwind, clear the Speakify a11y review, and close the Big Wedge timezone bug.",
  doing,
  done: doneToday,
  upcoming,
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
      summary: "Speakify weekly sync",
      start: todayAt(16, 30),
      end: todayAt(17, 0),
      attendees: ["dana@speakify.io", "alex@gitwork.co.uk"],
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
    { id: "m4", subject: "[Big Wedge] Staging deploy succeeded", from: "GitHub Actions <ci@github.com>", snippet: "Deployment to staging completed in 4m 12s.", date: atDays(-1), unread: false },
    { id: "m5", subject: "Your weekly Gitwork digest", from: "Foundry <no-reply@gitwork.co.uk>", snippet: "12 tasks moved, 3 shipped, 2 meetings summarised.", date: atDays(-1), unread: false },
  ],
};

// ─── Desk: Scribe action items ──────────────────────────────────────────────────

const demoActionItems = {
  items: [
    { id: "ai1", title: "Send Priya the updated webhook flow diagram", text: "Send Priya the updated webhook flow diagram after standup.", meetingId: "mtg1", meetingTitle: "Northwind — Sprint planning", meetingStartedAt: atDays(-1), clientSlug: "northwind", clientName: "Northwind Studio", hasTask: false },
    { id: "ai2", title: "Confirm timezone handling with Big Wedge", text: "Confirm the booking timezone edge cases with the Big Wedge team.", meetingId: "mtg2", meetingTitle: "Big Wedge weekly", meetingStartedAt: atDays(-2), clientSlug: "big-wedge-golf", clientName: "Big Wedge Golf", hasTask: true },
    { id: "ai3", title: "Draft pricing copy for review", text: "Draft the v2 pricing page copy for Dana to review.", meetingId: "mtg3", meetingTitle: "Speakify weekly sync", meetingStartedAt: atDays(-3), clientSlug: "speakify", clientName: "Speakify", hasTask: false },
  ],
};

// ─── Desk: Slack activity ────────────────────────────────────────────────────────

const demoSlack = {
  configured: true,
  reason: "ok" as const,
  messages: [
    { id: "s1", author: "Priya", text: "Deploy to staging looks good ✅ — going to smoke-test the search flow now.", ts: atDays(0), clientName: "Northwind Studio", clientSlug: "northwind" },
    { id: "s2", author: "Dana", text: "Can we ship the pricing page today? Marketing wants it live for the campaign.", ts: atDays(0), clientName: "Speakify", clientSlug: "speakify" },
    { id: "s3", author: "Tom", text: "Leaderboard cache is live 🎉 response times down from 900ms to 40ms.", ts: atDays(0), clientName: "Big Wedge Golf", clientSlug: "big-wedge-golf" },
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
function monitorHistory(baseLatency: number, blips: number[] = []): unknown[] {
  const pts: unknown[] = [];
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

const demoWiki = {
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
    { id: "cl1", platform: "IOS", version: "3.2.0", title: "Offline downloads", body: "- Download titles for offline viewing\n- Smarter storage management\n- Fixes for AirPlay handoff", releasedAt: atDays(-2), createdAt: atDays(-3), status: "APPROVED" },
    { id: "cl2", platform: "ANDROID", version: "3.2.0", title: "Offline downloads", body: "- Download titles for offline viewing\n- Chromecast reliability improvements", releasedAt: atDays(-2), createdAt: atDays(-3), status: "APPROVED" },
    { id: "cl3", platform: "WEB", version: "2.8.1", title: "Faster search", body: "- New search index, ~3x faster results\n- Keyboard navigation in the results list", releasedAt: atDays(-9), createdAt: atDays(-10), status: "APPROVED" },
    { id: "cl4", platform: "IOS", version: "3.1.0", title: "New player controls", body: "- Redesigned scrubber\n- Playback speed control", releasedAt: atDays(-24), createdAt: atDays(-25), status: "APPROVED" },
  ],
  courseRequests: [],
  timeline: { blocks: demoGanttBlocks, milestones: demoGanttMilestones },
  designSystem: { tokens: demoDesignTokens, logoUrl: null, showFoundryBranding: true, guidelinesEnabled: true },
  monitors: {
    enabled: true,
    monitors: [
      {
        id: "mon1", name: "Marketing site", type: "HTTP", target: "https://northwind.co", method: "GET",
        expectedStatus: 200, keyword: null, degradedMs: 800, enabled: true, intervalMinutes: 5,
        status: "UP", checkedAt: atDays(0), latencyMs: 142, statusCode: 200, error: null,
        uptime: { d1: 100, d7: 99.9, d30: 99.8 }, avgLatencyMs: 150, history: monitorHistory(140),
      },
      {
        id: "mon2", name: "API", type: "HTTP", target: "https://api.northwind.co/health", method: "GET",
        expectedStatus: 200, keyword: "ok", degradedMs: 500, enabled: true, intervalMinutes: 5,
        status: "UP", checkedAt: atDays(0), latencyMs: 88, statusCode: 200, error: null,
        uptime: { d1: 100, d7: 99.98, d30: 99.9 }, avgLatencyMs: 92, history: monitorHistory(90, [6, 7]),
      },
      {
        id: "mon3", name: "Web app", type: "HTTP", target: "https://app.northwind.co", method: "GET",
        expectedStatus: 200, keyword: null, degradedMs: 1200, enabled: true, intervalMinutes: 5,
        status: "DEGRADED", checkedAt: atDays(0), latencyMs: 1340, statusCode: 200, error: null,
        uptime: { d1: 99.2, d7: 99.5, d30: 99.6 }, avgLatencyMs: 410, history: monitorHistory(300, [0, 1, 2]),
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
  documents: { enabled: false, documents: [] },
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
  users: [],
  updatedAt: atDays(0),
};

// ─── Client portal detail (ClientDetailRecord) ──────────────────────────────────
// The live "Wiki →" link lives on this page's header; the demo enters the wiki from here.

const demoClientDetail = {
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
      logins: [], notes: null, previewImageUrl: null, createdAt: atDays(-110), updatedAt: atDays(-4),
    },
    {
      id: "pf2", clientId: WIKI_CLIENT.id, name: "iOS app", platformType: "IOS",
      url: "https://apps.apple.com/app/northwind", stagingUrl: null,
      repoUrl: "https://github.com/northwind/ios", hasUsername: false, hasPassword: false,
      logins: [], notes: null, previewImageUrl: null, createdAt: atDays(-90), updatedAt: atDays(-9),
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
  ],
};

// ─── Docs (dev-visible document types only: HANDOVER / REPORT / BRIEF / OTHER) ────

const demoProposals = {
  proposals: [
    { id: "d1", title: "Northwind — API handover", clientName: "Northwind Studio", status: "ACCEPTED", updatedAt: atDays(-2), documentType: "HANDOVER", documentNumber: "HAND-014", ownerName: "Alex Rivera", sectionCount: 7 },
    { id: "d2", title: "Speakify — Sprint 8 report", clientName: "Speakify", status: "SENT", updatedAt: atDays(-1), documentType: "REPORT", documentNumber: "REP-032", ownerName: "Alex Rivera", sectionCount: 5 },
    { id: "d3", title: "Big Wedge — Booking integration brief", clientName: "Big Wedge Golf", status: "DRAFT", updatedAt: atDays(0), documentType: "BRIEF", documentNumber: "BRF-021", ownerName: "Marco Bianchi", sectionCount: 4 },
    { id: "d4", title: "Northwind — Search rollout report", clientName: "Northwind Studio", status: "APPROVED", updatedAt: atDays(-6), documentType: "REPORT", documentNumber: "REP-031", ownerName: "Alex Rivera", sectionCount: 6 },
    { id: "d5", title: "Speakify — Component library handover", clientName: "Speakify", status: "IN_REVIEW", updatedAt: atDays(-3), documentType: "HANDOVER", documentNumber: "HAND-013", ownerName: "Marco Bianchi", sectionCount: 9 },
    { id: "d6", title: "Big Wedge — Data export notes", clientName: "Big Wedge Golf", status: "DRAFT", updatedAt: atDays(-4), documentType: "OTHER", documentNumber: null, ownerName: "Alex Rivera", sectionCount: 3 },
  ],
};

/** Build a full, renderable document (for the Docs preview) from a list item.
 *  Uses only non-financial section types (dev docs: handovers/reports/briefs/notes). */
function buildDemoDoc(item: (typeof demoProposals.proposals)[number]) {
  const t = item.documentType;
  const statement =
    t === "HANDOVER"
      ? `This handover covers everything the team needs to run and maintain ${item.title.replace(/^.*—\s*/, "")}.`
      : t === "REPORT"
        ? `This report summarises delivery progress and outcomes for ${item.clientName}.`
        : t === "BRIEF"
          ? "This brief scopes the upcoming work and the outcomes we're targeting."
          : "Working notes and reference material for the team.";
  return {
    id: item.id,
    workspaceId: "demo-ws",
    ownerId: "demo-dev",
    documentType: t,
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
    sections: [
      {
        key: "introduction", title: "Overview", sortOrder: 0, isVisible: true,
        data: { statement, summary: "Structured so anyone on the team can pick this up without a handover call.", graphic: "" },
      },
      {
        key: "objectives", title: "What's covered", sortOrder: 1, isVisible: true,
        data: {
          items: [
            { id: "o1", title: "Architecture & setup", description: "How the system fits together and how to run it locally.", icon: "bolt" },
            { id: "o2", title: "Key workflows", description: "The main flows, where the code lives, and the gotchas.", icon: "shield" },
            { id: "o3", title: "Operations", description: "Deploys, monitoring, and what to do when something breaks.", icon: "cog" },
          ],
        },
      },
      {
        key: "cta_next_steps", title: "Next steps", sortOrder: 2, isVisible: true,
        data: { headline: "Questions?", body: "Ping the team in Slack — everything here is a living document." },
      },
    ],
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
        key: "prose", title: "Base URLs & environments", sortOrder: 2, isVisible: true,
        data: {
          content:
            "The API is versioned under `/v1`. There are two environments:\n\n- **Production** — `https://api.northwind.co/v1`\n- **Staging** — `https://api.staging.northwind.co/v1`\n\nAll requests and responses are JSON (`Content-Type: application/json`). Timestamps are ISO-8601 in UTC. Use **staging** for integration testing — it's reset nightly and safe to hammer.",
        },
      },
      {
        key: "prose", title: "Authentication", sortOrder: 3, isVisible: true,
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
        key: "prose", title: "Core endpoints", sortOrder: 5, isVisible: true,
        data: {
          content:
            "The resources you'll use most:\n\n- `GET /v1/titles` — list catalogue titles (paginated, `?cursor=` + `?limit=`)\n- `GET /v1/titles/{id}` — a single title with credits and artwork\n- `GET /v1/collections` — curated rails (New releases, Because you watched…)\n- `GET /v1/search?q=` — full-text search across titles, people and collections\n- `POST /v1/watch-events` — record a playback position (powers continue-watching)\n\nList endpoints are **cursor-paginated**: follow `next_cursor` until it's null.",
        },
      },
      {
        key: "prose", title: "Webhooks", sortOrder: 6, isVisible: true,
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
        key: "prose", title: "Handover checklist", sortOrder: 8, isVisible: true,
        data: {
          content:
            "Before we close this out, confirm:\n\n- [x] Staging API key issued to your team\n- [x] Postman collection shared in **#northwind-dev**\n- [x] Webhook endpoint registered + signature verification tested\n- [ ] Production key issued (on go-live)\n- [ ] On-call rota confirmed for launch week",
        },
      },
      {
        key: "cta_next_steps", title: "Handover complete", sortOrder: 9, isVisible: true,
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
    { id: "sup-speakify", name: "Speakify", slug: "speakify", status: "active", unreadCount: 1, supportDaysPerMonth: 3, supportDaysUsed: 1 },
  ],
};

const demoConversationsByClient: Record<string, unknown[]> = {
  "sup-northwind": [
    { id: "cv1", clientId: "sup-northwind", source: "app_reviews", customerLabel: "App Store · ★★☆☆☆", subject: "Search is slow on older phones", preview: "Love the app but search takes ages on my iPhone 11…", receivedAt: atDays(0), unread: true, tags: ["performance"], sentiment: "negative", status: "new", priority: "high", issueType: "Bug", noteCount: 0 },
    { id: "cv2", clientId: "sup-northwind", source: "gmail", customerLabel: "priya@northwind.co", subject: "Can we add a dark theme?", preview: "A few users have asked about a dark mode…", receivedAt: atDays(0), unread: true, tags: ["feature-request"], sentiment: "neutral", status: "open", priority: "normal", noteCount: 1 },
    { id: "cv3", clientId: "sup-northwind", source: "discord", customerLabel: "@dev_sam", subject: "Webhook docs unclear", preview: "The retry section doesn't say what the backoff is…", receivedAt: atDays(-1), unread: true, tags: ["docs"], sentiment: "neutral", status: "open", priority: "low", noteCount: 0 },
    { id: "cv4", clientId: "sup-northwind", source: "gmail", customerLabel: "ops@northwind.co", subject: "Thanks for the quick fix!", preview: "The download bug is gone — appreciate the fast turnaround.", receivedAt: atDays(-2), unread: false, tags: [], sentiment: "positive", status: "closed", priority: "normal", closedAt: atDays(-2), noteCount: 0 },
  ],
  "sup-speakify": [
    { id: "cv5", clientId: "sup-speakify", source: "reddit", customerLabel: "u/speakify_fan", subject: "Feature idea: shared playlists", preview: "Would be great to share a playlist with friends…", receivedAt: atDays(0), unread: true, tags: ["feature-request"], sentiment: "positive", status: "new", priority: "normal", noteCount: 0 },
    { id: "cv6", clientId: "sup-speakify", source: "youtube", customerLabel: "YT comment", subject: "Crash on Android 12", preview: "App crashes when I open settings on my Pixel…", receivedAt: atDays(-1), unread: false, tags: ["bug", "android"], sentiment: "negative", status: "open", priority: "urgent", issueType: "Crash", noteCount: 2 },
  ],
};

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

// ─── Resolver used by the fetch interceptor ─────────────────────────────────────

/**
 * Map an `/api/...` pathname (query stripped) to its demo payload. Returns an
 * empty object for anything unmapped so no fetcher errors or hangs during the demo.
 */
export function resolveDemoApi(pathname: string): unknown {
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
  // Client wiki — GET /api/clients/{slug}/wiki (exact; sub-paths are mutations → benign).
  if (/^\/api\/clients\/[^/]+\/wiki$/.test(pathname)) {
    return demoWiki;
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
    if (conv) return { conversations: demoConversationsByClient[conv[1]] ?? [], nextCursor: null };
  }
  if (/^\/api\/support\/clients\/[^/]+\/connections$/.test(pathname)) return { connections: [] };
  if (/^\/api\/support\/clients\/[^/]+\/members$/.test(pathname)) return { members: [] };
  if (/^\/api\/support\/clients\/[^/]+\/conversations\/[^/]+\/messages$/.test(pathname)) return { messages: [] };
  if (/^\/api\/support\/clients\/[^/]+\/conversations\/[^/]+\/notes$/.test(pathname)) return { notes: [] };

  // Backstage — calendar only.
  if (pathname === "/api/backstage/calendar") return demoCalendarMonth;
  if (pathname === "/api/backstage/calendar/connections") return { selfConnected: false, members: [] };
  if (pathname === "/api/backstage/calendar/team-events") return { events: [] };
  if (pathname === "/api/backstage/calendar/timeline") return { blocks: [], milestones: [] };
  if (pathname === "/api/backstage/leave") return [];
  if (pathname === "/api/backstage/alerts") return demoStaffingAlerts;

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

  return {};
}
