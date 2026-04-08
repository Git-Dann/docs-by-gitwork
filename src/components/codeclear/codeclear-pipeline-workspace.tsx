"use client";

import {
  ArrowPathIcon,
  Bars3Icon,
  DocumentTextIcon,
  EyeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useBulkUpdateCodeClearCandidates,
  useCodeClearCandidates,
  useRunCodeClearGitHubAnalysis,
} from "@/hooks/use-codeclear";
import {
  PIPELINE_STATUSES,
  type CodeClearCandidateListItem,
  type PipelineStatus,
} from "@/types/codeclear";
import {
  CodeClearAnalysisBadge,
  CodeClearScoreBadge,
  CodeClearStatusBadge,
  CodeClearTabs,
  CodeClearTierBadge,
  EmptyState,
  SignalSourcePill,
  StackPill,
} from "@/components/codeclear/codeclear-shared";
import { CodeClearCandidateDrawer } from "@/components/codeclear/codeclear-candidate-drawer";
import { cn, formatDate } from "@/lib/format";
import Link from "next/link";

export function CodeClearPipelineWorkspace() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCandidateId = searchParams.get("candidate");
  const candidatesQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 100,
    sortBy: "createdAt",
    sortDir: "desc",
  });
  const bulkUpdate = useBulkUpdateCodeClearCandidates();
  const candidates = useMemo(() => candidatesQuery.data?.items ?? [], [candidatesQuery.data]);
  const scanningCount = useMemo(
    () => candidates.filter((c) => c.analysisState === "RUNNING").length,
    [candidates],
  );
  const signalRequests = useMemo(
    () =>
      candidates.reduce(
        (sum, candidate) => sum + Math.max(0, candidate.signalSources.length - 1),
        0,
      ),
    [candidates],
  );

  const groups = useMemo(() => {
    return Object.fromEntries(
      PIPELINE_STATUSES.map((status) => [
        status.value,
        candidates.filter((candidate) => candidate.status === status.value),
      ]),
    ) as Record<PipelineStatus, typeof candidates>;
  }, [candidates]);

  function updateQuery(nextCandidateId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCandidateId) {
      params.set("candidate", nextCandidateId);
    } else {
      params.delete("candidate");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId) return;

    const candidate = candidates.find((item) => item.id === activeId);
    const targetStatus = PIPELINE_STATUSES.find((item) => item.value === overId)?.value;

    if (!candidate || !targetStatus || candidate.status === targetStatus) return;

    bulkUpdate.mutate({ action: "MOVE_STAGE", ids: [candidate.id], status: targetStatus });
  }

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-[16px] border border-[rgba(63,98,255,0.14)] bg-[linear-gradient(180deg,rgba(63,98,255,0.08),rgba(255,255,255,0.98))] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            Signal orchestration
          </p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">
            Trigger more evidence across GitHub, LinkedIn, CVs, interviews, and references.
          </p>
          <p className="mt-1 text-sm text-[var(--text-4)]">
            Use the candidate cards to request more data, then review the combined score in the drawer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PipelineStatCard label="Active scans" value={String(scanningCount)} tone="sky" />
          <PipelineStatCard label="Extra source signals" value={String(signalRequests)} tone="violet" />
        </div>
      </div>

      {candidates.length ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 xl:grid-cols-3">
            {PIPELINE_STATUSES.map((column) => (
              <PipelineColumn
                key={column.value}
                status={column.value}
                label={column.label}
                candidates={groups[column.value]}
                onOpen={updateQuery}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <EmptyState
          title="No candidates in the pipeline"
          body="Create a candidate in CodeClear to start moving profiles through the workflow."
        />
      )}

      <CodeClearCandidateDrawer
        candidateId={selectedCandidateId}
        onClose={() => updateQuery(null)}
      />
    </div>
  );
}

