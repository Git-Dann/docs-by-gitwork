"use client";

import { useState } from "react";
import {
  UserPlusIcon,
  FlagIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ArchiveBoxArrowDownIcon,
  ArchiveBoxXMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useBatchUpdateTasks, useBatchDeleteTasks } from "@/hooks/use-tasks";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { isAtLeast } from "@/types/auth";
import { TASK_STATUSES, type TaskStatus, type TaskPriority, type FeatureBlockDTO } from "@/types/tasks";
import { TaskStatusBadge, TaskPriorityDot } from "@/components/tasks/task-badges";

const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  DOING: "Doing",
  IN_REVIEW: "In Review",
  DONE: "Done",
};
const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

/** A button + dismissible dropdown panel (closes on outside click via a fixed backdrop). */
function Pop({
  label,
  icon,
  children,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
      >
        {icon}
        {label}
        <ChevronDownIcon className="h-3 w-3 text-[var(--text-4)]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 max-h-[60vh] min-w-[200px] overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
            {children(() => setOpen(false))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
    >
      {children}
    </button>
  );
}

export function TaskBatchBar({
  selectedIds,
  blocks,
  onClear,
  mode = "active",
  clientId,
}: {
  selectedIds: string[];
  blocks: FeatureBlockDTO[];
  onClear: () => void;
  /** "archived" flips the Archive action to Unarchive (used by the Archived tab). */
  mode?: "active" | "archived";
  /** When set, the assignee picker is scoped to this client's devs (+ admins). */
  clientId?: string;
}) {
  const batchUpdate = useBatchUpdateTasks();
  const batchDelete = useBatchDeleteTasks();
  const team = useBackstageTeam();
  const allMembers = team.data ?? [];
  // Scope assignees to the client's team — devs assigned to this client, plus admins/super-admins
  // (who can be assigned anywhere). Mirrors the task-form scoping. Falls back to all if no client.
  const members = clientId
    ? allMembers.filter(
        (m) => isAtLeast(m.role, "ADMIN") || m.assignedClientIds.includes(clientId),
      )
    : allMembers;

  const [assignSel, setAssignSel] = useState<Set<string>>(new Set());
  const [assignQuery, setAssignQuery] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const filteredMembers = assignQuery.trim()
    ? members.filter((m) => (m.name ?? "").toLowerCase().includes(assignQuery.trim().toLowerCase()))
    : members;
  const busy = batchUpdate.isPending || batchDelete.isPending;
  const n = selectedIds.length;

  async function apply(patch: Parameters<typeof batchUpdate.mutateAsync>[0]["patch"]) {
    await batchUpdate.mutateAsync({ ids: selectedIds, patch });
    onClear();
  }

  async function applyAssignees(close: () => void) {
    await batchUpdate.mutateAsync({ ids: selectedIds, patch: { assigneeIds: [...assignSel] } });
    setAssignSel(new Set());
    setAssignQuery("");
    close();
    onClear();
  }

  async function doDelete() {
    await batchDelete.mutateAsync(selectedIds);
    setConfirmDelete(false);
    onClear();
  }

  async function applyDueDate(close: () => void, value: string | null) {
    await apply({ dueDate: value });
    setDueDate("");
    close();
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[12px] border border-[var(--border-2)] bg-white px-3 py-2 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.30)]">
      <span className="whitespace-nowrap text-sm font-semibold text-[var(--brand-800)]">{n} selected</span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-xs font-medium text-[var(--brand-800)] hover:bg-[var(--surface-1)]"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
        Clear
      </button>

      <span className="mx-0.5 h-5 w-px bg-[var(--border-2)]" />

      <div className="flex items-center gap-1.5">
        <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)] md:inline">
          Bulk edit
        </span>

        {/* Assign */}
        <Pop label="Assign" icon={<UserPlusIcon className="h-3.5 w-3.5" />} disabled={busy}>
          {(close) => (
            <div>
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Replace assignees
              </p>
              {members.length > 6 ? (
                <div className="px-1.5 pb-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={assignQuery}
                    onChange={(e) => setAssignQuery(e.target.value)}
                    placeholder="Search people…"
                    aria-label="Search team members"
                    className="w-full rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-xs text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
                  />
                </div>
              ) : null}
              <div className="max-h-60 overflow-y-auto">
                {members.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--text-4)]">No team members.</p>
                ) : filteredMembers.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--text-4)]">No matches.</p>
                ) : (
                  filteredMembers.map((m) => {
                    const on = assignSel.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setAssignSel((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                        className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-1)]"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                            on
                              ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white"
                              : "border-[var(--border-3)] bg-white",
                          )}
                        >
                          {on ? <CheckIcon className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate text-[var(--text-2)]">{m.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border-2)] px-2 pt-1.5">
                <span className="text-[11px] text-[var(--text-4)]">
                  {assignSel.size === 0 ? "Clears assignees" : `${assignSel.size} selected`}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => applyAssignees(close)}
                  className="rounded-[6px] bg-[var(--brand-700)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--brand-800)] disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </Pop>

        {/* Status */}
        <Pop label="Status" icon={<CheckIcon className="h-3.5 w-3.5" />} disabled={busy}>
          {(close) =>
            TASK_STATUSES.map((s) => (
              <MenuButton
                key={s}
                onClick={() => {
                  void apply({ status: s });
                  close();
                }}
              >
                <TaskStatusBadge status={s} />
                <span className="ml-auto text-[var(--text-4)]">{STATUS_LABEL[s]}</span>
              </MenuButton>
            ))
          }
        </Pop>

        {/* Priority */}
        <Pop label="Priority" icon={<FlagIcon className="h-3.5 w-3.5" />} disabled={busy}>
          {(close) =>
            PRIORITIES.map((p) => (
              <MenuButton
                key={p}
                onClick={() => {
                  void apply({ priority: p });
                  close();
                }}
              >
                <TaskPriorityDot priority={p} />
                {PRIORITY_LABEL[p]}
              </MenuButton>
            ))
          }
        </Pop>

        {/* Move to block */}
        <Pop label="Block" icon={<Squares2X2Icon className="h-3.5 w-3.5" />} disabled={busy}>
          {(close) => (
            <div className="max-h-60 overflow-y-auto">
              <MenuButton
                onClick={() => {
                  void apply({ featureBlockId: null });
                  close();
                }}
              >
                <span className="text-[var(--text-4)]">No block</span>
              </MenuButton>
              {blocks.map((b) => (
                <MenuButton
                  key={b.id}
                  onClick={() => {
                    void apply({ featureBlockId: b.id });
                    close();
                  }}
                >
                  <span className="truncate">{b.name}</span>
                </MenuButton>
              ))}
            </div>
          )}
        </Pop>

        {/* Due date */}
        <Pop label="Due date" icon={<CalendarDaysIcon className="h-3.5 w-3.5" />} disabled={busy}>
          {(close) => (
            <div className="w-56 space-y-2 p-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Set due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1.5 text-xs text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applyDueDate(close, null)}
                  className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  Clear date
                </button>
                <button
                  type="button"
                  disabled={busy || !dueDate}
                  onClick={() => void applyDueDate(close, dueDate)}
                  className="rounded-[6px] bg-[var(--brand-700)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--brand-800)] disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </Pop>

        {/* Archive / Unarchive */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply({ archived: mode !== "archived" })}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
        >
          {mode === "archived" ? (
            <><ArchiveBoxXMarkIcon className="h-3.5 w-3.5" />Unarchive</>
          ) : (
            <><ArchiveBoxArrowDownIcon className="h-3.5 w-3.5" />Archive</>
          )}
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="inline-flex items-center gap-1.5 rounded-[7px] border border-red-300 bg-red-50 px-2 py-1">
            <span className="text-[11px] font-medium text-red-700">Delete {n}?</span>
            <button
              type="button"
              disabled={busy}
              onClick={doDelete}
              className="rounded-[5px] bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
