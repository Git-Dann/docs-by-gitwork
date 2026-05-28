/**
 * Visual template gallery (P3.12). Replaces the 3-pill doc-type picker on the create-document
 * modal with a card grid of all available templates — seeded Foundry stock + workspace-owned.
 *
 * Picking a card sets both the documentType and the templateId on the create form, so the new
 * doc spins up from that exact template (not just the type's default).
 */

"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/format";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import type { DocumentType, SectionKey } from "@/types/proposal";

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
  /** Optional doc-type filter; "ALL" shows every template. */
  initialFilter?: DocumentType | "ALL";
}

const TYPE_LABEL: Record<DocumentType, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  OTHER: "Document",
};

export function TemplateGallery({
  selectedTemplateId,
  onPick,
  initialFilter = "ALL",
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

  const filtered = filter === "ALL" ? templates : templates.filter((t) => t.documentType === filter);
  const docTypes = Array.from(new Set(templates.map((t) => t.documentType)));

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
          All
        </FilterChip>
        {docTypes.map((type) => (
          <FilterChip key={type} active={filter === type} onClick={() => setFilter(type)}>
            {type}
          </FilterChip>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-sm text-[var(--text-3)]">Loading templates…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No templates match this filter.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((template) => {
            const sections = Array.isArray(template.sections)
              ? (template.sections as Array<{ key?: string; title?: string }>)
              : [];
            const selected = template.id === selectedTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onPick({ id: template.id, documentType: template.documentType })}
                className={cn(
                  "group relative flex flex-col gap-2 rounded-[10px] border bg-white p-4 text-left transition",
                  selected
                    ? "border-[var(--brand-600)] ring-2 ring-[var(--brand-600)]/20"
                    : "border-[var(--border-2)] hover:border-[var(--border-1)] hover:shadow-[var(--shadow-xs)]",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                    {template.documentType}
                  </span>
                  {template.isDefault ? (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      DEFAULT
                    </span>
                  ) : template.workspaceId === null ? (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      FOUNDRY
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                      WORKSPACE
                    </span>
                  )}
                </div>

                <p className="font-[family-name:var(--font-display)] text-[18px] leading-[1.2] text-[var(--text-1)]">
                  {template.name}
                </p>

                {template.description ? (
                  <p className="text-[12px] leading-[1.5] text-[var(--text-3)]">
                    {template.description}
                  </p>
                ) : null}

                {/* Mini section preview */}
                <div className="mt-1 flex flex-wrap gap-1">
                  {sections.slice(0, 6).map((s, i) => {
                    const reg = SECTION_REGISTRY[s.key as SectionKey];
                    const Icon = reg?.icon;
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] text-[var(--text-3)]"
                        title={s.title ?? s.key}
                      >
                        {Icon ? <Icon className="h-3 w-3" /> : null}
                        {reg?.displayName ?? s.title ?? s.key}
                      </span>
                    );
                  })}
                  {sections.length > 6 ? (
                    <span className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] text-[var(--text-4)]">
                      +{sections.length - 6}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] text-[var(--text-4)]">
                    {sections.length} sections · {template.documentCount} used
                  </span>
                  <span className="text-[11px] text-[var(--text-4)]">{TYPE_LABEL[template.documentType]}</span>
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
