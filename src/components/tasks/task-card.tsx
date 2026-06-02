import { ChatBubbleLeftIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { cn, formatDate } from "@/lib/format";
import type { TaskDTO } from "@/types/tasks";
import { AssigneeStack } from "@/components/tasks/task-avatar";
import { TaskPriorityDot, TaskStatusBadge } from "@/components/tasks/task-badges";

/** Is the due date in the past and the task still open? */
function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function TaskCard({
  task,
  onClick,
  showClient = true,
  showStatus = false,
  className,
  dragging = false,
}: {
  task: TaskDTO;
  onClick?: () => void;
  showClient?: boolean;
  showStatus?: boolean;
  className?: string;
  dragging?: boolean;
}) {
  const overdue = isOverdue(task);
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
      <div className="flex items-start gap-2">
        <TaskPriorityDot priority={task.priority} className="mt-1.5" />
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--text-1)]">
          {task.title}
        </p>
        <AssigneeStack users={task.assignees} size={22} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {showStatus ? <TaskStatusBadge status={task.status} /> : null}
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
        {task.dueDate ? (
          <span
            className={cn(
              "text-[11px]",
              overdue ? "font-medium text-red-600" : "text-[var(--text-4)]",
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {formatDate(task.dueDate)}
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-2">
          {task.subtaskCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-4)]">
              <Squares2X2Icon className="h-3 w-3" />
              {task.subtaskCount}
            </span>
          ) : null}
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
