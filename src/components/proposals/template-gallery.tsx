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

/**
 * Order chips deliberately: the most-used doc type first, then commercial contracts grouped
 * together, then catch-all. "All" sits at the end so the default scan starts with the relevant
 * doc type, not with an undifferentiated grid of everything.
 */
const CHIP_ORDER: Array<DocumentType | "ALL"> = [
  "PROPOSAL",
  "HANDOVER",
  "REPORT",
  "BRIEF",
  "OTHER",
  "SLA",
  "SOW",
  "MSA",
  "NDA",
  "CO",
  "DSA",
  "ALL",
];

const CHIP_LABEL: Record<DocumentType | "ALL", string> = {
  PROPOSAL: "Proposal",
  HANDOVER: "Handover",
  REPORT: "Report",
  BRIEF: "Brief",
  OTHER: "Blank",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "Change Order",
  DSA: "DSA",
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
    <div>
      {/* Filter chips — sticky to the top of the gallery scroll container. The chip row owns
          its own padding + bottom border; the parent scroll container has no padding so
          `sticky top-0` lands the chip row flush against the scroll viewport edge with no
          content bleeding through above it. */}
      <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-[var(--border-2)] bg-[var(--surface-canvas)] px-3 py-2.5">
        {visibleChips.map((chip) => (
          <FilterChip key={chip} active={filter === chip} onClick={() => setFilter(chip)}>
            {CHIP_LABEL[chip]}
          </FilterChip>
        ))}
      </div>

      {/* Dense list rows — one template per row so the operator can scan many at a glance and
          the modal doesn't get drowned in big cards. Padding lives here, not on the parent
          scroll container, so the sticky chip strip above stays flush. */}
      {loading ? (
        <p className="px-3 py-3 text-sm text-[var(--text-3)]">Loading templates…</p>
      ) : filtered.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[var(--text-3)]">No templates yet for this type.</p>
      ) : (
        <ul className="space-y-1.5 p-3">
          {filtered.map((template) => {
            const sections = Array.isArray(template.sections)
              ? (template.sections as Array<{ key?: string; title?: string }>)
              : [];
            const selected = template.id === selectedTemplateId;
            const sourceBadge = template.workspaceId === null ? "FOUNDRY" : "WORKSPACE";

            return (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({ id: template.id, documentType: template.documentType })
                  }
                  className={cn(
                    "group relative flex w-full items-start gap-3 rounded-[8px] border bg-white px-3 py-2.5 text-left transition",
                    selected
                      ? "border-[var(--brand-600)] ring-2 ring-[var(--brand-600)]/20"
                      : "border-[var(--border-2)] hover:border-[var(--border-1)] hover:shadow-[var(--shadow-xs)]",
                  )}
                >
                  <span className="mt-0.5 inline-flex h-5 min-w-[52px] shrink-0 items-center justify-center rounded-[4px] bg-[var(--brand-200)] px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">
                    {template.documentType}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">
                        {template.name}
                      </p>
                      {template.isDefault ? (
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                          DEFAULT
                        </span>
                      ) : null}
                      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                        {sourceBadge}
                      </span>
                    </div>
                    {template.description ? (
                      <p className="mt-0.5 truncate text-[11px] leading-[1.4] text-[var(--text-3)]">
                        {template.description}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-[var(--text-4)]">
                      {sections.length} section{sections.length === 1 ? "" : "s"}
                      {template.documentCount > 0 ? ` · used ${template.documentCount}×` : ""}
                    </p>
                  </div>
                  {selected ? (
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-600)]" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
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