function PipelineColumn({
  status,
  label,
  candidates,
  onOpen,
}: {
  status: PipelineStatus;
  label: string;
  candidates: CodeClearCandidateListItem[];
  onOpen: (candidateId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "app-card min-h-[300px] p-4 transition",
        isOver ? "border-[var(--brand-600)] bg-[var(--surface-brand-soft)]" : "",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] pb-3">
        <div>
          <p className="text-base font-semibold text-[var(--text-1)]">{label}</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">{candidates.length} candidates</p>
        </div>
        <CodeClearStatusBadge status={status} />
      </div>

      <div className="mt-4 space-y-3">
        {candidates.map((candidate) => (
          <PipelineCard key={candidate.id} candidate={candidate} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function PipelineCard({
  candidate,
  onOpen,
}: {
  candidate: CodeClearCandidateListItem;
  onOpen: (candidateId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidate.id,
  });
  const runAnalysis = useRunCodeClearGitHubAnalysis(candidate.id);
  const isRunning = candidate.analysisState === "RUNNING";
  const neverScanned = candidate.analysisState === "NEVER_RUN";
  const scanFailed = candidate.analysisState === "FAILED";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "rounded-[18px] border bg-white shadow-[var(--shadow-xs)] transition",
        isDragging ? "opacity-70" : "",
        isRunning
          ? "border-sky-300 bg-sky-50/60"
          : "border-[var(--border-2)]",
      )}
    >
      {isRunning ? (
        <div className="flex items-center gap-2 rounded-t-[18px] border-b border-sky-200 bg-sky-100 px-4 py-2">
          <ArrowPathIcon className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600" />
          <p className="text-xs font-semibold text-sky-700">Collecting repository signal…</p>
        </div>
      ) : null}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
            <p className="mt-1 truncate text-xs text-[var(--text-4)]">@{candidate.githubHandle}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-2)] text-[var(--text-4)] transition hover:border-[var(--border-1)]"
            {...attributes}
            {...listeners}
            title="Drag to move stage"
          >
            <Bars3Icon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidate.techStacks.slice(0, 3).map((stack) => (
            <StackPill key={stack} label={stack} tone="stack" />
          ))}
          <CodeClearTierBadge tier={candidate.tier} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {candidate.signalSources.slice(0, 3).map((source) => (
            <SignalSourcePill key={source} source={source} />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <CodeClearAnalysisBadge state={candidate.analysisState} />
          <CodeClearScoreBadge
            value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
          />
        </div>

        <p className="mt-3 text-xs text-[var(--text-4)]">
          Updated {formatDate(candidate.updatedAt)}
        </p>

        {/* Verified banner */}
        {candidate.status === "CODECLEAR_COMPLETE" ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2">
            <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="text-xs font-semibold text-emerald-700">Verified — ready to place</p>
          </div>
        ) : null}

        {/* Action row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Run / Re-run analysis button */}
          {isRunning ? (
            <span className="text-xs text-sky-600">Live update in ~4s</span>
          ) : (
            <Button
              type="button"
              variant={neverScanned || scanFailed ? "primary" : "secondary"}
              size="sm"
              leadingIcon={
                runAnalysis.isPending ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="h-3.5 w-3.5" />
                )
              }
              onClick={() => runAnalysis.mutate()}
              loading={runAnalysis.isPending}
              disabled={runAnalysis.isPending}
            >
              {scanFailed ? "Retry repo scan" : neverScanned ? "Run repo scan" : "Re-scan"}
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<EyeIcon className="h-3.5 w-3.5" />}
            onClick={() => onOpen(candidate.id)}
          >
            Open
          </Button>

          {candidate.status === "CODECLEAR_COMPLETE" ? (
            <Link
              href="/app/proposals?new=1"
              className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--brand-600)] bg-[var(--brand-600)] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-xs)] transition hover:bg-[var(--brand-700)]"
            >
              <DocumentTextIcon className="h-3.5 w-3.5" />
              Create Doc
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PipelineStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "violet";
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-4",
        tone === "sky"
          ? "border-sky-200 bg-sky-50/70"
          : "border-violet-200 bg-violet-50/70",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">{value}</p>
    </div>
  );
}
