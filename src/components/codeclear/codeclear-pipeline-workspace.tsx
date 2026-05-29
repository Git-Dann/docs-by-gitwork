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
import { setCandidateCurrentClients } from "@/lib/api";
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

// Drag id is "<candidateId>::<sourceColumnId>" — we need to know which
// placement is being moved, since a dev can appear in multiple columns.
function makeDragId(candidateId: string, columnId: string) {
  return `${candidateId}::${columnId}`;
}

function parseDragId(dragId: string): { candidateId: string; columnId: string } | null {
  const idx = dragId.indexOf("::");
  if (idx === -1) return null;
  return { candidateId: dragId.slice(0, idx), columnId: dragId.slice(idx + 2) };
}

/**
 * Pipeline reframed as a client-engagement board with multi-client support.
 *
 * Columns are Portal clients + an "Unassigned" column. A dev appears in
 * every column they're currently engaged with — dragging a card from one
 * column to another MOVES the placement (closes the source, opens the
 * target). To add a dev to a second client without removing the first,
 * use the Current-client picker on the registry table or profile page.
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

  // Optimistic overrides: candidateId -> set of clientIds currently assigned.
  // Updated synchronously on drag end before the API call lands.
  const [optimistic, setOptimistic] = useState<Record<string, string[]>>({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Resolve each candidate's effective client set (optimistic beats stored).
  const effectiveClientIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const candidate of candidates) {
      const override = optimistic[candidate.id];
      if (override !== undefined) {
        map.set(candidate.id, override);
      } else {
        map.set(
          candidate.id,
          candidate.currentClients
            .map((entry) => entry.id)
            .filter((id): id is string => id !== null),
        );
      }
    }
    return map;
  }, [candidates, optimistic]);

  // For each column, list the candidates assigned to it. Unassigned column
  // shows candidates whose effective client set is empty.
  const grouped = useMemo(() => {
    const map = new Map<string, CodeClearCandidateListItem[]>();
    for (const candidate of candidates) {
      const assigned = effectiveClientIds.get(candidate.id) ?? [];
      if (assigned.length === 0) {
        const list = map.get(UNASSIGNED_COLUMN_ID) ?? [];
        list.push(candidate);
        map.set(UNASSIGNED_COLUMN_ID, list);
      } else {
        for (const clientId of assigned) {
          const list = map.get(clientId) ?? [];
          list.push(candidate);
          map.set(clientId, list);
        }
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => rosterIndexFor(a.name) - rosterIndexFor(b.name));
    }
    return map;
  }, [candidates, effectiveClientIds]);

  // Column order: clients with assigned devs first, then empty clients,
  // then Unassigned at the end. Alpha within each tier.
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

  const activeContext = activeDragId ? parseDragId(activeDragId) : null;
  const activeCandidate = activeContext
    ? candidates.find((entry) => entry.id === activeContext.candidateId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const dragId = String(event.active.id);
    setActiveDragId(null);

    const parsed = parseDragId(dragId);
    if (!parsed || !event.over) return;
    const { candidateId, columnId: sourceColumnId } = parsed;

    const overRaw = String(event.over.id);
    // Dropping over a column → that column. Dropping over a card → use the
    // column the card's drag id was minted in.
    let targetColumnId: string;
    if (columns.find((column) => column.id === overRaw)) {
      targetColumnId = overRaw;
    } else {
      const overParsed = parseDragId(overRaw);
      targetColumnId = overParsed ? overParsed.columnId : UNASSIGNED_COLUMN_ID;
    }

    if (sourceColumnId === targetColumnId) return;

    const current = effectiveClientIds.get(candidateId) ?? [];
    // Move semantics: drop the source column from the assigned set, add
    // the target (unless target is Unassigned). Order is preserved.
    let next = current.filter((id) => id !== sourceColumnId);
    if (targetColumnId !== UNASSIGNED_COLUMN_ID && !next.includes(targetColumnId)) {
      next = [...next, targetColumnId];
    }

    // Optimistic
    setOptimistic((prev) => ({ ...prev, [candidateId]: next }));

    try {
      await setCandidateCurrentClients(candidateId, next);
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidates"] });
      queryClient.invalidateQueries({ queryKey: ["codeclear", "candidate", candidateId] });
    } catch (error) {
      setOptimistic((prev) => {
        const fresh = { ...prev };
        delete fresh[candidateId];
        return fresh;
      });
      console.error("Failed to update placements", error);
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
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
        sits right now. A dev appears in every client they&apos;re engaged with — drag a card
        between columns to <em>move</em> the placement (close one, open another). To add a dev
        to a <em>second</em> client without removing the first, use the picker on the registry
        table or profile page. Click a card to open the full profile.
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
              activeDragId={activeDragId}
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
  activeDragId,
  onCardClick,
}: {
  column: { id: string; name: string };
  candidates: CodeClearCandidateListItem[];
  activeDragId: string | null;
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
          candidates.map((candidate) => {
            const dragId = makeDragId(candidate.id, column.id);
            return (
              <DraggablePipelineCard
                key={dragId}
                dragId={dragId}
                candidate={candidate}
                isDragging={activeDragId === dragId}
                onClick={() => onCardClick(candidate.id)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function DraggablePipelineCard({
  dragId,
  candidate,
  isDragging,
  onClick,
}: {
  dragId: string;
  candidate: CodeClearCandidateListItem;
  isDragging: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: dragId });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  if (isDragging) {
    return (
      <div className="h-[72px] rounded-[8px] border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-1)] opacity-50" />
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
          {candidate.currentClients.length > 1 ? (
            <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-4)]">
              +{candidate.currentClients.length - 1} other
              {candidate.currentClients.length - 1 === 1 ? "" : "s"}
            </p>
          ) : null}
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
