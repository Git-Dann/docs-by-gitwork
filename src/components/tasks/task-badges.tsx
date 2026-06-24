import { cn } from "@/lib/format";
import type { TaskStatus, TaskPriority } from "@/types/tasks";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/types/tasks";

// Status badge — modelled on the app-wide StatusBadge (rounded border + dot + label).
const STATUS_TONE: Record<TaskStatus, { wrapper: string; dot: string }> = {
  BACKLOG: { wrapper: "border-zinc-200 bg-white text-zinc-600", dot: "bg-zinc-400" },
  TODO: { wrapper: "border-sky-200 bg-white text-sky-700", dot: "bg-sky-500" },
  DOING: { wrapper: "border-amber-200 bg-white text-amber-800", dot: "bg-amber-500" },
  IN_REVIEW: { wrapper: "border-blue-200 bg-white text-blue-700", dot: "bg-blue-500" },
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
  LOW: "bg-zinc-300",
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
