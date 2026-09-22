/**
 * RoundUp — "what we did last week, what we're on this week, and the bigger picture",
 * derived from what the wiki already carries.
 *
 * Pure: no Prisma, no loader, no route. `src/lib` rather than `src/server` for the same
 * reason `wiki-delivery.ts` is — there is nothing to fetch, so it can be proved without
 * a database. The one server change RoundUp needed was widening the timeline's task
 * `select` to carry `completedAt` / `startedAt`; everything below is arithmetic on that.
 *
 * ## The three buckets, and why they are timestamps rather than statuses
 *
 * The wiki DTO deliberately does not carry per-task status — a client sees done or not
 * done, never BACKLOG vs TODO vs IN_REVIEW. But `startedAt` and `completedAt` say more
 * than a status does anyway, because they say WHEN:
 *
 *   delivered   done
 *   in flight   not done, work has begun (startedAt set)
 *   planned     not done, not begun
 *
 * ⚠️ `done` is the authority for WHETHER; the stamp only says WHEN. A DONE task whose
 * `completedAt` is null is still delivered — it must not fall through to "planned"
 * because a timestamp is missing. It is counted as delivered-but-undated and named in
 * the blind spots, because "we shipped this, we cannot tell you which week" and "we
 * shipped nothing" are different facts and the page must not merge them.
 *
 * ## What it must never surface
 *
 * The same boundary `wiki-delivery.ts` documents: no assignees, no priorities, no
 * comments, no per-developer velocity, nothing finer than done/not-done. This module
 * only ever reads fields the wiki timeline already scopes as client-safe.
 */

import type { VennRegion } from "@/lib/insights/venn-geometry";

export interface RoundupTask {
  title: string;
  done: boolean;
  completedAt: string | null;
  startedAt: string | null;
}

export interface RoundupBlock {
  id: string;
  name: string;
  progress?: number;
  tasks?: readonly RoundupTask[];
}

export type RoundupBucket = "delivered" | "in-flight" | "planned";

export interface RoundupItem {
  title: string;
  /** The block it belongs to, so a reader knows which workstream moved. */
  block: string | null;
  /** ISO day. Null on a delivered task whose completion was never stamped. */
  at: string | null;
}

export type RoundupBlindSpotKind =
  | "NO_TASKS"
  | "NO_COMPLETION_STAMPS"
  | "SOME_UNDATED"
  | "NOTHING_IN_FLIGHT";

export interface RoundupBlindSpot {
  kind: RoundupBlindSpotKind;
  message: string;
}

export interface RoundupVennSet {
  key: "A" | "B" | "C";
  label: string;
}

export interface RoundupVennItem {
  id: string;
  label: string;
  /**
   * ⚠️ The renderer's own union, not `string`. A region it does not know (e.g. "BA")
   * draws nothing at all, silently — so the key order is a type error rather than a
   * blank diagram.
   */
  region: VennRegion;
  note: string | null;
}

export interface RoundupSummary {
  /** The window "last week" means, so the page can state it rather than imply it. */
  window: { fromISO: string; toISO: string; days: number };
  /** Completed inside the window, newest first. */
  delivered: RoundupItem[];
  /** Completed in the window before it — for "more or less than last week". */
  deliveredPrevious: number;
  /** Delivered but never stamped, so they cannot be placed in any week. */
  deliveredUndated: number;
  /** Started and not finished. */
  inFlight: RoundupItem[];
  /** Not started. Capped by the caller's `upNextLimit`. */
  upNext: RoundupItem[];
  totals: { delivered: number; inFlight: number; planned: number };
  venn: { sets: RoundupVennSet[]; items: RoundupVennItem[] };
  blindSpots: RoundupBlindSpot[];
}

const DAY = 86_400_000;

export const ROUNDUP_WINDOW_DAYS = 7;

function bucketOf(task: RoundupTask): RoundupBucket {
  // ⚠️ `done` first. A delivered task with no stamp must never read as planned.
  if (task.done) return "delivered";
  return task.startedAt ? "in-flight" : "planned";
}

function isoDay(value: string): string {
  return value.slice(0, 10);
}

/**
 * The Venn's unit is the BLOCK, not the task, and that is not a stylistic choice.
 *
 * ⚠️ A task holds one status, so delivered / in flight / planned cannot overlap for a
 * task — a Venn of tasks is three circles that touch nothing, which is a worse pie
 * chart. A block can hold tasks in several buckets at once, so the overlaps are real
 * and mean something: "this workstream is part-built" is exactly the lens region.
 */
