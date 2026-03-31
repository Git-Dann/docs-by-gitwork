"use client";

import { ArrowTopRightOnSquareIcon, LinkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { ProposalLinkInput } from "@/types/proposal";

const linkTypeOptions: Array<{ value: ProposalLinkInput["type"]; label: string; placeholder: string }> = [
  { value: "EXTERNAL_URL", label: "Website link", placeholder: "example.com" },
  { value: "DECK_LINK", label: "Deck link", placeholder: "pitch.com/..." },
  { value: "DOCUMENT_LINK", label: "Document link", placeholder: "docs.google.com/..." },
  { value: "EMAIL_LINK", label: "Email link", placeholder: "hello@gitwork.io" },
  { value: "INTERNAL_ROUTE", label: "Internal page", placeholder: "/app/proposals/123" },
];

export function LinkManager({
  links,
  onChange,
}: {
  links: ProposalLinkInput[];
  onChange: (links: ProposalLinkInput[]) => void;
}) {
  const safeLinks = links ?? [];

  function updateLink(index: number, patch: Partial<ProposalLinkInput>) {
    onChange(
      safeLinks.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-eyebrow">Links</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-1)]">Supporting links</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
            Add useful references the client may want to open alongside the proposal.
          </p>
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
        <div className="space-y-3">
          {safeLinks.map((link, index) => {
            const selectedType = linkTypeOptions.find((option) => option.value === link.type) ?? linkTypeOptions[0];

            return (
              <article
                key={`${link.id ?? "link"}-${index}`}
                className="rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-2)]">
                    <LinkIcon className="h-4 w-4 text-[var(--brand-600)]" />
                    {selectedType.label}
                  </div>
                  <Button
                    type="button"
                    onClick={() => onChange(safeLinks.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="icon-sm"
                    aria-label="Remove link"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-1.5">
                    <span className="text-xs text-[var(--text-3)]">Link label</span>
                    <input
                      value={link.label}
                      onChange={(event) => updateLink(index, { label: event.target.value })}
                      className="app-input-compact"
                      placeholder="Case study"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs text-[var(--text-3)]">Link type</span>
                    <select
                      value={link.type}
                      onChange={(event) =>
                        updateLink(index, {
                          type: event.target.value as ProposalLinkInput["type"],
                        })
                      }
                      className="app-select-compact w-full text-sm"
                    >
                      {linkTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">Destination</span>
                  <input
                    value={link.url}
                    onChange={(event) => updateLink(index, { url: event.target.value })}
                    onBlur={(event) =>
                      updateLink(index, {
                        url: normalizeLinkDestination(event.target.value, link.type),
                      })
                    }
                    className="app-input-compact"
                    placeholder={selectedType.placeholder}
                  />
                </label>

                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">Why it matters</span>
                  <input
                    value={link.notes ?? ""}
                    onChange={(event) => updateLink(index, { notes: event.target.value })}
                    className="app-input-compact"
                    placeholder="What this link helps explain or support"
                  />
                </label>

                <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-3)]">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--brand-600)]" />
                  <span>{selectedType.label}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No links added yet.
        </p>
      )}
    </div>
  );
}

function normalizeLinkDestination(value: string, type: ProposalLinkInput["type"]) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (type === "EMAIL_LINK") {
    if (trimmed.startsWith("mailto:")) {
      return trimmed;
    }

    return trimmed.includes("@") ? `mailto:${trimmed}` : trimmed;
  }

  if (type === "INTERNAL_ROUTE") {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
