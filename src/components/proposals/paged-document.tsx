/**
 * Real A4-paged document renderer — splits sections via `paginateSections` (deterministic,
 * author-driven: cover + explicit page-break dividers only, never a height guess) and renders
 * each page as its own `.doc-a4-page` sheet. Used everywhere a document is shown — the editor
 * canvas (with the editor props below wired through for inline editing), print, public share, and
 * the internal preview — so the builder shows exactly what will print/ship, on the same pages.
 * Pure aside from the editable-mode callbacks, so it's still safe to render server-side.
 *
 * Every non-cover page carries a quiet running header (Gitwork · client · doc number) and footer
 * (doc type/version · date · page X of Y) inside its own margin box — the cover already carries
 * this metadata boldly via its own masthead, so it's skipped there to avoid doubling up.
 */

import { formatDate } from "@/lib/format";
import { paginateSections } from "@/lib/proposal-pagination";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

const DOC_TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  OTHER: "Document",
};

function isCoverPage(pageSections: ProposalSection[]): boolean {
  return pageSections.length === 1 && pageSections[0].key === "cover";
}

export function PagedDocument({
  proposal,
  sections,
  trackSections = false,
  activeSectionId,
  onSelectSection,
  editable = false,
  onSectionChange,
}: {
  proposal: ProposalDocument;
  sections: ProposalSection[];
  /** Tag each section with data-doc-section attributes for the public engagement tracker. */
  trackSections?: boolean;
  /** Editor-only: id of the selected block (active highlight). Omitted on public/print. */
  activeSectionId?: string | null;
  /** Editor-only: click a non-inline block to open its inspector. Omitted on public/print. */
  onSelectSection?: (id: string) => void;
  /** Editor-only: the canvas is editable — text-first blocks render inline-editable fields. */
  editable?: boolean;
  /** Editor-only: write a block's data back to the draft (inline editing). */
  onSectionChange?: (sectionId: string, next: ProposalSection["data"]) => void;
}) {
  const pages = paginateSections(sections);
  const contentPageCount = pages.filter((p) => !isCoverPage(p)).length;
  const docTypeLabel = DOC_TYPE_LABEL[proposal.documentType] ?? "Document";
  const dateFmt = formatDate(proposal.updatedAt);
  let contentPageNumber = 0;

  return (
    <div className="doc-a4-stack">
      {pages.map((pageSections, pageIndex) => {
        const cover = isCoverPage(pageSections);
        if (!cover) contentPageNumber += 1;

        const body = pageSections.map((section, index) => {
          const preview = (
            <ProposalSectionPreview
              section={section}
              proposal={proposal}
              index={index}
              activeSectionId={activeSectionId}
              onSelectSection={onSelectSection}
              editable={editable}
              onChange={
                onSectionChange ? (next) => onSectionChange(section.id ?? section.key, next) : undefined
              }
            />
          );
          return trackSections ? (
            <div
              key={section.id ?? `${section.key}-${index}`}
              data-doc-section={section.key}
              data-doc-section-title={section.title}
            >
              {preview}
            </div>
          ) : (
            <div key={section.id ?? `${section.key}-${index}`}>{preview}</div>
          );
        });

        if (cover) {
          return (
            <div key={pageIndex} className="doc-a4-page">
              <div className="doc-a4-page__inner doc-a4-page__inner--cover">{body}</div>
            </div>
          );
        }

        return (
          <div key={pageIndex} className="doc-a4-page">
            <div className="doc-a4-page__margin">
              <header className="doc-a4-page__header">
                <span className="truncate">
                  GITWORK{proposal.clientName ? ` · ${proposal.clientName}` : ""}
                </span>
                <span className="shrink-0">{proposal.documentNumber ?? proposal.title}</span>
              </header>
              <div className="doc-a4-page__body space-y-8">{body}</div>
              <footer className="doc-a4-page__footer">
                <span className="truncate">
                  {docTypeLabel}
                  {proposal.version ? ` · ${proposal.version}` : ""}
                </span>
                <span className="shrink-0">
                  {dateFmt} · Page {contentPageNumber} of {contentPageCount}
                </span>
              </footer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
