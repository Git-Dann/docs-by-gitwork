"use client";

import {
  Bars3Icon,
  EyeIcon,
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
import { useBulkUpdateCodeClearCandidates, useCodeClearCandidates } from "@/hooks/use-codeclear";
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
  StackPill,
} from "@/components/codeclear/codeclear-shared";
import { CodeClearCandidateDrawer } from "@/components/codeclear/codeclear-candidate-drawer";
import { cn, formatDate } from "@/lib/format";

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

    if (!overId) {
      return;
    }

    const candidate = candidates.find((item) => item.id === activeId);
    const targetStatus = PIPELINE_STATUSES.find((item) => item.value === overId)?.value;

    if (!candidate || !targetStatus || candidate.status === targetStatus) {
      return;
    }

    bulkUpdate.mutate({
      action: "MOVE_STAGE",
      ids: [candidate.id],
      status: targetStatus,
    });
  }

  return (
    <div className="space-y-6">
      <CodeClearTabs />

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
  const { isOver, setNodeRef } = useDroppable({
    id: status,
  });

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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      className={cn(
        "rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]",
        isDragging ? "opacity-70" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
          <p className="mt-1 truncate text-sm text-[var(--text-4)]">@{candidate.githubHandle}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-2)] text-[var(--text-4)]"
          {...attributes}
          {...listeners}
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StackPill label={candidate.primaryStack} tone="brand" />
        <CodeClearTierBadge tier={candidate.tier} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CodeClearAnalysisBadge state={candidate.analysisState} />
        <CodeClearScoreBadge
          value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
        />
      </div>

      <p className="mt-3 text-xs text-[var(--text-4)]">Updated {formatDate(candidate.updatedAt)}</p>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<EyeIcon className="h-4 w-4" />}
          onClick={() => onOpen(candidate.id)}
        >
          Open
        </Button>
      </div>
    </div>
  );
}
