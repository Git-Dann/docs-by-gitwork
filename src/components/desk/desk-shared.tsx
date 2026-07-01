"use client";

import Link from "next/link";
import { cn } from "@/lib/format";
import type { TaskDTO, TaskStatus } from "@/types/tasks";

/** Status chip styles — mirrors DevOverview, but token-backed so dark mode flips cleanly. */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG: "bg-[var(--surface-1)] text-[var(--text-3)]",
  TODO: "bg-[var(--surface-1)] text-[var(--text-3)]",
  DOING: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  IN_REVIEW: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DONE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  DOING: "Doing",
  IN_REVIEW: "In review",
  DONE: "Done",
};

/** Mono-caps section heading used inside tab bodies (per DESIGN.md eyebrow style). */
export function DeskSectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-3)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {children}
      </span>
      {typeof count === "number" && count > 0 ? (
        <span
          className="text-[10px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

/** A single task row — deep-links to the client's board. */
export function DeskTaskRow({ task, showStatus = true }: { task: TaskDTO; showStatus?: boolean }) {
  const overdue = task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== "DONE" : false;
  return (
    <Link
      href={`/app/portal/${task.client.slug}/tasks`}
      className="flex items-center justify-between gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 transition hover:bg-[var(--surface-1)]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{task.title}</p>
        <p className="truncate text-xs text-[var(--text-4)]">
          {task.client.name}
          {task.dueDate ? (
            <span className={cn("ml-1.5", overdue && "text-[var(--danger-500)]")}>
              · {overdue ? "overdue " : "due "}
              {new Date(task.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          ) : null}
        </p>
      </div>
      {showStatus ? (
        <span
          className={cn(
            "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_STYLES[task.status],
          )}
        >
          {STATUS_LABEL[task.status]}
        </span>
      ) : null}
    </Link>
  );
}

/** Muted empty-state line. */
export function DeskEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-[var(--text-4)]">{children}</p>;
}

/** Skeleton block while a section loads. */
export function DeskSkeleton() {
  return <div className="h-20 animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
}

/** "Connect Google" empty state shared by Meetings + Inbox tabs. */
export function DeskConnectGoogle({ what }: { what: string }) {
  return (
    <div className="rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center">
      <p className="text-xs text-[var(--text-4)]">
        Connect your Google account to see {what}.
      </p>
      <Link
        href="/app/settings/account"
        className="mt-2 inline-block text-xs font-medium text-[var(--brand-700)] hover:underline"
      >
        Connect in Settings →
      </Link>
    </div>
  );
}
