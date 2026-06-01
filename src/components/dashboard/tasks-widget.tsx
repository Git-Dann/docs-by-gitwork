"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTasks } from "@/hooks/use-tasks";
import type { WidgetSize } from "@/components/app-overview";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/types/tasks";

export default function TasksWidget({ size }: { size: WidgetSize }) {
  const { data: tasks = [], isLoading } = useTasks({});

  const counts = useMemo(() => {
    const c = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const t of tasks) c[t.status] += 1;
    return c;
  }, [tasks]);

  const open = tasks.length - counts.DONE;

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span
          className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          06 // TASKS
        </span>
        <Link
          href="/app/portal"
          className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]"
        >
          Open
        </Link>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl tabular-nums text-[#0F172A]" style={{ fontFamily: "var(--font-display)" }}>
            {open}
          </p>
          <p className="text-xs text-[#475569]">open task{open === 1 ? "" : "s"}</p>
        </div>
        {size !== "sm" ? (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {TASK_STATUSES.filter((s) => s !== "DONE").map((s) => (
              <span key={s} className="text-[11px] text-[#475569]">
                <span className="font-semibold text-[#0F172A]">{counts[s]}</span> {TASK_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
