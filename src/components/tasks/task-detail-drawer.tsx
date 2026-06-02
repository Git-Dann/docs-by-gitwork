"use client";

import { useState } from "react";
import {
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  UserGroupIcon,
  FlagIcon,
  TagIcon,
  CalendarDaysIcon,
  UserIcon,
  ClockIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn, formatDate, taskRef } from "@/lib/format";
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useAddTaskComment,
  useCreateTask,
} from "@/hooks/use-tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/types/tasks";
import { TaskAvatar, AssigneeStack } from "@/components/tasks/task-avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-badges";
import { TaskFormModal } from "@/components/tasks/task-form";

const MONO = { fontFamily: "var(--font-mono)" } as const;

const STATUS_DOT: Record<TaskStatus, string> = {
  BACKLOG: "bg-zinc-400",
  TODO: "bg-sky-500",
  DOING: "bg-amber-500",
  IN_REVIEW: "bg-blue-500",
  DONE: "bg-emerald-500",
};

// Active status chip takes the status colour; inactive stays quiet.
const STATUS_ACTIVE: Record<TaskStatus, string> = {
  BACKLOG: "border-zinc-300 bg-zinc-100 text-zinc-700",
  TODO: "border-sky-300 bg-sky-50 text-sky-700",
  DOING: "border-amber-300 bg-amber-50 text-amber-700",
  IN_REVIEW: "border-blue-300 bg-blue-50 text-blue-700",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 px-3 py-2.5">
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]"
        style={MONO}
      >
        {icon}
        {label}
      </span>
      <div className="min-w-0 text-sm text-[var(--text-2)]">{children}</div>
    </div>
  );
}

export function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data: task, isPending } = useTask(taskId);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const addComment = useAddTaskComment();
  const createSub = useCreateTask();

  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyRef() {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(taskRef(task.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  async function addSubtask() {
    if (!subtaskTitle.trim() || !task) return;
    await createSub.mutateAsync({
      clientId: task.client.id,
      title: subtaskTitle.trim(),
      parentId: task.id,
      featureBlockId: task.featureBlock?.id ?? null,
    });
    setSubtaskTitle("");
  }

  async function toggleSubtask(subId: string, done: boolean) {
    await update.mutateAsync({ id: subId, input: { status: done ? "DONE" : "TODO" } });
  }

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
      <button type="button" className="app-dialog-backdrop absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-[560px] flex-col bg-[var(--surface-0)] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]">
        {isPending || !task ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="widget-data-label animate-pulse">Loading task…</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="app-eyebrow" style={MONO}>{task.client.name}</span>
                  <button
                    type="button"
                    onClick={copyRef}
                    title="Copy reference"
                    className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--border-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                    style={MONO}
                  >
                    {copied ? <CheckIcon className="h-3 w-3 text-emerald-600" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
                    {copied ? "Copied" : taskRef(task.id)}
                  </button>
                </div>
                <h3 className="mt-1.5 text-lg font-semibold leading-snug tracking-[-0.02em] text-[var(--text-1)]">
                  {task.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Status */}
              <div>
                <p className="app-eyebrow mb-2">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_STATUSES.map((s) => {
                    const on = task.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => changeStatus(s)}
                        disabled={update.isPending}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60",
                          on ? STATUS_ACTIVE[s] : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />
                        {TASK_STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Meta */}
              <div className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]">
                <MetaRow icon={<UserGroupIcon className="h-3.5 w-3.5" />} label="Who">
                  <div className="flex items-center gap-2">
                    <AssigneeStack users={task.assignees} size={20} />
                    <span className="truncate">
                      {task.assignees.length ? task.assignees.map((a) => a.name).join(", ") : "Unassigned"}
                    </span>
                  </div>
                </MetaRow>
                <MetaRow icon={<FlagIcon className="h-3.5 w-3.5" />} label="Priority">
                  <TaskPriorityBadge priority={task.priority} />
                </MetaRow>
                <MetaRow icon={<TagIcon className="h-3.5 w-3.5" />} label="Category">
                  {task.featureBlock?.name ?? <span className="text-[var(--text-4)]">—</span>}
                </MetaRow>
                <MetaRow icon={<CalendarDaysIcon className="h-3.5 w-3.5" />} label="Due">
                  <span style={MONO}>{task.dueDate ? formatDate(task.dueDate) : "—"}</span>
                </MetaRow>
                <MetaRow icon={<UserIcon className="h-3.5 w-3.5" />} label="Created by">
                  {task.createdBy?.name ?? <span className="text-[var(--text-4)]">—</span>}
                </MetaRow>
                <MetaRow icon={<ClockIcon className="h-3.5 w-3.5" />} label="Updated">
                  <span style={MONO}>{formatDate(task.updatedAt)}</span>
                </MetaRow>
              </div>

              {/* Description */}
              {task.description ? (
                <div>
                  <p className="app-eyebrow mb-2">Description</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{task.description}</p>
                </div>
              ) : null}

              {/* Acceptance criteria */}
              {task.acceptanceCriteria ? (
                <div>
                  <p className="app-eyebrow mb-2">Acceptance criteria</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{task.acceptanceCriteria}</p>
                </div>
              ) : null}

              {/* Subtasks */}
              <div>
                <p className="app-eyebrow mb-2">
                  Subtasks {task.subtasks.length > 0 ? `· ${task.subtaskDoneCount}/${task.subtasks.length}` : ""}
                </p>
                <div className="space-y-1.5">
                  {task.subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        checked={s.status === "DONE"}
                        disabled={update.isPending}
                        onChange={(e) => toggleSubtask(s.id, e.target.checked)}
                        className="accent-[var(--brand-700)]"
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          s.status === "DONE" ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]",
                        )}
                      >
                        {s.title}
                      </span>
                      <AssigneeStack users={s.assignees} size={18} />
                    </div>
                  ))}
                  {task.subtasks.length === 0 ? <p className="text-xs text-[var(--text-4)]">No subtasks.</p> : null}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="app-input flex-1"
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    placeholder="Add a subtask…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addSubtask();
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addSubtask} loading={createSub.isPending} disabled={!subtaskTitle.trim()}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="app-eyebrow mb-2">Notes {task.comments.length > 0 ? `· ${task.comments.length}` : ""}</p>
                <div className="space-y-2.5">
                  {task.comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <TaskAvatar user={c.author} size={24} />
                      <div className="min-w-0 flex-1 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-1)]">{c.author?.name ?? "Someone"}</span>
                          <span className="text-[10px] text-[var(--text-4)]" style={MONO}>{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text-2)]">{c.body}</p>
                      </div>
                    </div>
                  ))}
                  {task.comments.length === 0 ? <p className="text-xs text-[var(--text-4)]">No notes yet.</p> : null}
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
                  <Button type="button" variant="secondary" onClick={submitNote} loading={addComment.isPending} disabled={!note.trim()}>
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
              <Button type="button" variant="primary" leadingIcon={<PencilIcon className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          </>
        )}
      </div>

      {editing && task ? <TaskFormModal task={task} lockClient onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
