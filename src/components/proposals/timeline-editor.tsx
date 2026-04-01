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

const phaseStarters = [
  { name: "Discovery", duration: "Weeks 1-2", summary: "Align on scope, users, and delivery plan." },
  { name: "Design and build", duration: "Weeks 3-8", summary: "Deliver the core product experience and supporting services." },
  { name: "QA and launch", duration: "Weeks 9-10", summary: "Test, refine, and prepare for release." },
] as const;

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

  function createPhase(starter?: Partial<TimelinePhaseInput>): TimelinePhaseInput {
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
      ...starter,
    };
  }

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
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-eyebrow">Timeline</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">Delivery timeline</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
            Build the proposal in phases. This is the clearest way to map back to Axis timeline details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              onChange({
                viewMode,
                phases: [...sorted, createPhase()],
              })
            }
            variant="secondary"
            size="sm"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add phase
          </Button>

          <select
            defaultValue=""
            onChange={(event) => {
              const index = Number(event.target.value);
              if (!Number.isNaN(index)) {
                const starter = phaseStarters[index];
                if (starter) {
                  onChange({
                    viewMode,
                    phases: [...sorted, createPhase(starter)],
                  });
                }
              }

              event.target.value = "";
            }}
            className="app-select-compact min-w-[220px] text-sm"
          >
            <option value="">Use starter...</option>
            {phaseStarters.map((starter, index) => (
              <option key={starter.name} value={index}>
                {starter.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={sorted.map((phase) => phase.id ?? phase.name)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {sorted.map((phase, index) => (
              <PhaseItem
                key={phase.id ?? `${phase.name}-${index}`}
                id={phase.id ?? phase.name}
                phase={phase}
                index={index}
                linkedMilestones={paymentSchedule.filter((entry) => entry.timelinePhaseId && entry.timelinePhaseId === phase.id)}
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
      className="rounded-[18px] border border-[var(--border-2)] bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
            Phase {index + 1}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="text-[var(--text-3)]"
            aria-label="Drag phase"
            {...attributes}
            {...listeners}
          >
            <Bars3Icon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={onRemove}
            variant="danger"
            size="icon-sm"
            aria-label="Remove phase"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FieldInput
          label="Phase name"
          value={phase.name}
          onChange={(name) => onChange({ name })}
          placeholder="Discovery"
        />
        <FieldInput
          label="Project window"
          value={phase.duration}
          onChange={(duration) => onChange({ duration })}
          placeholder="Weeks 1-2"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldTextArea
          label="What happens in this phase"
          value={phase.summary}
          onChange={(summary) => onChange({ summary })}
          rows={4}
          placeholder="Describe the work, decision points, or outputs in this phase."
        />
        <FieldTextArea
          label="Key deliverables"
          value={phase.deliverables.join("\n")}
          onChange={(next) =>
            onChange({
              deliverables: next
                .split("\n")
                .map((entry) => entry.trim())
                .filter(Boolean),
            })
          }
          rows={4}
          placeholder={"Discovery notes\nInteractive prototype\nLaunch checklist"}
        />
      </div>

      <div className="mt-4 rounded-[16px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
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
                className="rounded-[14px] border border-[var(--border-2)] bg-white px-3 py-2"
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
            Link a payment milestone to this phase in the payment schedule to keep delivery and commercials aligned.
          </p>
        )}
      </div>
    </article>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-[var(--text-3)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input-compact"
        placeholder={placeholder}
      />
    </label>
  );
}

function FieldTextArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-[var(--text-3)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="proposal-field-compact w-full"
        placeholder={placeholder}
      />
    </label>
  );
}
