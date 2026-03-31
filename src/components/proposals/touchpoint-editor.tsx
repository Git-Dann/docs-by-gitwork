"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { TouchpointItem } from "@/types/proposal";

const touchpointStarters = [
  "Discovery and planning",
  "Product and UX design",
  "Core app delivery",
  "Backend and integrations",
  "QA and launch readiness",
] as const;

export function TouchpointEditor({
  items,
  onChange,
}: {
  items: TouchpointItem[];
  onChange: (items: TouchpointItem[]) => void;
}) {
  const safeItems = items ?? [];

  function createWorkstream(title = ""): TouchpointItem {
    return {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
      title,
      summary: "",
      features: [],
      notes: "",
      callout: "",
    };
  }

  function move(index: number, delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= safeItems.length) {
      return;
    }

    const clone = [...safeItems];
    const [entry] = clone.splice(index, 1);
    clone.splice(nextIndex, 0, entry);
    onChange(clone);
  }

  function patch(index: number, updates: Partial<TouchpointItem>) {
    onChange(
      safeItems.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...updates,
            }
          : entry,
      ),
    );
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-eyebrow">Scope</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">Scope & delivery</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
            Use one card per workstream. This is the clearest match to Axis scope, deliverables, and delivery approach.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => onChange([...safeItems, createWorkstream()])}
            variant="secondary"
            size="xs"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add workstream
          </Button>

          <select
            defaultValue=""
            onChange={(event) => {
              const title = event.target.value;
              if (title) {
                onChange([...safeItems, createWorkstream(title)]);
              }
              event.target.value = "";
            }}
            className="app-select-compact min-w-[220px] text-sm"
          >
            <option value="">Use starter...</option>
            {touchpointStarters.map((starter) => (
              <option key={starter} value={starter}>
                {starter}
              </option>
            ))}
          </select>
        </div>
      </div>

      {safeItems.length ? (
        <div className="space-y-3">
          {safeItems.map((touchpoint, index) => (
            <article
              key={touchpoint.id ?? `${touchpoint.title}-${index}`}
              className="rounded-[18px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                    Workstream {index + 1}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    onClick={() => move(index, -1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move workstream up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => move(index, 1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move workstream down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="icon-md"
                    aria-label="Delete workstream"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <FieldInput
                  label="Workstream title"
                  value={touchpoint.title}
                  onChange={(title) => patch(index, { title })}
                  placeholder="Core app delivery"
                />
                <FieldInput
                  label="Included scope"
                  value={touchpoint.summary}
                  onChange={(summary) => patch(index, { summary })}
                  placeholder="What this workstream covers"
                />
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <FieldTextArea
                  label="Key deliverables"
                  value={touchpoint.features.join("\n")}
                  onChange={(next) =>
                    patch(index, {
                      features: next
                        .split("\n")
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={"Wireframes\nAcceptance criteria\nQA-ready build"}
                  rows={5}
                />
                <div className="space-y-3">
                  <FieldTextArea
                    label="Delivery notes"
                    value={touchpoint.notes ?? ""}
                    onChange={(notes) => patch(index, { notes })}
                    placeholder="Dependencies, handoffs, or implementation notes"
                    rows={3}
                  />
                  <FieldInput
                    label="Optional callout"
                    value={touchpoint.callout ?? ""}
                    onChange={(callout) => patch(index, { callout })}
                    placeholder="Anything worth highlighting in the proposal"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No workstreams yet. Add a workstream to define in-scope delivery, outputs, and delivery notes.
        </p>
      )}
    </div>
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
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
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
