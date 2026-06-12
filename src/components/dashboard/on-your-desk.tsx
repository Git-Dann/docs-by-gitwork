"use client";

/**
 * "On your desk" — personal task strip rendered at the top of HQ for any
 * non-developer (devs have an equivalent inside DevOverview's My Day card).
 *
 * Shows the current user's open tasks (assignees includes me OR legacy
 * assigneeId === me), sorted by due date asc → priority desc → recently
 * updated. Each row deep-links to the per-client tasks page with the task
 * drawer pre-opened (`?task=…`) so clicks land on the task detail directly.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";

const VISIBLE_LIMIT = 6;

const PRIORITY_WEIGHT: Record<TaskDTO["priority"], number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function isOverdue(t: TaskDTO): boolean {
  if (!t.dueDate) return false;
  return new Date(t.dueDate).getTime() < Date.now() && t.status !== "DONE";
}

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays < 0) return `${-diffDays}d overdue`;
  if (diffDays < 7) return `${diffDays}d`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
}

export function OnYourDesk() {
  const { data: tasks = [], isLoading } = useTasks({ assigneeId: "me" });

  const sorted = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "DONE");
    open.sort((a, b) => {
      // Overdue + due-today rise to the top.
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const ap = PRIORITY_WEIGHT[a.priority];
      const bp = PRIORITY_WEIGHT[b.priority];
      if (ap !== bp) return ap - bp;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return open;
  }, [tasks]);

  const visible = sorted.slice(0, VISIBLE_LIMIT);
  const overflow = Math.max(0, sorted.length - VISIBLE_LIMIT);

  if (isLoading) {
    return (
      <section className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
        <Header count={null} />
        <div className="h-24 animate-pulse bg-[var(--surface-1)]" />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      <Header count={sorted.length} />
      {sorted.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-[var(--text-4)]">
          Nothing assigned to you right now.
        </div>
      ) : (
        <ul className="divide-y divide-[rgba(0,0,0,0.06)]">
          {visible.map((t) => {
            const due = formatDue(t.dueDate);
            const overdue = isOverdue(t);
            return (
              <li key={t.id}>
                <Link
                  href={`/app/portal/${t.client.slug}/tasks?task=${encodeURIComponent(t.id)}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <span className="min-w-0 truncate text-sm text-[var(--text-1)]">
                    {t.title}
                  </span>
                  <span
                    className="shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
                    title={t.client.name}
                  >
                    {t.client.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                    {TASK_STATUS_LABELS[t.status]}
                  </span>
                  <span
                    className={
                      "shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] " +
                      (overdue ? "text-rose-600" : "text-[var(--text-4)]")
                    }
                  >
                    {due ?? "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {overflow > 0 ? (
        <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-2 text-center">
          <Link
            href="/app/portal"
            className="text-[11px] font-medium text-[var(--brand-700)] hover:underline"
          >
            +{overflow} more open task{overflow === 1 ? "" : "s"} — view in Portal
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function Header({ count }: { count: number | null }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
      <span
        className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        00 // ON YOUR DESK{count !== null ? ` · ${count}` : ""}
      </span>
      <Link
        href="/app/portal"
        className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]"
      >
        Open Portal
      </Link>
    </div>
  );
}
