/**
 * Retention policy registry — one entry per data-type the platform ages into cold storage.
 *
 * A policy owns: its age windows (configurable), and a `tierDown` that moves rows crossing the
 * cold threshold off the hot Postgres working set into the cold store, recording each batch as a
 * `ColdArchive` (the manifest for rehydrate + purge-review). Tier-down is automatic + reversible;
 * only an admin-approved purge (src/server/retention/purge.ts) ever deletes a cold copy.
 *
 * To add a data-type: add a `RetentionPolicy` here. Nothing else needs editing — the sweep, the
 * cron, and the purge-review surface all iterate this registry.
 */

import { prisma } from "@/lib/prisma";
import type { ColdStore } from "@/server/retention/cold-store";

const DAY_MS = 86_400_000;

export interface TierDownContext {
  store: ColdStore;
  workspaceId: string;
  /** Max source rows/units to process this run — the sweep drains a backlog over multiple runs. */
  batchLimit: number;
}

export interface TierDownResult {
  archives: number;
  rows: number;
}

export interface RetentionPolicy {
  key: string;
  entity: string;
  label: string;
  /** Age (days) at which data moves to cold. */
  coldDays: number;
  /** Days after a batch's newest row at which its cold copy becomes purge-review eligible.
   *  Null = keep the cold copy indefinitely (never surfaced for purge). */
  purgeDays: number | null;
  tierDown: (ctx: TierDownContext) => Promise<TierDownResult>;
}

// ── docs.view-events ──────────────────────────────────────────────────────────
// Per-section dwell events (DocumentViewEvent) are the fastest-growing Docs table. The DocumentView
// summary (total durationMs, geo, device) stays hot; only the bulky per-section rows tier to cold,
// batched per document, and are removed from hot once safely archived.

async function tierDownDocViewEvents(ctx: TierDownContext): Promise<TierDownResult> {
  const COLD_DAYS = docsViewEventsPolicy.coldDays;
  const PURGE_DAYS = docsViewEventsPolicy.purgeDays;
  const cutoff = new Date(Date.now() - COLD_DAYS * DAY_MS);

  const oldViews = await prisma.documentView.findMany({
    where: {
      createdAt: { lt: cutoff },
      document: { workspaceId: ctx.workspaceId },
      events: { some: {} },
    },
    orderBy: { createdAt: "asc" },
    take: ctx.batchLimit,
    select: {
      id: true,
      documentId: true,
      createdAt: true,
      events: {
        select: { id: true, sectionKey: true, sectionTitle: true, dwellMs: true, maxScrollPct: true, createdAt: true },
      },
    },
  });
  if (oldViews.length === 0) return { archives: 0, rows: 0 };

  // Group the old views (and their events) by document so each cold object covers one document.
  const byDoc = new Map<string, typeof oldViews>();
  for (const view of oldViews) {
    const list = byDoc.get(view.documentId) ?? [];
    list.push(view);
    byDoc.set(view.documentId, list);
  }

  let archives = 0;
  let rows = 0;
  for (const [documentId, views] of byDoc) {
    const eventIds: string[] = [];
    let periodStart = views[0].createdAt;
    let periodEnd = views[0].createdAt;
    const payload = views.map((v) => {
      if (v.createdAt < periodStart) periodStart = v.createdAt;
      if (v.createdAt > periodEnd) periodEnd = v.createdAt;
      for (const e of v.events) eventIds.push(e.id);
      return { viewId: v.id, visitAt: v.createdAt, events: v.events };
    });
    if (eventIds.length === 0) continue;

    const key = `docs/view-events/${documentId}/${periodEnd.toISOString().slice(0, 10)}-${views[0].id}`;
    const ref = await ctx.store.putJson(key, { documentId, views: payload });

    await prisma.coldArchive.create({
      data: {
        workspaceId: ctx.workspaceId,
        policyKey: docsViewEventsPolicy.key,
        entity: docsViewEventsPolicy.entity,
        scopeId: documentId,
        store: ref.store,
        ref: ref.ref,
        rowCount: eventIds.length,
        byteSize: ref.byteSize,
        periodStart,
        periodEnd,
        tier: "COLD",
        purgeEligibleAt: PURGE_DAYS != null ? new Date(periodEnd.getTime() + PURGE_DAYS * DAY_MS) : null,
      },
    });

    // Only now that the cold copy + manifest exist do we remove the hot rows.
    await prisma.documentViewEvent.deleteMany({ where: { id: { in: eventIds } } });

    archives += 1;
    rows += eventIds.length;
  }

  return { archives, rows };
}

const docsViewEventsPolicy: RetentionPolicy = {
  key: "docs.view-events",
  entity: "DocumentViewEvent",
  label: "Docs — per-section view events",
  coldDays: 60,
  purgeDays: 365,
  tierDown: tierDownDocViewEvents,
};

export const RETENTION_POLICIES: RetentionPolicy[] = [docsViewEventsPolicy];

export function getPolicy(key: string): RetentionPolicy | undefined {
  return RETENTION_POLICIES.find((p) => p.key === key);
}
