import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { drainJobs } from "@/server/jobs/runner";
import { enqueueJob } from "@/server/jobs/queue";
import { checkMonitorsWatchdog } from "@/server/wiki-monitors";
import { checkMonitorExpiries } from "@/server/wiki-monitor-expiry";
import { refreshRunningMonths } from "@/server/wiki-metrics";
import { runDueCareWaitAlerts } from "@/server/care-alerts";
import { sendHrDigests } from "@/server/hr/digest";
import { startDueAnswerRuns } from "@/server/ai-answers";
import { syncDueCommitments } from "@/server/commitments";
import { startDueRechecks } from "@/server/provenance/recheck";
import { checkCronWatchdog } from "@/server/cron-watchdog";
import { checkDiskAndDatabase } from "@/server/disk-watch";

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

    // ── Certificate + domain expiry for monitors ── (a few per tick; read twice / once a day)
    const expiries = await checkMonitorExpiries().catch((err) => {
      console.error("[jobs] monitor expiry checks failed", err);
      return null;
    });

    // ── Wiki Metrics: the month still running, every 15 minutes ── (reads capture times only
    // unless one is over an hour old; a failure here must not fail the job worker)
    const metrics = await refreshRunningMonths().catch((err) => {
      console.error("[jobs] running-month metrics refresh failed", err);
      return null;
    });

    // ── Care: a customer waiting past the threshold ── (latched, so once per outage; the
    // 24-hour threshold is why this is not on the 10:00 digest cron)
    const careWaits = await runDueCareWaitAlerts().catch((err) => {
      console.error("[jobs] Care wait alerts failed", err);
      return null;
    });

    // ── HR's Monday digest ── (does nothing outside Monday 08:00+ UK, or once sent this week)
    const hrDigest = await sendHrDigests().catch((err) => {
      console.error("[jobs] HR digest failed", err);
      return null;
    });

    // ── Pulse → AI search: weekly buyer questions ── (starts a run and returns; the run
    // carries on in the background and the next tick sees it as running)
    const aiAnswers = await startDueAnswerRuns().catch((err) => {
      console.error("[jobs] AI answers start failed", err);
      return null;
    });

    // ── Commitments: re-read Gmail/Slack for people who switched them on (a few per tick) ──
    const commitments = await syncDueCommitments().catch((err) => {
      console.error("[jobs] commitments read failed", err);
      return null;
    });

    // ── Provenance: countermarks kept current ── (enqueues a start job per due schedule; the
    // scans themselves run in the background and are watched by their own poll jobs)
    const countermarkRechecks = await startDueRechecks().catch((err) => {
      console.error("[jobs] countermark re-examination scheduling failed", err);
      return null;
    });

    // ── Scheduled-job watchdog ── (a job in deploy/crontab that stopped being called; the
    // worker itself is watched from outside, via /api/health?cron=1)
    const cronWatch = await checkCronWatchdog().catch((err) => {
      console.error("[jobs] cron watchdog failed", err);
      return null;
    });

    // ── Disk + database size ── (hourly; alerts once when the disk passes 80%)
    const disk = await checkDiskAndDatabase().catch((err) => {
      console.error("[jobs] disk check failed", err);
      return null;
    });

    return apiOk({
      reconciled,
      cronWatch,
      disk,
      ...drain,
      staleMonitors: monitors.stale,
      monitorExpiries: expiries,
      metricsRefreshed: metrics?.refreshed.length ?? null,
      careWaits,
      hrDigest,
      aiAnswers,
      commitments,
      countermarkRechecks,
    });
  } catch (error) {
    return fromError(error);
  }
}
