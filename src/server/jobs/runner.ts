/**
 * Job queue — drain side.
 *
 * `drainJobs` claims due jobs one at a time (atomically, so concurrent drains never double-run a
 * job), dispatches each to its handler, and records the outcome:
 *   - success  → SUCCEEDED, `result` stored, `finishedAt` stamped
 *   - failure  → back to PENDING with backoff (runAt pushed out) until `maxAttempts`, then FAILED
 * A job whose type has no registered handler is dead-lettered immediately (FAILED) so it can't spin.
 *
 * Called by `GET /api/cron/jobs` (host cron on the VPS). Bounded by `limit` per run.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getJobHandler } from "@/server/jobs/handlers";
import { backoffFor } from "@/server/jobs/types";

export interface DrainResult {
  claimed: number;
  succeeded: number;
  failed: number;
  rescheduled: number;
}

/**
 * Atomically claim a single PENDING job that's due. Uses a status-guarded `updateMany` so that if
 * another drain grabbed it first, our update matches 0 rows and we move on. Returns the claimed
 * job row, or null when nothing is claimable.
 */
async function claimNext(now: Date) {
  // Look at a small window of due jobs (oldest first) and try to claim one.
  const candidates = await prisma.backgroundJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 10,
    select: { id: true },
  });

  for (const { id } of candidates) {
    const claimed = await prisma.backgroundJob.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return prisma.backgroundJob.findUnique({ where: { id } });
    }
  }
  return null;
}

export async function drainJobs(opts?: { limit?: number }): Promise<DrainResult> {
  const limit = opts?.limit ?? 10;
  const out: DrainResult = { claimed: 0, succeeded: 0, failed: 0, rescheduled: 0 };

  for (let i = 0; i < limit; i += 1) {
    const now = new Date();
    const job = await claimNext(now);
    if (!job) break;
    out.claimed += 1;

    const handler = getJobHandler(job.type);
    if (!handler) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date(), lastError: `No handler for type "${job.type}"` },
      });
      out.failed += 1;
      continue;
    }

    try {
      const result = await handler(job.payload as never, job);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          lastError: null,
          result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      out.succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = job.attempts >= job.maxAttempts;
      if (exhausted) {
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: "FAILED", finishedAt: new Date(), lastError: message.slice(0, 2000) },
        });
        out.failed += 1;
      } else {
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            runAt: new Date(Date.now() + backoffFor(job.attempts)),
            lastError: message.slice(0, 2000),
          },
        });
        out.rescheduled += 1;
      }
    }
  }

  return out;
}
