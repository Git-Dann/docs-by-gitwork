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
import {
  decryptScraperConfig,
  getTicketStatsForPeriod,
  getPerformanceMetricsForPeriod,
} from "@/server/support";
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
    // AccountConnection stores secrets encrypted. This document-generation path
    // runs outside the connector sync context, so it must decrypt explicitly.
    const config = (decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}) as AnalyticsConnectionConfig;
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

  const data = await buildSupportReportData({ clientId, periodStart, periodEnd, periodLabel });

  const reportTemplate = await prisma.documentTemplate.findFirst({
    where: { slug: TEMPLATE_SLUG_BY_TYPE.REPORT },
    select: { id: true },
  });

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const sections = buildReportSections(client.name, periodLabel, today, data);

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

/**
 * The live data for one client's support report, shaped for direct use in section payloads.
 * Section titles below are the single source of truth shared by three surfaces: the REPORT
 * template blueprint (src/lib/templates/report.ts), the generator, and the in-builder
 * "Pull in client data" endpoint (which matches existing sections by these titles).
 */
export interface SupportReportData {
  periodLabel: string;
  overviewText: string;
  /** kpi_strip items for "Support performance". */
  performanceItems: Array<{ value: string; label: string; context?: string; emphasis?: boolean }>;
  /** data_table payload for "Ticket volume". */
  ticketVolume: { columns: string[]; rows: string[][]; caption: string };
  /** data_table payload for "By priority". */
  priority: { columns: string[]; rows: string[][] };
  /**
   * One data_table per analytics group (Revenue / Subscription activity / Top countries / …),
   * titled by the metric group. Empty when there's no analytics connection. Split out (rather
   * than one big table) so the report reads as distinct, scannable sections.
   */
  analyticsTables: Array<{ title: string; columns: string[]; rows: string[][]; caption: string }>;
}

/** Format one metric as a [label, value, trend] row for an analytics data_table. */
function formatMetricRow(m: AnalyticsMetric): string[] {
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
}

/** Group metrics by their `group` (first-seen order) → one titled data_table each. */
function buildAnalyticsTables(
  metrics: AnalyticsMetric[],
  periodLabel: string,
): SupportReportData["analyticsTables"] {
  const order: string[] = [];
  const byGroup = new Map<string, AnalyticsMetric[]>();
  for (const m of metrics) {
    const group = m.group?.trim() || "Product analytics";
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      order.push(group);
    }
    byGroup.get(group)!.push(m);
  }
  return order.map((group) => ({
    title: group,
    columns: ["Metric", "Value", "vs last month"],
    rows: (byGroup.get(group) ?? []).map(formatMetricRow),
    caption: periodLabel,
  }));
}

/**
 * Fixed section titles that are the join key between template, generator and pull-refresh for the
 * Care (non-analytics) sections. Analytics sections are titled dynamically by their metric group
 * (Revenue / Subscription activity / Top countries / …), so they aren't listed here.
 */
export const SUPPORT_REPORT_SECTION_TITLES = {
  performance: "Support performance",
  ticketVolume: "Ticket volume",
  priority: "By priority",
} as const;

/** Pull the live figures for a client/period into the report-ready shape. */
export async function buildSupportReportData(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}): Promise<SupportReportData> {
  const { clientId, periodStart, periodEnd, periodLabel } = input;
  const [year, month] = periodStart.split("-").map(Number);

  const [stats, perf, metrics] = await Promise.all([
    getTicketStatsForPeriod(clientId, periodStart, periodEnd),
    getPerformanceMetricsForPeriod(clientId, periodStart, periodEnd),
    loadAnalyticsMetrics(clientId, year, month),
  ]);

  const performanceItems: SupportReportData["performanceItems"] = [
    { value: `${stats.totalTickets}`, label: "Conversations" },
    { value: `${perf.resolvedCount}`, label: "Resolved", context: `${perf.resolutionRate}% resolution rate`, emphasis: true },
    { value: fmtDuration(perf.avgFirstResponseMs), label: "Avg first response" },
    { value: fmtDuration(perf.avgResolutionMs), label: "Avg resolution time" },
  ];
  if (perf.slaFrtCompliancePct != null) {
    performanceItems.push({ value: `${perf.slaFrtCompliancePct}%`, label: "Within SLA", context: `${perf.slaTargetHours}h target` });
  }
  if (perf.avgCsatScore != null) {
    performanceItems.push({ value: `${perf.avgCsatScore}/5`, label: "Avg CSAT" });
  }

  // One data_table per analytics group (Revenue / Subscription activity / Top countries / …)
  // rather than a single wall-of-numbers table.
  const analyticsTables = buildAnalyticsTables(metrics, periodLabel);

  return {
    periodLabel,
    overviewText:
      `This report summarises the support activity during ${periodLabel}. ` +
      `Our team handled ${stats.totalTickets} conversation${stats.totalTickets === 1 ? "" : "s"} across all connected channels, ` +
      `resolving ${perf.resolvedCount} (${perf.resolutionRate}%) within the period.`,
    performanceItems,
    ticketVolume: {
      columns: ["Category", "Count"],
      rows: [
        ["Cancellations / churn", `${stats.catCancellations}`],
        ["Billing / refunds", `${stats.catRefunds}`],
        ["Account queries", `${stats.catAccountQueries}`],
        ["Technical issues", `${stats.catTechIssues}`],
        ["Other", `${stats.catOther}`],
      ],
      caption: `By category · ${stats.totalTickets} total`,
    },
    priority: {
      columns: ["Priority", "Count"],
      rows: [
        ["Urgent", `${stats.prioUrgent}`],
        ["High", `${stats.prioHigh}`],
        ["Normal", `${stats.prioMedium}`],
        ["Low", `${stats.prioLow}`],
      ],
    },
    analyticsTables,
  };
}

