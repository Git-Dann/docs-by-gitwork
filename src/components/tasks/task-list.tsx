"use client";

import { useRef, useEffect } from "react";
import { cn, formatDate } from "@/lib/format";
import type { TaskDTO } from "@/types/tasks";
import { AssigneeStack } from "@/components/tasks/task-avatar";
import { TaskPriorityDot, TaskStatusBadge } from "@/components/tasks/task-badges";

function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

/** Tri-state header checkbox (checked / unchecked / indeterminate). */
function SelectAllBox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select all tasks"
      className="h-4 w-4 cursor-pointer accent-[var(--brand-700)]"
    />
  );
}

export function TaskList({
  tasks,
  showClient = true,
  onRowClick,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: {
  tasks: TaskDTO[];
  showClient?: boolean;
  onRowClick: (taskId: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white py-16 text-center">
        <p className="widget-data-label">No tasks</p>
      </div>
    );
  }

  const sel = selectedIds ?? new Set<string>();
  const allChecked = selectable && tasks.length > 0 && tasks.every((t) => sel.has(t.id));
  const someChecked = selectable && tasks.some((t) => sel.has(t.id));

  return (
    <div className="app-table-shell">
      <table className="app-table min-w-full">
        <thead>
          <tr>
            {selectable ? (
              <th className="w-9">
                <SelectAllBox
                  checked={allChecked}
                  indeterminate={someChecked && !allChecked}
                  onChange={(c) => onToggleAll?.(c)}
                />
              </th>
            ) : null}
            <th>Task</th>
            {showClient ? <th>Client</th> : null}
            <th>Block</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const checked = sel.has(task.id);
            return (
              <tr
                key={task.id}
                onClick={() => onRowClick(task.id)}
                className={cn("cursor-pointer", checked && "bg-[var(--surface-brand)]")}
              >
                {selectable ? (
                  <td className="w-9" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelect?.(task.id)}
                      aria-label={`Select ${task.title}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-700)]"
                    />
                  </td>
                ) : null}
                <td>
                  <div className="flex items-center gap-2">
                    <TaskPriorityDot priority={task.priority} />
                    <span className="font-medium text-[var(--text-1)]">{task.title}</span>
                  </div>
                </td>
                {showClient ? <td className="text-[var(--text-3)]">{task.client.name}</td> : null}
                <td className="text-[var(--text-3)]">{task.featureBlock?.name ?? "—"}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <AssigneeStack users={task.assignees} size={20} />
                    <span className="truncate text-[var(--text-3)]">
                      {task.assignees.length === 0 ? "—" : task.assignees.map((a) => a.name).join(", ")}
                    </span>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
