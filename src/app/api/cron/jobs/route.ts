import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { drainJobs } from "@/server/jobs/runner";
import { enqueueJob } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";
// No serverless cap on the VPS, but keep runs bounded so host cron ticks stay short.
export const maxDuration = 300;

// Per-run drain cap + how many missed clients to reconcile per tick.
const DRAIN_LIMIT = 25;
const RECONCILE_LIMIT = 25;

/**
 * GET /api/cron/jobs  (host cron on the VPS — see CLAUDE.md §23)
 *
 * The background-job worker. First reconciles: enqueues archive jobs for any archived/deleted
 * clients that never landed in Drive (safety net for a failed inline enqueue). Then drains the
 * BackgroundJob queue — claiming due jobs, dispatching to handlers, rescheduling failures with
 * backoff. Idempotent + deduped, so a tight cron cadence (e.g. every minute) is safe.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    // ── Reconcile: archived/deleted clients missing a Drive archive ──
    let reconciled = 0;
    const workspaces = await prisma.workspace.findMany({
      where: { docsBackupEnabled: true },
      select: { id: true },
    });
    for (const ws of workspaces) {
      const missing = await prisma.workspaceClient.findMany({
        where: {
          workspaceId: ws.id,
          archivedToDriveAt: null,
          OR: [{ status: "ARCHIVED" }, { hidden: true }],
        },
        select: { id: true },
        take: RECONCILE_LIMIT,
      });
      for (const client of missing) {
        const { deduped } = await enqueueJob({
          type: "CLIENT_ARCHIVE",
          payload: { clientId: client.id, reason: "archived" },
          workspaceId: ws.id,
          dedupeKey: `client-archive:${client.id}`,
        });
        if (!deduped) reconciled += 1;
      }
    }

    // ── Drain the queue ──
    const drain = await drainJobs({ limit: DRAIN_LIMIT });

    return apiOk({ reconciled, ...drain });
  } catch (error) {
    return fromError(error);
  }
}
