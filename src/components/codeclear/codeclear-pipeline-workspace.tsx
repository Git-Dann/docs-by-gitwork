"use client";

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
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setCandidateCurrentClient } from "@/lib/api";
import { useCodeClearCandidates } from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import { rosterIndexFor } from "@/lib/gitwork-roster";
import {
  CodeClearTabs,
  EmptyState,
  RosterScoreChip,
  RosterTierBadge,
} from "@/components/codeclear/codeclear-shared";
import { useQueryClient } from "@tanstack/react-query";
import type { CodeClearCandidateListItem } from "@/types/codeclear";

const UNASSIGNED_COLUMN_ID = "__unassigned__";

/**
 * Pipeline reframed as a client-engagement board.
 *
 * Columns are Portal clients + an "Unassigned" column. Dragging a dev card
 * across columns reassigns their current Portal client (closes any open
 * Placement, opens a new one if the target column is a real client). Click
 * a card to open the full profile page.
 *
 * Older versions of this view were a stage-based kanban (Sourced / Invited /
 * Assessment / Verified / Placed). That mental model lives in the Candidates
 * registry now — Pipeline is purely about "who's where with whom".
 */
export function CodeClearPipelineWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const candidatesQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 200,
    sortBy: "createdAt",
    sortDir: "desc",
  });
  const clientsQuery = useClientList();
  const clients = useMemo(
    () => clientsQuery.data?.clients ?? [],
    [clientsQuery.data],
  );
  const candidates = useMemo(
    () => candidatesQuery.data?.items ?? [],
    [candidatesQuery.data],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  // Optimistic local map: candidateId -> currentClientId (or UNASSIGNED).
  // Lets the card jump columns instantly while the API call lands.
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  const activeCandidate = activeId
    ? candidates.find((entry) => entry.id === activeId) ?? null
    : null;

  // Group candidates by effective client (optimistic value beats stored).
  const grouped = useMemo(() => {
    const map = new Map<string, CodeClearCandidateListItem[]>();
    for (const candidate of candidates) {
      const optimisticClient = optimistic[candidate.id];
      const clientId =
        optimisticClient !== undefined
          ? optimisticClient
          : candidate.currentClient?.id ?? UNASSIGNED_COLUMN_ID;
      const list = map.get(clientId) ?? [];
      list.push(candidate);
      map.set(clientId, list);
    }
    // Sort each column by canonical roster order so the familiar core
    // team appears first wherever they're placed.
    for (const list of map.values()) {
      list.sort((a, b) => rosterIndexFor(a.name) - rosterIndexFor(b.name));
    }
    return map;
  }, [candidates, optimistic]);

  // Column order: clients with at least one assigned dev, then clients with
  // none, then Unassigned. Within each tier, alphabetical.
  const columns = useMemo(() => {
    const withClients: Array<{ id: string; name: string }> = clients.map(
      (client) => ({ id: client.id, name: client.name }),
    );
    withClients.sort((a, b) => {
      const aHas = (grouped.get(a.id)?.length ?? 0) > 0;
      const bHas = (grouped.get(b.id)?.length ?? 0) > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return [
      ...withClients,
      { id: UNASSIGNED_COLUMN_ID, name: "Unassigned" },
    ];
  }, [clients, grouped]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    setActiveId(null);

    if (!event.over) return;
    const overRaw = String(event.over.id);

    // Drop target can be a column (its id is a clientId or UNASSIGNED) OR
    // another card. If it's a card, use its column.
    const overColumnId = columns.find((column) => column.id === overRaw)
      ? overRaw
      : (candidates.find((entry) => entry.id === overRaw)?.currentClient?.id ??
          UNASSIGNED_COLUMN_ID);

    const dragged = candidates.find((entry) => entry.id === draggedId);
    if (!dragged) return;

    const currentColumnId =
      optimistic[draggedId] !== undefined
        ? optimistic[draggedId]
        : dragged.currentClient?.id ?? UNASSIGNED_COLUMN_ID;

    if (currentColumnId === overColumnId) return;

    // Optimistic move
    setOptimistic((prev) => ({ ...prev, [draggedId]: overColumnId }));

    const clientIdForApi = overColumnId === UNASSIGNED_COLUMN_ID ? null : overColumnId;
    try {
      await setCandidateCurrentClient(draggedId, clientIdForApi);
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate", draggedId] });
    } catch (error) {
      // Roll back on failure
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[draggedId];
        return next;
      });
      console.error("Failed to reassign current client", error);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  if (candidates.length === 0 && !candidatesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <CodeClearTabs />
        <EmptyState
          title="No devs in the pipeline yet"
          body="Add a dev in /app/codeclear/candidates and they'll appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-3)]">
        <span className="font-medium text-[var(--text-2)]">Pipeline</span> shows where every dev
        sits right now. Drag a card between columns to move them to a different client (or to
        Unassigned). Click a card to open the full profile.
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid auto-cols-[280px] grid-flow-col gap-3 overflow-x-auto pb-3">
          {columns.map((column) => (
            <PipelineColumn
              key={column.id}
              column={column}
              candidates={grouped.get(column.id) ?? []}
              activeId={activeId}
              onCardClick={(candidateId) =>
                router.push(`/app/codeclear/candidates/${candidateId}`)
              }
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCandidate ? <PipelineCard candidate={activeCandidate} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PipelineColumn({
  column,
  candidates,
  activeId,
  onCardClick,
}: {
  column: { id: string; name: string };
  candidates: CodeClearCandidateListItem[];
  activeId: string | null;
  onCardClick: (candidateId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const isUnassigned = column.id === UNASSIGNED_COLUMN_ID;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-[400px] flex-col rounded-[10px] border bg-white transition",
        isOver
          ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)]"
          : "border-[var(--border-2)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-2)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isUnassigned ? "bg-[var(--text-4)]" : "bg-emerald-500",
            )}
            aria-hidden
          />
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{column.name}</p>
        </div>
        <span className="font-mono text-[11px] text-[var(--text-4)]">{candidates.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {candidates.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center text-xs text-[var(--text-4)]">
            {isUnassigned ? "All assigned." : "Drop devs here."}
          </p>
        ) : (
          candidates.map((candidate) => (
            <DraggablePipelineCard
              key={candidate.id}
              candidate={candidate}
              isDragging={activeId === candidate.id}
              onClick={() => onCardClick(candidate.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DraggablePipelineCard({
  candidate,
  isDragging,
  onClick,
}: {
  candidate: CodeClearCandidateListItem;
  isDragging: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: candidate.id,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  if (isDragging) {
    // Ghost placeholder while the overlay handles the visual drag.
    return (
      <div className="rounded-[8px] border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-1)] opacity-50 h-[72px]" />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <PipelineCard candidate={candidate} listeners={listeners} onClick={onClick} />
    </div>
  );
}

function PipelineCard({
  candidate,
  listeners,
  onClick,
  isOverlay,
}: {
  candidate: CodeClearCandidateListItem;
  listeners?: ReturnType<typeof useDraggable>["listeners"];
  onClick?: () => void;
  isOverlay?: boolean;
}) {
  const score = candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore ?? null;
  return (
    <div
      className={cn(
        "group cursor-pointer rounded-[8px] border bg-white p-3 transition",
        isOverlay
          ? "rotate-[1deg] scale-[1.02] border-[var(--brand-500)] shadow-[0_16px_40px_rgba(29,78,216,0.18)]"
          : "border-[var(--border-2)] hover:border-[var(--border-1)]",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          type="button"
          {...(isOverlay ? {} : (listeners ?? {}))}
          aria-label="Drag to move dev"
          className="mt-0.5 grid h-5 w-4 cursor-grab grid-cols-2 gap-[3px] text-[var(--text-4)] hover:text-[var(--text-2)] active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="h-1 w-1 rounded-full bg-current" />
          ))}
        </button>

        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">{candidate.primaryStack}</p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <RosterTierBadge
            effectiveTier={candidate.effectiveTier}
            isOverridden={
              candidate.tierManualOverride !== null &&
              candidate.tierManualOverride !== candidate.tier
            }
          />
          <RosterScoreChip value={score} />
        </div>
      </div>
    </div>
  );
}

