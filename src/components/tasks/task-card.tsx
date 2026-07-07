import { ChatBubbleLeftIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { FlagIcon, CalendarDaysIcon } from "@heroicons/react/16/solid";
import { cn, formatDate, taskRef } from "@/lib/format";
import type { TaskDTO } from "@/types/tasks";
import { AssigneeStack } from "@/components/tasks/task-avatar";
import { TaskPriorityDot, TaskStatusBadge } from "@/components/tasks/task-badges";

/** Is the due date in the past and the task still open? */
function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

const PRIORITY_FLAG: Record<string, { iconColor: string; label: string }> = {
  HIGH:   { iconColor: "text-red-500",   label: "High" },
  MEDIUM: { iconColor: "text-amber-400", label: "Medium" },
  LOW:    { iconColor: "text-[var(--text-4)]",  label: "Low" },
};

export function TaskCard({
  task,
  onClick,
  showClient = true,
  showStatus = false,
  className,
  dragging = false,
  onScribeSourceClick,
}: {
  task: TaskDTO;
  onClick?: () => void;
  showClient?: boolean;
  showStatus?: boolean;
  className?: string;
  dragging?: boolean;
  onScribeSourceClick?: (task: TaskDTO) => void;
}) {
  const overdue = isOverdue(task);
  const flag = PRIORITY_FLAG[task.priority] ?? PRIORITY_FLAG.LOW;
  const subtaskPct =
    task.subtaskCount > 0
      ? Math.round((task.subtaskDoneCount / task.subtaskCount) * 100)
      : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-3 text-left transition",
        onClick && "cursor-pointer hover:border-[var(--brand-300)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        dragging && "rotate-1 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <TaskPriorityDot priority={task.priority} className="mt-1.5" />
        <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-medium leading-snug text-[var(--text-1)]">
          {task.title}
        </p>
        {task.scribeSource && onScribeSourceClick ? (
          <button
            type="button"
            title="Scribe source"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onScribeSourceClick(task);
            }}
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)] transition hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
          >
            <VideoCameraIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <AssigneeStack users={task.assignees} size={22} />
      </div>

      {/* Subtask progress bar */}
      {task.subtaskCount > 0 ? (
        <div className="mt-2">
          <p className="mb-0.5 text-[10px] text-[var(--text-4)]">
            {task.subtaskDoneCount}/{task.subtaskCount} subtask{task.subtaskCount === 1 ? "" : "s"}
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${subtaskPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Footer meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {showStatus ? <TaskStatusBadge status={task.status} /> : null}

        <span className="text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {taskRef(task.id)}
        </span>

        {/* Priority flag — colored icon + muted label */}
        <span className="inline-flex items-center gap-0.5 text-[10px]">
          <FlagIcon className={cn("h-3 w-3", flag.iconColor)} />
          <span className="text-[var(--text-4)]">{flag.label}</span>
        </span>

        {showClient ? (
          <span className="inline-flex max-w-[140px] items-center truncate rounded-[4px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
            {task.client.name}
          </span>
        ) : null}

        {task.featureBlock ? (
          <span className="inline-flex max-w-[140px] items-center truncate rounded-[4px] bg-[var(--surface-brand)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-700)]">
            {task.featureBlock.name}
          </span>
        ) : null}

        {/* Date: range (startedAt – dueDate) or single due date, with calendar icon */}
        {task.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px]",
              overdue ? "font-medium text-red-600" : "text-[var(--text-4)]",
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <CalendarDaysIcon className="h-3 w-3 shrink-0" />
            {task.startedAt
              ? `${formatDate(task.startedAt)} – ${formatDate(task.dueDate)}`
              : formatDate(task.dueDate)}
          </span>
        ) : null}

        {/* Comment count pushed to the right */}
        <span className="ml-auto inline-flex items-center gap-2">
          {task.commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-4)]">
              <ChatBubbleLeftIcon className="h-3 w-3" />
              {task.commentCount}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
