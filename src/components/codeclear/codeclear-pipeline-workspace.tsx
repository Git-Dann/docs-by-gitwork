"use client";

import {
  ArrowPathIcon,
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
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
  CandidateMeta,
  CodeClearActionButton,
  CodeClearStatusBadge,
  CodeClearTabs,
  CodeClearTierPanel,
  EmptyState,
  SignalSourceIcons,
  StackPill,
} from "@/components/codeclear/codeclear-shared";
import { CodeClearCandidateDrawer } from "@/components/codeclear/codeclear-candidate-drawer";
import { cn } from "@/lib/format";
import Link from "next/link";

export function CodeClearPipelineWorkspace() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
  const [optimisticCandidates, setOptimisticCandidates] = useState<CodeClearCandidateListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const savedCandidates = useRef<CodeClearCandidateListItem[]>([]);
  const activeCandidate = useMemo(
    () => optimisticCandidates.find((c) => c.id === activeId) ?? null,
    [optimisticCandidates, activeId],
  );

  useEffect(() => {
    if (!activeId) setOptimisticCandidates(candidates);
  }, [candidates, activeId]);

  const scanningCount = useMemo(
    () => optimisticCandidates.filter((c) => c.analysisState === "RUNNING").length,
    [optimisticCandidates],
  );
  const signalRequests = useMemo(
    () =>
      optimisticCandidates.reduce(
        (sum, candidate) => sum + Math.max(0, candidate.signalSources.length - 1),
        0,
      ),
    [optimisticCandidates],
  );

  const groups = useMemo(() => {
    return Object.fromEntries(
      PIPELINE_STATUSES.map((status) => [
        status.value,
        optimisticCandidates.filter((candidate) => candidate.status === status.value),
      ]),
    ) as Record<PipelineStatus, typeof optimisticCandidates>;
  }, [optimisticCandidates]);

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

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    savedCandidates.current = optimisticCandidates;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    setOptimisticCandidates((current) => {
      const activeIndex = current.findIndex((c) => c.id === draggedId);
      if (activeIndex === -1) return current;

      const activeCand = current[activeIndex];
      const overIsColumn = PIPELINE_STATUSES.some((s) => s.value === overId);

      if (overIsColumn) {
        const targetStatus = overId as PipelineStatus;
        // Already last in this column — skip
        const colCards = current.filter((c) => c.status === targetStatus);
        if (
          activeCand.status === targetStatus &&
          colCards[colCards.length - 1]?.id === draggedId
        ) {
          return current;
        }
        const without = current.filter((c) => c.id !== draggedId);
        const lastInCol = without.reduce<number>(
          (acc, c, i) => (c.status === targetStatus ? i : acc),
          -1,
        );
        const insertAt = lastInCol === -1 ? without.length : lastInCol + 1;
        const updated =
          activeCand.status !== targetStatus
            ? { ...activeCand, status: targetStatus, updatedAt: new Date().toISOString() }
            : activeCand;
        const result = [...without];
        result.splice(insertAt, 0, updated);
        return result;
      }

      // Over is a card
      const overIndex = current.findIndex((c) => c.id === overId);
      if (overIndex === -1) return current;

      const overCand = current[overIndex];
      const targetStatus = overCand.status;

      // Already directly before this card in same column — skip
      if (activeIndex === overIndex - 1 && activeCand.status === targetStatus) return current;

      const without = current.filter((c) => c.id !== draggedId);
      const newOverIndex = without.findIndex((c) => c.id === overId);
      const updated =
        activeCand.status !== targetStatus
          ? { ...activeCand, status: targetStatus, updatedAt: new Date().toISOString() }
          : activeCand;
      const result = [...without];
      result.splice(newOverIndex >= 0 ? newOverIndex : result.length, 0, updated);
      return result;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active } = event;
    setActiveId(null);

    const draggedId = String(active.id);
    const finalCand = optimisticCandidates.find((c) => c.id === draggedId);
    const originalCand = savedCandidates.current.find((c) => c.id === draggedId);

    if (!finalCand || !originalCand) return;

    if (finalCand.status !== originalCand.status) {
      bulkUpdate.mutate(
        { action: "MOVE_STAGE", ids: [draggedId], status: finalCand.status },
        { onError: () => setOptimisticCandidates(savedCandidates.current) },
      );
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setOptimisticCandidates(savedCandidates.current);
  }

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-[10px] border border-[rgba(63,98,255,0.14)] bg-[linear-gradient(180deg,rgba(63,98,255,0.08),rgba(255,255,255,0.98))] px-4 py-4">
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid gap-4 xl:grid-cols-3">
            {PIPELINE_STATUSES.map((column) => (
              <PipelineColumn
                key={column.value}
                status={column.value}
                label={column.label}
                candidates={groups[column.value]}
                activeId={activeId}
                onOpen={updateQuery}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeCandidate ? (
              <PipelineCard candidate={activeCandidate} onOpen={() => {}} isOverlay />
            ) : null}
          </DragOverlay>
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
  activeId,
  onOpen,
}: {
  status: PipelineStatus;
  label: string;
  candidates: CodeClearCandidateListItem[];
  activeId: string | null;
  onOpen: (candidateId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "app-card min-h-[300px] p-4 transition-all duration-150",
        isOver && activeId
          ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)] shadow-[0_0_0_2px_var(--brand-200)]"
          : "",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] pb-3">
        <div>
          <p className="text-base font-semibold text-[var(--text-1)]">{label}</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">{candidates.length} candidates</p>
        </div>
        <CodeClearStatusBadge status={status} />
      </div>

      <SortableContext items={candidates.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="mt-4 space-y-1">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="py-1">
              <PipelineCard candidate={candidate} onOpen={onOpen} />
            </div>
          ))}

          {activeId && isOver && candidates.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-[10px] border-2 border-dashed border-[var(--brand-400)] bg-[var(--surface-brand-soft)]">
              <p className="text-xs font-medium text-[var(--brand-600)]">Drop here</p>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function PipelineCard({
  candidate,
  onOpen,
  isOverlay = false,
}: {
  candidate: CodeClearCandidateListItem;
  onOpen: (candidateId: string) => void;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
    disabled: isOverlay,
  });

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const runAnalysis = useRunCodeClearGitHubAnalysis(candidate.id);
  const isRunning = candidate.analysisState === "RUNNING";
  const neverScanned = candidate.analysisState === "NEVER_RUN";
  const scanFailed = candidate.analysisState === "FAILED";

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, height: 160 }}
        className="rounded-[10px] border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-2)] opacity-40"
      />
    );
  }

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        "rounded-[10px] border bg-white shadow-[var(--shadow-xs)] transition-shadow duration-150",
        isOverlay
          ? "rotate-1 scale-[1.02] shadow-[0_16px_48px_rgba(0,0,0,0.18)] ring-2 ring-[var(--brand-400)]/40"
          : "",
        isRunning ? "border-sky-300 bg-sky-50/60" : "border-[var(--border-2)]",
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-grid h-6 w-5 cursor-grab grid-cols-2 gap-[3px] text-[var(--border-1)] active:cursor-grabbing"
                {...(isOverlay ? {} : attributes)}
                {...(isOverlay ? {} : listeners)}
                title="Drag to move stage"
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <span key={index} className="h-1.5 w-1.5 rounded-full bg-current" />
                ))}
              </button>
              <p className="truncate text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
            </div>
            <p className="mt-1 truncate pl-7 text-xs text-[var(--text-4)]">@{candidate.githubHandle}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpen(candidate.id)}
          >
            View Profile
          </Button>
        </div>

        <div className="mt-4">
          {candidate.primaryStack ? (
            <StackPill label={candidate.primaryStack} tone="stack" />
          ) : null}
        </div>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div className="space-y-3">
            <SignalSourceIcons sources={candidate.signalSources} />
            <CandidateMeta
              updatedAt={candidate.updatedAt}
              prefix={candidate.analysisState === "NEVER_RUN" ? "Never run" : "Updated"}
            />
          </div>

          <div className="flex flex-col items-end gap-3">
            <CodeClearTierPanel tier={candidate.tier} />
            {isRunning ? (
              <span className="text-xs text-sky-600">Live update in ~4s</span>
            ) : (
              <CodeClearActionButton
                type="button"
                trailingIcon={
                  runAnalysis.isPending ? (
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => runAnalysis.mutate()}
                disabled={runAnalysis.isPending}
                className="min-w-[146px] justify-center"
              >
                {scanFailed ? "Retry CodeClear" : neverScanned ? "Run CodeClear" : "Re-run CodeClear"}
              </CodeClearActionButton>
            )}
          </div>
        </div>

        {candidate.status === "CODECLEAR_COMPLETE" ? (
          <div className="mt-4 flex items-center justify-end">
            <Link
              href="/app/proposals?new=1"
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--brand-600)] bg-[var(--brand-600)] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-xs)] transition hover:bg-[var(--brand-700)]"
            >
              <DocumentTextIcon className="h-3.5 w-3.5" />
              Create Doc
            </Link>
          </div>
        ) : null}
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
        "rounded-[10px] border px-4 py-4",
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
