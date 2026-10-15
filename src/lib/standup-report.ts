/**
 * How a developer's tasks are laid out in the daily Slack updates — the per-developer
 * standup card, the consolidated #updates card, and the admin's review preview.
 *
 * Pure and framework-free, so all three render from ONE rule. They used to each decide for
 * themselves, which is how the consolidated card ended up reporting only "done today":
 * a developer three days into one task had nothing to show at the end of the day.
 *
 * Two rules worth knowing:
 *
 *  - **A subtask with no assignee belongs to whoever owns its parent.** 172 of 265 live
 *    subtasks have no assignee (made before subtasks inherited their parent's), so a report
 *    that only reads a subtask's own assignees silently drops the work it was asked to show.
 *  - **Subtasks sit under their parent**, indented with a ↳, never as loose bullets. A parent
 *    that is not itself in the group still heads its subtasks so they have context.
 */

export type ReportStatus = "BACKLOG" | "TODO" | "DOING" | "IN_REVIEW" | "UI_DONE" | "DONE";

export interface ReportTask {
  taskId: string;
  title: string;
  status: ReportStatus;
  parentId?: string | null;
  parentTitle?: string | null;
}

export type ReportGroupKey = "done" | "progress" | "review";

export interface ReportRow {
  kind: "task" | "subtask";
  taskId: string;
  title: string;
}

export interface ReportGroup {
  key: ReportGroupKey;
  label: string;
  rows: ReportRow[];
}

const LABELS: Record<ReportGroupKey, string> = {
  done: "Done today",
  progress: "In progress",
  review: "In review",
};

const EMOJI: Record<ReportGroupKey, string> = {
  done: ":white_check_mark:",
  progress: ":arrows_counterclockwise:",
  review: ":eyes:",
};

export function groupKeyFor(status: ReportStatus): ReportGroupKey | null {
  if (status === "DONE") return "done";
  if (status === "DOING") return "progress";
  if (status === "IN_REVIEW" || status === "UI_DONE") return "review";
  return null;
}

/**
 * Who a task is reported for: its own assignees, or — for a subtask nobody is assigned
 * to — its parent's. A top-level task with no assignee belongs to nobody.
 */
export function reportOwnerIds(task: {
  assigneeId?: string | null;
  assignees?: Array<{ id: string }>;
  parent?: { assigneeId?: string | null; assignees?: Array<{ id: string }> } | null;
}): string[] {
  const own = new Set<string>((task.assignees ?? []).map((a) => a.id));
  if (task.assigneeId) own.add(task.assigneeId);
  if (own.size > 0 || !task.parent) return [...own];
  const inherited = new Set<string>((task.parent.assignees ?? []).map((a) => a.id));
  if (task.parent.assigneeId) inherited.add(task.parent.assigneeId);
  return [...inherited];
}

/**
 * Lay one group's tasks out as rows: top-level tasks in order, each followed by its own
 * subtasks; subtasks whose parent is not in this group get the parent as a heading row.
 * Every task appears exactly once.
 */
export function toRows(tasks: ReportTask[]): ReportRow[] {
  const present = new Set(tasks.map((t) => t.taskId));
  const subsByParent = new Map<string, ReportTask[]>();
  const order: Array<{ kind: "task"; t: ReportTask } | { kind: "heading"; id: string; title: string }> = [];
  const headingSeen = new Set<string>();

  for (const t of tasks) {
    if (t.parentId) {
      if (!subsByParent.has(t.parentId)) subsByParent.set(t.parentId, []);
      subsByParent.get(t.parentId)!.push(t);
      if (!present.has(t.parentId) && !headingSeen.has(t.parentId)) {
        headingSeen.add(t.parentId);
        order.push({ kind: "heading", id: t.parentId, title: t.parentTitle?.trim() || "Task" });
      }
    } else {
      order.push({ kind: "task", t });
    }
  }

  const rows: ReportRow[] = [];
  for (const entry of order) {
    const id = entry.kind === "task" ? entry.t.taskId : entry.id;
    rows.push({ kind: "task", taskId: id, title: entry.kind === "task" ? entry.t.title : entry.title });
    for (const sub of subsByParent.get(id) ?? []) {
      rows.push({ kind: "subtask", taskId: sub.taskId, title: sub.title });
    }
  }
  return rows;
}

/**
 * A developer's tasks grouped for the phase. End of day reports what shipped AND what is
 * still moving — multi-day work is the point of the in-progress group. Morning reports
 * only what is moving. Empty groups are dropped.
 */
export function groupForReport(tasks: ReportTask[], phase: "AM" | "PM"): ReportGroup[] {
  const order: ReportGroupKey[] = phase === "PM" ? ["done", "progress", "review"] : ["progress", "review"];
  return order
    .map((key) => ({
      key,
      label: LABELS[key],
      rows: toRows(tasks.filter((t) => groupKeyFor(t.status) === key)),
    }))
    .filter((g) => g.rows.length > 0);
}

/** Leading indent for a subtask. Non-breaking spaces: Slack collapses ordinary ones. */
export const SUBTASK_PREFIX = "    ↳ ";

/** Slack mrkdwn for a set of rows. `escape` is the caller's mrkdwn escaper. */
export function rowsToMrkdwn(rows: ReportRow[], escape: (s: string) => string): string {
  return rows
    .map((r) => (r.kind === "subtask" ? `${SUBTASK_PREFIX}${escape(r.title)}` : `• ${escape(r.title)}`))
    .join("\n");
}

/** Slack mrkdwn for a developer's groups, each under a small emoji label. */
export function groupsToMrkdwn(groups: ReportGroup[], escape: (s: string) => string): string {
  return groups.map((g) => `${EMOJI[g.key]} _${g.label}_\n${rowsToMrkdwn(g.rows, escape)}`).join("\n");
}
