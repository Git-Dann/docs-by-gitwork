// Tasks — Portal task tracker + daily Slack standups.
//
// These shapes are the contract for the web app (and future iOS). All dates are
// ISO-8601 strings in UTC; clients localise for display.

export type TaskStatus = "BACKLOG" | "TODO" | "DOING" | "IN_REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

/** Board column order. */
export const TASK_STATUSES: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "DOING",
  "IN_REVIEW",
  "DONE",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  DOING: "Doing",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export type TaskUserRef = { id: string; name: string; avatarUrl: string | null };
export type TaskClientRef = { id: string; name: string; slug: string };

export type TaskDTO = {
  id: string;
  workspaceId: string;
  client: TaskClientRef;
  assignee: TaskUserRef | null;
  createdBy: TaskUserRef | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  orderKey: number;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskCommentDTO = {
  id: string;
  taskId: string;
  author: TaskUserRef | null;
  body: string;
  createdAt: string;
};

export type TaskDetailDTO = TaskDTO & { comments: TaskCommentDTO[] };

/** Per-dev/day standup record. `id` is null before the first push of the day. */
export type DailyUpdateDTO = {
  id: string | null;
  workDate: string; // ISO date (UTC midnight)
  amPushedAt: string | null;
  pmPushedAt: string | null;
  weekPlan: string | null;
  note: string | null;
};

/** The dev's "My Day" standup surface. */
export type MyDayDTO = {
  date: string; // workDate ISO
  isMonday: boolean;
  update: DailyUpdateDTO;
  /** Prefilled "This week" suggestion (tasks due this ISO week) — editable before pushing. */
  suggestedWeekPlan: string;
  /** Assignee's in-progress work (DOING + IN_REVIEW) — the Slack "Doing" section. */
  doing: TaskDTO[];
  /** Tasks the dev completed today — the Slack "Done" section. */
  done: TaskDTO[];
  /** Assignee's not-yet-started work (TODO + BACKLOG) — for picking today's focus. */
  upcoming: TaskDTO[];
};

/** One dev's row in the DevOps roll-up roster. */
export type RollupDevStatus = {
  user: TaskUserRef;
  amPushedAt: string | null;
  pmPushedAt: string | null;
  doingCount: number;
  doneCount: number;
};

export type RollupRosterDTO = {
  date: string;
  /** True when every active dev has pushed their PM update — gates Publish. */
  allPushed: boolean;
  devs: RollupDevStatus[];
};

/** Counts per status for the compact card on a client detail page. */
export type ClientTaskSummary = {
  clientId: string;
  counts: Record<TaskStatus, number>;
  total: number;
  /** Non-DONE total. */
  openTotal: number;
};

export type ClientAssignmentDTO = {
  clientId: string;
  clientName: string;
  clientSlug: string;
};
