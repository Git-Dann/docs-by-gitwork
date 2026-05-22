"use client";

import {
  ArrowPathIcon,
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
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
  const [overId, setOverId] = useState<string | null>(null);
  // Ref holds the last confirmed over target — read in handleDragEnd
  // to guarantee "drops where the line is" even if event.over lags
  const overIdRef = useRef<string | null>(null);
  const savedCandidates = useRef<CodeClearCandidateListItem[]>([]);

  const activeCandidate = useMemo(
    () => optimisticCandidates.find((c) => c.id === activeId) ?? null,
    [optimisticCandidates, activeId],
  );

  // Smart sync: preserve drag order; only do a full reset when cards are
  // added or removed (not on status-change refetches which would re-sort)
  useEffect(() => {
    if (activeId) return;

    const currentIds = new Set(optimisticCandidates.map((c) => c.id));
    const serverIds = new Set(candidates.map((c) => c.id));
    const structureChanged =
      candidates.some((c) => !currentIds.has(c.id)) ||
      optimisticCandidates.some((c) => !serverIds.has(c.id));

    if (structureChanged || optimisticCandidates.length === 0) {
      setOptimisticCandidates(candidates);
    } else {
      // Keep order, update individual card data (analysis state, score, etc.)
      setOptimisticCandidates((current) =>
        current.map((c) => candidates.find((s) => s.id === c.id) ?? c),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const groups = useMemo(
    () =>
      Object.fromEntries(
        PIPELINE_STATUSES.map((status) => [
          status.value,
          optimisticCandidates.filter((c) => c.status === status.value),
        ]),
      ) as Record<PipelineStatus, CodeClearCandidateListItem[]>,
    [optimisticCandidates],
  );

  function updateQuery(nextCandidateId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCandidateId) params.set("candidate", nextCandidateId);
    else params.delete("candidate");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverId(null);
    overIdRef.current = null;
    savedCandidates.current = optimisticCandidates;
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) return; // keep last overId — line stays stable between cards
    const id = String(event.over.id);
    overIdRef.current = id;
    setOverId(id);
  }

  function handleDragEnd(_event: DragEndEvent) {
    const draggedId = activeId;
    const targetId = overIdRef.current;

    setActiveId(null);
    setOverId(null);
    overIdRef.current = null;

    if (!draggedId) return;

    if (!targetId) {
      setOptimisticCandidates(savedCandidates.current);
      return;
    }

    const dragged = savedCandidates.current.find((c) => c.id === draggedId);
    if (!dragged) return;

    const isOverColumn = PIPELINE_STATUSES.some((s) => s.value === targetId);
    const overCard = isOverColumn ? null : optimisticCandidates.find((c) => c.id === targetId);
    const targetStatus: PipelineStatus = isOverColumn
      ? (targetId as PipelineStatus)
      : (overCard?.status ?? dragged.status);

    const updated = { ...dragged, status: targetStatus, updatedAt: new Date().toISOString() };

    setOptimisticCandidates((current) => {
      const without = current.filter((c) => c.id !== draggedId);
      if (overCard) {
        const insertAt = without.findIndex((c) => c.id === targetId);
        const result = [...without];
        result.splice(insertAt >= 0 ? insertAt : result.length, 0, updated);
        return result;
      }
      // Column drop — place after last card in that column
      const lastInCol = without.reduce<number>(
        (acc, c, i) => (c.status === targetStatus ? i : acc),
        -1,
      );
      const result = [...without];
      result.splice(lastInCol === -1 ? result.length : lastInCol + 1, 0, updated);
      return result;
    });

    if (dragged.status !== targetStatus) {
      bulkUpdate.mutate(
        { action: "MOVE_STAGE", ids: [draggedId], status: targetStatus },
        { onError: () => setOptimisticCandidates(savedCandidates.current) },
      );
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
    overIdRef.current = null;
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
          collisionDetection={pointerWithin}
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
                overId={overId}
                onOpen={updateQuery}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeCandidate ? (
              <PipelineCard
                candidate={activeCandidate}
                onOpen={() => {}}
                isOverlay
              />
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

function DropLine() {
  return (
    <div className="pointer-events-none flex items-center gap-1.5 py-0.5">
      <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-500)]" />
      <div className="h-[2px] flex-1 rounded-full bg-[var(--brand-500)]" />
    </div>
  );
}

function PipelineColumn({
  status,
  label,
  candidates,
  activeId,
  overId,
  onOpen,
}: {
  status: PipelineStatus;
  label: string;
  candidates: CodeClearCandidateListItem[];
  activeId: string | null;
  overId: string | null;
  onOpen: (candidateId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  // overId matches a card in this column → show drop line before that card
  const overCardId = candidates.find((c) => c.id === overId && c.id !== activeId)?.id ?? null;
  // overId is the column itself → show indicator at bottom
  const overColumn = overId === status;
  const isDraggingHere = !!(activeId && (overCardId || overColumn));

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "app-card min-h-[300px] p-4 transition-colors duration-100",
        isDraggingHere
          ? "border-[var(--brand-400)] bg-[var(--surface-brand-soft)]"
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

      <div className="mt-4 space-y-0">
        {candidates.map((candidate) => {
          const showLineAbove = overCardId === candidate.id;
          return (
            <div key={candidate.id}>
              {showLineAbove ? <DropLine /> : null}
              <div className="py-1">
                <PipelineCard
                  candidate={candidate}
                  onOpen={onOpen}
                  isDragging={candidate.id === activeId}
                />
              </div>
            </div>
          );
        })}

        {activeId && overColumn && !overCardId && (
          candidates.filter((c) => c.id !== activeId).length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-[10px] border-2 border-dashed border-[var(--brand-400)] bg-[var(--surface-brand-soft)]">
              <p className="text-xs font-medium text-[var(--brand-600)]">Drop here</p>
            </div>
          ) : (
            <DropLine />
          )
        )}
      </div>
    </section>
  );
}

function PipelineCard({
  candidate,
  onOpen,
  isDragging = false,
  isOverlay = false,
}: {
  candidate: CodeClearCandidateListItem;
  onOpen: (candidateId: string) => void;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
  } = useDraggable({
    id: candidate.id,
    disabled: isDragging || isOverlay,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: candidate.id,
    disabled: isDragging || isOverlay,
  });

  const combinedRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const runAnalysis = useRunCodeClearGitHubAnalysis(candidate.id);
  const isRunning = candidate.analysisState === "RUNNING";
  const neverScanned = candidate.analysisState === "NEVER_RUN";
  const scanFailed = candidate.analysisState === "FAILED";

  // Ghost placeholder at original position while dragging
  if (isDragging && !isOverlay) {
    return (
      <div
        className="rounded-[10px] border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-1)] opacity-50"
        style={{ height: 172 }}
      />
    );
  }

  return (
    <div
      ref={isOverlay ? undefined : combinedRef}
      style={isOverlay ? undefined : { transform: CSS.Translate.toString(transform) }}
      className={cn(
        "rounded-[10px] border bg-white shadow-[var(--shadow-xs)]",
        isOverlay
          ? "rotate-[1.5deg] scale-[1.02] shadow-[0_20px_56px_rgba(0,0,0,0.16)] ring-2 ring-[var(--brand-400)]/40"
          : "cursor-default",
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
                className="inline-grid h-6 w-5 cursor-grab grid-cols-2 gap-[3px] text-[var(--text-4)] hover:text-[var(--text-2)] active:cursor-grabbing"
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
        tone === "sky" ? "border-sky-200 bg-sky-50/70" : "border-violet-200 bg-violet-50/70",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">{value}</p>
    </div>
  );
}
