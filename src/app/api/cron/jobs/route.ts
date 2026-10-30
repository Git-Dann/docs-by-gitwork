import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { drainJobs } from "@/server/jobs/runner";
import { enqueueJob } from "@/server/jobs/queue";
import { checkMonitorsWatchdog } from "@/server/wiki-monitors";
import { refreshRunningMonths } from "@/server/wiki-metrics";
import { sendHrDigests } from "@/server/hr/digest";

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

    // ── Uptime-monitor watchdog ──
    // Here, not in the wiki-monitors cron it watches: if that cron stops, a check of its own
    // could never say so. Monitors went unchecked for 2½ months (Aug–Oct 2026) unnoticed.
    // A failure here must not fail the job worker.
    const monitors = await checkMonitorsWatchdog().catch((err) => {
      console.error("[jobs] monitor watchdog failed", err);
      return { stale: 0 };
    });

    // ── Wiki Metrics: the month still running, every 15 minutes ── (reads capture times only
    // unless one is over an hour old; a failure here must not fail the job worker)
    const metrics = await refreshRunningMonths().catch((err) => {
      console.error("[jobs] running-month metrics refresh failed", err);
      return null;
    });

    // ── HR's Monday digest ── (does nothing outside Monday 08:00+ UK, or once sent this week)
    const hrDigest = await sendHrDigests().catch((err) => {
      console.error("[jobs] HR digest failed", err);
      return null;
    });

    return apiOk({
      reconciled,
      ...drain,
      staleMonitors: monitors.stale,
      metricsRefreshed: metrics?.refreshed.length ?? null,
      hrDigest,
    });
  } catch (error) {
    return fromError(error);
  }
}
