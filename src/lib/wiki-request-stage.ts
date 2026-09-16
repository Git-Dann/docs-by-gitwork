/**
 * Where a client request has actually got to — derived from the dev board, never stored.
 *
 * ## The defect this exists to close
 *
 * A request promoted to a task sets `ClientWikiIntakeItem.status = "PROMOTED"` and stamps
 * `taskId`. Nothing ever writes that field again. So a developer could drag the card
 * BACKLOG → DOING → DONE, ship the fix, and the client's Requests page would still read
 * "Task created" — forever. That is why clients keep their own spreadsheets: ours stops
 * telling them anything the moment we start work.
 *
 * ## Why this is derived and not synced
 *
 * The obvious fix is to write the task's status back onto the intake row whenever a task
 * moves. That is a second source of truth, and a second source of truth is only correct
 * while every write path remembers to update it — batch updates, the drag handler, the
 * detail drawer, the standup, the importer, MCP. Miss one and the row lies again, silently,
 * exactly as it does today. Care learned this the expensive way (CLAUDE.md §42.2): store
 * the facts a system can observe, derive the judgement at read time, and a board that has
 * drifted repairs itself the moment anyone looks at it.
 *
 * So: the loader reads the linked task's status, this pure function turns
 * `(intake status, task status)` into one client-facing word, and there is no write path
 * to forget.
 *
 * ## The honesty rule
 *
 * `taskStatus` is null whenever we could not establish one — no task linked yet, or a
 * `taskId` pointing at a task that has since been deleted (there is no FK, so that dangles).
 * Both collapse to REVIEWING rather than SCHEDULED, because "we have it" is true in both
 * cases and "it is on the board" is not. Reporting a deleted task as scheduled would be the
 * §35 mistake — "we could not look" rendered as a fact.
 */

/** The six task-board columns, mirrored rather than imported: this module is pure and is
 *  read by a public client-facing bundle. `dev-label-parity`-style drift is covered by the
 *  exhaustive `Record` below — add a TaskStatus and this file stops compiling. */
export type WikiTaskStatus =
  | "BACKLOG"
  | "TODO"
  | "DOING"
  | "IN_REVIEW"
  | "UI_DONE"
  | "DONE";

/** The intake row's own lifecycle, as stored. */
export type WikiIntakeStatus = "NEW" | "TRIAGED" | "PROMOTED" | "CLOSED";

/**
 * What the client is told. Deliberately coarser than `TaskStatus` — BACKLOG vs TODO is
 * our queue management and means nothing outside the team, whereas "is anyone working on
 * it yet" means everything.
 */
export type RequestStage =
  | "NEW"
  | "REVIEWING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CLOSED";

/**
 * Board column → what a client understands by it.
 *
 * UI_DONE folds into IN_REVIEW for the same reason `buildTaskStatusCounts` folds it on the
 * wiki timeline: it is a hand-off state between two of our own people, not a stage of the
 * client's request.
 */
const TASK_STAGE: Record<WikiTaskStatus, RequestStage> = {
  BACKLOG: "SCHEDULED",
  TODO: "SCHEDULED",
  DOING: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  UI_DONE: "IN_REVIEW",
  DONE: "DONE",
};

/**
 * @param status     the intake row's own status
 * @param taskStatus the linked task's board column, or null when none could be established
 */
export function deriveRequestStage(
  status: WikiIntakeStatus,
  taskStatus: WikiTaskStatus | null,
): RequestStage {
  // CLOSED wins over everything, including a task still in flight. "Mark dealt with" is an
  // explicit statement by the team that this request is finished with — and its own tooltip
  // says the task is deliberately not affected. Letting a live task overrule it would put
  // a request the team has filed back onto the client's open list.
  if (status === "CLOSED") return "CLOSED";
  if (taskStatus) return TASK_STAGE[taskStatus];
  return status === "NEW" ? "NEW" : "REVIEWING";
}

export const STAGE_LABEL: Record<RequestStage, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CLOSED: "Closed",
};

/**
 * Reading order, for sorting and for laying the filter chips out left-to-right. It is the
 * journey a request takes, so "oldest stage first" is also "least progressed first".
 */
export const STAGE_ORDER: RequestStage[] = [
  "NEW",
  "REVIEWING",
  "SCHEDULED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CLOSED",
];

/**
 * Chip styling. One journey, so mostly one hue at rising intensity — amber to enter (it
 * needs someone), blue while it is ours, emerald to leave.
 *
 * ⚠️ No `--text-4` on `--surface-1`: that pair measures 4.36:1, under AA at the 10px these
 * chips use (the same trap recorded in CLAUDE.md §45.3). `--text-3` is 6.95:1.
 */
export const STAGE_STYLE: Record<RequestStage, string> = {
  NEW: "bg-amber-50 text-amber-700",
  REVIEWING: "bg-[var(--surface-1)] text-[var(--text-2)] ring-1 ring-[var(--border-1)]",
  SCHEDULED: "bg-blue-50 text-blue-700",
  // Solid, not another tint: "someone is on it right now" is the single thing a client
  // scans this column for, so it is the one chip that carries its own ground.
  IN_PROGRESS: "bg-blue-600 text-white",
  IN_REVIEW: "bg-indigo-50 text-indigo-700",
  DONE: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-[var(--surface-1)] text-[var(--text-3)]",
};

/**
 * A one-line explanation of the stage, shown as the chip's `title`.
 *
 * Worth the words: "Reviewing" is the stage a request lands in both before triage and when
 * its task has gone missing, and a client reading it deserves to know it means "with us,
 * not yet scheduled" rather than "being actively looked at this minute".
 */
export const STAGE_HINT: Record<RequestStage, string> = {
  NEW: "Logged — not triaged yet.",
  REVIEWING: "With the team. Not scheduled onto the board yet.",
  SCHEDULED: "On the delivery board, waiting to be picked up.",
  IN_PROGRESS: "A developer is working on it now.",
  IN_REVIEW: "Built — being checked before it ships.",
  DONE: "Shipped.",
  CLOSED: "Filed as dealt with by the team.",
};
