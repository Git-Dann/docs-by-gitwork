"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
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
  void paymentSchedule;
  const sorted = [...phases].sort((left, right) => left.sortOrder - right.sortOrder);

  function updatePhase(index: number, patch: Partial<TimelinePhaseInput>) {
    onChange({
      viewMode,
      phases: sorted.map((phase, phaseIndex) =>
        phaseIndex === index
          ? {
              ...phase,
              ...patch,
            }
          : phase,
      ),
    });
  }

  function removePhase(index: number) {
    onChange({
      viewMode,
      phases: sorted
        .filter((_, phaseIndex) => phaseIndex !== index)
        .map((phase, phaseIndex) => ({
          ...phase,
          sortOrder: phaseIndex,
        })),
    });
  }

  return (
    <div className="space-y-4">
      {sorted.length ? (
        sorted.map((phase, index) => (
          <article
            key={phase.id ?? `${phase.name}-${index}`}
            className="@container rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-4 shadow-[var(--shadow-xs)]"
          >
            <div className="mb-3 flex items-center justify-end">
              <Button
                type="button"
                onClick={() => removePhase(index)}
                variant="utility"
                size="icon-md"
                className="text-rose-500 hover:text-rose-600"
                aria-label="Remove phase"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 @[26rem]:grid-cols-[minmax(0,1fr)_140px]">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Phase title</span>
                <input
                  value={phase.name}
                  onChange={(event) => updatePhase(index, { name: event.target.value })}
                  className="app-input"
                  placeholder="Discovery"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Duration</span>
                <input
                  value={phase.duration}
                  onChange={(event) => updatePhase(index, { duration: event.target.value })}
                  className="app-input"
                  placeholder="Week 1"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">
                Deliverables (comma separated)
              </span>
              <input
                value={phase.deliverables.join(", ")}
                onChange={(event) =>
                  updatePhase(index, {
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
          </article>
        ))
      ) : (
        <div className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-10 text-sm text-[var(--text-4)] shadow-[var(--shadow-xs)]">
          Add a phase to build the delivery timeline.
        </div>
      )}
    </div>
  );
}
