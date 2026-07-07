/**
 * Purge review — the only destructive step in the retention lifecycle, and never automatic.
 *
 * `listPurgeCandidates` surfaces cold archives past their retention window (purgeEligibleAt <= now,
 * not yet purged). An admin approves specific ids via `approvePurge`, which deletes the cold copy
 * and stamps `purgedAt`. `getPurgeAttention` powers the On Your Desk banner (admins/super-admins).
 */

import { prisma } from "@/lib/prisma";
import { isAtLeast } from "@/types/auth";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { getColdStore, type ColdRef } from "@/server/retention/cold-store";

/** Admins + super-admins review purges. */
export function canReviewPurges(user: EffectiveUser | null | undefined): boolean {
  return Boolean(user && isAtLeast(user.role, "ADMIN"));
}

export interface PurgeCandidate {
  id: string;
  policyKey: string;
  entity: string;
  scopeId: string | null;
  rowCount: number;
  byteSize: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  purgeEligibleAt: string | null;
}

export async function listPurgeCandidates(limit = 100): Promise<PurgeCandidate[]> {
  const rows = await prisma.coldArchive.findMany({
    where: { purgedAt: null, purgeEligibleAt: { not: null, lte: new Date() } },
    orderBy: { purgeEligibleAt: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    policyKey: r.policyKey,
    entity: r.entity,
    scopeId: r.scopeId,
    rowCount: r.rowCount,
    byteSize: r.byteSize,
    periodStart: r.periodStart?.toISOString() ?? null,
    periodEnd: r.periodEnd?.toISOString() ?? null,
    purgeEligibleAt: r.purgeEligibleAt?.toISOString() ?? null,
  }));
}

export interface PurgeAttention {
  count: number;
  reclaimableBytes: number;
}

/** Lightweight count + reclaimable size for the Desk banner. Empty for non-admins. */
export async function getPurgeAttention(user: EffectiveUser | null | undefined): Promise<PurgeAttention> {
  if (!canReviewPurges(user)) return { count: 0, reclaimableBytes: 0 };
  const where = { purgedAt: null, purgeEligibleAt: { not: null, lte: new Date() } } as const;
  const [count, agg] = await Promise.all([
    prisma.coldArchive.count({ where }),
    prisma.coldArchive.aggregate({ where, _sum: { byteSize: true } }),
  ]);
  return { count, reclaimableBytes: agg._sum.byteSize ?? 0 };
}

export interface PurgeResult {
  purged: number;
  errors: string[];
}

/**
 * Permanently delete the cold copies for the given archive ids (admin-approved). Deletes the cold
 * object then stamps `purgedAt`. Skips ids that don't exist or are already purged.
 */
export async function approvePurge(ids: string[]): Promise<PurgeResult> {
  const out: PurgeResult = { purged: 0, errors: [] };
  if (ids.length === 0) return out;

  const rows = await prisma.coldArchive.findMany({
    where: { id: { in: ids }, purgedAt: null },
    include: { workspace: { select: { id: true, docsBackupEnabled: true, coldStoreFolderId: true } } },
  });

  for (const row of rows) {
    try {
      if (row.workspace) {
        const store = await getColdStore(row.workspace);
        if (store) {
          await store.remove({ store: row.store as ColdRef["store"], ref: row.ref });
        }
      }
      await prisma.coldArchive.update({ where: { id: row.id }, data: { purgedAt: new Date() } });
      out.purged += 1;
    } catch (err) {
      out.errors.push(`${row.id}: ${String(err).slice(0, 160)}`);
    }
  }

  return out;
}
