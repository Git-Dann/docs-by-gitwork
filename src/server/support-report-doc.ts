/**
 * support-report-doc.ts — generate a Care customer report as a real Docs `Document`.
 *
 * Rather than the bespoke `SupportReport` print page, this pulls the same live data
 * (ticket stats, performance metrics, analytics snapshot) and builds a `Document` of
 * type REPORT out of the existing section registry (cover / prose / kpi_strip /
 * data_table / callout). The result opens in the Docs builder and inherits everything
 * Docs already has: share links (`/docs/[token]`), server PDF, view tracking, AI
 * authoring, comments.
 *
 * Mirrors `generateProposalFromScan` (src/server/pulse.ts) — the canonical
 * "generate a Document from module data" pattern.
 */

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getTicketStatsForPeriod, getPerformanceMetricsForPeriod } from "@/server/support";
import { enableDocumentShare } from "@/server/documents";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";
import type { AnalyticsMetric } from "@/server/support-analytics/types";
import { TEMPLATE_SLUG_BY_TYPE } from "@/lib/templates";
import type { Prisma } from "@prisma/client";

export interface GenerateSupportReportInput {
  clientId: string;
  /** Inclusive period start (YYYY-MM-DD). */
  periodStart: string;
  /** Inclusive period end (YYYY-MM-DD). */
  periodEnd: string;
  /** Human label for the period, e.g. "June 2026". */
  periodLabel: string;
  /** Optional author name stamped on the doc metadata. */
  author?: string;
  /** When true, don't reuse an already-generated doc for this client+period. */
  force?: boolean;
}

/** ms → compact human duration ("—" | "42m" | "3.2h" | "1.4d"). */
function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  const mins = ms / 60000;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/** Read the stored analytics snapshot for a period; fall back to a live run if none exists. */
async function loadAnalyticsMetrics(
  clientId: string,
  year: number,
  month: number,
): Promise<AnalyticsMetric[]> {
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const stored = await prisma.supportAnalyticsSnapshot.findUnique({
    where: { clientId_period: { clientId, period } },
  });
  if (Array.isArray(stored?.metrics) && stored!.metrics.length > 0) {
    return stored!.metrics as unknown as AnalyticsMetric[];
  }

  // No snapshot yet — try a live run if the client has an analytics connection.
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId, source: "ANALYTICS" },
    orderBy: { createdAt: "desc" },
  });
  if (!conn) return [];

  try {
    const config = (conn.scraperConfig ?? {}) as AnalyticsConnectionConfig;
    const prevDate = new Date(year, month - 2, 1);
    const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevRow = await prisma.supportAnalyticsSnapshot.findUnique({
      where: { clientId_period: { clientId, period: prevPeriod } },
    });
    const prevSnapshot = Array.isArray(prevRow?.metrics)
      ? (prevRow!.metrics as Array<{ key: string; value: number }>)
      : undefined;
    const snapshot = await runAnalytics(config, year, month, prevSnapshot);
    // Persist so the report page and future runs have history.
    await prisma.supportAnalyticsSnapshot.upsert({
      where: { clientId_period: { clientId, period } },
      create: { clientId, period, metrics: snapshot.metrics as object },
      update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
    });
    return snapshot.metrics;
  } catch {
    // Analytics fetch is best-effort — a failure just omits the analytics section.
    return [];
  }
}

/**
 * Generate (or return the existing) Docs `Document` for a client's monthly support report.
 * Returns the document id — callers redirect to `/app/docs/{id}` to open the builder.
 */
export async function generateSupportReportDocument(
  input: GenerateSupportReportInput,
): Promise<string> {
  const { clientId, periodStart, periodEnd, periodLabel, author, force } = input;

  const client = await prisma.supportClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, workspaceClientId: true },
  });
  if (!client) throw new Error("Support client not found");

  // Idempotency: reuse a doc already generated for this client + period unless forced.
  const [year, month] = periodStart.split("-").map(Number);
  const period = `${year}-${String(month).padStart(2, "0")}`;
  if (!force) {
    const existing = await prisma.document.findFirst({
      where: {
        documentType: "REPORT",
        metadata: { path: ["supportReportKey"], equals: `${clientId}:${period}` },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const { workspace, user, template } = await ensureBaseRecords();

  // Gather the same live data the bespoke report builder uses.
  const [stats, perf, metrics] = await Promise.all([
    getTicketStatsForPeriod(clientId, periodStart, periodEnd),
    getPerformanceMetricsForPeriod(clientId, periodStart, periodEnd),
    loadAnalyticsMetrics(clientId, year, month),
  ]);

  const reportTemplate = await prisma.documentTemplate.findFirst({
    where: { slug: TEMPLATE_SLUG_BY_TYPE.REPORT },
    select: { id: true },
  });

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const sections = buildReportSections({
    clientName: client.name,
    periodLabel,
    today,
    stats,
    perf,
    metrics,
  });

  const document = await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: user.id,
      templateId: reportTemplate?.id ?? template.id,
      documentType: "REPORT",
      status: "DRAFT",
      title: `${client.name} — Support Report — ${periodLabel}`,
      productName: client.name,
      clientName: client.name,
      clientId: client.workspaceClientId ?? null,
      summary: `Monthly support report for ${client.name} — ${periodLabel}.`,
      version: "v1.0",
      metadata: {
        client: client.name,
        owner: author ?? user.name ?? "",
        version: "v1.0",
        notes: "",
        internalComments: `Auto-generated Care support report for ${periodLabel}`,
        // Key used for idempotent regeneration (client + period).
        supportReportKey: `${clientId}:${period}`,
        supportReportPeriod: period,
      } as unknown as Prisma.InputJsonValue,
      sections: { create: sections },
    },
  });

  // Share on creation so the "send client a link" + server PDF paths work immediately.
  await enableDocumentShare(document.id).catch(() => undefined);

  return document.id;
}

