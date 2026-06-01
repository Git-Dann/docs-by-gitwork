"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { useClientList } from "@/hooks/use-proposals";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskDTO,
  type TaskStatus,
  type TaskPriority,
} from "@/types/tasks";

export function TaskFormModal({
  task,
  defaultClientId,
  defaultStatus,
  lockClient = false,
  onClose,
  onSaved,
}: {
  /** Present = edit mode. */
  task?: TaskDTO | null;
  defaultClientId?: string;
  defaultStatus?: TaskStatus;
  /** Hide/disable the client picker (creating from a client-scoped view). */
  lockClient?: boolean;
  onClose: () => void;
  onSaved?: (task: TaskDTO) => void;
}) {
  const isEdit = Boolean(task);
  const teamQuery = useBackstageTeam();
  const clientsQuery = useClientList();
  const create = useCreateTask();
  const update = useUpdateTask();

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [clientId, setClientId] = useState(task?.client.id ?? defaultClientId ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? "BACKLOG");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);

  const members = teamQuery.data ?? [];
  const clients = clientsQuery.data?.clients ?? [];
  const saving = create.isPending || update.isPending;

  async function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!isEdit && !clientId) {
      setError("Pick a client.");
      return;
    }
    try {
      if (isEdit && task) {
        const saved = await update.mutateAsync({
          id: task.id,
          input: {
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            assigneeId: assigneeId || null,
            dueDate: dueDate || null,
          },
        });
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync({
          clientId,
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        onSaved?.(saved);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="app-dialog-backdrop absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
          <div>
            <p className="widget-data-label">{isEdit ? "EDIT TASK" : "NEW TASK"}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {isEdit ? "Update task" : "Create a task"}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Title</label>
            <input
              autoFocus
              className="app-input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Description <span className="text-[var(--text-4)]">(optional)</span>
            </label>
            <textarea
              className="app-textarea w-full"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add detail, links, acceptance criteria…"
            />
          </div>

          {!lockClient ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Client</label>
              <select
                className="app-select w-full"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={isEdit}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {isEdit ? (
                <p className="mt-1 text-[11px] text-[var(--text-4)]">
                  Move a task to another client by recreating it.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Assignee</label>
              <select
                className="app-select w-full"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Due date</label>
              <input
                type="date"
                className="app-input w-full"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Status</label>
              <select
                className="app-select w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Priority</label>
              <select
                className="app-select w-full"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-[var(--danger-500)]">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-2)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </div>
      </div>
    </div>
  );
}
