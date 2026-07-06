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

export type TaskScribeSourceRef = {
  kind: "ACTION_ITEM" | "MANUAL";
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string | null;
  actionItemId: string | null;
  actionTitle: string | null;
  actionText: string | null;
};

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
  /** Set when soft-archived (hidden from active views). Null = active. */
  archivedAt: string | null;
  commentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
  metadata: Record<string, unknown> | null;
  scribeSource: TaskScribeSourceRef | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskCommentDTO = {
  id: string;
  taskId: string;
  author: TaskUserRef | null;
  body: string;
  /** User ids @mentioned in the note body (`@[Name](id)` tokens). */
  mentions: string[];
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
  /** Only set on a push response: how many client channels the update actually
   *  posted to. 0 means there was nothing to post (no matching tasks/channels),
   *  so the UI can say so honestly instead of a blanket "Pushed to Slack". */
  posted?: number;
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

// ─── Slack push (per-client "Push to Slack" composer + DevOps broadcast) ──────

/** How much of each task to render in a project-update Slack card. */
export type TaskCardDetail = "TITLES" | "TITLES_AND_DESCRIPTIONS";

/** Which status groups a project update may include. Mirrors the standup
 *  `partition()`: DOING = DOING|IN_REVIEW, DONE = status===DONE (point-in-time,
 *  no done-today filter), UPCOMING = TODO|BACKLOG. */
export const PROJECT_UPDATE_STATUS_GROUPS = ["DOING", "DONE", "UPCOMING"] as const;
export type ProjectUpdateStatusGroup = (typeof PROJECT_UPDATE_STATUS_GROUPS)[number];

export const PROJECT_UPDATE_GROUP_LABELS: Record<ProjectUpdateStatusGroup, string> = {
  DOING: "In progress",
  DONE: "Done",
  UPCOMING: "Up next",
};

/** Per-dev saved defaults for the Tasks-page composer. Persisted on
 *  WorkspaceMember.slackPushPrefs. Category filter is an EXCLUDE-list so a newly
 *  created block is included by default rather than silently dropped; the
 *  sentinel "none" excludes tasks with no feature block. */
export type SlackPushPrefs = {
  detail: TaskCardDetail;
  statusGroups: ProjectUpdateStatusGroup[];
  excludedCategoryIds: string[];
  defaultNote: string | null;
};

export const DEFAULT_PUSH_PREFS: SlackPushPrefs = {
  detail: "TITLES",
  statusGroups: ["DOING", "DONE"],
  excludedCategoryIds: [],
  defaultNote: null,
};

/** Sentinel category id for tasks with no feature block (used in excludedCategoryIds
 *  and the composer's include-list). */
export const NO_CATEGORY_ID = "none";

export type ProjectUpdateInput = {
  clientId: string;
  /** Include-list of feature-block ids (plus NO_CATEGORY_ID). Undefined = all. */
  categoryIds?: string[];
  statusGroups?: ProjectUpdateStatusGroup[];
  detail?: TaskCardDetail;
  note?: string;
  /** Also stamp the dev's daily standup (shared green AM/PM dot). */
  markPhases?: ("AM" | "PM")[];
  /** Cross-post to the roll-up channel. */
  toRollup?: boolean;
  /** Persist the current selection as this dev's defaults. */
  saveAsDefaults?: boolean;
};

export type ProjectUpdateResult = {
  ok: boolean;
  channel: string | null;
  taskCount: number;
};

export type BroadcastInput = {
  clientIds: string[];
  message: string;
  /** Optional per-client message overrides (clientId → message). */
  perClientMessages?: Record<string, string>;
  toRollup?: boolean;
};

export type BroadcastResult = {
  ok: boolean;
  postedCount: number;
  channels: string[];
};

/** A recent ad-hoc Slack push, for the broadcast card's history line. */
export type SlackUpdateLogDTO = {
  id: string;
  kind: "PROJECT_UPDATE" | "BROADCAST";
  clientId: string | null;
  taskCount: number | null;
  createdAt: string;
};

/** Counts per status for the compact card on a client detail page. */
export type ClientTaskSummary = {
  clientId: string;
  counts: Record<TaskStatus, number>;
  total: number;
  /** Non-DONE total. */
  openTotal: number;
};

/** Dashboard "needs attention" aggregate, scoped to the caller's clients. */
export type TaskAttentionDTO = {
  /** Overdue, soonest-first, capped (full count in overdueCount). */
  overdue: TaskDTO[];
  overdueCount: number;
  /** Currently in progress (DOING / IN_REVIEW), soonest-due-first, capped. */
  doing: TaskDTO[];
  dueSoonCount: number;
  doingCount: number;
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
export type GanttScale = "fit" | "month" | "quarter" | "half" | "year";

export const GANTT_SCALE_LABELS: Record<GanttScale, string> = {
  fit: "Fit",
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
