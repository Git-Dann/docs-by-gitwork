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

export type TaskBlockRef = { id: string; name: string };

export type TaskDTO = {
  id: string;
  workspaceId: string;
  client: TaskClientRef;
  assignees: TaskUserRef[];
  createdBy: TaskUserRef | null;
  featureBlock: TaskBlockRef | null;
  parentId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  orderKey: number;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  commentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
  metadata: Record<string, unknown> | null;
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

export type TaskDetailDTO = TaskDTO & {
  comments: TaskCommentDTO[];
  subtasks: TaskDTO[];
};

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

// ─── Feature blocks ("lists") + Gantt timeline ───────────────────────────────

/** Named accent keys for Gantt bars (resolved to colours in the component). */
export const FEATURE_BLOCK_COLORS = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;
export type FeatureBlockColor = (typeof FEATURE_BLOCK_COLORS)[number];

export type FeatureBlockDTO = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  /** Null until dated. A block with both dates renders as a Gantt bar. */
  startDate: string | null;
  endDate: string | null;
  orderKey: number;
  color: string | null;
  /** Total tasks in the block. */
  taskCount: number;
  /** Tasks in DONE. */
  doneCount: number;
  /** 0–100, rounded. */
  progress: number;
};

export type MilestoneDTO = {
  id: string;
  clientId: string;
  name: string;
  date: string;
  description: string | null;
  color: string | null;
};

/** Gantt zoom levels. */
export type GanttScale = "month" | "quarter" | "half" | "year";

export const GANTT_SCALE_LABELS: Record<GanttScale, string> = {
  month: "Month",
  quarter: "Quarter",
  half: "6 months",
  year: "Year",
};

/** Per-client share status for the public timeline. */
export type TimelineShareDTO = {
  enabled: boolean;
  /** Null until first enabled. */
  token: string | null;
  /** Absolute public URL, or null when never shared. */
  url: string | null;
};

/** Read-only public timeline (client-facing): blocks + task names, no internals. */
export type PublicTimelineBlock = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  color: string | null;
  progress: number;
  tasks: { title: string; done: boolean }[];
};

export type PublicTimelineMilestone = {
  id: string;
  name: string;
  date: string;
  color: string | null;
};

export type PublicTimelineDTO = {
  clientName: string;
  generatedAt: string;
  blocks: PublicTimelineBlock[];
  milestones: PublicTimelineMilestone[];
};