function buildVenn(blocks: readonly RoundupBlock[]): RoundupSummary["venn"] {
  const sets: RoundupVennSet[] = [
    { key: "A", label: "Delivered" },
    { key: "B", label: "In flight" },
    { key: "C", label: "Planned" },
  ];
  const KEY: Record<RoundupBucket, "A" | "B" | "C"> = {
    delivered: "A",
    "in-flight": "B",
    planned: "C",
  };
  const items: RoundupVennItem[] = [];
  for (const block of blocks) {
    const present = new Set<string>();
    for (const task of block.tasks ?? []) present.add(KEY[bucketOf(task)]);
    if (present.size === 0) continue; // a block with no tasks sits in no region
    // Region keys are ordered A→B→C to match VENN_REGIONS_3 ("AB", never "BA").
    const region = (["A", "B", "C"] as const)
      .filter((k) => present.has(k))
      .join("") as VennRegion;
    const counts = { delivered: 0, inFlight: 0, planned: 0 };
    for (const task of block.tasks ?? []) {
      const b = bucketOf(task);
      if (b === "delivered") counts.delivered += 1;
      else if (b === "in-flight") counts.inFlight += 1;
      else counts.planned += 1;
    }
    const parts = [
      counts.delivered ? `${counts.delivered} delivered` : null,
      counts.inFlight ? `${counts.inFlight} in flight` : null,
      counts.planned ? `${counts.planned} planned` : null,
    ].filter(Boolean);
    items.push({ id: block.id, label: block.name, region, note: parts.join(" · ") });
  }
  return { sets, items };
}

export function summariseRoundup(
  blocks: readonly RoundupBlock[],
  now: Date,
  opts: { windowDays?: number; upNextLimit?: number } = {},
): RoundupSummary {
  const days = opts.windowDays ?? ROUNDUP_WINDOW_DAYS;
  const to = now.getTime();
  const from = to - days * DAY;
  const prevFrom = from - days * DAY;

  const delivered: RoundupItem[] = [];
  const inFlight: RoundupItem[] = [];
  const upNext: RoundupItem[] = [];
  let deliveredPrevious = 0;
  let deliveredUndated = 0;
  const totals = { delivered: 0, inFlight: 0, planned: 0 };
  let anyTask = false;

  for (const block of blocks) {
    for (const task of block.tasks ?? []) {
      anyTask = true;
      const bucket = bucketOf(task);
      const item: RoundupItem = {
        title: task.title,
        block: block.name,
        at: task.completedAt ? isoDay(task.completedAt) : null,
      };
      if (bucket === "delivered") {
        totals.delivered += 1;
        if (!task.completedAt) {
          deliveredUndated += 1;
          continue;
        }
        const at = Date.parse(task.completedAt);
        // ⚠️ An unparseable stamp is undated, not "now" — Date.parse returns NaN and
        // every comparison against it is false, which would silently drop the task.
        if (Number.isNaN(at)) {
          deliveredUndated += 1;
          continue;
        }
        if (at >= from && at <= to) delivered.push(item);
        else if (at >= prevFrom && at < from) deliveredPrevious += 1;
      } else if (bucket === "in-flight") {
        totals.inFlight += 1;
        inFlight.push({ ...item, at: task.startedAt ? isoDay(task.startedAt) : null });
      } else {
        totals.planned += 1;
        upNext.push(item);
      }
    }
  }

  delivered.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") * -1);
  const limit = opts.upNextLimit ?? 6;

  const blindSpots: RoundupBlindSpot[] = [];
  if (!anyTask) {
    blindSpots.push({
      kind: "NO_TASKS",
      message: "No work is broken down into tasks yet, so there is nothing to report on.",
    });
  } else if (totals.delivered > 0 && deliveredUndated === totals.delivered) {
    // ⚠️ THE case this module exists to get right. Everything is delivered and nothing
    // is dated, so "0 this week" would be a lie of omission.
    blindSpots.push({
      kind: "NO_COMPLETION_STAMPS",
      message:
        `${totals.delivered} item${totals.delivered === 1 ? " is" : "s are"} complete, but ` +
        "none records when it was finished — so this page cannot say which week the work " +
        "landed in, only that it is done.",
    });
  } else if (deliveredUndated > 0) {
    blindSpots.push({
      kind: "SOME_UNDATED",
      message:
        `${deliveredUndated} completed item${deliveredUndated === 1 ? "" : "s"} ` +
        "cannot be placed in a week, because the completion date was not recorded. " +
        "They are counted in the totals but not in the weekly figures.",
    });
  }
  if (anyTask && totals.inFlight === 0 && totals.planned > 0) {
    blindSpots.push({
      kind: "NOTHING_IN_FLIGHT",
      message:
        "Nothing is currently marked as started, so the work in progress below may be " +
        "out of date rather than genuinely empty.",
    });
  }

  return {
    window: { fromISO: new Date(from).toISOString(), toISO: new Date(to).toISOString(), days },
    delivered,
    deliveredPrevious,
    deliveredUndated,
    inFlight,
    upNext: upNext.slice(0, limit),
    totals,
    venn: buildVenn(blocks),
    blindSpots,
  };
}
