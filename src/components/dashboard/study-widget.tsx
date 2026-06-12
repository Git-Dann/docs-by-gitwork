"use client";

import Link from "next/link";
import { BeakerIcon } from "@heroicons/react/24/solid";
import { useStudyList } from "@/hooks/use-study";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_STYLES: Record<string, string> = {
  RUNNING:          "bg-emerald-50 text-emerald-700",
  PLAN_GENERATING:  "bg-blue-50 text-blue-700",
  DRAFT:            "bg-[var(--surface-2)] text-[#475569]",
  COMPLETE:         "bg-[var(--surface-2)] text-[#475569]",
};

const STATUS_LABEL: Record<string, string> = {
  RUNNING:          "Running",
  PLAN_GENERATING:  "Planning",
  DRAFT:            "Draft",
  COMPLETE:         "Complete",
};

export default function StudyWidget(_: { size: WidgetSize }) {
  const { data: studies, isLoading } = useStudyList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const list = studies ?? [];
  const running = list.filter((s) => s.status === "RUNNING" || s.status === "PLAN_GENERATING");

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          05 // STUDY
        </span>
        <div className="flex items-center gap-2">
          {running.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {running.length} running
            </span>
          )}
          <Link href="/app/study" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
            View all
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <BeakerIcon className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-xs text-[#475569]">No studies yet</p>
              <Link href="/app/study" className="text-xs font-medium text-[#1D4ED8] hover:underline">
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
                  <span className="truncate text-sm text-[#0F172A]">{study.title}</span>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[study.status] ?? STATUS_STYLES.DRAFT}`}
                  >
                    {STATUS_LABEL[study.status] ?? study.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
