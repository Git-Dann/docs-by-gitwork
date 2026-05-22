"use client";

import Link from "next/link";
import { BeakerIcon } from "@heroicons/react/24/solid";
import { useStudyList } from "@/hooks/use-study";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_STYLES: Record<string, string> = {
  RUNNING:          "bg-emerald-50 text-emerald-700",
  PLAN_GENERATING:  "bg-blue-50 text-blue-700",
  DRAFT:            "bg-[var(--surface-2)] text-[var(--text-3)]",
  COMPLETE:         "bg-[var(--surface-2)] text-[var(--text-2)]",
};

const STATUS_LABEL: Record<string, string> = {
  RUNNING:          "Running",
  PLAN_GENERATING:  "Planning",
  DRAFT:            "Draft",
  COMPLETE:         "Complete",
};

export default function StudyWidget({ size }: { size: WidgetSize }) {
  const { data: studies, isLoading } = useStudyList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const list = studies ?? [];
  const running = list.filter((s) => s.status === "RUNNING" || s.status === "PLAN_GENERATING");

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
            <BeakerIcon className="h-2.5 w-2.5" />
            Study
          </span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              live
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{list.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">studies</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {running.length > 0 ? `${running.length} running` : "None active"}
        </p>
      </div>
    );
  }

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
            <BeakerIcon className="h-2.5 w-2.5" />
            Study
          </span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {running.length} running
            </span>
          )}
        </div>
        <Link href="/app/study" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* List */}
      <div className="mt-2 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <BeakerIcon className="h-6 w-6 text-[var(--text-4)]" />
            <p className="text-[11px] text-[var(--text-3)]">No studies yet</p>
            <Link href="/app/study" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
              Start a study →
            </Link>
          </div>
        ) : (
          <div className="space-y-0.5">
            {list.slice(0, displayCount).map((study) => (
              <Link
                key={study.id}
                href={`/app/study/${study.id}`}
                className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
              >
                <span className="truncate text-xs text-[var(--text-1)]">{study.title}</span>
                <span
                  className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[study.status] ?? STATUS_STYLES.DRAFT}`}
                >
                  {STATUS_LABEL[study.status] ?? study.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
