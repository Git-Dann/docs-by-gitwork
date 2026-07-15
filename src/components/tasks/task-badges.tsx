import { cn } from "@/lib/format";
import type { TaskStatus, TaskPriority, TaskLabel } from "@/types/tasks";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_LABEL_LABELS } from "@/types/tasks";

// Status badge — modelled on the app-wide StatusBadge (rounded border + dot + label).
const STATUS_TONE: Record<TaskStatus, { wrapper: string; dot: string }> = {
  BACKLOG: { wrapper: "border-[var(--border-2)] bg-white text-[var(--text-3)]", dot: "bg-[var(--text-4)]" },
  TODO: { wrapper: "border-sky-200 bg-white text-sky-700", dot: "bg-sky-500" },
  DOING: { wrapper: "border-amber-200 bg-white text-amber-800", dot: "bg-amber-500" },
  IN_REVIEW: { wrapper: "border-blue-200 bg-white text-blue-700", dot: "bg-blue-500" },
  UI_DONE: { wrapper: "border-teal-200 bg-white text-teal-700", dot: "bg-teal-500" },
  DONE: { wrapper: "border-emerald-200 bg-white text-emerald-800", dot: "bg-emerald-500" },
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone.wrapper,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

// Priority — a small dot (HIGH red, MEDIUM amber, LOW grey) with an accessible title.
const PRIORITY_DOT: Record<TaskPriority, string> = {
  LOW: "bg-[var(--text-4)]",
  MEDIUM: "bg-amber-400",
  HIGH: "bg-red-500",
};

export function TaskPriorityDot({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${TASK_PRIORITY_LABELS[priority]} priority`}
      title={`${TASK_PRIORITY_LABELS[priority]} priority`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[priority], className)}
    />
  );
}

export function TaskPriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-3)]",
        className,
      )}
    >
      <TaskPriorityDot priority={priority} />
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}

// Ticket-type label — a quiet tinted chip, one tone per label so a board/list scan
// tells Backend/Frontend/UI-UX/Research/Design apart at a glance.
const LABEL_TONE: Record<TaskLabel, string> = {
  BACKEND: "border-violet-200 bg-violet-50 text-violet-700",
  FRONTEND: "border-sky-200 bg-sky-50 text-sky-700",
  UI_UX: "border-pink-200 bg-pink-50 text-pink-700",
  RESEARCH: "border-amber-200 bg-amber-50 text-amber-700",
  DESIGN: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function TaskLabelBadge({ label, className }: { label: TaskLabel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center truncate rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium",
        LABEL_TONE[label],
        className,
      )}
    >
      {TASK_LABEL_LABELS[label]}
    </span>
  );
}

// Blocked flag — a loud red chip so a blocked task stands out on the board/list at a glance.
// `awaitingReply` dims it slightly once the client has responded (dev's turn to act).
export function TaskBlockedBadge({
  clientReplied = false,
  className,
}: {
  clientReplied?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 truncate rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold",
        clientReplied
          ? "border-teal-300 bg-teal-50 text-teal-700"
          : "border-red-300 bg-red-50 text-red-700",
        className,
      )}
    >
      {clientReplied ? "CLIENT REPLIED" : "BLOCKED"}
    </span>
  );
}
