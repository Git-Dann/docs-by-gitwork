/**
 * Tasks in and out of a spreadsheet, pure so the board, the import dialog and their tests agree.
 *
 * - `tasksToCsv` writes the board as a CSV whose columns are exactly the ones the import dialog
 *   reads, plus `Task ID`. Edit it in a spreadsheet, import it with "Update tasks that match",
 *   and the same tasks change (the dev team asked for export and import-with-overwrite).
 * - `parseTaskList` turns a pasted list (one task per line, bullets and numbering allowed) into
 *   titles, for "Paste a list".
 *
 * Cells go through `csvField`, so a title starting with = + - @ can't run as a formula when the
 * file is opened.
 */

import { csvField } from "@/lib/table/cells";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";

/** Header names. The import dialog's aliases match every one of them. */
export const TASK_CSV_COLUMNS = [
  "Task ID",
  "Title",
  "Status",
  "Priority",
  "Assignee",
  "Due date",
  "Category",
  "Release",
  "Description",
] as const;

/** Several assignees in one cell are separated by "; ". The import splits on ";". */
export const ASSIGNEE_SEPARATOR = "; ";

type ExportableTask = Pick<
  TaskDTO,
  "id" | "title" | "status" | "priority" | "assignees" | "dueDate" | "featureBlock" | "release" | "description"
>;

export function tasksToCsv(tasks: readonly ExportableTask[]): string {
  const lines = [TASK_CSV_COLUMNS.map(csvField).join(",")];
  for (const t of tasks) {
    const fields = [
      t.id,
      t.title,
      TASK_STATUS_LABELS[t.status] ?? t.status,
      TASK_PRIORITY_LABELS[t.priority] ?? t.priority,
      t.assignees.map((a) => a.name ?? "").filter(Boolean).join(ASSIGNEE_SEPARATOR),
      t.dueDate ? t.dueDate.slice(0, 10) : "",
      t.featureBlock?.name ?? "",
      t.release?.version ?? "",
      t.description ?? "",
    ];
    lines.push(fields.map((f) => csvField(f)).join(","));
  }
  return lines.join("\r\n");
}

/** Split an Assignee cell into names ("Ali; Sara" → ["Ali", "Sara"]). */
export function splitAssigneeCell(cell: string): string[] {
  return cell
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean);
}

/** The most tasks one paste may create, matching the import limit. */
export const PASTE_LIST_MAX = 1000;
const TITLE_MAX = 200;

export interface ParsedTaskList {
  titles: string[];
  /** Lines over 200 characters, shortened to fit. */
  shortened: number;
  /** Lines past the limit, left out. */
  overLimit: number;
}

/**
 * One task per line. Leading bullets (- * • ·), numbering (1. 1) a.), and checkboxes ([ ] [x])
 * are stripped; blank lines are skipped. A line that is only a bullet is skipped too.
 */
export function parseTaskList(text: string): ParsedTaskList {
  const titles: string[] = [];
  let shortened = 0;
  let overLimit = 0;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw
      .replace(/^\s*(?:[-*•·–]\s+|\d{1,3}[.)]\s+|[a-zA-Z][.)]\s+)?/, "")
      .replace(/^\[[ xX]?\]\s*/, "")
      .trim();
    if (!line) continue;
    if (titles.length >= PASTE_LIST_MAX) {
      overLimit++;
      continue;
    }
    if (line.length > TITLE_MAX) {
      titles.push(line.slice(0, TITLE_MAX));
      shortened++;
    } else {
      titles.push(line);
    }
  }
  return { titles, shortened, overLimit };
}

/**
 * How an import with "Update tasks that match" splits its rows: a row with an id ON THIS CLIENT
 * updates that task; a row with any other id is skipped (never created as a copy, never
 * touches another client's task); a row with no id is created.
 */
export function planImportRows<R extends { id?: string }>(
  rows: readonly R[],
  idsOnThisClient: ReadonlySet<string>,
): { updates: R[]; creates: R[]; notFound: number } {
  const updates: R[] = [];
  const creates: R[] = [];
  let notFound = 0;
  for (const r of rows) {
    if (!r.id) creates.push(r);
    else if (idsOnThisClient.has(r.id)) updates.push(r);
    else notFound++;
  }
  return { updates, creates, notFound };
}

/** The fields an import row carries, as an update: a blank cell is left out, never cleared. */
export function importRowPatch(r: {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  releaseId?: string | null;
  dueDate?: string | null;
}) {
  const patch: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assigneeIds?: string[];
    featureBlockId?: string;
    releaseId?: string;
    dueDate?: string;
  } = {};
  if (r.title?.trim()) patch.title = r.title.trim().slice(0, 200);
  if (r.description) patch.description = r.description.slice(0, 10000);
  if (r.status) patch.status = r.status;
  if (r.priority) patch.priority = r.priority;
  if (r.assigneeIds && r.assigneeIds.length > 0) patch.assigneeIds = r.assigneeIds;
  if (r.featureBlockId) patch.featureBlockId = r.featureBlockId;
  if (r.releaseId) patch.releaseId = r.releaseId;
  if (r.dueDate) patch.dueDate = r.dueDate;
  return patch;
}
