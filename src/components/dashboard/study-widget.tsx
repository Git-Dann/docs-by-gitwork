"use client";

import Link from "next/link";
import { useStudyList } from "@/hooks/use-study";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_COLOR: Record<string, string> = {
  RUNNING: "bg-green-100 text-green-700",
  PLAN_GENERATING: "bg-blue-100 text-blue-700",
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)]",
  COMPLETE: "bg-[var(--surface-1)] text-[var(--text-2)]",
};

const STATUS_LABEL: Record<string, string> = {
  RUNNING: "Running",
  PLAN_GENERATING: "Planning",
  DRAFT: "Draft",
  COMPLETE: "Complete",
};

export default function StudyWidget({ size }: { size: WidgetSize }) {
  const { data: studies, isLoading } = useStudyList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const list = studies ?? [];
  const running = list.filter((s) => s.status === "RUNNING" || s.status === "PLAN_GENERATING");

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium text-[var(--text-2)]">Study</span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              live
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{list.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">studies</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {running.length > 0 ? `${running.length} running` : "None active"}
        </p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 6 : 3;

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-2)]">Study</span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              {running.length} running
            </span>
          )}
        </div>
        <Link href="/app/study" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-3)]">
          No studies yet
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {list.slice(0, displayCount).map((study) => (
            <Link
              key={study.id}
              href={`/app/study/${study.id}`}
              className="flex items-center justify-between rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-1)]"
            >
              <span className="truncate text-xs text-[var(--text-1)]">{study.title}</span>
              <span
                className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[study.status] ?? STATUS_COLOR.DRAFT}`}
              >
                {STATUS_LABEL[study.status] ?? study.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
