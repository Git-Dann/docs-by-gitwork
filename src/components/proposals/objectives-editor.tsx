"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { IconSelect, getObjectiveIcon } from "@/components/proposals/icon-select";
import type { ObjectiveItem } from "@/types/proposal";

export function ObjectivesEditor({
  items,
  onChange,
}: {
  items: ObjectiveItem[];
  onChange: (items: ObjectiveItem[]) => void;
}) {
  const safeItems = items ?? [];

  function createObjective(overrides?: Partial<ObjectiveItem>) {
    return {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
      title: "",
      description: "",
      icon: "sparkles",
      ...overrides,
    };
  }

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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => onChange([...safeItems, createObjective()])}
          variant="secondary"
          size="md"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add
        </Button>
      </div>

      {safeItems.length ? (
        <div className="space-y-4">
          {safeItems.map((item, index) => (
            <article key={item.id ?? `${item.title}-${index}`} className="space-y-4 border-b border-[rgba(0,0,0,0.08)] pb-4 last:border-b-0 last:pb-0">
              <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
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

                <div className="flex items-start justify-end gap-1 pt-7">
                  <Button
                    type="button"
                    onClick={() => move(index, -1)}
                    variant="utility"
                    size="icon-md"
                    aria-label="Move objective up"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => move(index, 1)}
                    variant="utility"
                    size="icon-md"
                    aria-label="Move objective down"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
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

              <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">Icon</span>
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

                <div className="flex items-center gap-2 rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3 text-sm text-[var(--text-3)]">
                  {(() => {
                    const SelectedIcon = getObjectiveIcon(item.icon);
                    return <SelectedIcon className="h-4 w-4 text-[var(--brand-600)]" />;
                  })()}
                  <span>
                    Preview icon: <span className="font-medium text-[var(--text-2)]">{item.icon || "sparkles"}</span>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No objectives yet.
        </p>
      )}
    </div>
  );
}
