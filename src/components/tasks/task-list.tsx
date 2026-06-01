"use client";

import { cn, formatDate } from "@/lib/format";
import type { TaskDTO } from "@/types/tasks";
import { TaskAvatar } from "@/components/tasks/task-avatar";
import { TaskPriorityDot, TaskStatusBadge } from "@/components/tasks/task-badges";

function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function TaskList({
  tasks,
  showClient = true,
  onRowClick,
}: {
  tasks: TaskDTO[];
  showClient?: boolean;
  onRowClick: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white py-16 text-center">
        <p className="widget-data-label">No tasks</p>
      </div>
    );
  }

  return (
    <div className="app-table-shell">
      <table className="app-table min-w-full">
        <thead>
          <tr>
            <th>Task</th>
            {showClient ? <th>Client</th> : null}
            <th>Assignee</th>
            <th>Status</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              onClick={() => onRowClick(task.id)}
              className="cursor-pointer"
            >
              <td>
                <div className="flex items-center gap-2">
                  <TaskPriorityDot priority={task.priority} />
                  <span className="font-medium text-[var(--text-1)]">{task.title}</span>
                </div>
              </td>
              {showClient ? (
                <td className="text-[var(--text-3)]">{task.client.name}</td>
              ) : null}
              <td>
                <div className="flex items-center gap-2">
                  <TaskAvatar user={task.assignee} size={20} />
                  <span className="text-[var(--text-3)]">{task.assignee?.name ?? "—"}</span>
                </div>
              </td>
              <td>
                <TaskStatusBadge status={task.status} />
              </td>
              <td>
                <span
                  className={cn(isOverdue(task) ? "font-medium text-red-600" : "text-[var(--text-4)]")}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {task.dueDate ? formatDate(task.dueDate) : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
