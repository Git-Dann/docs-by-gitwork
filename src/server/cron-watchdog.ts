/**
 * Watches the scheduled jobs in deploy/crontab and says when one stops (CLAUDE.md §144).
 *
 * Every authorised call to `/api/cron/<name>` records a `cron:<name>` marker (assertCron).
 * The every-minute `jobs` worker runs `checkCronWatchdog`, which compares those markers with
 * each job's longest allowed gap (`CRON_MAX_GAP`) and alerts once per stopped job, then once
 * when it runs again (latch: marker `cron-alert:<name>`).
 *
 * The one job this can't watch is `jobs` itself: if the worker stops, nothing runs this check.
 * That case is covered from outside, by `/api/health?cron=1` probed from GitHub
 * (foundry-watchdog.yml), which uses `cronHealth` below.
 */

import { CRON_MAX_GAP, cronAlertChanges, silentFor, staleJobs, type StaleJob } from "@/lib/cron-watch";
import type { JobStatus } from "@/lib/platform-health";
import { clearSystem, markSystem, readSystemMarkers } from "@/server/system-markers";
import { sendOpsAlert } from "@/server/ops-alert";

const WATCH_SINCE = "cron-watch-since";
const JOBS = Object.keys(CRON_MAX_GAP);
const cronKey = (name: string) => `cron:${name}`;
const alertKey = (name: string) => `cron-alert:${name}`;

/** The stopped jobs right now. Starts the watch clock on its first ever call. */
export async function cronHealth(now: Date = new Date()): Promise<{ stale: StaleJob[]; alerted: Set<string>; jobs: JobStatus[] }> {
  const markers = await readSystemMarkers([WATCH_SINCE, ...JOBS.map(cronKey), ...JOBS.map(alertKey)]);
  let since = markers[WATCH_SINCE];
  if (!since) {
    since = now;
    await markSystem(WATCH_SINCE, now);
  }
  const lastRuns = Object.fromEntries(JOBS.map((n) => [n, markers[cronKey(n)]]));
  const alerted = new Set(JOBS.filter((n) => markers[alertKey(n)]));
  const stale = staleJobs(lastRuns, now, since);
  const staleNames = new Set(stale.map((s) => s.name));
  const jobs: JobStatus[] = JOBS.map((name) => ({
    name,
    lastRun: lastRuns[name]?.toISOString() ?? null,
    maxGapMinutes: Math.round(CRON_MAX_GAP[name] / 60_000),
    stale: staleNames.has(name),
  }));
  return { stale, alerted, jobs };
}

export async function checkCronWatchdog(now: Date = new Date()): Promise<{ stale: number; alerted: number; recovered: number }> {
  const { stale, alerted } = await cronHealth(now);
  const { stopped, recovered } = cronAlertChanges(stale, alerted);
  for (const job of stopped) {
    await sendOpsAlert({
      key: `cron:${job.name}`,
      title: `Scheduled job "${job.name}" has stopped`,
      body: job.lastRun
        ? `It last ran ${silentFor(job.silentMinutes)} ago (${job.lastRun}). Check the VPS crontab and /tmp/foundry-cron.log.`
        : `It hasn't run since the watch began, ${silentFor(job.silentMinutes)} ago. Check the VPS crontab.`,
    });
    await markSystem(alertKey(job.name), now);
  }
  for (const name of recovered) {
    await sendOpsAlert({ key: `cron:${name}`, level: "resolved", title: `Scheduled job "${name}" is running again` });
    await clearSystem(alertKey(name));
  }
  return { stale: stale.length, alerted: stopped.length, recovered: recovered.length };
}
