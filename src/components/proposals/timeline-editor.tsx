"use client";

import { useState } from "react";
import { ChevronDownIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { EditorSectionHeader, editorId } from "@/components/proposals/editor-primitives";
import type { PaymentScheduleRow, TimelinePhaseInput } from "@/types/proposal";

// ⚠️ `name`, `duration` and `summary` are all `z.string().min(1)` server-side
// (timelinePhaseSchema) — a phase with any of the three blank fails validation on the very next
// autosave, and since one PATCH saves the whole document, that one bad phase blocks every other
// edit from persisting too, silently, until it's fixed or removed. Seed non-empty placeholders so
// a freshly added phase is valid the instant it's created, before the author has touched a field.
function newPhase(sortOrder: number, viewMode: "LIST" | "MILESTONE"): TimelinePhaseInput {
  return {
    id: editorId(),
    name: "New phase",
    duration: "TBC",
    summary: "Describe what happens in this phase.",
    deliverables: [],
    sortOrder,
    viewMode,
  };
}

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

  // Accordion: at most one phase open at a time — a card's fields only matter while you're
  // editing that phase, and with six-plus phases a wall of open forms is what this replaces.
  // Defaults to the first phase open rather than everything collapsed, so opening the block
  // doesn't read as empty.
  const [openIndex, setOpenIndex] = useState<number | null>(sorted.length ? 0 : null);

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
    setOpenIndex((current) => {
      if (current === null || current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function addPhase() {
    const next = [...sorted, newPhase(sorted.length, viewMode)];
    onChange({ viewMode, phases: next });
    // The new phase is what you're here to fill in — open it, closing whatever was open before.
    setOpenIndex(next.length - 1);
  }

  return (
    <div className="space-y-3">
      <EditorSectionHeader
        label="Phases"
        action={
          <button
            type="button"
            onClick={addPhase}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
          >
            + Add phase
          </button>
        }
      />

      {sorted.length ? (
        <div className="space-y-3">
          {sorted.map((phase, index) => {
            const isOpen = openIndex === index;
            const shortTitle = phase.name.trim() || `Phase ${index + 1}`;
            return (
              <article
                key={phase.id ?? `${phase.name}-${index}`}
                className="@container overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-xs)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${shortTitle}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-1)]">
                    {shortTitle}
                  </span>
                  {phase.duration ? (
                    <span className="shrink-0 text-xs uppercase tracking-[0.1em] text-[var(--text-4)]">
                      {phase.duration}
                    </span>
                  ) : null}
                  <ChevronDownIcon
                    className={`h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="border-t border-[var(--border-3)] px-4 py-4">
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

                    <label className="mt-3 block space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-2)]">Summary</span>
                      <textarea
                        value={phase.summary}
                        onChange={(event) => updatePhase(index, { summary: event.target.value })}
                        className="app-input"
                        rows={2}
                        placeholder="Discovery, data model, and a pivot to consuming the client's own data instead of a public API."
                      />
                    </label>

                    <label className="mt-3 block space-y-1.5">
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
                  </div>
                ) : null}

                {/* Bottom-left, so it's reachable whether the card is open or collapsed — a phase
                    doesn't need to be expanded to be removed. */}
                <div className="flex items-center justify-start border-t border-[var(--border-3)] px-2 py-1.5">
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
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-white px-4 py-10 text-center text-sm text-[var(--text-4)] shadow-[var(--shadow-xs)]">
          Add a phase to build the delivery timeline.
        </div>
      )}
    </div>
  );
}
