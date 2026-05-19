"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import type { TouchpointItem } from "@/types/proposal";

export function TouchpointEditor({
  items,
  onChange,
}: {
  items: TouchpointItem[];
  onChange: (items: TouchpointItem[]) => void;
}) {
  const safeItems = items ?? [];

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
    <div className="rounded-[18px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-xs)]">
      {safeItems.length ? (
        safeItems.map((touchpoint, index) => (
          <article
            key={touchpoint.id ?? `${touchpoint.title}-${index}`}
            className={cn("px-4 py-4", index > 0 ? "border-t border-[var(--border-3)]" : null)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3.5">
                <label className="block max-w-[180px] space-y-1.5">
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
                    className="proposal-field-compact min-h-[74px] w-full"
                    placeholder="Foundry by Gitwork is a template-driven platform for generating client-ready proposals and documentation from structured content blocks."
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
                    placeholder="Multi-step capture flow, Validation rules, Submission status tracking"
                  />
                </label>
              </div>

              <Button
                type="button"
                onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                variant="utility"
                size="icon-md"
                className="mt-7 text-rose-500 hover:text-rose-600"
                aria-label="Delete workstream"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          </article>
        ))
      ) : (
        <div className="px-4 py-10 text-sm text-[var(--text-4)]">Add a scope item to get started.</div>
      )}
    </div>
  );
}
