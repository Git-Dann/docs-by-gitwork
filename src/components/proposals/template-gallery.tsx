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
import { usePermissions } from "@/hooks/use-permissions";
import { allowedDocTypes } from "@/lib/templates";
import { DECK_TEMPLATES } from "@/lib/deck-templates";
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
  /**
   * `id` is the DocumentTemplate id, or null for DECK — decks have no template
   * row, so the choice travels as `deckTemplate` (a slug from
   * src/lib/deck-templates.ts) instead.
   */
  onPick: (template: {
    id: string | null;
    documentType: DocumentType;
    deckTemplate?: string | null;
  }) => void;
  /** The currently-chosen deck slug, so the row can show as selected. */
  selectedDeckTemplate?: string | null;
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
  "DECK",
  "ALL",
];

const CHIP_LABEL: Record<DocumentType | "ALL", string> = {
  PROPOSAL: "Proposal",
  HANDOVER: "Handover",
  REPORT: "Report",
  BRIEF: "Brief",
  DECK: "Deck",
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
  selectedDeckTemplate,
  initialFilter = "PROPOSAL",
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DocumentType | "ALL">(initialFilter);

  // Role-gate the doc types: developers only see/create the lightweight types. Recompute a valid
  // active filter rather than locking initial state (the account perms load asynchronously).
  const { canViewAdminDocTypes } = usePermissions();
  const allowedTypeSet = new Set<string>(allowedDocTypes(canViewAdminDocTypes));
  const effectiveFilter: DocumentType | "ALL" =
    filter === "ALL" || allowedTypeSet.has(filter) ? filter : "ALL";

  useEffect(() => {
    setLoading(true);
    void apiFetch<{ templates: TemplateRecord[] }>("/api/templates")
      .then((res) => setTemplates(res.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  // Role-gate first (never list admin templates to a developer), then apply the active filter,
  // then sort: Foundry stock first (canonical starting point), workspace customs after, defaults
  // pinned to the top within each group.
  const visibleTemplates = templates.filter((t) => allowedTypeSet.has(t.documentType));
  const filtered = (effectiveFilter === "ALL"
    ? visibleTemplates
    : visibleTemplates.filter((t) => t.documentType === effectiveFilter)
  )
    .slice()
    .sort((a, b) => {
      const aStock = a.workspaceId === null ? 1 : 0;
      const bStock = b.workspaceId === null ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  // Only show chips for types that actually have a (role-allowed) template seeded — keeps the strip
  // honest as the workspace grows/shrinks, and never offers an admin type to a developer.
  const availableTypes = new Set(visibleTemplates.map((t) => t.documentType));
  // DECK is always offered. Its templates are not DocumentTemplate rows — they
  // live in the Deck app and are catalogued in src/lib/deck-templates.ts — so the
  // "only show chips with a seeded template" rule would hide it forever.
  const visibleChips = CHIP_ORDER.filter(
    (chip) => chip === "ALL" || chip === "DECK" || availableTypes.has(chip as DocumentType),
  );

  // Clicking a type chip filters the gallery AND selects that type's template — so the create
  // form's documentType follows the chip even when the operator doesn't also click the row below.
  // (Previously the chip only filtered; hitting Create without an explicit row click silently fell
  // back to PROPOSAL — e.g. filtering to REPORT still produced a proposal.) Prefer the type's
  // default template, else the first available for that type. "ALL" is a pure filter, no auto-pick.
  function handleChipClick(chip: DocumentType | "ALL") {
    setFilter(chip);
    if (chip === "ALL") return;
    if (chip === "DECK") {
      // No DocumentTemplate to pick — the deck rows below carry the choice.
      onPick({ id: null, documentType: "DECK" });
      return;
    }
    const forType = templates.filter(
      (t) => allowedTypeSet.has(t.documentType) && t.documentType === chip,
    );
    const pick = forType.find((t) => t.isDefault) ?? forType[0];
    if (pick) onPick({ id: pick.id, documentType: pick.documentType });
  }

  return (
    <div>
      {/* Filter chips — sticky to the top of the gallery scroll container. The chip row owns
          its own padding + bottom border; the parent scroll container has no padding so
          `sticky top-0` lands the chip row flush against the scroll viewport edge with no
          content bleeding through above it. */}
      <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-[var(--border-2)] bg-[var(--surface-canvas)] px-3 py-2.5">
        {visibleChips.map((chip) => (
          <FilterChip key={chip} active={effectiveFilter === chip} onClick={() => handleChipClick(chip)}>
            {CHIP_LABEL[chip]}
          </FilterChip>
        ))}
      </div>

      {/* Dense list rows — one template per row so the operator can scan many at a glance and
          the modal doesn't get drowned in big cards. Padding lives here, not on the parent
          scroll container, so the sticky chip strip above stays flush. */}
      {effectiveFilter === "DECK" ? (
        <DeckTemplateRows selectedSlug={selectedDeckTemplate ?? null} onPick={onPick} />
      ) : loading ? (
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

/**
 * The deck catalogue, rendered in the same row shape as the DocumentTemplate
 * rows above so the gallery reads as one list whichever chip is active. Grouped
 * Delivery / Sales — the two are different jobs and the split is the fastest way
 * into the right half.
 */
function DeckTemplateRows({
  selectedSlug,
  onPick,
}: {
  selectedSlug: string | null;
  onPick: TemplateGalleryProps["onPick"];
}) {
  const groups: Array<{ label: string; house: "foundry" | "gitwork" }> = [
    { label: "Delivery", house: "foundry" },
    { label: "Sales", house: "gitwork" },
  ];
  return (
    <div className="p-3">
      {groups.map((group) => {
        const rows = DECK_TEMPLATES.filter((t) => t.house === group.house);
        if (rows.length === 0) return null;
        return (
          <div key={group.house} className="mb-3 last:mb-0">
            <p className="px-1 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              {group.label}
            </p>
            <ul className="space-y-1.5">
              {rows.map((tpl) => {
                const selected = tpl.slug === selectedSlug;
                return (
                  <li key={tpl.slug}>
                    <button
                      type="button"
                      onClick={() =>
                        onPick({ id: null, documentType: "DECK", deckTemplate: tpl.slug })
                      }
                      className={cn(
                        "group relative flex w-full items-start gap-3 rounded-[8px] border bg-white px-3 py-2.5 text-left transition",
                        selected
                          ? "border-[var(--brand-600)] ring-2 ring-[var(--brand-600)]/20"
                          : "border-[var(--border-2)] hover:border-[var(--border-1)] hover:shadow-[var(--shadow-xs)]",
                      )}
                    >
                      <span className="mt-0.5 inline-flex h-5 min-w-[52px] shrink-0 items-center justify-center rounded-[4px] bg-[var(--brand-200)] px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">
                        DECK
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="truncate text-sm font-medium text-[var(--text-1)]">{tpl.name}</p>
                          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                            {tpl.house === "gitwork" ? "GITWORK" : "FOUNDRY"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-3)]">{tpl.blurb}</p>
                        <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">
                          {tpl.slides} slides
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
