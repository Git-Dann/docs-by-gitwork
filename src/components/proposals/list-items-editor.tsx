"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
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
        <div className="space-y-2">
          {safeItems.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white p-3"
            >
              <input
                value={item}
                onChange={(event) =>
                  onChange(
                    safeItems.map((entry, entryIndex) =>
                        entryIndex === index ? event.target.value : entry,
                    ),
                  )
                }
                className="app-input-compact flex-1"
              />

              <Button
                type="button"
                onClick={() => move(index, -1)}
                variant="secondary"
                size="icon-md"
                aria-label="Move item up"
              >
                <ArrowUpIcon className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                onClick={() => move(index, 1)}
                variant="secondary"
                size="icon-md"
                aria-label="Move item down"
              >
                <ArrowDownIcon className="h-4 w-4" />
              </Button>

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
          ))}
        </div>
      ) : (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No items yet.
        </p>
      )}
    </div>
  );
}
