"use client";

import Link from "next/link";
import { formatDate, taskRef } from "@/lib/format";
import { useTaskAttention } from "@/hooks/use-tasks";

export function OverdueTasksCard() {
  const { data, isLoading } = useTaskAttention();
  const overdue = data?.overdue ?? [];

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">03</span>
          {" // ON YOUR PLATE"}
        </span>
        {data ? (
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            {data.doingCount} doing · {data.dueSoonCount} due 7d
          </span>
        ) : null}
      </div>

      <div className="widget-body space-y-1.5">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : overdue.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">Nothing overdue — nice.</p>
        ) : (
          <>
            <p className="text-[10px] font-medium uppercase tracking-[0.8px] text-red-600" style={{ fontFamily: "var(--font-mono)" }}>
              Overdue ({data?.overdueCount ?? overdue.length})
            </p>
            {overdue.map((t) => (
              <Link
                key={t.id}
                href={`/app/portal/${t.client.slug}/tasks`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-red-100 bg-red-50/50 px-3 py-2 transition hover:bg-red-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {taskRef(t.id)}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--text-1)]">{t.title}</span>
                  <span className="shrink-0 truncate text-[11px] text-[var(--text-4)]">· {t.client.name}</span>
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-red-600">
                  {t.dueDate ? formatDate(t.dueDate) : ""}
                </span>
              </Link>
            ))}
            {(data?.overdueCount ?? 0) > overdue.length ? (
              <p className="text-center text-[11px] text-[var(--text-4)]">+{(data?.overdueCount ?? 0) - overdue.length} more overdue</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
