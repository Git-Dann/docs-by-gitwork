"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { DragHandle, SortableList, SortableRow, reorder } from "@/components/proposals/sortable-list";

export function ListItemsEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const safeItems = items ?? [];

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="app-eyebrow">List</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">{title}</p>
        </div>
        <Button
          type="button"
          onClick={() => onChange([...safeItems, ""])}
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
        >
          Add item
        </Button>
      </div>

      {safeItems.length ? (
        <SortableList
          ids={safeItems.map((_, index) => String(index))}
          onReorder={(from, to) => onChange(reorder(safeItems, from, to))}
        >
          <div className="space-y-2">
            {safeItems.map((item, index) => (
              <SortableRow key={index} id={String(index)}>
                {({ handleProps }) => (
                  <div className="@container rounded-[10px] border border-[var(--border-2)] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <DragHandle {...handleProps} />
                      <Button
                        type="button"
                        onClick={() => onChange(safeItems.filter((_, entryIndex) => entryIndex !== index))}
                        variant="danger"
                        size="icon-md"
                        aria-label="Delete item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <input
                      value={item}
                      onChange={(event) =>
                        onChange(
                          safeItems.map((entry, entryIndex) =>
                            entryIndex === index ? event.target.value : entry,
                          ),
                        )
                      }
                      className="app-input-compact w-full"
                    />
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableList>
      ) : (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No items yet.
        </p>
      )}
    </div>
  );
}
