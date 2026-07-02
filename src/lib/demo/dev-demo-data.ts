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
    permissions: ["clients", "proposals", "codeclear", "support", "backstage"],
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
    orderKey: (orderSeq += 100),
    dueDate: partial.dueDate ?? null,
    startedAt: partial.startedAt ?? null,
    completedAt: partial.completedAt ?? null,
    archivedAt: null,
    commentCount: partial.commentCount ?? 0,
    subtaskCount: partial.subtaskCount ?? 0,
    subtaskDoneCount: partial.subtaskDoneCount ?? 0,
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
  designSystem: null,
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

// Empty-but-valid shapes for the client detail's secondary sections.
const demoClientMeetings = { meetings: [], candidates: [], calendarConnected: false, query: null };
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
  // Single client — GET /api/clients/{slug} (exact; not a sub-resource).
  if (/^\/api\/clients\/[^/]+$/.test(pathname)) {
    return demoClientDetail;
  }

  // Docs.
  if (pathname === "/api/proposals") return demoProposals;
  if (pathname === "/api/templates") return { templates: [] };

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
  return {};
}
