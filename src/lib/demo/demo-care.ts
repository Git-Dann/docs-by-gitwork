import type { AuditLog, ClientHealthScore, SupportPerformanceMetrics, SupportReport, SupportReportPayload, WorkflowRule } from "@/types/support";

/**
 * The parts of Care the demo could not show: Reports, Automation (workflow rules and the agent
 * log), the health badge, the performance strip and AI search.
 *
 * Every one of those reached the demo's `{}` catch-all, so `/demo/care` rendered each screen in
 * its empty or "couldn't load" state and nothing else. These were the capabilities the legacy
 * `/app/support` dashboard owned before Care became one UI, so they are also the screens that most
 * needed a surface they could be rendered on: `/app/care` is auth-gated with no staging.
 *
 * Writes are applied in memory, like the queue's own demo handlers, so add / edit / delete can be
 * driven end to end. Nothing here reaches a server.
 */

/** A conversation as the semantic search needs it. The demo fixtures carry more; this is the subset read. */
export interface DemoSearchable {
  id: string;
  subject: string;
  preview?: string | null;
  source: string;
  customerLabel: string;
  receivedAt: string;
}

const WORD = /[a-z0-9]+/g;
const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "is", "it", "in", "on", "for", "my", "we", "i", "about", "with", "what", "who", "are", "be"]);

