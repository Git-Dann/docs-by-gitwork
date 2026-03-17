"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bars3Icon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { TimelinePhaseInput } from "@/types/proposal";

export function TimelineEditor({
  phases,
  viewMode,
  onChange,
}: {
  phases: TimelinePhaseInput[];
  viewMode: "LIST" | "MILESTONE";
  onChange: (payload: { phases: TimelinePhaseInput[]; viewMode: "LIST" | "MILESTONE" }) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const sorted = [...phases].sort((left, right) => left.sortOrder - right.sortOrder);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sorted.findIndex((phase) => phase.id === active.id || phase.name === active.id);
    const newIndex = sorted.findIndex((phase) => phase.id === over.id || phase.name === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const reordered = arrayMove(sorted, oldIndex, newIndex).map((phase, index) => ({
      ...phase,
      sortOrder: index,
    }));

    onChange({
      phases: reordered,
      viewMode,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Timeline phases</p>
          <p className="text-xs text-[var(--text-3)]">Drag to reorder phases.</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={viewMode}
            onChange={(event) =>
              onChange({
                phases: sorted,
                viewMode: event.target.value as "LIST" | "MILESTONE",
              })
            }
            className="h-9 rounded-md border border-[var(--border-1)] bg-white px-2 text-xs"
          >
            <option value="LIST">Simple list</option>
            <option value="MILESTONE">Milestone timeline</option>
          </select>

          <Button
            type="button"
            onClick={() =>
              onChange({
                viewMode,
                phases: [
                  ...sorted,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    duration: "",
                    summary: "",
                    deliverables: [],
                    sortOrder: sorted.length,
                    viewMode,
                  },
                ],
              })
            }
            variant="secondary"
            size="sm"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add phase
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={sorted.map((phase) => phase.id ?? phase.name)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sorted.map((phase, index) => (
              <PhaseItem
                key={phase.id ?? `${phase.name}-${index}`}
                id={phase.id ?? phase.name}
                phase={phase}
                onChange={(patch) => {
                  const next = sorted.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, ...patch } : entry,
                  );

                  onChange({
                    viewMode,
                    phases: next,
                  });
                }}
                onRemove={() => {
                  const next = sorted
                    .filter((_, entryIndex) => entryIndex !== index)
                    .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex }));

                  onChange({
                    viewMode,
                    phases: next,
                  });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PhaseItem({
  id,
  phase,
  onChange,
  onRemove,
}: {
  id: string;
  phase: TimelinePhaseInput;
  onChange: (patch: Partial<TimelinePhaseInput>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="grid gap-2 rounded-md border border-[var(--border-1)] bg-white p-3 md:grid-cols-[auto_1fr_1fr_1fr_auto]"
    >
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="mt-1 text-[var(--text-3)]"
        aria-label="Drag phase"
        {...attributes}
        {...listeners}
      >
        <Bars3Icon className="h-4 w-4" />
      </Button>

      <label className="space-y-1">
        <span className="text-xs text-[var(--text-3)]">Phase name</span>
        <input
          value={phase.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-[var(--text-3)]">Duration</span>
        <input
          value={phase.duration}
          onChange={(event) => onChange({ duration: event.target.value })}
          className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-[var(--text-3)]">Summary</span>
        <input
          value={phase.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
          className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
        />
      </label>

      <Button
        type="button"
        onClick={onRemove}
        variant="danger"
        size="icon-sm"
        className="mt-1"
        aria-label="Remove phase"
      >
        <TrashIcon className="h-4 w-4" />
      </Button>

      <label className="space-y-1 md:col-start-2 md:col-end-6">
        <span className="text-xs text-[var(--text-3)]">Deliverables (comma separated)</span>
        <input
          value={phase.deliverables.join(", ")}
          onChange={(event) =>
            onChange({
              deliverables: event.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
            })
          }
          className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
        />
      </label>
    </article>
  );
}
