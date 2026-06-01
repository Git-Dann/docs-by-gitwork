"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { useClientTaskSummary } from "@/hooks/use-tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/types/tasks";

/**
 * Compact tasks card for a client detail page. Shows open count + a small
 * per-status breakdown and links into the client-filtered task view. Renders as
 * a numbered `widget-card` section so it drops straight into client-detail.
 */
export function TasksSummaryCard({
  clientId,
  number = "02",
}: {
  clientId: string;
  number?: string;
}) {
  const { data, isPending } = useClientTaskSummary(clientId);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // TASKS"}
        </span>
        <Link
          href={`/app/portal?tab=tasks&client=${encodeURIComponent(clientId)}`}
          className="widget-header__status inline-flex items-center gap-1 transition-colors hover:text-[var(--brand-700)]"
        >
          Open tasks <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="widget-body">
        {isPending || !data ? (
          <div className="h-16 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : data.total === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-4)]">No tasks yet for this client.</p>
            <Link
              href={`/app/portal?tab=tasks&client=${encodeURIComponent(clientId)}`}
              className="text-xs font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
            >
              Add the first →
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div className="shrink-0">
              <p
                className="leading-none text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)", fontSize: 40 }}
              >
                {data.openTotal}
              </p>
              <p className="mt-1 widget-data-label">OPEN</p>
            </div>
            <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1.5">
              {TASK_STATUSES.map((s) => (
                <div key={s} className="flex items-baseline gap-1.5">
                  <span
                    className="text-sm font-semibold text-[var(--text-1)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {data.counts[s]}
                  </span>
                  <span className="text-[11px] text-[var(--text-4)]">{TASK_STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
