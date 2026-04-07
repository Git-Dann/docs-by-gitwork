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
import type { PaymentScheduleRow, TimelinePhaseInput } from "@/types/proposal";

export function TimelineEditor({
  phases,
  paymentSchedule,
  viewMode,
  onChange,
}: {
  phases: TimelinePhaseInput[];
  paymentSchedule: PaymentScheduleRow[];
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

  function createPhase(initialValues?: Partial<TimelinePhaseInput>): TimelinePhaseInput {
    return {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
      name: "",
      duration: "",
      summary: "",
      deliverables: [],
      sortOrder: sorted.length,
      viewMode,
      ...initialValues,
    };
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sorted.findIndex(
      (phase) => phase.id === active.id || phase.name === active.id,
    );
    const newIndex = sorted.findIndex(
      (phase) => phase.id === over.id || phase.name === over.id,
    );

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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() =>
            onChange({
              viewMode,
              phases: [...sorted, createPhase()],
            })
          }
          variant="secondary"
          size="md"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={sorted.map((phase) => phase.id ?? phase.name)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {sorted.map((phase, index) => (
              <PhaseItem
                key={phase.id ?? `${phase.name}-${index}`}
                id={phase.id ?? phase.name}
                phase={phase}
                index={index}
                linkedMilestones={paymentSchedule.filter(
                  (entry) => entry.timelinePhaseId && entry.timelinePhaseId === phase.id,
                )}
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
  index,
  linkedMilestones,
  onChange,
  onRemove,
}: {
  id: string;
  phase: TimelinePhaseInput;
  index: number;
  linkedMilestones: PaymentScheduleRow[];
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
      className="rounded-[14px] border border-[var(--border-2)] bg-white px-4 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
            Phase {index + 1}
          </p>

          <div className="mt-3 flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="utility"
              size="icon-md"
              className="mt-7 text-[var(--text-3)]"
              aria-label="Drag phase"
              {...attributes}
              {...listeners}
            >
              <Bars3Icon className="h-4 w-4" />
            </Button>

            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Phase title</span>
                <input
                  value={phase.name}
                  onChange={(event) => onChange({ name: event.target.value })}
                  className="app-input"
                  placeholder="Discovery"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Duration</span>
                <input
                  value={phase.duration}
                  onChange={(event) => onChange({ duration: event.target.value })}
                  className="app-input"
                  placeholder="Week 1"
                />
              </label>
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={onRemove}
          variant="utility"
          size="icon-md"
          className="mt-7 text-rose-600 hover:text-rose-700"
          aria-label="Remove phase"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">
            Deliverables (comma separated)
          </span>
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
            className="app-input"
            placeholder="Discovery brief, implementation plan"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Summary</span>
          <textarea
            value={phase.summary}
            onChange={(event) => onChange({ summary: event.target.value })}
            rows={3}
            className="app-textarea min-h-[92px]"
            placeholder="Describe the work, decision points, or outputs in this phase."
          />
        </label>
      </div>

      <div className="mt-4 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
            Linked milestones
          </p>
          <span className="text-xs text-[var(--text-3)]">
            {linkedMilestones.length ? `${linkedMilestones.length} linked` : "None linked yet"}
          </span>
        </div>

        {linkedMilestones.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {linkedMilestones.map((milestone) => (
              <div
                key={milestone.id}
                className="rounded-[12px] border border-[var(--border-2)] bg-white px-3 py-2"
              >
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {milestone.action || "Milestone"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {milestone.periodCovered || phase.duration || "Timeline to confirm"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-3)]">
            Link a payment milestone to this phase in the payment schedule to keep delivery and
            commercials aligned.
          </p>
        )}
      </div>
    </article>
  );
}
