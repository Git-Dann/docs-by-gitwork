"use client";

import { useState, useRef, useEffect } from "react";
import { cn, formatDate, taskRef } from "@/lib/format";
import type { TaskDTO, TaskStatus } from "@/types/tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/tasks";
import { AssigneeStack } from "@/components/tasks/task-avatar";
import { ChevronDownIcon, ChevronRightIcon, CheckIcon } from "@heroicons/react/16/solid";

function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

const STATUS_STYLE: Record<TaskStatus, { border: string; dot: string; text: string; bg: string }> = {
  BACKLOG:   { border: "border-l-zinc-300",    dot: "bg-zinc-400",    text: "text-zinc-500",    bg: "bg-zinc-50"   },
  TODO:      { border: "border-l-sky-400",     dot: "bg-sky-500",     text: "text-sky-700",     bg: "bg-sky-50"    },
  DOING:     { border: "border-l-amber-400",   dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50"  },
  IN_REVIEW: { border: "border-l-blue-500",    dot: "bg-blue-500",    text: "text-blue-700",    bg: "bg-blue-50"   },
  DONE:      { border: "border-l-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50"},
};

const VISIBLE_CAP = 8;
const GRID = "1.5rem minmax(0,1fr) 9rem 2.25rem 5rem";
const GRID_SEL = "1.5rem 1.5rem minmax(0,1fr) 9rem 2.25rem 5rem";

/** Quick "complete" circle — click to toggle the task to/from DONE. */
function CompleteToggle({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded-full border transition",
        done
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-[rgba(0,0,0,0.25)] text-transparent hover:border-emerald-500 hover:text-emerald-500",
      )}
    >
      <CheckIcon className="h-3 w-3" />
    </button>
  );
}

function SelectAllBox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()} aria-label="Select all"
      className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]" />
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
  onToggleDone,
}: {
  tasks: TaskDTO[];
  showClient?: boolean;
  onRowClick: (taskId: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  onToggleDone?: (task: TaskDTO) => void;
}) {
  // DONE starts collapsed to keep the page compact.
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set(["DONE"]));
  const toggleCollapse = (s: TaskStatus) =>
    setCollapsed((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; });
  // Each group caps at VISIBLE_CAP rows until "show all" is toggled for it.
  const [showAll, setShowAll] = useState<Set<TaskStatus>>(new Set());
  const toggleShowAll = (s: TaskStatus) =>
    setShowAll((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; });

  const grouped = TASK_STATUSES.reduce<Record<TaskStatus, TaskDTO[]>>(
    (acc, s) => { acc[s] = tasks.filter((t) => t.status === s); return acc; },
    {} as Record<TaskStatus, TaskDTO[]>,
  );

  const sel = selectedIds ?? new Set<string>();
  const allChecked = selectable && tasks.length > 0 && tasks.every((t) => sel.has(t.id));
  const someChecked = selectable && tasks.some((t) => sel.has(t.id));
  const selectionActive = sel.size > 0;
  const gridCols = selectable ? GRID_SEL : GRID;

  if (tasks.length === 0) {
    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white py-16 text-center">
        <p className="widget-data-label">No tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {selectable ? (
        <div className="flex items-center gap-2 px-1">
          <SelectAllBox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={(c) => onToggleAll?.(c)} />
          <span className="text-[11px] font-medium text-[var(--text-4)]">Select all</span>
        </div>
      ) : null}

      {/* One self-contained card per status group. */}
      {TASK_STATUSES.map((status) => {
        const group = grouped[status];
        const isOpen = !collapsed.has(status);
        const style = STATUS_STYLE[status];
        const visible = showAll.has(status) ? group : group.slice(0, VISIBLE_CAP);

        return (
          <section key={status} className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
            <button
              type="button"
              onClick={() => toggleCollapse(status)}
              className={cn(
                "flex w-full items-center gap-2 border-l-[3px] px-3 py-2 text-left transition hover:brightness-95",
                style.border, style.bg,
              )}
            >
              {isOpen ? (
                <ChevronDownIcon className={cn("h-3.5 w-3.5 shrink-0", style.text)} />
              ) : (
                <ChevronRightIcon className={cn("h-3.5 w-3.5 shrink-0", style.text)} />
              )}
              <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
              <span className={cn("text-[11px] font-bold uppercase tracking-[0.8px]", style.text)}>
                {TASK_STATUS_LABELS[status]}
              </span>
              <span className={cn("ml-0.5 text-[10px] font-semibold opacity-70", style.text)}>{group.length}</span>
            </button>

            {isOpen && group.length > 0 && (
              <div className="border-t border-[rgba(0,0,0,0.06)]">
                {visible.map((task) => {
                  const checked = sel.has(task.id);
                  const overdue = isOverdue(task);
                  return (
                    <div
                      key={task.id}
                      onClick={() => onRowClick(task.id)}
                      className={cn(
                        "group grid cursor-pointer items-center border-b border-[rgba(0,0,0,0.04)] px-3 py-[7px] transition last:border-b-0 hover:bg-[var(--surface-1)]",
                        checked && "bg-[var(--surface-brand)]",
                      )}
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      {selectable && (
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleSelect?.(task.id)}
                            aria-label={`Select ${task.title}`}
                            className={cn(
                              "h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)] transition",
                              checked || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            )}
                          />
                        </div>
                      )}

                      {/* quick complete */}
                      <div className="flex items-center">
                        <CompleteToggle done={task.status === "DONE"} onToggle={() => onToggleDone?.(task)} />
                      </div>

                      {/* ref id + title */}
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-1)]">
                          <span
                            className="shrink-0 text-[10px] text-[var(--text-4)]"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {taskRef(task.id)}
                          </span>
                          <span className={cn("min-w-0 truncate", task.status === "DONE" && "text-[var(--text-4)] line-through")}>
                            {task.title}
                          </span>
                        </span>
                        {(showClient || (task.subtaskCount ?? 0) > 0) && (
                          <div className="mt-0.5 flex items-center gap-2">
                            {showClient && (
                              <span className="truncate text-[11px] text-[var(--text-4)]">{task.client.name}</span>
                            )}
                            {(task.subtaskCount ?? 0) > 0 && (
                              <span className="text-[10px] text-[var(--text-4)]">↳ {task.subtaskCount}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* category */}
                      <div className="flex items-center">
                        {task.featureBlock ? (
                          <span className="inline-block max-w-[8rem] truncate rounded-[4px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]">
                            {task.featureBlock.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-4)]">—</span>
                        )}
                      </div>

                      {/* assignees */}
                      <div className="flex items-center justify-center">
                        {task.assignees.length > 0 ? (
                          <AssigneeStack users={task.assignees} size={22} />
                        ) : (
                          <span className="text-[11px] text-[var(--text-4)]">—</span>
                        )}
                      </div>

                      {/* due */}
                      <div className="flex items-center justify-end">
                        {task.dueDate ? (
                          <span
                            className={cn("text-[11px] tabular-nums", overdue ? "font-semibold text-red-600" : "text-[var(--text-4)]")}
                          >
                            {formatDate(task.dueDate)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-4)]">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {group.length > VISIBLE_CAP && (
                  <button
                    type="button"
                    onClick={() => toggleShowAll(status)}
                    className="w-full px-3 py-2 text-left text-[11px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)]"
                  >
                    {showAll.has(status) ? "Show less" : `Show all ${group.length}`}
                  </button>
                )}
              </div>
            )}

            {isOpen && group.length === 0 && (
              <p className="border-t border-[rgba(0,0,0,0.06)] px-3 py-2.5 text-[12px] text-[var(--text-4)]">No tasks</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
