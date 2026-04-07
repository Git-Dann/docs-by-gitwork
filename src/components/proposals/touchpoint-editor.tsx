"use client";

import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { TouchpointItem } from "@/types/proposal";

export function TouchpointEditor({
  items,
  onChange,
}: {
  items: TouchpointItem[];
  onChange: (items: TouchpointItem[]) => void;
}) {
  const safeItems = items ?? [];

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
    <div className="space-y-4">
      {safeItems.length ? (
        <div className="space-y-4">
          {safeItems.map((touchpoint, index) => (
            <article
              key={touchpoint.id ?? `${touchpoint.title}-${index}`}
              className="space-y-4 rounded-[14px] border border-[var(--border-2)] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-full space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                    Workstream {index + 1}
                  </p>

                  <label className="block max-w-[280px] space-y-1.5">
                    <span className="text-sm font-medium text-[var(--text-2)]">Title</span>
                    <input
                      value={touchpoint.title}
                      onChange={(event) => patch(index, { title: event.target.value })}
                      className="app-input"
                      placeholder={`Scoping Item ${String(index + 1).padStart(3, "0")}`}
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-[var(--text-2)]">Description</span>
                    <textarea
                      value={touchpoint.summary}
                      onChange={(event) => patch(index, { summary: event.target.value })}
                      rows={3}
                      className="app-textarea min-h-[92px]"
                      placeholder="Describe the workstream or touchpoint."
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-[var(--text-2)]">
                      Features (comma separated)
                    </span>
                    <input
                      value={touchpoint.features.join(", ")}
                      onChange={(event) =>
                        patch(index, {
                          features: event.target.value
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        })
                      }
                      className="app-input"
                      placeholder="Multi-step capture flow, validation rules"
                    />
                  </label>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-2)]">Notes</span>
                      <input
                        value={touchpoint.notes ?? ""}
                        onChange={(event) => patch(index, { notes: event.target.value })}
                        className="app-input"
                        placeholder="Optional delivery note"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-2)]">Callout</span>
                      <input
                        value={touchpoint.callout ?? ""}
                        onChange={(event) => patch(index, { callout: event.target.value })}
                        className="app-input"
                        placeholder="Optional callout"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-1 pt-5">
                  <Button
                    type="button"
                    onClick={() => move(index, -1)}
                    variant="utility"
                    size="icon-md"
                    aria-label="Move workstream up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => move(index, 1)}
                    variant="utility"
                    size="icon-md"
                    aria-label="Move workstream down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))
                    }
                    variant="utility"
                    size="icon-md"
                    className="text-rose-600 hover:text-rose-700"
                    aria-label="Delete workstream"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No workstreams yet. Add a workstream to define in-scope delivery, outputs, and delivery
          notes.
        </p>
      )}
    </div>
  );
}
