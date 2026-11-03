/**
 * wiki-support.ts — the client's own support performance, in their wiki.
 *
 * ## Why this is safe to show, and how that was decided
 *
 * Every figure here is one Foundry **already emails the client every month** in the Care
 * report (`support-report-doc.ts`). So they are client-safe by existing precedent rather
 * than by my judgement — which is the only defensible way to answer "can they see this?",
 * because the alternative is one person's taste standing between a client and their own
 * data.
 *
 * ## What is deliberately EXCLUDED
 *
 * - **Sentiment** and `getClientHealthScore`. "23% of your customers sound negative" is a
 *   conversation to have with someone, not a number to publish at them.
 * - **`SupportConversationNote`** — staff-only by its own schema comment.
 * - **Raw `SupportMessage` bodies** and `CustomerIdentity`: those are the client's END
 *   customers' personal data. We hold it to do the work, not to redistribute it.
 * - Anything cross-client.
 *
 * ⚠️ **Support days are NOT the `clients.viewFinancials` fields.** That gate covers
 * `monthlyCost` / `workingDays` / `retainerDays` / `retainerDaysUsed` on `WorkspaceClient`
 * and must never appear here. `SupportClient.supportDaysPerMonth` is the client's own
 * contractual allowance — a term of their agreement, which they already have a copy of.
 */

import { prisma } from "@/lib/prisma";
import { getPerformanceMetricsForPeriod, getTicketStatsForPeriod } from "@/server/support";

export interface WikiSupportPeriod {
  /** "2026-09" — the month these figures cover. */
  month: string;
  totalTickets: number;
  resolvedCount: number;
  openCount: number;
  resolutionRate: number;
  avgFirstResponseMs: number | null;
  medianFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
  slaCompliancePct: number | null;
  /** Ticket counts by category — the shape the monthly report already publishes. */
  categories: { label: string; count: number }[];
}

export interface WikiSupportSection {
  enabled: boolean;
  /**
   * Null when this client has no linked Care record. ⚠️ That is NOT the same as "they
   * had no tickets": the section renders an explicit "not connected" state rather than an
   * empty chart, because an empty chart reads as "nobody contacted support this month".
   */
  linked: boolean;
  current: WikiSupportPeriod | null;
  /** The month before, so every figure can carry a trend rather than float free. */
  previous: WikiSupportPeriod | null;
  /** Contractual support allowance and what has been used — both may be null. */
  daysAllowance: number | null;
  daysUsed: number | null;
}

const EMPTY: WikiSupportSection = {
  enabled: false,
  linked: false,
  current: null,
  previous: null,
  daysAllowance: null,
  daysUsed: null,
};

/** First and last day of a month, as the `YYYY-MM-DD` strings Care's helpers expect. */
function monthBounds(year: number, month0: number): { start: string; end: string; label: string } {
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: iso(start).slice(0, 7) };
}

async function loadPeriod(
  clientId: string,
  year: number,
  month0: number,
  slaTargetHours: number,
): Promise<WikiSupportPeriod> {
  const { start, end, label } = monthBounds(year, month0);
  // Both reads are independent, so they run together — this sits on a wiki page load.
  const [stats, perf] = await Promise.all([
    getTicketStatsForPeriod(clientId, start, end),
    getPerformanceMetricsForPeriod(clientId, start, end, slaTargetHours),
  ]);
  return {
    month: label,
    totalTickets: perf.totalTickets,
    resolvedCount: perf.resolvedCount,
    openCount: perf.openCount,
    resolutionRate: perf.resolutionRate,
    avgFirstResponseMs: perf.avgFirstResponseMs,
    medianFirstResponseMs: perf.medianFirstResponseMs,
    avgResolutionMs: perf.avgResolutionMs,
    medianResolutionMs: perf.medianResolutionMs,
    slaCompliancePct: perf.slaFrtCompliancePct,
    // Only categories that actually occurred. A permanent row of zeroes is noise, and
    // "0 refunds" reads as a finding when it is really an unused category.
    categories: [
      { label: "Technical issues", count: stats.catTechIssues },
      { label: "Account queries", count: stats.catAccountQueries },
      { label: "Cancellations", count: stats.catCancellations },
      { label: "Refunds", count: stats.catRefunds },
      { label: "Other", count: stats.catOther },
    ].filter((c) => c.count > 0),
  };
}

export async function loadWikiSupport(
  clientId: string,
  now: Date = new Date(),
): Promise<WikiSupportSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { supportEnabled: true },
  });
  if (!wiki?.supportEnabled) return EMPTY;

  // `SupportClient.workspaceClientId` is the one link between Care and Portal. Matching
  // on NAME would be the other option and is exactly the mistake §42.15 records — the
  // same client is "wedge" in Portal and "Big Wedge Golf" in Care, so a name match would
  // never have fired. It is not declared `@unique`, hence `findFirst`.
  const care = await prisma.supportClient.findFirst({
    where: { workspaceClientId: clientId },
    select: { id: true, supportDaysPerMonth: true, supportDaysUsed: true },
  });
  if (!care) return { ...EMPTY, enabled: true };

  // 4h first-touch, the same default `getPerformanceMetricsForPeriod` documents. There
  // is no per-client SLA column yet; when there is one, read it here rather than adding
  // a second definition of the target.
  const sla = 4;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const [current, previous] = await Promise.all([
    loadPeriod(care.id, y, m, sla),
    loadPeriod(care.id, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, sla),
  ]);

  return {
    enabled: true,
    linked: true,
    current,
    previous,
    daysAllowance: care.supportDaysPerMonth ?? null,
    daysUsed: care.supportDaysUsed ?? null,
  };
}

export async function setWikiSupportEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, supportEnabled: enabled },
    update: { supportEnabled: enabled },
    select: { id: true },
  });
}

export async function setWikiDeliveryEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, deliveryEnabled: enabled },
    update: { deliveryEnabled: enabled },
    select: { id: true },
  });
}

export async function setWikiRoundupEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, roundupEnabled: enabled },
    update: { roundupEnabled: enabled },
    select: { id: true },
  });
}
