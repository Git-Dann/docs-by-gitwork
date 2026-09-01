"use client";

import { useState } from "react";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  CheckIcon,
} from "@heroicons/react/16/solid";
import { cn, formatDate } from "@/lib/format";
import { TASK_LABELS, TASK_LABEL_LABELS } from "@/types/tasks";
import type { TaskDTO, TaskPriority, TaskLabel } from "@/types/tasks";

export type TaskFilters = {
  q: string;
  categoryIds: string[]; // feature-block ids; "none" = tasks with no category
  assigneeIds: string[];
  priorities: TaskPriority[];
  labels: TaskLabel[];
  sourceMeetingIds: string[];
};

export const EMPTY_FILTERS: TaskFilters = { q: "", categoryIds: [], assigneeIds: [], priorities: [], labels: [], sourceMeetingIds: [] };

const PRIORITY_OPTS: { id: TaskPriority; label: string }[] = [
  { id: "HIGH", label: "High" },
  { id: "MEDIUM", label: "Medium" },
  { id: "LOW", label: "Low" },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function Dropdown({
  label,
  count,
  children,
  footer,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  footer?: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-xs font-medium transition",
          count > 0
            ? "border-[var(--brand-400)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
            : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        )}
      >
        {label}
        {count > 0 ? ` · ${count}` : ""}
        <ChevronDownIcon className="h-3 w-3 text-[var(--text-4)]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-64 min-w-[200px] overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-white p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
            {children}
            {footer?.(() => setOpen(false))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-1)]"
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
          on ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white" : "border-[var(--border-3)] bg-white",
        )}
      >
        {on ? <CheckIcon className="h-3 w-3" /> : null}
      </span>
      <span className="truncate text-[var(--text-2)]">{label}</span>
    </button>
  );
}

export function TaskFilterBar({
  tasks,
  categories,
  sourceMeetings = [],
  value,
  onChange,
  onManageCategories,
}: {
  tasks: TaskDTO[];
  categories: { id: string; name: string }[];
  sourceMeetings?: { id: string; title: string; startedAt?: string | null; createdAt?: string | null }[];
  value: TaskFilters;
  onChange: (f: TaskFilters) => void;
  onManageCategories?: () => void;
}) {
  // Assignee options derived from the tasks actually present.
  const assigneeMap = new Map<string, string>();
  for (const t of tasks) for (const a of t.assignees) assigneeMap.set(a.id, a.name);
  const assigneeOpts = [...assigneeMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sourcedMeetingIds = new Set(tasks.map((task) => task.scribeSource?.meetingId).filter((id): id is string => Boolean(id)));
  const meetingMap = new Map<string, { id: string; title: string; startedAt?: string | null; createdAt?: string | null }>();
  for (const meeting of sourceMeetings) {
    if (sourcedMeetingIds.has(meeting.id)) meetingMap.set(meeting.id, meeting);
  }
  for (const task of tasks) {
    if (!task.scribeSource) continue;
    if (!meetingMap.has(task.scribeSource.meetingId)) {
      meetingMap.set(task.scribeSource.meetingId, {
        id: task.scribeSource.meetingId,
        title: task.scribeSource.meetingTitle,
        startedAt: task.scribeSource.meetingStartedAt,
      });
    }
  }
  const meetingOpts = [...meetingMap.values()].sort((a, b) => {
    const aDate = a.startedAt ?? a.createdAt ?? "";
    const bDate = b.startedAt ?? b.createdAt ?? "";
    return bDate.localeCompare(aDate) || a.title.localeCompare(b.title);
  });

  const active =
    value.categoryIds.length +
    value.assigneeIds.length +
    value.priorities.length +
    value.labels.length +
    value.sourceMeetingIds.length +
    (value.q.trim() ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
        <input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Search title or #ref…"
          className="h-[34px] w-56 rounded-[7px] border border-[var(--border-2)] bg-white pl-8 pr-3 text-xs text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--brand-400)] focus:outline-none"
        />
      </div>

      <Dropdown
        label="Category"
        count={value.categoryIds.length}
        footer={
          onManageCategories
            ? (close) => (
                <div className="mt-1 border-t border-[var(--border-2)] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onManageCategories();
                    }}
                    className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-xs font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-brand)]"
                  >
                    Manage categories
                  </button>
                </div>
              )
            : undefined
        }
      >
        <CheckRow
          on={value.categoryIds.includes("none")}
          label="No category"
          onClick={() => onChange({ ...value, categoryIds: toggle(value.categoryIds, "none") })}
        />
        {categories.map((c) => (
          <CheckRow
            key={c.id}
            on={value.categoryIds.includes(c.id)}
            label={c.name}
            onClick={() => onChange({ ...value, categoryIds: toggle(value.categoryIds, c.id) })}
          />
        ))}
        {categories.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-[var(--text-4)]">No categories yet.</p>
        ) : null}
      </Dropdown>

      <Dropdown label="Assignee" count={value.assigneeIds.length}>
        {assigneeOpts.map((a) => (
          <CheckRow
            key={a.id}
            on={value.assigneeIds.includes(a.id)}
            label={a.name}
            onClick={() => onChange({ ...value, assigneeIds: toggle(value.assigneeIds, a.id) })}
          />
        ))}
        {assigneeOpts.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-[var(--text-4)]">No assignees yet.</p>
        ) : null}
      </Dropdown>

      <Dropdown label="Priority" count={value.priorities.length}>
        {PRIORITY_OPTS.map((p) => (
          <CheckRow
            key={p.id}
            on={value.priorities.includes(p.id)}
            label={p.label}
            onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p.id) })}
          />
        ))}
      </Dropdown>

      <Dropdown label="Label" count={value.labels.length}>
        {TASK_LABELS.map((l) => (
          <CheckRow
            key={l}
            on={value.labels.includes(l)}
            label={TASK_LABEL_LABELS[l]}
            onClick={() => onChange({ ...value, labels: toggle(value.labels, l) })}
          />
        ))}
      </Dropdown>

      {meetingOpts.length > 0 ? (
        <Dropdown label="Scribe source" count={value.sourceMeetingIds.length}>
          {meetingOpts.map((meeting) => (
            <CheckRow
              key={meeting.id}
              on={value.sourceMeetingIds.includes(meeting.id)}
              label={`${meeting.title}${meeting.startedAt ?? meeting.createdAt ? ` · ${formatDate(meeting.startedAt ?? meeting.createdAt ?? "")}` : ""}`}
              onClick={() => onChange({ ...value, sourceMeetingIds: toggle(value.sourceMeetingIds, meeting.id) })}
            />
          ))}
        </Dropdown>
      ) : null}

      {active > 0 ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          Clear
        </button>
      ) : null}
    </div>
  );
}
