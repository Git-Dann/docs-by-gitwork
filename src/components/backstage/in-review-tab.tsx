"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTasks } from "@/hooks/use-tasks";
import { BackstagePanel } from "@/components/backstage/panel";
import { cn } from "@/lib/format";
import type { TaskPriority } from "@/types/tasks";

// Agency-wide "tasks in review" queue — every task sitting in the IN_REVIEW column on any
// client board, surfaced in one place so leads can see what's waiting on a review. Read-only;
// each row deep-links to that client's task board. Pagination mirrors the other list cards:
// a fixed initial cap with a "Show all N" expander.

const PAGE = 8;

const PRIORITY_DOT: Record<TaskPriority, string> = {
  HIGH: "bg-[var(--danger-500)]",
  MEDIUM: "bg-[var(--warning-500)]",
  LOW: "bg-[var(--text-4)]",
};
const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function InReviewTab() {
  const { data: tasks = [], isLoading } = useTasks({ status: "IN_REVIEW" });
  const [expanded, setExpanded] = useState(false);

  // High priority first, then soonest due date (undated last), then title — most-urgent reviews
  // float to the top.
  const sorted = [...tasks].sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    const ad = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  });

  const visible = expanded ? sorted : sorted.slice(0, PAGE);

  return (
    <BackstagePanel
      number="01"
      title="IN REVIEW"
      bodyClassName="p-0"
      action={
        tasks.length > 0 ? (
          <span className="text-[11px] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
            {tasks.length}
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 p-10 text-center">
          <CheckCircleIcon className="h-6 w-6 text-[var(--text-4)]" />
          <p className="text-sm text-[var(--text-2)]">Nothing in review.</p>
          <p className="text-xs text-[var(--text-4)]">
            Tasks moved to “In Review” on any client board show up here.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border-2)]">
            {visible.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/portal/${t.client.slug}/tasks`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-1)]"
                >
                  <span
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])}
                    title={`${t.priority.charAt(0)}${t.priority.slice(1).toLowerCase()} priority`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-1)]">
                    {t.title}
                  </span>
                  <span className="max-w-[40%] shrink-0 truncate text-xs text-[var(--text-3)]">
                    {t.client.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {sorted.length > PAGE ? (
            <div className="border-t border-[var(--border-2)] px-4 py-2.5 text-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
              >
                {expanded ? "Show less" : `Show all ${sorted.length}`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </BackstagePanel>
  );
}