/**
 * Fill an EXISTING report Document's data sections from live client data, without touching
 * the narrative (cover / overview prose / closing callout). Matches sections by the shared
 * titles in SUPPORT_REPORT_SECTION_TITLES, so it works on both generated docs and blank docs
 * created from the REPORT template. Returns how many sections were updated.
 */
export async function pullSupportDataIntoDocument(input: {
  documentId: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}): Promise<{ updated: number; analyticsFound: boolean }> {
  const { documentId, clientId, periodStart, periodEnd, periodLabel } = input;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, sections: { select: { id: true, key: true, title: true, sortOrder: true } } },
  });
  if (!doc) throw new Error("Document not found");

  const data = await buildSupportReportData({ clientId, periodStart, periodEnd, periodLabel });
  const T = SUPPORT_REPORT_SECTION_TITLES;

  // The data sections this pull owns, in render order. Each is matched to an existing section by
  // title (case-insensitive) and updated in place; if the report has no such section yet (e.g. it
  // was created from the generic Status-report template, or a blank doc), it's appended instead —
  // so the pull is seamless on ANY report doc, not just Care-generated ones. Analytics is only
  // included when the client has an analytics connection returning metrics.
  const targets: Array<{ key: string; title: string; description: string; data: Record<string, unknown> }> = [
    { key: "kpi_strip", title: T.performance, description: "Key service metrics for the period.", data: { items: data.performanceItems } },
    { key: "data_table", title: T.ticketVolume, description: "Breakdown of conversations by type.", data: data.ticketVolume },
    { key: "data_table", title: T.priority, description: "Conversations by priority.", data: data.priority },
  ];
  // One data_table per analytics group — matched/created by the group title so a re-pull updates
  // the same tables in place.
  for (const table of data.analyticsTables) {
    targets.push({
      key: "data_table",
      title: table.title,
      description: `${table.title} for the period.`,
      data: { columns: table.columns, rows: table.rows, caption: table.caption },
    });
  }

  const byTitle = new Map(doc.sections.map((s) => [s.title.trim().toLowerCase(), s]));
  let nextOrder = doc.sections.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;

  let updated = 0;
  let created = 0;
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const target of targets) {
    const existing = byTitle.get(target.title.toLowerCase());
    if (existing) {
      updated += 1;
      ops.push(
        prisma.documentSection.update({
          where: { id: existing.id },
          data: { data: target.data as unknown as Prisma.InputJsonValue },
        }),
      );
    } else {
      created += 1;
      ops.push(
        prisma.documentSection.create({
          data: {
            document: { connect: { id: documentId } },
            key: target.key,
            title: target.title,
            description: target.description,
            sortOrder: nextOrder++,
            isVisible: true,
            data: target.data as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops);

  return { updated: updated + created, analyticsFound: data.analyticsTables.length > 0 };
}

function buildReportSections(
  clientName: string,
  periodLabel: string,
  today: string,
  data: SupportReportData,
): Prisma.DocumentSectionCreateWithoutDocumentInput[] {
  const T = SUPPORT_REPORT_SECTION_TITLES;
  const sections: Prisma.DocumentSectionCreateWithoutDocumentInput[] = [];
  let order = 0;
  const push = (key: string, title: string, d: Record<string, unknown>, description?: string) => {
    sections.push({ key, title, description: description ?? null, sortOrder: order++, isVisible: true, data: d as unknown as Prisma.InputJsonValue });
  };

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

  push("prose", "Overview", {
    content: `${data.overviewText}\n\nUse the toolbar to refine this narrative, or let the AI writer expand it.`,
  }, "Summary of the month's support activity.");

  push("kpi_strip", T.performance, { items: data.performanceItems }, "Key service metrics for the period.");

  // Narrative breakdown scaffold (hand-written, like Support highlights) — a place for the
  // "conversations by request type" write-up with a short note per type. Pre-seeded with examples
  // to replace; "Pull in client data" never touches it.
  push("breakdown", "Request breakdown", {
    items: [
      { label: "Subscription confusion (Stripe vs App Store)", count: "0", description: "Users who signed up on one platform but tried to cancel on another. Replace with this period's specifics." },
      { label: "Billing & refund requests", count: "0", description: "Trial-to-paid conversions and duplicate-charge queries, handled per policy. Replace with specifics." },
      { label: "Access & login issues", count: "0", description: "Password resets, verification, and access on active accounts. Replace with specifics." },
    ],
  }, "Conversations by request type.");

  push("data_table", T.ticketVolume, data.ticketVolume, "Breakdown of conversations by type.");
  push("data_table", T.priority, data.priority, "Conversations by priority.");

  // Hand-written narrative scaffold — a place for the qualitative wins / notable resolutions that
  // don't come from data. Pre-seeded with examples to replace. "Pull in client data" never touches
  // this section (it only refreshes the performance / ticket / priority / analytics data tables).
  push("checklist", "Support highlights", {
    polarity: "INCLUDE",
    intro: "Wins worth calling out from this period (replace with specifics):",
    items: [
      "Every user got a clear, actionable response",
      "Consistent tone and policy application across the batch",
      "Genuine issues surfaced to the dev team and resolved",
    ],
  }, "Qualitative wins and notable resolutions — written by hand, not pulled.");

  for (const table of data.analyticsTables) {
    push(
      "data_table",
      table.title,
      { columns: table.columns, rows: table.rows, caption: table.caption },
      `${table.title} for the period.`,
    );
  }

  push("callout", "Summary", {
    tone: "info",
    headline: "Looking ahead",
    body:
      `Thanks for your continued partnership. If you'd like to discuss any of the above or adjust priorities ` +
      `for next month, just reply to this report or reach out to your Gitwork contact.`,
  });

  return sections;
}
