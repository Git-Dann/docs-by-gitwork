"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, BeakerIcon, BuildingOffice2Icon, TrashIcon } from "@heroicons/react/24/outline";
import { useStudyList, useStudyPersonas, useDeleteStudy, useLoadStudyDemo } from "@/hooks/use-study";
import { usePermissions } from "@/hooks/use-permissions";
import { PERSONA_COLORS } from "@/config/study-personas";
import { cn, formatDate } from "@/lib/format";
import { Button, buttonStyles } from "@/components/ui/button";
import type { StudyListItem } from "@/server/study";

type Filter = "all" | "running" | "draft" | "completed";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLAN_GENERATING: "Generating plan",
  PLAN_READY: "Plan ready",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

// DESIGN.md: badges use rounded-[4px], not rounded-full. Status dots are the only full-radius element.
const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
  PLAN_GENERATING: "bg-amber-50 text-amber-700 border border-amber-200",
  PLAN_READY: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  RUNNING: "bg-amber-50 text-amber-700 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

function normalizeFilter(status: string): Filter {
  if (status === "RUNNING" || status === "PLAN_GENERATING") return "running";
  if (status === "COMPLETED") return "completed";
  return "draft";
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        STATUS_TONE[status] ?? STATUS_TONE.DRAFT,
      )}
    >
      {status === "RUNNING" || status === "PLAN_GENERATING" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      ) : null}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PersonaAvatars({
  ids,
  personasById,
}: {
  ids: string[];
  personasById: Record<string, { initials: string; color: string }>;
}) {
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
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white text-[10px] font-semibold",
              colors.bg,
              colors.text,
            )}
          >
            {p?.initials ?? "?"}
          </span>
        );
      })}
      {rest > 0 && (
        <span
          style={{ marginLeft: -6 }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-[var(--surface-1)] text-[10px] font-medium text-[var(--text-4)]"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

function StudyCard({
  study,
  index,
  personasById,
  onDelete,
}: {
  study: StudyListItem;
  index: number;
  personasById: Record<string, { initials: string; color: string }>;
  onDelete: (id: string) => void;
}) {
  const numberLabel = String(index + 1).padStart(2, "0");
  return (
    <article className="widget-card group transition-shadow hover:shadow-[rgba(0,0,0,0.04)_0px_2px_8px]">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{numberLabel}</span>
          {" // STUDY"}
        </span>
        <StatusChip status={study.status} />
      </div>

      <Link href={`/app/study/${study.id}`} className="block min-w-0 px-5 pt-5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
          {study.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{study.problemStatement}</p>
      </Link>

      {study.workspaceClientName && (
        <Link
          href={`/app/clients/${study.workspaceClientSlug}`}
          className="mx-5 mt-3 inline-flex w-fit items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)] transition hover:border-[var(--brand-200)] hover:text-[var(--brand-700)]"
        >
          <BuildingOffice2Icon className="h-3 w-3" />
          {study.workspaceClientName}
        </Link>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border-2)] px-5 py-3">
        <PersonaAvatars ids={study.selectedPersonaIds} personasById={personasById} />
        <div className="flex items-center gap-3">
          <span className="widget-timestamp">
            {study.sessionMode === "GROUP" ? "Group" : "1-on-1"}
            {study.sessionCount > 0 && ` · ${study.completedSessionCount}/${study.sessionCount}`}
          </span>
          <span className="widget-timestamp">{formatDate(study.createdAt)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (confirm("Delete this study?")) onDelete(study.id);
            }}
            className="rounded-[6px] p-1 text-[var(--text-4)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            title="Delete study"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function StudyList() {
  const router = useRouter();
  const { canManageStudy } = usePermissions();
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

  const all = studies ?? [];
  const counts = {
    all: all.length,
    running: all.filter((s) => normalizeFilter(s.status) === "running").length,
    draft: all.filter((s) => normalizeFilter(s.status) === "draft").length,
    completed: all.filter((s) => normalizeFilter(s.status) === "completed").length,
  };

  const filtered = all.filter((s) => {
    if (filter === "all") return true;
    return normalizeFilter(s.status) === filter;
  });

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "running", label: "Running", count: counts.running },
    { id: "draft", label: "Draft", count: counts.draft },
    { id: "completed", label: "Completed", count: counts.completed },
  ];

  return (
    <div className="space-y-5">
      {/* 01 // STUDIES — control strip */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // STUDIES"}
          </span>
          <span className="widget-header__status">
            {counts.all} TOTAL
            {counts.running > 0 && ` · ${counts.running} ACTIVE`}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition",
                  filter === tab.id
                    ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                    filter === tab.id
                      ? "bg-[var(--mist)] text-[var(--brand-700)]"
                      : "bg-[var(--surface-2)] text-[var(--text-4)]",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleLoadDemo}
              loading={loadingDemo}
              leadingIcon={!loadingDemo ? <BeakerIcon className="h-4 w-4" /> : null}
            >
              {loadingDemo ? "Loading…" : "Load demo"}
            </Button>
            {canManageStudy ? (
              <Link
                href="/app/study/new"
                className={buttonStyles({ variant: "primary", size: "sm" })}
              >
                <PlusIcon className="h-4 w-4" />
                New study
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // EMPTY"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <BeakerIcon className="mb-4 h-10 w-10 text-[var(--text-4)]" />
            <h3
              className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {filter === "all" ? "No studies yet" : `No ${filter} studies`}
            </h3>
            {filter === "all" && (
              <>
                <p className="mt-3 max-w-md text-sm text-[var(--text-3)]">
                  Start an AI-powered research project. Interview personas, capture insights, synthesise a report.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleLoadDemo}
                    loading={loadingDemo}
                    leadingIcon={!loadingDemo ? <BeakerIcon className="h-4 w-4" /> : null}
                  >
                    {loadingDemo ? "Loading…" : "Load demo study"}
                  </Button>
                  {canManageStudy ? (
                    <Link
                      href="/app/study/new"
                      className={buttonStyles({ variant: "primary", size: "md" })}
                    >
                      <PlusIcon className="h-4 w-4" />
                      New study
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s, i) => (
            <StudyCard
              key={s.id}
              study={s}
              index={i}
              personasById={personasById}
              onDelete={(id) => deleteStudy(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
