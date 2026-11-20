/**
 * Which scheduled jobs have stopped running (CLAUDE.md §144). Pure, so the rules are tested.
 *
 * Each job in deploy/crontab has a longest gap it may go without running. A gap is the
 * schedule's own interval plus slack for a slow run or a restart: an every-minute job may miss
 * ten minutes, a daily one 26 hours, a weekday job a long weekend. A test reads deploy/crontab
 * and fails when a job there has no entry here, so a new job can't go unwatched.
 *
 * "Stopped" is judged from when the scheduler last CALLED the route, not whether the route
 * succeeded: a route that fails still reports its own errors; the case nothing reported was
 * the scheduler itself stopping (a broken run-cron.sh, a wrong CRON_SECRET, cron not running).
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Longest gap, in milliseconds, each scheduled job may go without being called. */
export const CRON_MAX_GAP: Readonly<Record<string, number>> = {
  jobs: 10 * MIN,
  "wiki-monitors": 10 * MIN,
  "wedge-keepwarm": 30 * MIN,
  "pulse-reconcile": 60 * MIN,
  "pulse-run-monitors": 3 * HOUR,
  "wedge-course-feed": 3 * HOUR,
  // Weekdays 08–18 hourly: the longest gap is Friday 18:00 to Monday 08:00.
  "crm-sync": 3 * DAY,
  "docs-gdrive-backup": 26 * HOUR,
  "auto-archive-tasks": 26 * HOUR,
  "member-purge": 26 * HOUR,
  "analytics-snapshot": 26 * HOUR,
  "embed-conversations": 26 * HOUR,
  "support-sync": 26 * HOUR,
  // Weekdays 08:30: Friday to Monday.
  "availability-digest": 3 * DAY + 2 * HOUR,
  foreman: 26 * HOUR,
  "meet-transcripts": 26 * HOUR,
  "care-digest": 26 * HOUR,
  "absence-cover-reconcile": 26 * HOUR,
  retention: 26 * HOUR,
  curator: 8 * DAY,
  "db-backup": 26 * HOUR,
};

export interface StaleJob {
  name: string;
  /** When it was last called, or null if it never has been since watching began. */
  lastRun: string | null;
  /** How long it has gone without running, in minutes. */
  silentMinutes: number;
}

/**
 * The jobs that have gone longer than their gap without running.
 *
 * `watchingSince` is when the watch began recording. A job that has never been seen only
 * counts as stopped once its whole gap has passed since then, so the first deploy of the
 * watch (and a daily job that simply hasn't come round yet) is not reported.
 */
export function staleJobs(
  lastRuns: Readonly<Record<string, Date | null | undefined>>,
  now: Date,
  watchingSince: Date,
  gaps: Readonly<Record<string, number>> = CRON_MAX_GAP,
): StaleJob[] {
  const out: StaleJob[] = [];
  for (const [name, gap] of Object.entries(gaps)) {
    const last = lastRuns[name] ?? null;
    const since = last ?? watchingSince;
    const silent = now.getTime() - since.getTime();
    if (silent > gap) {
      out.push({ name, lastRun: last ? last.toISOString() : null, silentMinutes: Math.floor(silent / MIN) });
    }
  }
  return out.sort((a, b) => b.silentMinutes - a.silentMinutes);
}

/** "2 days", "3 hours", "40 minutes": how long a job has been quiet, in plain words. */
export function silentFor(minutes: number): string {
  if (minutes >= 2 * 24 * 60) return `${Math.floor(minutes / (24 * 60))} days`;
  if (minutes >= 2 * 60) return `${Math.floor(minutes / 60)} hours`;
  return `${minutes} minutes`;
}

/** The job name from a cron request's path (`/api/cron/<name>`), or null. */
export function cronNameFromPath(pathname: string): string | null {
  const m = /^\/api\/cron\/([a-z0-9-]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}

/**
 * Which alerts to send this tick: a stale job not yet alerted gets one "stopped" alert; a job
 * alerted earlier that is no longer stale gets one "running again". Nothing else, so a job that
 * stays stopped for a week is reported once.
 */
export function cronAlertChanges(
  stale: readonly StaleJob[],
  alerted: ReadonlySet<string>,
): { stopped: StaleJob[]; recovered: string[] } {
  const staleNames = new Set(stale.map((s) => s.name));
  return {
    stopped: stale.filter((s) => !alerted.has(s.name)),
    recovered: [...alerted].filter((name) => !staleNames.has(name)).sort(),
  };
}
