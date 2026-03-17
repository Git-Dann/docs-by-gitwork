"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { TouchpointItem } from "@/types/proposal";

const touchpointSnippets = [
  "Authentication and profiles",
  "Onboarding and consent",
  "Submission engine",
  "Therapist / operator dashboard",
  "Response delivery",
  "Admin dashboard",
  "Payments and discounts",
  "Re-engagement system",
  "Partner SDK / integrations",
];

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
    <div className="space-y-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Scope / touchpoints</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              onChange([
                ...safeItems,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  summary: "",
                  features: [],
                  notes: "",
                  callout: "",
                },
              ])
            }
            variant="secondary"
            size="xs"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add touchpoint
          </Button>

          <select
            defaultValue=""
            onChange={(event) => {
              const title = event.target.value;
              if (title) {
                onChange([
                  ...safeItems,
                  {
                    id: crypto.randomUUID(),
                    title,
                    summary: "",
                    features: [],
                    notes: "",
                    callout: "",
                  },
                ]);
              }

              event.target.value = "";
            }}
            className="h-8 rounded-md border border-[var(--border-1)] bg-white px-2 text-xs"
          >
            <option value="">Add snippet...</option>
            {touchpointSnippets.map((snippet) => (
              <option key={snippet} value={snippet}>
                {snippet}
              </option>
            ))}
          </select>
        </div>
      </div>

      {safeItems.length ? (
        <div className="space-y-3">
          {safeItems.map((touchpoint, index) => (
            <article key={touchpoint.id ?? `${touchpoint.title}-${index}`} className="space-y-2 rounded-md border border-[var(--border-1)] bg-white p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Title</span>
                  <input
                    value={touchpoint.title}
                    onChange={(event) => patch(index, { title: event.target.value })}
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Summary</span>
                  <input
                    value={touchpoint.summary}
                    onChange={(event) => patch(index, { summary: event.target.value })}
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <div className="flex items-end justify-end gap-1">
                  <Button
                    type="button"
                    onClick={() => move(index, -1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move touchpoint up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => move(index, 1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move touchpoint down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="icon-md"
                    aria-label="Delete touchpoint"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-[var(--text-3)]">Features (comma separated)</span>
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
                  className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                />
              </label>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Notes</span>
                  <input
                    value={touchpoint.notes ?? ""}
                    onChange={(event) => patch(index, { notes: event.target.value })}
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Callout</span>
                  <input
                    value={touchpoint.callout ?? ""}
                    onChange={(event) => patch(index, { callout: event.target.value })}
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-3)]">No touchpoints yet.</p>
      )}
    </div>
  );
}
