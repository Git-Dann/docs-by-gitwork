"use client";

import { useEffect, useMemo, useState } from "react";
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
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/format";
import { useMoveTask } from "@/hooks/use-tasks";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskDTO,
  type TaskStatus,
} from "@/types/tasks";
import { TaskCard } from "@/components/tasks/task-card";

type Override = { status: TaskStatus; orderKey: number };

// Both columns AND cards are droppable. When the pointer is within a card, prefer
// it over its column container so the drop lands at that card's position rather
// than always at the column's end.
const boardCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const card = hits.find((h) => !(TASK_STATUSES as string[]).includes(String(h.id)));
  return card ? [card] : hits;
};

export function TaskBoard({
  tasks,
  showClient = true,
  onCardClick,
}: {
  tasks: TaskDTO[];
  showClient?: boolean;
  onCardClick: (taskId: string) => void;
}) {
  const move = useMoveTask();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Drop an optimistic override once the refetched task matches it — keeps the
  // card from flickering back to its old column between the move and the refetch.
  useEffect(() => {
    setOverrides((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const t of tasks) {
        const o = next[t.id];
        if (o && o.status === t.status && o.orderKey === t.orderKey) {
          delete next[t.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  // Merge optimistic overrides over the fetched tasks.
  const merged = useMemo(
    () =>
      tasks.map((t) =>
        overrides[t.id] ? { ...t, status: overrides[t.id].status, orderKey: overrides[t.id].orderKey } : t,
      ),
    [tasks, overrides],
  );

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, TaskDTO[]>();
    for (const s of TASK_STATUSES) map.set(s, []);
    for (const t of merged) map.get(t.status)?.push(t);
    for (const s of TASK_STATUSES) {
      map.get(s)!.sort((a, b) => a.orderKey - b.orderKey || a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [merged]);

  const statusByTaskId = useMemo(() => {
    const m = new Map<string, TaskStatus>();
    for (const t of merged) m.set(t.id, t.status);
    return m;
  }, [merged]);

  const activeTask = activeId ? merged.find((t) => t.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    setActiveId(null);
    setOverId(null);
    if (!event.over) return;

    const overRaw = String(event.over.id);
    if (overRaw === id) return; // dropped on itself — no-op

    const overIsStatus = (TASK_STATUSES as string[]).includes(overRaw);
    const targetStatus = overIsStatus ? (overRaw as TaskStatus) : statusByTaskId.get(overRaw);
    if (!targetStatus) return;

    // Target column, sorted, minus the card being dragged.
    const col = (byStatus.get(targetStatus) ?? []).filter((t) => t.id !== id);

    // Land just before the card we dropped onto; if dropped on the column itself,
    // append to the end.
    let index = col.length;
    if (!overIsStatus) {
      const i = col.findIndex((t) => t.id === overRaw);
      if (i !== -1) index = i;
    }

    // Fractional key = midpoint between the neighbours at the drop position.
    const before = index > 0 ? col[index - 1].orderKey : null;
    const after = index < col.length ? col[index].orderKey : null;
    let orderKey: number;
    if (before !== null && after !== null) orderKey = (before + after) / 2;
    else if (before !== null) orderKey = before + 1;
    else if (after !== null) orderKey = after - 1;
    else orderKey = 1;

    const current = statusByTaskId.get(id);
    const currentKey = merged.find((t) => t.id === id)?.orderKey;
    if (current === targetStatus && currentKey === orderKey) return; // no change

    setOverrides((prev) => ({ ...prev, [id]: { status: targetStatus, orderKey } }));
    try {
      await move.mutateAsync({ id, status: targetStatus, orderKey });
      // The override is pruned by the effect above once the refetch reflects it.
    } catch {
      // Roll back on failure.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
    >
      <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
        {TASK_STATUSES.map((status, i) => (
          <BoardColumn
            key={status}
            status={status}
            index={i + 1}
            tasks={byStatus.get(status) ?? []}
            showClient={showClient}
            onCardClick={onCardClick}
            overId={overId}
            activeId={activeId}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} showClient={showClient} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  status,
  index,
  tasks,
  showClient,
  onCardClick,
  overId,
  activeId,
}: {
  status: TaskStatus;
  index: number;
  tasks: TaskDTO[];
  showClient: boolean;
  onCardClick: (taskId: string) => void;
  overId: string | null;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex max-h-full flex-col rounded-[10px] border bg-[var(--surface-1)] transition-colors",
        isOver ? "border-[var(--brand-400)] bg-[var(--surface-brand)]" : "border-[rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-3 py-2.5">
        <span
          className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {`${String(index).padStart(2, "0")} // ${TASK_STATUS_LABELS[status]}`}
        </span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
          {tasks.length}
        </span>
      </div>
      <div className="flex min-h-[120px] min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2">
        {tasks.map((task) => (
          <BoardCard
            key={task.id}
            task={task}
            showClient={showClient}
            onClick={() => onCardClick(task.id)}
            showIndicator={overId === task.id && activeId != null && activeId !== task.id}
          />
        ))}
        {/* Drop line when hovering the column's empty space → card appends to the end. */}
        {activeId != null && overId === status ? (
          <div className="h-0.5 rounded-full bg-[var(--brand-700)]" />
        ) : null}
        {tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-[var(--text-4)]">Drop tasks here</p>
        ) : null}
      </div>
    </section>
  );
}

function BoardCard({
  task,
  showClient,
  onClick,
  showIndicator = false,
}: {
  task: TaskDTO;
  showClient: boolean;
  onClick: () => void;
  showIndicator?: boolean;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: task.id });
  // Also a drop target, so a card dropped onto it lands at this card's position.
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id });
  const setRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  return (
    <div
      ref={setRef}
      className="relative"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
    >
      {/* Drop indicator — a stroke in the gap above this card (we insert before it). */}
      {showIndicator ? (
        <div className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-[var(--brand-700)]" />
      ) : null}
      <TaskCard task={task} showClient={showClient} onClick={onClick} />
    </div>
  );
}
