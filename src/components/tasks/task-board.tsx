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
  type DragEndEvent,
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
        if (o && o.status === t.status) {
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

  async function handleDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    setActiveId(null);
    if (!event.over) return;

    const overRaw = String(event.over.id);
    const targetStatus = (TASK_STATUSES as string[]).includes(overRaw)
      ? (overRaw as TaskStatus)
      : statusByTaskId.get(overRaw);
    if (!targetStatus) return;

    const current = statusByTaskId.get(id);
    if (current === targetStatus) return;

    // Append to the end of the target column.
    const colTasks = byStatus.get(targetStatus) ?? [];
    const maxKey = colTasks.reduce((max, t) => Math.max(max, t.orderKey), 0);
    const orderKey = maxKey + 1;

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
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
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
}: {
  status: TaskStatus;
  index: number;
  tasks: TaskDTO[];
  showClient: boolean;
  onCardClick: (taskId: string) => void;
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
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {tasks.map((task) => (
          <BoardCard key={task.id} task={task} showClient={showClient} onClick={() => onCardClick(task.id)} />
        ))}
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
}: {
  task: TaskDTO;
  showClient: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
    >
      <TaskCard task={task} showClient={showClient} onClick={onClick} />
    </div>
  );
}
