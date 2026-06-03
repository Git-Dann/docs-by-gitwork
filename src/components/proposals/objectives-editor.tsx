"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { IconSelect } from "@/components/proposals/icon-select";
import { DragHandle, SortableList, SortableRow, reorder } from "@/components/proposals/sortable-list";
import type { ObjectiveItem } from "@/types/proposal";

export function ObjectivesEditor({
  items,
  onChange,
}: {
  items: ObjectiveItem[];
  onChange: (items: ObjectiveItem[]) => void;
}) {
  const safeItems = items ?? [];
  const ids = safeItems.map((item, index) => item.id ?? `obj-${index}`);

  return (
    <div className="space-y-4">
      {safeItems.length ? (
        <SortableList ids={ids} onReorder={(from, to) => onChange(reorder(safeItems, from, to))}>
          <div className="space-y-4">
            {safeItems.map((item, index) => (
              <SortableRow key={ids[index]} id={ids[index]}>
                {({ handleProps }) => (
                  <article className="space-y-4 border-b border-[rgba(0,0,0,0.08)] pb-4">
                    <div className="grid gap-3 lg:grid-cols-[auto_220px_minmax(0,1fr)_auto]">
                      <div className="flex items-start pt-7">
                        <DragHandle {...handleProps} />
                      </div>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">Title</span>
                  <input
                    value={item.title}
                    onChange={(event) =>
                      onChange(
                        safeItems.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      )
                    }
                    className="app-input"
                    placeholder={`Objective ${index + 1}`}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">Description</span>
                  <textarea
                    value={item.description}
                    onChange={(event) =>
                      onChange(
                        safeItems.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, description: event.target.value } : entry,
                        ),
                      )
                    }
                    rows={3}
                    className="app-textarea min-h-[92px]"
                    placeholder="Describe the outcome this objective supports."
                  />
                </label>

                <div className="flex items-start justify-end pt-7">
                  <Button
                    type="button"
                    onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                    variant="utility"
                    size="icon-md"
                    className="text-rose-600 hover:text-rose-700"
                    aria-label="Delete objective"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Icon (optional)</span>
                <IconSelect
                  value={item.icon}
                  onChange={(icon) =>
                    onChange(
                      safeItems.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, icon } : entry,
                      ),
                    )
                  }
                      />
                    </label>
                  </article>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableList>
      ) : (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No objectives yet.
        </p>
      )}
    </div>
  );
}
