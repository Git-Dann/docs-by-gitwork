/**
 * How much of a project's recent work happened ON its plan, and how much of the plan is
 * being left alone.
 *
 * The October 2026 audit: Fellas Loaded completed 150 tasks in 30 days and none was in a
 * category, while 78 of its planned tasks hadn't been touched in 30 days. Every figure the
 * client and the team read — phase progress, the Gantt, the Delivery page — counts the
 * plan, so the project looked stalled while the work was really happening. Neither number
 * was shown anywhere, so nobody could see it.
 *
 * Pure, so the board's strip and the tests agree. Top-level tasks only, like every other
 * progress figure in the app.
 */

export const PLAN_WINDOW_DAYS = 30;
/** A planned task untouched for this long is "left alone". */
export const PLAN_STALE_DAYS = 21;

const DAY = 86_400_000;

export interface PlanHealthTask {
  id: string;
  status: string;
  parentId: string | null;
  archivedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  featureBlock: { id: string; name: string } | null;
}

export interface PlanHealth {
  windowDays: number;
  staleDays: number;
  /** Top-level tasks completed in the window. */
  doneInWindow: number;
  /** …of which were in a category. */
  donePlanned: number;
  /** …of which were not. */
  doneUnplanned: number;
  /** Open, unarchived tasks in a category. */
  plannedOpen: number;
  /** …untouched for `staleDays` or more. */
  plannedStale: number;
  /** Open, unarchived tasks in no category. */
  unplannedOpen: number;
  /** Ids behind the two actionable figures, for the board's filters. */
  staleIds: string[];
  unplannedIds: string[];
}

export function computePlanHealth(
  tasks: readonly PlanHealthTask[],
  now: Date,
  opts: { windowDays?: number; staleDays?: number } = {},
): PlanHealth {
  const windowDays = opts.windowDays ?? PLAN_WINDOW_DAYS;
  const staleDays = opts.staleDays ?? PLAN_STALE_DAYS;
  const windowStart = now.getTime() - windowDays * DAY;
  const staleBefore = now.getTime() - staleDays * DAY;

  let doneInWindow = 0;
  let donePlanned = 0;
  let plannedOpen = 0;
  let unplannedOpen = 0;
  const staleIds: string[] = [];
  const unplannedIds: string[] = [];

  for (const t of tasks) {
    if (t.parentId) continue;
    const planned = Boolean(t.featureBlock);
    if (t.status === "DONE") {
      const at = t.completedAt ? Date.parse(t.completedAt) : NaN;
      if (Number.isFinite(at) && at >= windowStart) {
        doneInWindow += 1;
        if (planned) donePlanned += 1;
        else unplannedIds.push(t.id);
      }
      continue;
    }
    if (t.archivedAt) continue;
    if (planned) {
      plannedOpen += 1;
      if (Date.parse(t.updatedAt) < staleBefore) staleIds.push(t.id);
    } else {
      unplannedOpen += 1;
      unplannedIds.push(t.id);
    }
  }

  return {
    windowDays,
    staleDays,
    doneInWindow,
    donePlanned,
    doneUnplanned: doneInWindow - donePlanned,
    plannedOpen,
    plannedStale: staleIds.length,
    unplannedOpen,
    staleIds,
    unplannedIds,
  };
}

/**
 * Whether the strip has anything worth saying. Silent on a healthy board: a status line
 * that is always present is a status line nobody reads.
 *
 * - Some recent work was done outside the plan, AND that is a meaningful share of it
 *   (one stray task in a busy month is noise), or
 * - planned tasks are being left alone while work carries on elsewhere.
 */
export function planHealthWorthShowing(h: PlanHealth): boolean {
  const unplannedShare = h.doneInWindow === 0 ? 0 : h.doneUnplanned / h.doneInWindow;
  const drifting = h.doneUnplanned >= 3 && unplannedShare >= 0.25;
  const leftAlone = h.plannedStale >= 3 && h.doneInWindow > 0;
  return drifting || leftAlone;
}
