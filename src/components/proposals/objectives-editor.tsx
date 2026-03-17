"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { ObjectiveItem } from "@/types/proposal";

const snippets = [
  {
    title: "Reduce proposal cycle time",
    description: "Decrease proposal drafting and review timeline by at least 40%.",
  },
  {
    title: "Increase consistency",
    description: "Standardize structure and language across all proposal outputs.",
  },
];

export function ObjectivesEditor({
  items,
  onChange,
}: {
  items: ObjectiveItem[];
  onChange: (items: ObjectiveItem[]) => void;
}) {
  const safeItems = items ?? [];

  function move(index: number, delta: -1 | 1) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= safeItems.length) {
      return;
    }

    const clone = [...safeItems];
    const [entry] = clone.splice(index, 1);
    clone.splice(targetIndex, 0, entry);
    onChange(clone);
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Objectives</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              onChange([
                ...safeItems,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  description: "",
                  icon: "",
                },
              ])
            }
            variant="secondary"
            size="xs"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add objective
          </Button>

          <select
            defaultValue=""
            onChange={(event) => {
              const index = Number(event.target.value);
              if (!Number.isNaN(index)) {
                const snippet = snippets[index];
                if (snippet) {
                  onChange([
                    ...safeItems,
                    {
                      id: crypto.randomUUID(),
                      title: snippet.title,
                      description: snippet.description,
                      icon: "",
                    },
                  ]);
                }
              }

              event.target.value = "";
            }}
            className="h-8 rounded-md border border-[var(--border-1)] bg-white px-2 text-xs"
          >
            <option value="">Use snippet...</option>
            {snippets.map((snippet, index) => (
              <option key={snippet.title} value={index}>
                {snippet.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {safeItems.length ? (
        <div className="space-y-2">
          {safeItems.map((item, index) => (
            <article key={item.id ?? `${item.title}-${index}`} className="rounded-md border border-[var(--border-1)] bg-white p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Title</span>
                  <input
                    value={item.title}
                    onChange={(event) =>
                      onChange(
                        safeItems.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Description</span>
                  <input
                    value={item.description}
                    onChange={(event) =>
                      onChange(
                        safeItems.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, description: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Icon</span>
                  <input
                    value={item.icon ?? ""}
                    onChange={(event) =>
                      onChange(
                        safeItems.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, icon: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <div className="flex items-end justify-end gap-1">
                  <Button
                    type="button"
                    onClick={() => move(index, -1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move objective up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => move(index, 1)}
                    variant="secondary"
                    size="icon-md"
                    aria-label="Move objective down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="icon-md"
                    aria-label="Delete objective"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-3)]">No objectives yet.</p>
      )}
    </div>
  );
}
