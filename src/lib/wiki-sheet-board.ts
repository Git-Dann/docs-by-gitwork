/**
 * The Board column as a tracker (CLAUDE.md §73.1) — the pure half. No Prisma, no React.
 *
 * A row sent to the board shows its task's stage, who is on it, its due date and how
 * recently it moved — always derived from the live task at read time (§47.2), never a copy
 * kept on the row. The loader hands the raw task in; everything here turns it into what the
 * team and the client see, and decides what the client is NOT shown.
 */

import { STAGE_LABEL, STAGE_ORDER, type RequestStage } from "@/lib/wiki-request-stage";
import type { SheetRowTask, SheetTaskPerson, WikiSheetRow } from "@/types/wiki-sheets";

export interface RawTaskPerson {
  name: string | null;
  email: string;
}

export interface RawTask {
  title: string;
  status: string;
  dueDate: Date | null;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  assignees: RawTaskPerson[];
  /** Legacy single assignee — the fallback when the many-to-many is empty (as `tasks.ts`). */
  assignee: RawTaskPerson | null;
}

function displayName(p: RawTaskPerson): string {
  return p.name?.trim() || p.email.split("@")[0] || "Someone";
}

export function nameInitials(name: string): string {
  const words = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0][0]];
  return letters.join("").toUpperCase();
}

/** Everyone on a task: the join wins; the legacy `assignee` only when the join is empty. */
export function taskAssignees(task: Pick<RawTask, "assignees" | "assignee">): string[] {
  const list = task.assignees.length ? task.assignees : task.assignee ? [task.assignee] : [];
  return [...new Set(list.map(displayName))];
}

/** "Priya Shah" → "Priya S."; a single name stays as it is. What a client sees of our team. */
export function shortPersonName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? name;
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function isoDay(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** The team's view of a row's live task. */
export function deriveRowTask(task: RawTask): SheetRowTask {
  return {
    title: task.title,
    assignees: taskAssignees(task).map((name): SheetTaskPerson => ({ name, initials: nameInitials(name) })),
    dueDate: isoDay(task.dueDate),
    updatedAt: task.updatedAt.toISOString(),
    startedAt: iso(task.startedAt),
    completedAt: task.status === "DONE" ? iso(task.completedAt) : null,
  };
}

/**
 * The client's view: stage, who (first name + last initial), due date and when it moved.
 * Never the task title, never full names, and nothing the loader didn't select in the first
 * place (comments, subtasks, priority, estimates, the board link). Built field by field
 * rather than spread, so a field added to `SheetRowTask` later can't leak by default.
 */
export function publicRowTask(task: SheetRowTask | null): SheetRowTask | null {
  if (!task) return null;
  return {
    title: null,
    assignees: task.assignees.map((p) => {
      const name = shortPersonName(p.name);
      return { name, initials: nameInitials(name) };
    }),
    dueDate: task.dueDate,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

/**
 * The app's overdue rule (`getTaskAttention`): not done, and due before the start of today
 * (UTC). A task due today is not overdue yet.
 */
export function isTaskOverdue(task: Pick<SheetRowTask, "dueDate">, stage: RequestStage | null, now: Date = new Date()): boolean {
  if (!task.dueDate || stage === "DONE") return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
  return task.dueDate < today;
}

/** "just now", "5m", "3h", "2d", "3w", "4mo" — then "ago" is the caller's word. */
export function ageLabel(isoTime: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(isoTime).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** `2026-11-03` → `3 Nov`. */
export function shortDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* ───────────────────────────────────────────────── filters + summary ── */

export const UNASSIGNED = "__unassigned__";
export const NOT_ON_BOARD = "none";

/** The assignee names a row can be filtered by. A linked row with nobody on it is "Unassigned". */
export function rowAssigneeKeys(row: Pick<WikiSheetRow, "task" | "taskId">): string[] {
  if (!row.taskId) return [];
  const names = row.task?.assignees.map((a) => a.name) ?? [];
  return names.length ? names : [UNASSIGNED];
}

export function matchesAssignee(row: Pick<WikiSheetRow, "task" | "taskId">, filter: string): boolean {
  return filter === "all" || rowAssigneeKeys(row).includes(filter);
}

/** Everyone who appears on the sheet's linked tasks, for the filter — plus "Unassigned" if any. */
export function assigneeOptions(rows: readonly Pick<WikiSheetRow, "task" | "taskId">[]): string[] {
  const names = new Set<string>();
  let unassigned = false;
  for (const r of rows) {
    for (const k of rowAssigneeKeys(r)) {
      if (k === UNASSIGNED) unassigned = true;
      else names.add(k);
    }
  }
  return [...[...names].sort((a, b) => a.localeCompare(b)), ...(unassigned ? [UNASSIGNED] : [])];
}

/** Counts by stage, in board order, for the summary strip. Empty stages are left out. */
export function stageSummary(rows: readonly Pick<WikiSheetRow, "stage">[]): { stage: RequestStage | null; label: string; count: number }[] {
  const out: { stage: RequestStage | null; label: string; count: number }[] = [];
  const off = rows.filter((r) => !r.stage).length;
  if (off) out.push({ stage: null, label: "not on board", count: off });
  for (const s of STAGE_ORDER) {
    const n = rows.filter((r) => r.stage === s).length;
    if (n) out.push({ stage: s, label: STAGE_LABEL[s].toLowerCase(), count: n });
  }
  return out;
}
