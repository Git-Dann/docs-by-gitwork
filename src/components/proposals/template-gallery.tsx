/**
 * Visual template gallery (P3.12). Replaces the 3-pill doc-type picker on the create-document
 * modal with a card grid of available templates — seeded Foundry stock + workspace-owned.
 *
 * Picking a card sets both the documentType and the templateId on the create form, so the new
 * doc spins up from that exact template (not just the type's default).
 *
 * Filter default is "PROPOSAL" rather than "ALL" so the modal stays scannable now that we seed
 * seven Gitwork stock templates by default. The operator clicks the doc-type chip they want
 * (or "All" for the full library view).
 */

"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/format";
import type { DocumentType } from "@/types/proposal";

interface TemplateRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  documentType: DocumentType;
  isDefault: boolean;
  sections: unknown;
  workspaceId: string | null;
  documentCount: number;
}

interface TemplateGalleryProps {
  selectedTemplateId: string | null;
  onPick: (template: { id: string; documentType: DocumentType }) => void;
  /** Optional doc-type filter; "ALL" shows every template. Defaults to "PROPOSAL". */
  initialFilter?: DocumentType | "ALL";
}

const TYPE_LABEL: Record<DocumentType, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  OTHER: "Document",
};

/**
 * Order chips deliberately: the most-used doc type first, then commercial contracts grouped
 * together, then catch-all. "All" sits at the end so the default scan starts with the relevant
 * doc type, not with an undifferentiated grid of everything.
 */
const CHIP_ORDER: Array<DocumentType | "ALL"> = [
  "PROPOSAL",
  "SLA",
  "SOW",
  "MSA",
  "NDA",
  "CO",
  "DSA",
  "OTHER",
  "ALL",
];

const CHIP_LABEL: Record<DocumentType | "ALL", string> = {
  PROPOSAL: "Proposal",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "Change Order",
  DSA: "DSA",
  OTHER: "Other",
  ALL: "All",
};

export function TemplateGallery({
  selectedTemplateId,
  onPick,
  initialFilter = "PROPOSAL",
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DocumentType | "ALL">(initialFilter);

  useEffect(() => {
    setLoading(true);
    void apiFetch<{ templates: TemplateRecord[] }>("/api/templates")
      .then((res) => setTemplates(res.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  // Filter, then sort: Foundry stock first (canonical starting point), workspace customs after,
  // defaults pinned to the top within each group.
  const filtered = (filter === "ALL" ? templates : templates.filter((t) => t.documentType === filter))
    .slice()
    .sort((a, b) => {
      const aStock = a.workspaceId === null ? 1 : 0;
      const bStock = b.workspaceId === null ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  // Only show chips for types that actually have a template seeded — keeps the strip honest as
  // the workspace grows or shrinks its library.
  const availableTypes = new Set(templates.map((t) => t.documentType));
  const visibleChips = CHIP_ORDER.filter(
    (chip) => chip === "ALL" || availableTypes.has(chip as DocumentType),
  );

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {visibleChips.map((chip) => (
          <FilterChip key={chip} active={filter === chip} onClick={() => setFilter(chip)}>
            {CHIP_LABEL[chip]}
          </FilterChip>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-sm text-[var(--text-3)]">Loading templates…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No templates yet for this type.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((template) => {
            const sections = Array.isArray(template.sections)
              ? (template.sections as Array<{ key?: string; title?: string }>)
              : [];
            const selected = template.id === selectedTemplateId;
            const sourceBadge = template.workspaceId === null ? "FOUNDRY" : "WORKSPACE";

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onPick({ id: template.id, documentType: template.documentType })}
                className={cn(
                  "group relative flex flex-col gap-1.5 rounded-[10px] border bg-white p-3.5 text-left transition",
                  selected
                    ? "border-[var(--brand-600)] ring-2 ring-[var(--brand-600)]/20"
                    : "border-[var(--border-2)] hover:border-[var(--border-1)] hover:shadow-[var(--shadow-xs)]",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                    {template.documentType}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {template.isDefault ? (
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                        DEFAULT
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      {sourceBadge}
                    </span>
                  </span>
                </div>

                <p className="font-[family-name:var(--font-display)] text-[17px] leading-[1.2] text-[var(--text-1)]">
                  {template.name}
                </p>

                {template.description ? (
                  <p className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--text-3)]">
                    {template.description}
                  </p>
                ) : null}

                <div className="mt-1 flex items-baseline justify-between text-[11px] text-[var(--text-4)]">
                  <span>{TYPE_LABEL[template.documentType]}</span>
                  <span>
                    {sections.length} section{sections.length === 1 ? "" : "s"}
                    {template.documentCount > 0 ? ` · ${template.documentCount} used` : ""}
                  </span>
                </div>

                {selected ? (
                  <CheckCircleIcon className="absolute right-3 top-3 h-5 w-5 text-[var(--brand-600)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[6px] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition",
        active
          ? "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)]"
          : "border-[var(--border-2)] bg-white text-[var(--text-4)] hover:border-[var(--border-1)] hover:text-[var(--text-2)]",
      )}
    >
      {children}
    </button>
  );
}
