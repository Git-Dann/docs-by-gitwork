/**
 * Drag-to-reorder primitives for in-section repeating items (Phase 2b-ii).
 *
 * A thin, accessible wrapper over @dnd-kit (already used by the outline) so the list editors
 * (objectives, links, list items, …) get drag-and-drop with a keyboard fallback, replacing the
 * up/down arrow buttons. Pointer drags need a 5px move to start, so clicking inside a row's
 * inputs never begins a drag.
 *
 * Usage:
 *   <SortableList ids={ids} onReorder={(from, to) => onChange(reorder(items, from, to))}>
 *     {items.map((item, i) => (
 *       <SortableRow key={ids[i]} id={ids[i]}>
 *         {({ handleProps, isDragging }) => (
 *           <div>… <DragHandle {...handleProps} /> …</div>
 *         )}
 *       </SortableRow>
 *     ))}
 *   </SortableList>
 */

"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Re-exported so editors don't import @dnd-kit directly. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  return arrayMove(items, from, to);
}

type HandleProps = Record<string, unknown>;

export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (args: { handleProps: HandleProps; isDragging: boolean }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? "relative" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

/** A 6-dot grab handle. Spread the row's `handleProps` onto it. */
export function DragHandle({ className, ...handleProps }: { className?: string } & HandleProps) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className={
        className ??
        "inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] active:cursor-grabbing"
      }
      {...handleProps}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="3" r="1.4" />
        <circle cx="8" cy="3" r="1.4" />
        <circle cx="2" cy="8" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="2" cy="13" r="1.4" />
        <circle cx="8" cy="13" r="1.4" />
      </svg>
    </button>
  );
}
