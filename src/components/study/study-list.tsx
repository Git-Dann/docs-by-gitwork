"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, BeakerIcon } from "@heroicons/react/24/outline";
import { useStudyList, useStudyPersonas, useDeleteStudy, useLoadStudyDemo } from "@/hooks/use-study";
import { PERSONA_COLORS } from "@/config/study-personas";
import { cn, formatDate } from "@/lib/format";
import type { StudyListItem } from "@/server/study";

type Filter = "all" | "running" | "draft" | "completed";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLAN_GENERATING: "Generating plan…",
  PLAN_READY: "Plan ready",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
  PLAN_GENERATING: "bg-amber-50 text-amber-700 border border-amber-200",
  PLAN_READY: "bg-blue-50 text-blue-700 border border-blue-200",
  RUNNING: "bg-amber-50 text-amber-700 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

function normalizeFilter(status: string): Filter {
  if (status === "RUNNING" || status === "PLAN_GENERATING") return "running";
  if (status === "COMPLETED") return "completed";
  return "draft";
}

function PersonaAvatars({ ids, personasById }: { ids: string[]; personasById: Record<string, { initials: string; color: string }> }) {
  const shown = ids.slice(0, 5);
  const rest = ids.length - 5;
  return (
    <div className="flex items-center">
      {shown.map((id, i) => {
        const p = personasById[id];
        const colors = PERSONA_COLORS[p?.color ?? "violet"] ?? PERSONA_COLORS.violet;
        return (
          <span
            key={id}
            style={{ marginLeft: i === 0 ? 0 : -6 }}
            className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white text-[10px] font-semibold", colors.bg, colors.text)}
          >
            {p?.initials ?? "?"}
          </span>
        );
      })}
      {rest > 0 && (
        <span style={{ marginLeft: -6 }} className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-[var(--surface-1)] text-[10px] font-medium text-[var(--text-4)]">
          +{rest}
        </span>
      )}
    </div>
  );
}

function StudyCard({ study, personasById, onDelete }: { study: StudyListItem; personasById: Record<string, { initials: string; color: string }>; onDelete: (id: string) => void }) {
  return (
    <div className="app-card group relative flex flex-col gap-3 p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[study.status] ?? STATUS_TONE.DRAFT)}>
          {study.status === "RUNNING" && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
          {STATUS_LABEL[study.status] ?? study.status}
        </span>
        <span className="text-[11px] text-[var(--text-4)]">{formatDate(study.createdAt)}</span>
      </div>

      <Link href={`/app/study/${study.id}`} className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[var(--text-1)] hover:text-[var(--brand-600)]">{study.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{study.problemStatement}</p>
      </Link>

      <div className="flex items-center justify-between border-t border-[var(--border-2)] pt-3">
        <PersonaAvatars ids={study.selectedPersonaIds} personasById={personasById} />
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-4)]">
            {study.sessionMode === "GROUP" ? "Group" : "1-on-1"}
            {study.sessionCount > 0 && ` · ${study.completedSessionCount}/${study.sessionCount} sessions`}
          </span>
          <button
            type="button"
            onClick={() => onDelete(study.id)}
            className="text-[11px] text-[var(--text-4)] opacity-0 transition hover:text-red-500 group-hover:opacity-100"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudyList() {
  const router = useRouter();
  const { data: studies, isLoading } = useStudyList();
  const { data: personas } = useStudyPersonas();
  const { mutate: deleteStudy } = useDeleteStudy();
  const { mutateAsync: loadDemo, isPending: loadingDemo } = useLoadStudyDemo();
  const [filter, setFilter] = useState<Filter>("all");

  async function handleLoadDemo() {
    const result = await loadDemo();
    router.push(`/app/study/${result.studyId}`);
  }

  const personasById = Object.fromEntries((personas ?? []).map((p) => [p.id, p]));

  const filtered = (studies ?? []).filter((s) => {
    if (filter === "all") return true;
    return normalizeFilter(s.status) === filter;
  });

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "running", label: "Running" },
    { id: "draft", label: "Draft" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-[6px] px-3 py-1.5 text-sm font-medium transition",
                filter === tab.id
                  ? "bg-white text-[var(--text-1)] shadow-sm"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <BeakerIcon className="h-4 w-4" />
            {loadingDemo ? "Loading…" : "Load demo"}
          </button>
          <Link href="/app/study/new">
            <button type="button" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
              <PlusIcon className="h-4 w-4" />
              New study
            </button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] py-16 text-center">
          <BeakerIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
          <p className="text-sm font-medium text-[var(--text-2)]">{filter === "all" ? "No studies yet" : `No ${filter} studies`}</p>
          {filter === "all" && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleLoadDemo}
                disabled={loadingDemo}
                className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                <BeakerIcon className="h-4 w-4" />
                {loadingDemo ? "Loading…" : "Load demo study"}
              </button>
              <Link href="/app/study/new" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" style={{ color: "white" }}>
                <PlusIcon className="h-4 w-4" />
                New study
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <StudyCard key={s.id} study={s} personasById={personasById} onDelete={(id) => deleteStudy(id)} />
          ))}
        </div>
      )}
    </div>
  );
}
