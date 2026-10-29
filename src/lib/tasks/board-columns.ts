/**
 * A client's own task-board columns — the pure half (no Prisma, no React).
 *
 * The five statuses stay the only statuses: standups, Foreman, the Gantt and the client's
 * Delivery page all read them. An extra column is a lane INSIDE one of them — "QA" counts as
 * In review, "Blocked" as Doing — so adding one changes nothing downstream.
 *
 * Where a task sits is derived, never trusted: it is in a custom column only while that column
 * still exists AND belongs to the task's current status. A task moved from the drawer, a batch
 * edit or MCP simply falls back to its status column, with nothing to keep in sync.
 */

import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/types/tasks";

export interface BoardColumnDef {
  id: string;
  name: string;
  /** The status a task in this column has. */
  stage: TaskStatus;
}

/** A move or edit that names a column the board no longer has. 409: refresh and retry. */
export class BoardColumnError extends Error {
  status = 409;
}

export const BOARD_COLUMN_LIMITS = { columns: 12, name: 40 } as const;

const ID = /^col_[a-z0-9]{6,24}$/;

export function newBoardColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 12).padEnd(8, "0")}`;
}

/** Stored JSON → columns. Anything malformed is dropped rather than thrown, so a board always renders. */
export function parseBoardColumns(raw: unknown): BoardColumnDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  // Two columns called "QA", or one called "Done", would read as the same lane.
  const names = new Set(TASK_STATUSES.map((s) => columnNameKey(TASK_STATUS_LABELS[s])));
  const out: BoardColumnDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, stage } = item as Record<string, unknown>;
    if (typeof id !== "string" || !ID.test(id) || seen.has(id)) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof stage !== "string" || !(TASK_STATUSES as string[]).includes(stage)) continue;
    if (names.has(columnNameKey(name))) continue;
    names.add(columnNameKey(name));
    seen.add(id);
    out.push({ id, name: name.trim().slice(0, BOARD_COLUMN_LIMITS.name), stage: stage as TaskStatus });
    if (out.length === BOARD_COLUMN_LIMITS.columns) break;
  }
  return out;
}

/** Names compare without case or spacing: "In review" is the In Review column. */
export function columnNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/** A rendered column: one of the five statuses, or a custom lane inside one. */
export interface BoardLane {
  /** Droppable id: the status itself, or the custom column's id. */
  key: string;
  label: string;
  stage: TaskStatus;
  /** Null for a status column. */
  columnId: string | null;
}

/** Status columns in their fixed order, each followed by its custom lanes in the order they were added. */
export function boardLanes(columns: readonly BoardColumnDef[]): BoardLane[] {
  const lanes: BoardLane[] = [];
  for (const status of TASK_STATUSES) {
    lanes.push({ key: status, label: TASK_STATUS_LABELS[status], stage: status, columnId: null });
    for (const c of columns) {
      if (c.stage === status) lanes.push({ key: c.id, label: c.name, stage: status, columnId: c.id });
    }
  }
  return lanes;
}

/** The lane a task belongs in. A column that is gone, or no longer matches the task's status, is ignored. */
export function laneKeyFor(
  task: { status: TaskStatus; boardColumnId?: string | null },
  columns: readonly BoardColumnDef[],
): string {
  const col = task.boardColumnId ? columns.find((c) => c.id === task.boardColumnId) : undefined;
  return col && col.stage === task.status ? col.id : task.status;
}

/** The custom column a task sits in, by name — for Slack lines and anything else that lists tasks. */
export function columnNameFor(
  task: { status: TaskStatus; boardColumnId?: string | null },
  columns: readonly BoardColumnDef[],
): string | null {
  const key = laneKeyFor(task, columns);
  return columns.find((c) => c.id === key)?.name ?? null;
}
