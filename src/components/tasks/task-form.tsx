"use client";

import { useMemo, useRef, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { useClientList } from "@/hooks/use-proposals";
import { useCreateTask, useUpdateTask, useFeatureBlocks } from "@/hooks/use-tasks";
import type { BackstageMember } from "@/types/backstage";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_LABELS,
  TASK_LABEL_LABELS,
  type TaskDTO,
  type TaskUserRef,
  type TaskStatus,
  type TaskPriority,
  type TaskLabel,
} from "@/types/tasks";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);
const EMPTY_MEMBERS: BackstageMember[] = [];

/** Local (not UTC) YYYY-MM-DD for today — the default date on a new task, so
 *  logging same-day work needs no extra clicks (per the team's request). */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isAdminOrSuperAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

function sortAssignees<T extends { name: string; email?: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const aName = a.name || a.email || "";
    const bName = b.name || b.email || "";
    return aName.localeCompare(bName);
  });
}

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
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task?.acceptanceCriteria ?? "");
  const [clientId, setClientId] = useState(task?.client.id ?? defaultClientId ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assignees.map((a) => a.id) ?? [],
  );
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? "BACKLOG");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [label, setLabel] = useState<TaskLabel | "">(task?.label ?? "");
  // New tasks default the date to today (saves a click when logging same-day
  // work); editing keeps the task's existing date (blank stays blank).
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? task.dueDate.slice(0, 10) : task ? "" : todayIso(),
  );
  const [featureBlockId, setFeatureBlockId] = useState(task?.featureBlock?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const blocksQuery = useFeatureBlocks(clientId || null);
  const blocks = blocksQuery.data ?? [];
  const members = teamQuery.data ?? EMPTY_MEMBERS;
  const clients = clientsQuery.data?.clients ?? [];
  const saving = create.isPending || update.isPending;
  const projectAssignees = useMemo(
    () =>
      sortAssignees(
        members.filter(
          (member) =>
            clientId !== "" &&
            !isAdminOrSuperAdmin(member.role) &&
            member.assignedClientIds.includes(clientId),
        ),
      ),
    [clientId, members],
  );
  const adminAssignees = useMemo(
    () => sortAssignees(members.filter((member) => isAdminOrSuperAdmin(member.role))),
    [members],
  );
  const visibleAssigneeIds = useMemo(
    () => new Set([...projectAssignees, ...adminAssignees].map((member) => member.id)),
    [adminAssignees, projectAssignees],
  );
  const hiddenSelectedAssignees = useMemo(
    () =>
      sortAssignees(
        (task?.assignees ?? []).filter(
          (assignee) => assigneeIds.includes(assignee.id) && !visibleAssigneeIds.has(assignee.id),
        ),
      ),
    [assigneeIds, task?.assignees, visibleAssigneeIds],
  );

  async function handleSave(options: { addAnother?: boolean } = {}) {
    setError(null);
    setSuccess(null);
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
            acceptanceCriteria: acceptanceCriteria.trim() || null,
            status,
            priority,
            label: label || null,
            assigneeIds,
            featureBlockId: featureBlockId || null,
            dueDate: dueDate || null,
          },
        });
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync({
          clientId,
          title: title.trim(),
          description: description.trim() || undefined,
          acceptanceCriteria: acceptanceCriteria.trim() || null,
          status,
          priority,
          label: label || null,
          assigneeIds,
          featureBlockId: featureBlockId || null,
          dueDate: dueDate || null,
        });
        onSaved?.(saved);
        if (options.addAnother) {
          setTitle("");
          setDescription("");
          setAcceptanceCriteria("");
          setDueDate(todayIso());
          setSuccess("Task created. Add the next one.");
          window.setTimeout(() => titleInputRef.current?.focus(), 0);
          return;
        }
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
      <div className="app-dialog-panel relative z-10 flex h-[min(760px,calc(100dvh-32px))] w-full max-w-4xl flex-col overflow-hidden">
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

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)] lg:overflow-hidden">
          {/* p-1.5 gives the fields' 4px focus ring room inside the scroll box —
              without it the ring clips against the overflow edge. */}
          <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:p-1.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Title</label>
              <input
                ref={titleInputRef}
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
              <MarkdownField
                value={description}
                onChange={setDescription}
                rows={6}
                placeholder="Add detail, links, context…"
                showMergeVars={false}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                Acceptance criteria <span className="text-[var(--text-4)]">(optional)</span>
              </label>
              <MarkdownField
                value={acceptanceCriteria}
                onChange={setAcceptanceCriteria}
                rows={5}
                placeholder="What does done look like?"
                showMergeVars={false}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-4 lg:overflow-hidden lg:p-1.5">
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

            <div className={blocks.length > 0 ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
              {blocks.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                    Category
                  </label>
                  <select
                    className="app-select w-full"
                    value={featureBlockId}
                    onChange={(e) => setFeatureBlockId(e.target.value)}
                  >
                    <option value="">No category</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                  Label <span className="text-[var(--text-4)]">(optional)</span>
                </label>
                <select
                  className="app-select w-full"
                  value={label}
                  onChange={(e) => setLabel(e.target.value as TaskLabel | "")}
                >
                  <option value="">No label</option>
                  {TASK_LABELS.map((l) => (
                    <option key={l} value={l}>
                      {TASK_LABEL_LABELS[l]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex min-h-[220px] flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] lg:flex-1">
              <div className="border-b border-[var(--border-2)] px-3 py-2.5">
                <label className="block text-xs font-semibold text-[var(--text-2)]">Assignees</label>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-4)]">
                  Project developers first, then workspace admins.
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                {members.length === 0 ? (
                  <span className="text-xs text-[var(--text-4)]">No team members yet.</span>
                ) : !clientId ? (
                  <span className="text-xs text-[var(--text-4)]">
                    Pick a client to see assigned project developers.
                  </span>
                ) : (
                  <>
                    <AssigneeGroup
                      title="Project developers"
                      empty="No developers assigned to this project yet."
                      members={projectAssignees}
                      assigneeIds={assigneeIds}
                      onToggle={toggleAssignee}
                    />
                    <AssigneeGroup
                      title="Admins & super admins"
                      empty="No admins available."
                      members={adminAssignees}
                      assigneeIds={assigneeIds}
                      onToggle={toggleAssignee}
                    />
                    {hiddenSelectedAssignees.length > 0 ? (
                      <SelectedOutsideProjectGroup
                        assignees={hiddenSelectedAssignees}
                        onToggle={toggleAssignee}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Due date</label>
                <input
                  type="date"
                  className="app-input w-full"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
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

            {error ? <p className="text-sm text-[var(--danger-500)]">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--border-2)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {!isEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSave({ addAnother: true })}
              loading={saving}
            >
              Create & add another
            </Button>
          ) : null}
          <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving}>
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssigneeGroup({
  title,
  empty,
  members,
  assigneeIds,
  onToggle,
}: {
  title: string;
  empty: string;
  members: BackstageMember[];
  assigneeIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
          {title}
        </p>
        {members.length > 0 ? (
          <span className="text-[11px] text-[var(--text-4)]">{members.length}</span>
        ) : null}
      </div>
      {members.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-xs text-[var(--text-4)]">
          {empty}
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => (
            <AssigneeButton
              key={member.id}
              id={member.id}
              name={member.name}
              avatarUrl={member.avatarUrl}
              selected={assigneeIds.includes(member.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SelectedOutsideProjectGroup({
  assignees,
  onToggle,
}: {
  assignees: TaskUserRef[];
  onToggle: (id: string) => void;
}) {
  return (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
        Already assigned
      </p>
      <div className="space-y-1.5">
        {assignees.map((assignee) => (
          <AssigneeButton
            key={assignee.id}
            id={assignee.id}
            name={assignee.name}
            avatarUrl={assignee.avatarUrl}
            selected
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function AssigneeButton({
  id,
  name,
  avatarUrl,
  selected,
  onToggle,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left transition",
        selected
          ? "border-[var(--brand-500)] bg-[var(--surface-brand)] shadow-[0_0_0_1px_var(--brand-200)]"
          : "border-[var(--border-2)] bg-white hover:border-[var(--brand-300)] hover:bg-[var(--surface-1)]",
      )}
      aria-pressed={selected}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--text-3)]">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text-1)]">{name}</span>
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
          selected
            ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
            : "border-[var(--border-2)] bg-white text-transparent",
        )}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}
