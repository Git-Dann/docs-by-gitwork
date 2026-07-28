/**
 * Document engagement analytics (Phase 1).
 *
 * Two halves:
 *   1. Recording — called by the public /docs/[token] endpoints. `recordDocumentView`
 *      (find-or-create per session, first-open detection) and `recordSectionDwell` (per-section
 *      dwell upserts + total visit duration).
 *   2. Reading — `getDocumentAnalytics` (one document: visitors, per-section dwell heatmap,
 *      device/geo splits, conversion) and `getWorkspaceDocumentAnalytics` (cross-document
 *      rollup: funnel counts, open/win rates, leaderboards). Both power the web UI and the iOS
 *      app through the /api/documents analytics endpoints.
 *
 * All numeric outputs are plain numbers; all timestamps are ISO strings — a stable JSON contract.
 */

import type { DocumentStatus, DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Recording ────────────────────────────────────────────────────────────────

export interface RecordViewInput {
  documentId: string;
  sessionId: string | null;
  visitorId: string | null;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  origin?: string; // "DOCS" (default) | "SIGN"
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
}

/**
 * Find-or-create the DocumentView for this visit (idempotent on sessionId so a double-fired
 * beacon doesn't double-count), and atomically detect the document's first-ever open.
 */
export async function recordDocumentView(
  input: RecordViewInput,
): Promise<{ viewId: string; isFirstView: boolean }> {
  const existing = input.sessionId
    ? await prisma.documentView.findFirst({
        where: { documentId: input.documentId, sessionId: input.sessionId },
        select: { id: true },
      })
    : null;

  const viewId =
    existing?.id ??
    (
      await prisma.documentView.create({
        data: {
          documentId: input.documentId,
          sessionId: input.sessionId,
          visitorId: input.visitorId,
          ip: input.ip,
          userAgent: input.userAgent,
          referer: input.referer,
          origin: input.origin ?? "DOCS",
          country: input.country,
          city: input.city,
          device: input.device,
          browser: input.browser,
          os: input.os,
        },
        select: { id: true },
      })
    ).id;

  // Atomic first-open: only the update that flips a still-null firstViewedAt "wins", so the
  // first-open alert fires exactly once even under concurrent opens.
  const flipped = await prisma.document.updateMany({
    where: { id: input.documentId, firstViewedAt: null },
    data: { firstViewedAt: new Date() },
  });

  return { viewId, isFirstView: flipped.count > 0 };
}

export interface SectionDwellInput {
  sectionKey: string;
  sectionTitle?: string | null;
  /** Dwell delta in ms accrued since the last flush (server increments). */
  dwellMs: number;
  /** Cumulative deepest scroll into the section, 0-100 (server overwrites — client max is monotonic). */
  maxScrollPct?: number | null;
}

/**
 * Apply a batch of per-section dwell deltas to a visit (resolved by sessionId), and set the
 * visit's total visible duration. No-ops silently if the session can't be resolved (e.g. the
 * view beacon was blocked) so tracking failures never surface to the visitor.
 */
export async function recordSectionDwell(input: {
  documentId: string;
  sessionId: string;
  durationMs?: number | null;
  sections: SectionDwellInput[];
}): Promise<{ ok: boolean }> {
  const view = await prisma.documentView.findFirst({
    where: { documentId: input.documentId, sessionId: input.sessionId },
    select: { id: true, durationMs: true },
  });
  if (!view) return { ok: false };

  await Promise.all(
    input.sections
      .filter((s) => s.sectionKey && Number.isFinite(s.dwellMs))
      .map((s) =>
        prisma.documentViewEvent.upsert({
          where: { viewId_sectionKey: { viewId: view.id, sectionKey: s.sectionKey } },
          create: {
            viewId: view.id,
            sectionKey: s.sectionKey,
            sectionTitle: s.sectionTitle ?? null,
            dwellMs: Math.max(0, Math.round(s.dwellMs)),
            maxScrollPct: clampPct(s.maxScrollPct),
          },
          update: {
            dwellMs: { increment: Math.max(0, Math.round(s.dwellMs)) },
            ...(s.maxScrollPct != null ? { maxScrollPct: clampPct(s.maxScrollPct) } : {}),
            ...(s.sectionTitle ? { sectionTitle: s.sectionTitle } : {}),
          },
        }),
      ),
  );

  if (input.durationMs != null && Number.isFinite(input.durationMs)) {
    const next = Math.max(0, Math.round(input.durationMs));
    // Duration is cumulative + monotonic from the client; keep the larger of the two.
    if (next > (view.durationMs ?? 0)) {
      await prisma.documentView.update({ where: { id: view.id }, data: { durationMs: next } });
    }
  }

  return { ok: true };
}

function clampPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ── Reading: per-document ──────────────────────────────────────────────────────

export interface SectionEngagement {
  sectionKey: string;
  sectionTitle: string | null;
  totalDwellMs: number;
  avgDwellMs: number;
  viewers: number;
  avgScrollPct: number | null;
  /** Share of total dwell across all sections — drives the heatmap intensity (0-100). */
  sharePct: number;
}

export interface DocumentVisitRow {
  id: string;
  createdAt: string;
  durationMs: number | null;
  visitorLabel: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  sectionsViewed: number;
}

export interface DocumentAnalytics {
  documentId: string;
  totalViews: number;
  uniqueVisitors: number;
  returningVisitors: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  avgDurationMs: number | null;
  totalDwellMs: number;
  status: DocumentStatus;
  isShared: boolean;
  sharedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  timeToFirstOpenMs: number | null;
  sections: SectionEngagement[];
  devices: Array<{ key: string; count: number }>;
  browsers: Array<{ key: string; count: number }>;
  locations: Array<{ key: string; count: number }>;
  recentVisits: DocumentVisitRow[];
}

export async function getDocumentAnalytics(documentId: string): Promise<DocumentAnalytics | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      isShared: true,
      sharedAt: true,
      firstViewedAt: true,
      acceptedAt: true,
      declinedAt: true,
    },
  });
  if (!doc) return null;

  const views = await prisma.documentView.findMany({
    where: { documentId, origin: "DOCS" },
    orderBy: { createdAt: "desc" },
    // Bound worst-case memory: a single heavily-shared doc could otherwise pull
    // its entire view history (+ nested events) into the function. 10k most-recent
    // visits is far beyond any real internal doc and keeps the heatmap accurate.
    take: 10_000,
    select: {
      id: true,
      createdAt: true,
      visitorId: true,
      ip: true,
      durationMs: true,
      device: true,
      browser: true,
      os: true,
      country: true,
      city: true,
      events: { select: { sectionKey: true, sectionTitle: true, dwellMs: true, maxScrollPct: true } },
    },
  });

  // Unique + returning visitors keyed by visitorId, falling back to ip, then the view id.
  const visitorKeys = views.map((v) => v.visitorId ?? v.ip ?? `v:${v.id}`);
  const visitorCounts = tally(visitorKeys);
  const uniqueVisitors = visitorCounts.size;
  const returningVisitors = [...visitorCounts.values()].filter((n) => n > 1).length;

  const durations = views.map((v) => v.durationMs).filter((d): d is number => d != null && d > 0);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  // Per-section aggregation across all views.
  const bySection = new Map<
    string,
    { title: string | null; totalDwell: number; viewers: number; scrollSum: number; scrollN: number }
  >();
  for (const v of views) {
    for (const e of v.events) {
      const cur =
        bySection.get(e.sectionKey) ??
        { title: e.sectionTitle, totalDwell: 0, viewers: 0, scrollSum: 0, scrollN: 0 };
      cur.totalDwell += e.dwellMs;
      cur.viewers += 1;
      if (e.sectionTitle && !cur.title) cur.title = e.sectionTitle;
      if (e.maxScrollPct != null) {
        cur.scrollSum += e.maxScrollPct;
        cur.scrollN += 1;
      }
      bySection.set(e.sectionKey, cur);
    }
  }
  const totalDwellMs = [...bySection.values()].reduce((a, s) => a + s.totalDwell, 0);
  const sections: SectionEngagement[] = [...bySection.entries()]
    .map(([sectionKey, s]) => ({
      sectionKey,
      sectionTitle: s.title,
      totalDwellMs: s.totalDwell,
      avgDwellMs: s.viewers ? Math.round(s.totalDwell / s.viewers) : 0,
      viewers: s.viewers,
      avgScrollPct: s.scrollN ? Math.round(s.scrollSum / s.scrollN) : null,
      sharePct: totalDwellMs ? Math.round((s.totalDwell / totalDwellMs) * 100) : 0,
    }))
    .sort((a, b) => b.totalDwellMs - a.totalDwellMs);

  const lastViewedAt = views[0]?.createdAt.toISOString() ?? null;
  const timeToFirstOpenMs =
    doc.sharedAt && doc.firstViewedAt
      ? Math.max(0, doc.firstViewedAt.getTime() - doc.sharedAt.getTime())
      : null;

  return {
    documentId: doc.id,
    totalViews: views.length,
    uniqueVisitors,
    returningVisitors,
    firstViewedAt: doc.firstViewedAt?.toISOString() ?? null,
    lastViewedAt,
    avgDurationMs,
    totalDwellMs,
    status: doc.status,
    isShared: doc.isShared,
    sharedAt: doc.sharedAt?.toISOString() ?? null,
    acceptedAt: doc.acceptedAt?.toISOString() ?? null,
    declinedAt: doc.declinedAt?.toISOString() ?? null,
    timeToFirstOpenMs,
    sections,
    devices: distribution(views.map((v) => v.device)),
    browsers: distribution(views.map((v) => v.browser)),
    locations: distribution(
      views.map((v) => (v.city && v.country ? `${v.city}, ${v.country}` : v.country)),
    ),
    recentVisits: views.slice(0, 15).map((v) => ({
      id: v.id,
      createdAt: v.createdAt.toISOString(),
      durationMs: v.durationMs,
      // Location, else "Anonymous" — never the raw IP (it's still stored on the
      // row for support/debugging, it just isn't a useful label to surface).
      visitorLabel: v.city && v.country ? `${v.city}, ${v.country}` : (v.country ?? "Anonymous"),
      device: v.device,
      browser: v.browser,
      os: v.os,
      country: v.country,
      city: v.city,
      sectionsViewed: v.events.length,
    })),
  };
}

