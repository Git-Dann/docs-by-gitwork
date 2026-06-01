"use client";

import { useState } from "react";
import { PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/format";
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useAddTaskComment,
} from "@/hooks/use-tasks";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "@/types/tasks";
import { TaskAvatar } from "@/components/tasks/task-avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-badges";
import { TaskFormModal } from "@/components/tasks/task-form";

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const { data: task, isPending } = useTask(taskId);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const addComment = useAddTaskComment();

  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function changeStatus(status: TaskStatus) {
    if (!task) return;
    await update.mutateAsync({ id: task.id, input: { status } });
  }

  async function submitNote() {
    if (!note.trim() || !task) return;
    await addComment.mutateAsync({ id: task.id, body: note.trim() });
    setNote("");
  }

  async function handleDelete() {
    if (!task) return;
    await del.mutateAsync(task.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        className="app-dialog-backdrop absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-[560px] flex-col bg-white shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]">
        {isPending || !task ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="widget-data-label animate-pulse">Loading task…</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
              <div className="min-w-0">
                <p
                  className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {task.client.name}
                </p>
                <h3 className="mt-1 text-lg font-semibold leading-snug tracking-[-0.02em] text-[var(--text-1)]">
                  {task.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Status quick-select */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--text-2)]">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeStatus(s)}
                      disabled={update.isPending}
                      className={cn(
                        "rounded-[6px] border px-2.5 py-1 text-xs font-medium transition",
                        task.status === s
                          ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                          : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      {TASK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-4 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
                <div>
                  <p className="widget-data-label mb-1">Assignee</p>
                  <div className="flex items-center gap-2">
                    <TaskAvatar user={task.assignee} size={22} />
                    <span className="text-sm text-[var(--text-2)]">
                      {task.assignee?.name ?? "Unassigned"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="widget-data-label mb-1">Priority</p>
                  <TaskPriorityBadge priority={task.priority} />
                </div>
                <div>
                  <p className="widget-data-label mb-1">Due</p>
                  <p className="text-sm text-[var(--text-2)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {task.dueDate ? formatDate(task.dueDate) : "—"}
                  </p>
                </div>
                <div>
                  <p className="widget-data-label mb-1">Created by</p>
                  <p className="text-sm text-[var(--text-2)]">{task.createdBy?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="widget-data-label mb-1">Block</p>
                  <p className="text-sm text-[var(--text-2)]">{task.featureBlock?.name ?? "—"}</p>
                </div>
              </div>

              {/* Description */}
              {task.description ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--text-2)]">Description</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">
                    {task.description}
                  </p>
                </div>
              ) : null}

              {/* Notes */}
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--text-2)]">
                  Notes {task.comments.length > 0 ? `(${task.comments.length})` : ""}
                </p>
                <div className="space-y-2.5">
                  {task.comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <TaskAvatar user={c.author} size={24} />
                      <div className="min-w-0 flex-1 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-1)]">
                            {c.author?.name ?? "Someone"}
                          </span>
                          <span
                            className="text-[10px] text-[var(--text-4)]"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {formatDate(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text-2)]">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))}
                  {task.comments.length === 0 ? (
                    <p className="text-xs text-[var(--text-4)]">No notes yet.</p>
                  ) : null}
                </div>

                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    className="app-textarea flex-1"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…"
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submitNote();
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={submitNote}
                    loading={addComment.isPending}
                    disabled={!note.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] px-6 py-4">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-4)] transition hover:text-[var(--danger-500)]"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-3)]">Delete this task?</span>
                  <Button type="button" variant="danger" onClick={handleDelete} loading={del.isPending}>
                    Yes
                  </Button>
                  <Button type="button" variant="tertiary" onClick={() => setConfirmDelete(false)}>
                    No
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="primary"
                leadingIcon={<PencilIcon className="h-4 w-4" />}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            </div>
          </>
        )}
      </div>

      {editing && task ? (
        <TaskFormModal task={task} lockClient onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}