function buildReportSections(args: {
  clientName: string;
  periodLabel: string;
  today: string;
  stats: Awaited<ReturnType<typeof getTicketStatsForPeriod>>;
  perf: Awaited<ReturnType<typeof getPerformanceMetricsForPeriod>>;
  metrics: AnalyticsMetric[];
}): Prisma.DocumentSectionCreateWithoutDocumentInput[] {
  const { clientName, periodLabel, today, stats, perf, metrics } = args;
  const sections: Prisma.DocumentSectionCreateWithoutDocumentInput[] = [];
  let order = 0;
  const push = (
    key: string,
    title: string,
    data: Record<string, unknown>,
    description?: string,
  ) => {
    sections.push({
      key,
      title,
      description: description ?? null,
      sortOrder: order++,
      isVisible: true,
      data: data as unknown as Prisma.InputJsonValue,
    });
  };

  // ── Cover ──
  push("cover", "Cover", {
    proposalTitle: `Support Report — ${periodLabel}`,
    productName: clientName,
    clientName,
    subtitle: "Prepared by Gitwork",
    date: today,
    confidentiality: "Confidential",
    confidentialityMode: "EXTERNAL",
    coverStyle: "light",
    brandLockup: "CLIENT_X_GITWORK",
  });

  // ── Overview (editable prose; the Docs AI can rewrite it) ──
  push(
    "prose",
    "Overview",
    {
      content:
        `This report summarises the support activity for ${clientName} during ${periodLabel}. ` +
        `Our team handled ${stats.totalTickets} conversation${stats.totalTickets === 1 ? "" : "s"} across all connected channels, ` +
        `resolving ${perf.resolvedCount} (${perf.resolutionRate}%) within the period.\n\n` +
        `Use the toolbar to refine this narrative, or let the AI writer expand it.`,
    },
    "Summary of the month's support activity.",
  );

  // ── Performance KPIs ──
  const kpiItems: Array<{ value: string; label: string; context?: string }> = [
    { value: `${stats.totalTickets}`, label: "Conversations" },
    { value: `${perf.resolvedCount}`, label: "Resolved", context: `${perf.resolutionRate}% resolution rate` },
    { value: fmtDuration(perf.avgFirstResponseMs), label: "Avg first response" },
    { value: fmtDuration(perf.avgResolutionMs), label: "Avg resolution time" },
  ];
  if (perf.slaFrtCompliancePct != null) {
    kpiItems.push({ value: `${perf.slaFrtCompliancePct}%`, label: "Within SLA", context: `${perf.slaTargetHours}h target` });
  }
  if (perf.avgCsatScore != null) {
    kpiItems.push({ value: `${perf.avgCsatScore}/5`, label: "Avg CSAT" });
  }
  push("kpi_strip", "Support Performance", { items: kpiItems }, "Key service metrics for the period.");

  // ── Ticket volume by category ──
  const catRows: string[][] = [
    ["Cancellations / churn", `${stats.catCancellations}`],
    ["Billing / refunds", `${stats.catRefunds}`],
    ["Account queries", `${stats.catAccountQueries}`],
    ["Technical issues", `${stats.catTechIssues}`],
    ["Other", `${stats.catOther}`],
  ];
  push(
    "data_table",
    "Ticket Volume",
    { columns: ["Category", "Count"], rows: catRows, caption: `By category · ${stats.totalTickets} total` },
    "Breakdown of conversations by type.",
  );

  // ── Priority breakdown ──
  push("data_table", "By Priority", {
    columns: ["Priority", "Count"],
    rows: [
      ["Urgent", `${stats.prioUrgent}`],
      ["High", `${stats.prioHigh}`],
      ["Normal", `${stats.prioMedium}`],
      ["Low", `${stats.prioLow}`],
    ],
  });

  // ── Analytics metrics (grouped) — only when the client has an analytics connection ──
  if (metrics.length > 0) {
    // Group metrics; render each group as its own data table with a trend column.
    const groups = new Map<string, AnalyticsMetric[]>();
    for (const m of metrics) {
      const g = m.group ?? "Product analytics";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(m);
    }
    for (const [group, items] of groups) {
      const rows = items.map((m) => {
        const unit = m.unit ?? "";
        const value = `${unit}${m.value.toLocaleString("en-GB")}`;
        let trend = "—";
        if (typeof m.previous === "number") {
          const delta = m.value - m.previous;
          const pct = m.previous !== 0 ? Math.round((delta / m.previous) * 100) : null;
          const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
          trend = pct != null ? `${arrow} ${Math.abs(pct)}%` : arrow;
        }
        return [m.label, value, trend];
      });
      push("data_table", group, {
        columns: ["Metric", "Value", "vs last month"],
        rows,
        caption: `${group} · ${periodLabel}`,
      });
    }
  }

  // ── Closing note ──
  push("callout", "Summary", {
    tone: "info",
    headline: "Looking ahead",
    body:
      `Thanks for your continued partnership. If you'd like to discuss any of the above or adjust priorities ` +
      `for next month, just reply to this report or reach out to your Gitwork contact.`,
  });

  return sections;
}