// ── Reading: cross-document workspace rollup ───────────────────────────────────

export interface WorkspaceDocAnalyticsOptions {
  documentType?: DocumentType | "ALL";
  from?: Date;
  to?: Date;
}

export interface WorkspaceDocAnalytics {
  range: { from: string | null; to: string | null };
  totals: {
    documents: number;
    shared: number;
    viewed: number;
    sent: number;
    accepted: number;
    declined: number;
  };
  rates: {
    openRate: number | null; // viewed / shared
    winRate: number | null; // accepted / (accepted + declined)
    avgTimeToFirstOpenMs: number | null;
  };
  byStatus: Array<{ status: DocumentStatus; count: number }>;
  topDocuments: Array<{
    id: string;
    title: string;
    documentNumber: string | null;
    clientName: string | null;
    status: DocumentStatus;
    views: number;
    lastViewedAt: string | null;
  }>;
  topSections: Array<{ sectionKey: string; totalDwellMs: number; avgDwellMs: number; samples: number }>;
}

export async function getWorkspaceDocumentAnalytics(
  workspaceId: string,
  opts: WorkspaceDocAnalyticsOptions = {},
): Promise<WorkspaceDocAnalytics> {
  const typeFilter =
    opts.documentType && opts.documentType !== "ALL" ? { documentType: opts.documentType } : {};
  const createdAt =
    opts.from || opts.to
      ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {};

  const base: Prisma.DocumentWhereInput = {
    workspaceId,
    archivedAt: null,
    ...typeFilter,
    ...createdAt,
  };

  const [documents, shared, viewed, accepted, declined, sent, statusGroups, openTimes] =
    await Promise.all([
      prisma.document.count({ where: base }),
      prisma.document.count({ where: { ...base, sharedAt: { not: null } } }),
      prisma.document.count({ where: { ...base, firstViewedAt: { not: null } } }),
      prisma.document.count({ where: { ...base, acceptedAt: { not: null } } }),
      prisma.document.count({ where: { ...base, declinedAt: { not: null } } }),
      prisma.document.count({ where: { ...base, status: { in: ["SENT", "ACCEPTED", "DECLINED"] } } }),
      prisma.document.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      prisma.document.findMany({
        where: { ...base, sharedAt: { not: null }, firstViewedAt: { not: null } },
        select: { sharedAt: true, firstViewedAt: true },
      }),
    ]);

  const openDeltas = openTimes
    .map((d) =>
      d.sharedAt && d.firstViewedAt ? Math.max(0, d.firstViewedAt.getTime() - d.sharedAt.getTime()) : null,
    )
    .filter((n): n is number => n != null);
  const avgTimeToFirstOpenMs = openDeltas.length
    ? Math.round(openDeltas.reduce((a, b) => a + b, 0) / openDeltas.length)
    : null;

  // Scope the view/section aggregations by document id rather than a relation filter. Filtering
  // documentView.groupBy via `document: base` JOINs the Document table, and since both DocumentView
  // and Document have a `createdAt` column, `_max: { createdAt }` becomes an ambiguous column
  // reference in Postgres (error 42702). Resolving the ids up front keeps these queries join-free.
  const baseDocs = await prisma.document.findMany({ where: base, select: { id: true } });
  const baseDocIds = baseDocs.map((d) => d.id);

  // Per-document view counts + last-viewed, top 8 by views.
  const viewGroups = await prisma.documentView.groupBy({
    by: ["documentId"],
    where: { origin: "DOCS", documentId: { in: baseDocIds } },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { documentId: "desc" } },
    take: 8,
  });
  const topDocIds = viewGroups.map((g) => g.documentId);
  const topDocsMeta = topDocIds.length
    ? await prisma.document.findMany({
        where: { id: { in: topDocIds } },
        select: { id: true, title: true, documentNumber: true, clientName: true, status: true },
      })
    : [];
  const metaById = new Map(topDocsMeta.map((d) => [d.id, d]));
  const topDocuments = viewGroups
    .map((g) => {
      const meta = metaById.get(g.documentId);
      if (!meta) return null;
      return {
        id: g.documentId,
        title: meta.title,
        documentNumber: meta.documentNumber,
        clientName: meta.clientName,
        status: meta.status,
        views: g._count._all,
        lastViewedAt: g._max.createdAt?.toISOString() ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // Most-read section types across every shared document.
  const sectionGroups = await prisma.documentViewEvent.groupBy({
    by: ["sectionKey"],
    where: { view: { documentId: { in: baseDocIds }, origin: "DOCS" } },
    _sum: { dwellMs: true },
    _avg: { dwellMs: true },
    _count: { _all: true },
    orderBy: { _sum: { dwellMs: "desc" } },
    take: 10,
  });
  const topSections = sectionGroups.map((g) => ({
    sectionKey: g.sectionKey,
    totalDwellMs: g._sum.dwellMs ?? 0,
    avgDwellMs: Math.round(g._avg.dwellMs ?? 0),
    samples: g._count._all,
  }));

  return {
    range: { from: opts.from?.toISOString() ?? null, to: opts.to?.toISOString() ?? null },
    totals: { documents, shared, viewed, sent, accepted, declined },
    rates: {
      openRate: shared ? round2(viewed / shared) : null,
      winRate: accepted + declined ? round2(accepted / (accepted + declined)) : null,
      avgTimeToFirstOpenMs,
    },
    byStatus: statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    topDocuments,
    topSections,
  };
}

// ── small helpers ──────────────────────────────────────────────────────────────

function tally(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function distribution(values: Array<string | null>): Array<{ key: string; count: number }> {
  const m = tally(values.filter((v): v is string => !!v));
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
