"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { ProposalLinkInput } from "@/types/proposal";

const linkTypeOptions: ProposalLinkInput["type"][] = [
  "EXTERNAL_URL",
  "DECK_LINK",
  "DOCUMENT_LINK",
  "EMAIL_LINK",
  "INTERNAL_ROUTE",
];

export function LinkManager({
  links,
  onChange,
}: {
  links: ProposalLinkInput[];
  onChange: (links: ProposalLinkInput[]) => void;
}) {
  const safeLinks = links ?? [];

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="app-eyebrow">Links</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">Supporting links</p>
        </div>
        <Button
          type="button"
          onClick={() =>
            onChange([
              ...safeLinks,
              {
                label: "",
                url: "",
                type: "EXTERNAL_URL",
                notes: "",
                sortOrder: safeLinks.length,
              },
            ])
          }
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
        >
          Add link
        </Button>
      </div>

      {safeLinks.length ? (
        <div className="space-y-2">
          {safeLinks.map((link, index) => (
            <article
              key={`${link.id ?? "link"}-${index}`}
              className="rounded-[18px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_180px_auto]">
                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">Label</span>
                  <input
                    value={link.label}
                    onChange={(event) =>
                      onChange(
                        safeLinks.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label: event.target.value } : entry,
                        ),
                      )
                    }
                    className="app-input-compact"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">URL</span>
                  <input
                    value={link.url}
                    onChange={(event) =>
                      onChange(
                        safeLinks.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, url: event.target.value } : entry,
                        ),
                      )
                    }
                    className="app-input-compact"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">Type</span>
                  <select
                    value={link.type}
                    onChange={(event) =>
                      onChange(
                        safeLinks.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, type: event.target.value as ProposalLinkInput["type"] }
                            : entry,
                        ),
                      )
                    }
                    className="app-select-compact w-full text-sm"
                  >
                    {linkTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={() => onChange(safeLinks.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="sm"
                    leadingIcon={<TrashIcon className="h-3.5 w-3.5" />}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">Notes</span>
                <input
                  value={link.notes ?? ""}
                  onChange={(event) =>
                    onChange(
                      safeLinks.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                      ),
                    )
                  }
                  className="app-input-compact"
                />
              </label>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No links added yet.
        </p>
      )}
    </div>
  );
}