function words(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The demo's stand-in for AI search. The real route embeds the query and ranks by vector distance;
 * the demo has no embeddings, so it ranks by shared words (a word counts when either one starts the
 * other, so "slow" finds "slowly"). A conversation sharing no word is left out rather than given a
 * score of zero: an AI search that returns everything says nothing.
 */
export function rankDemoSemantic(
  rows: DemoSearchable[],
  query: string,
  limit = 10,
): Array<DemoSearchable & { preview: string | null; score: number }> {
  const q = [...new Set(words(query))];
  if (q.length === 0) return [];
  return rows
    .map((row) => {
      const hay = words(`${row.subject} ${row.preview ?? ""} ${row.customerLabel}`);
      const hits = q.filter((w) => hay.some((h) => h.startsWith(w) || w.startsWith(h))).length;
      return { ...row, preview: row.preview ?? null, score: Math.round((hits / q.length) * 100) / 100 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit));
}

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const DAY_MS = 86_400_000;

function demoHealth(clientId: string): ClientHealthScore {
  const watch = clientId === "sup-cadenza";
  const factors = [
    { label: "First reply time", score: watch ? 14 : 22, maxScore: 25, note: watch ? "Median 9h, target 4h" : "Median 2h, inside the 4h target" },
    { label: "Awaiting reply", score: watch ? 15 : 20, maxScore: 25, note: watch ? "3 customers waiting, the oldest 2 days" : "2 customers waiting, none past 24h" },
    { label: "Sentiment", score: watch ? 16 : 21, maxScore: 25, note: watch ? "A third of recent messages read negative" : "Mostly neutral or positive" },
    { label: "Channels", score: 25, maxScore: 25, note: "Every channel synced in the last hour" },
  ];
  const score = factors.reduce((s, f) => s + f.score, 0);
  return { score, tier: score >= 80 ? "healthy" : score >= 60 ? "watch" : "at_risk", factors, computedAt: iso(0) };
}

function demoPerformance(clientId: string): SupportPerformanceMetrics {
  const watch = clientId === "sup-cadenza";
  return {
    totalTickets: watch ? 18 : 42,
    respondedCount: watch ? 15 : 40,
    resolvedCount: watch ? 11 : 36,
    openCount: watch ? 7 : 6,
    resolutionRate: watch ? 61 : 86,
    avgFirstResponseMs: (watch ? 9.4 : 2.6) * 3_600_000,
    medianFirstResponseMs: (watch ? 8.9 : 2.1) * 3_600_000,
    avgResolutionMs: (watch ? 3.1 : 1.4) * DAY_MS,
    medianResolutionMs: (watch ? 2.6 : 1.1) * DAY_MS,
    avgCsatScore: watch ? 3.9 : 4.6,
    slaFrtCompliancePct: watch ? 58 : 93,
    slaTargetHours: 4,
  };
}

function demoStats(clientId: string) {
  const watch = clientId === "sup-cadenza";
  return {
    totalTickets: watch ? 18 : 42,
    catCancellations: watch ? 3 : 6,
    catAccountQueries: watch ? 5 : 14,
    catRefunds: watch ? 2 : 4,
    catTechIssues: watch ? 6 : 13,
    catOther: watch ? 2 : 5,
    prioUrgent: watch ? 2 : 1,
    prioHigh: watch ? 4 : 7,
    prioMedium: watch ? 9 : 26,
    prioLow: watch ? 3 : 8,
  };
}

function monthBounds(monthsAgo: number): { start: string; end: string; label: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const label = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label };
}

function demoReportPayload(monthsAgo: number): SupportReportPayload {
  const { start, end } = monthBounds(monthsAgo);
  return {
    author: "Harry Beckett",
    periodStart: start,
    periodEnd: end,
    overviewText:
      "A steady month. Most questions were about account access after the new sign-in screen shipped; the fix in week two cut those by half.",
    totalTickets: 42,
    catCancellations: 6,
    catAccountQueries: 14,
    catRefunds: 4,
    catTechIssues: 13,
    catOther: 5,
    prioUrgent: 1,
    prioHigh: 7,
    prioMedium: 26,
    prioLow: 8,
    performanceText: "Median first reply was 2 hours against a 4 hour target, and 93% of first replies landed inside it.",
    refundRequests: 4,
    refundsProcessed: 3,
    refundTotalValue: 87.5,
    refundNotes: "One refund was declined: the purchase was outside the 14-day window.",
    metrics: [
      { key: "users_active", label: "Active users", value: 1842, previous: 1710, group: "Usage" },
      { key: "subscriptions", label: "Subscriptions", value: 231, previous: 219, group: "Revenue" },
    ],
    summaryText: "Fewer account questions than last month, faster first replies, and no urgent issue left open.",
  };
}

export interface DemoCareState {
  reports: Record<string, SupportReport[]>;
  rules: Record<string, WorkflowRule[]>;
  seq: number;
}

const DEFAULT_RULES: Array<Omit<WorkflowRule, "id" | "clientId">> = [
  { name: "Urgent words", when: "A message mentions refund, cancel or charged twice", then: "Set priority to high", requiresApproval: false },
  { name: "App Store one-star", when: "An App Store review has one or two stars", then: "Assign to the account lead", requiresApproval: false },
  { name: "Auto-reply out of hours", when: "A message arrives outside 9 to 5, Monday to Friday", then: "Draft an acknowledgement", requiresApproval: true },
];

export function newDemoCareState(): DemoCareState {
  const state: DemoCareState = { reports: {}, rules: {}, seq: 0 };
  for (const clientId of ["sup-northwind", "sup-cadenza"]) {
    state.reports[clientId] = [1, 2].map((m) => ({
      id: `rep-${clientId}-${m}`,
      clientId,
      period: monthBounds(m).label,
      payload: demoReportPayload(m),
      createdBy: "Harry Beckett",
      createdAt: iso(m * 30 - 3),
      updatedAt: iso(m * 30 - 3),
    }));
    state.rules[clientId] = DEFAULT_RULES.slice(0, clientId === "sup-northwind" ? 3 : 1).map((r, i) => ({
      ...r,
      id: `rule-${clientId}-${i}`,
      clientId,
    }));
  }
  return state;
}

function demoAuditLogs(clientId: string): AuditLog[] {
  return [
    { id: `al-${clientId}-1`, clientId, actor: "Care agent", action: "agent_classified", target: "Search is slow on older phones", createdAt: iso(0), reason: null },
    { id: `al-${clientId}-2`, clientId, actor: "Workflow rule", action: "rule_applied", target: "Urgent words → priority high", createdAt: iso(0.4), reason: null },
    { id: `al-${clientId}-3`, clientId, actor: "Care agent", action: "enrichment_failed", target: "Webhook docs unclear", createdAt: iso(1), reason: "The workspace's AI key is out of credit." },
    { id: `al-${clientId}-4`, clientId, actor: "Harry Beckett", action: "conversation_closed", target: "Thanks for the quick fix!", createdAt: iso(2), reason: null },
  ];
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "string") return {};
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Answers a Care route the queue's handlers don't, or `undefined` to fall through. `conversations`
 * is the demo's own fixture map, so AI search ranks the same rows the queue shows.
 */
export function resolveDemoCare(
  state: DemoCareState,
  pathname: string,
  init: { method?: string; body?: unknown } | undefined,
  conversations: Record<string, unknown[]>,
): unknown {
  const m = pathname.match(/^\/api\/support\/clients\/([^/]+)\/(.+)$/);
  if (!m) return undefined;
  const [, clientId, rest] = m;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init?.body);

  if (rest === "health") return { health: demoHealth(clientId) };
  if (rest === "conversations/performance") return { metrics: demoPerformance(clientId) };
  if (rest === "conversations/stats") return { stats: demoStats(clientId) };
  if (rest === "audit-logs") return { logs: demoAuditLogs(clientId) };

  if (rest === "conversations/search" && method === "POST") {
    const rows = (conversations[clientId] ?? []) as DemoSearchable[];
    const limit = typeof body.limit === "number" ? body.limit : 10;
    return { results: rankDemoSemantic(rows, String(body.query ?? ""), limit) };
  }

  if (rest === "reports" || rest.startsWith("reports/")) {
    const list = (state.reports[clientId] ??= []);
    if (rest === "reports/generate-narrative") {
      return {
        overviewText: demoReportPayload(1).overviewText,
        performanceText: demoReportPayload(1).performanceText,
        summaryText: "Fewer account questions than last month, faster first replies, and no urgent issue left open.",
        ticketCount: 42,
      };
    }
    if (rest === "reports/generate-doc") {
      return { error: "Creating the Docs copy needs a real workspace. Try it in the app.", __status: 409 };
    }
    if (rest === "reports") {
      if (method === "POST") {
        const now = new Date().toISOString();
        const report: SupportReport = {
          id: `rep-demo-${++state.seq}`,
          clientId,
          period: String(body.period ?? "This month"),
          payload: (body.payload as SupportReportPayload) ?? demoReportPayload(0),
          createdBy: typeof body.createdBy === "string" ? body.createdBy : "Demo user",
          createdAt: now,
          updatedAt: now,
        };
        list.unshift(report);
        return { report };
      }
      return { reports: list };
    }
    const reportId = rest.slice("reports/".length);
    const i = list.findIndex((r) => r.id === reportId);
    if (i < 0) return { error: "Report not found", __status: 404 };
    if (method === "DELETE") {
      list.splice(i, 1);
      return { ok: true };
    }
    if (method === "PATCH") {
      list[i] = {
        ...list[i],
        ...(typeof body.period === "string" ? { period: body.period } : {}),
        ...(body.payload ? { payload: body.payload as SupportReportPayload } : {}),
        updatedAt: new Date().toISOString(),
      };
      return { report: list[i] };
    }
    return { report: list[i] };
  }

  if (rest === "seed-rules" && method === "POST") {
    state.rules[clientId] = DEFAULT_RULES.map((r, i) => ({ ...r, id: `rule-${clientId}-seed-${i}`, clientId }));
    return { ok: true };
  }

  if (rest === "workflow-rules" || rest.startsWith("workflow-rules/")) {
    const list = (state.rules[clientId] ??= []);
    if (rest === "workflow-rules") {
      if (method === "POST") {
        const rule: WorkflowRule = {
          id: `rule-demo-${++state.seq}`,
          clientId,
          name: String(body.name ?? "New rule"),
          when: String(body.when ?? ""),
          then: String(body.then ?? ""),
          requiresApproval: body.requiresApproval === true,
        };
        list.push(rule);
        return { rule };
      }
      return { rules: list };
    }
    const ruleId = rest.slice("workflow-rules/".length);
    const i = list.findIndex((r) => r.id === ruleId);
    if (i < 0) return { error: "Rule not found", __status: 404 };
    if (method === "DELETE") {
      list.splice(i, 1);
      return { ok: true };
    }
    list[i] = {
      ...list[i],
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.when === "string" ? { when: body.when } : {}),
      ...(typeof body.then === "string" ? { then: body.then } : {}),
      ...(typeof body.requiresApproval === "boolean" ? { requiresApproval: body.requiresApproval } : {}),
    };
    return { rule: list[i] };
  }

  return undefined;
}
