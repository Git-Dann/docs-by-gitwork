/**
 * Delivery metrics — "how are we doing", derived from data the wiki already carries.
 *
 * **No Prisma, no loader, no route, no schema change.** `WikiTimeline` already holds
 * per-phase `statusCounts`, `progress` and `milestones`, and `wiki.blockers` is already in
 * the DTO and already documented client-safe. This page is pure presentation over facts
 * that were sitting there, which is why it is a `src/lib` module and not a `src/server`
 * one: it can be unit-tested without a database because there is nothing to fetch.
 *
 * ## What it must never surface
 *
 * Assignees, priorities, comments, per-developer velocity, and any status finer than
 * done/not-done. The wiki timeline is already scoped that way (`loadWikiTimeline`'s own
 * docstring says so); this module derives only from what that scoping already permits, so
 * there is no second place for a client-facing leak to appear.
 */

export type DeliveryTaskStatus =
  | "BACKLOG"
  | "TODO"
  | "DOING"
  | "IN_REVIEW"
  | "UI_DONE"
  | "DONE";

export interface DeliveryBlock {
  id: string;
  name: string;
  progress: number;
  /**
   * Per-status task counts. ⚠️ May be absent — the demo wiki's blocks carry none, and
   * reading `.DONE` off it threw on first render. The cast in the fixture (`as unknown
   * as WikiDTO["timeline"]`) is why `tsc` said nothing.
   */
  statusCounts?: Partial<Record<DeliveryTaskStatus, number>>;
  /**
   * The same tasks at a coarser grain, and the field that is reliably present on every
   * block in the DTO. Used when `statusCounts` is missing — NOT a second source of truth,
   * the same facts counted two ways, with the finer one preferred.
   */
  tasks?: readonly { done: boolean }[];
  endDate?: string | null;
}

export interface DeliveryMilestone {
  id: string;
  name: string;
  date: string;
}

export interface DeliveryBlocker {
  taskId: string;
  blockedResponse: string | null;
}

export interface DeliverySummary {
  /** Tasks done across every phase, and the total. */
  done: number;
  total: number;
  /** Overall completion, or null when there is nothing dated to measure. */
  percent: number | null;
  phasesComplete: number;
  phasesInFlight: number;
  phasesNotStarted: number;
  /** The next milestone still ahead, or null. */
  nextMilestone: DeliveryMilestone | null;
  milestonesHit: number;
  milestonesAhead: number;
  /**
   * Open blockers — the single most useful number on the page, and it already existed.
   * A blocker is work WE cannot move until the client answers, so "waiting on you" is
   * the honest label for it.
   */
  waitingOnClient: number;
  /**
   * True when there is no timeline at all. ⚠️ Distinct from `percent === 0`: "nobody has
   * built a plan" and "the plan is 0% done" are different facts, and reporting the first
   * as the second is the mistake §35 is about.
   */
  noTimeline: boolean;
}

/**
 * Tasks counted as finished.
 *
 * ⚠️ `buildTaskStatusCounts` folds `UI_DONE` into `IN_REVIEW` before these counts are
 * built, so UI_DONE is normally zero here. It is still counted as not-done rather than
 * omitted, because a legacy row that skipped that fold must not silently vanish from the
 * total — a phase whose counts do not sum to its task count is worse than a slightly
 * conservative percentage.
 */
function doneOf(block: DeliveryBlock): number {
  if (block.statusCounts) return block.statusCounts.DONE ?? 0;
  return (block.tasks ?? []).filter((t) => t.done).length;
}

function totalOf(block: DeliveryBlock): number {
  if (block.statusCounts) {
    return (Object.values(block.statusCounts) as (number | undefined)[]).reduce<number>(
      (a, b) => a + (b ?? 0),
      0,
    );
  }
  return (block.tasks ?? []).length;
}

export function summariseDelivery(input: {
  blocks: readonly DeliveryBlock[];
  milestones: readonly DeliveryMilestone[];
  blockers: readonly DeliveryBlocker[];
  /** Injected so the derivation is deterministic in a test. */
  now?: Date;
}): DeliverySummary {
  const now = input.now ?? new Date();
  const blocks = input.blocks;

  let done = 0;
  let total = 0;
  let phasesComplete = 0;
  let phasesInFlight = 0;
  let phasesNotStarted = 0;

  for (const block of blocks) {
    const d = doneOf(block);
    const t = totalOf(block);
    done += d;
    total += t;
    // A phase with no tasks is "not started" rather than "complete". Dividing by zero
    // and calling the result 100% is how an empty plan reports as finished.
    if (t === 0) phasesNotStarted += 1;
    else if (d === t) phasesComplete += 1;
    else if (d > 0 || (t - d < t && block.progress > 0)) phasesInFlight += 1;
    else phasesNotStarted += 1;
  }

  const upcoming = input.milestones
    .filter((m) => new Date(m.date).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    done,
    total,
    percent: total === 0 ? null : Math.round((done / total) * 100),
    phasesComplete,
    phasesInFlight,
    phasesNotStarted,
    nextMilestone: upcoming[0] ?? null,
    milestonesHit: input.milestones.length - upcoming.length,
    milestonesAhead: upcoming.length,
    // Only blockers the client has not yet answered — one they have replied to is ours
    // again, and counting it as "waiting on you" would be untrue.
    waitingOnClient: input.blockers.filter((b) => !b.blockedResponse).length,
    noTimeline: blocks.length === 0,
  };
}

/** Phases in reading order with their own done/total, for the per-phase list. */
export function phaseRows(blocks: readonly DeliveryBlock[]): {
  id: string;
  name: string;
  done: number;
  total: number;
  percent: number | null;
}[] {
  return blocks.map((block) => {
    const done = doneOf(block);
    const total = totalOf(block);
    return {
      id: block.id,
      name: block.name,
      done,
      total,
      // null, not 0 — a phase with no tasks has no percentage, and showing 0% says
      // something untrue about work nobody has broken down yet.
      percent: total === 0 ? null : Math.round((done / total) * 100),
    };
  });
}
