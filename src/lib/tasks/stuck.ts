/**
 * "Stuck in progress": one rule for Foreman's DEV_STALLED finding and the badge on a task card,
 * so the two can't disagree (the dev team asked to see stuck tasks on the board, Nov 2026).
 *
 * A task is stuck when it is in progress (Doing, In review, UI done) and started at least
 * `staleDays` whole days ago, counted in UTC days, exactly as Foreman counts them.
 */

export const IN_PROGRESS_STATUSES = ["DOING", "IN_REVIEW", "UI_DONE"] as const;

/** Foreman's default (`FOREMAN_DEFAULTS.staleDoingDays`). A test keeps them equal. */
export const DEFAULT_STALE_DAYS = 5;

const DAY_MS = 86_400_000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC days since the task was started, or null when it isn't in progress. */
export function daysInProgress(
  task: { status: string; startedAt: Date | string | null },
  now: Date = new Date(),
): number | null {
  if (!(IN_PROGRESS_STATUSES as readonly string[]).includes(task.status) || !task.startedAt) return null;
  const started = task.startedAt instanceof Date ? task.startedAt : new Date(task.startedAt);
  if (Number.isNaN(started.getTime())) return null;
  return Math.max(0, Math.floor((utcMidnight(now) - utcMidnight(started)) / DAY_MS));
}

export function isStuck(
  task: { status: string; startedAt: Date | string | null },
  staleDays: number = DEFAULT_STALE_DAYS,
  now: Date = new Date(),
): boolean {
  const days = daysInProgress(task, now);
  return days !== null && days >= staleDays;
}
