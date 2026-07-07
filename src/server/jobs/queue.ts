/**
 * Job queue — enqueue side.
 *
 * `enqueueJob` inserts a `BackgroundJob` row (PENDING, runnable now). When a `dedupeKey` is given
 * it collapses against any *in-flight* job (PENDING/RUNNING) with the same key, so repeated
 * triggers (e.g. re-saving an already-archiving client) don't pile up duplicates — while still
 * allowing a fresh run once the previous one has finished.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JobPayloads, JobType } from "@/server/jobs/types";

export interface EnqueueOptions<T extends JobType> {
  type: T;
  payload: JobPayloads[T];
  workspaceId?: string | null;
  /** Collapse key — skips insert if an in-flight (PENDING/RUNNING) job with this key exists. */
  dedupeKey?: string;
  /** Delay the earliest run time. Defaults to now. */
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueueJob<T extends JobType>(
  opts: EnqueueOptions<T>,
): Promise<{ id: string; deduped: boolean }> {
  if (opts.dedupeKey) {
    const existing = await prisma.backgroundJob.findFirst({
      where: { dedupeKey: opts.dedupeKey, status: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, deduped: true };
  }

  const job = await prisma.backgroundJob.create({
    data: {
      type: opts.type,
      payload: opts.payload as Prisma.InputJsonValue,
      workspaceId: opts.workspaceId ?? null,
      dedupeKey: opts.dedupeKey ?? null,
      runAt: opts.runAt ?? new Date(),
      ...(opts.maxAttempts != null ? { maxAttempts: opts.maxAttempts } : {}),
    },
    select: { id: true },
  });
  return { id: job.id, deduped: false };
}

/**
 * Fire-and-forget enqueue for use from request handlers that must not block or throw (e.g. the
 * client archive triggers). Swallows every error — the reconcile cron is the safety net.
 */
export function enqueueJobBestEffort<T extends JobType>(opts: EnqueueOptions<T>): void {
  void enqueueJob(opts).catch((err) => {
    console.warn(`[jobs] enqueue ${opts.type} failed: ${String(err).slice(0, 160)}`);
  });
}
