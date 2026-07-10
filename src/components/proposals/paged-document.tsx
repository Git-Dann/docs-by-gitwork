/**
 * Real A4-paged document renderer — splits sections via `paginateSections` (deterministic,
 * author-driven: cover + explicit page-break dividers only, never a height guess) and renders
 * each page as its own `.doc-a4-page` sheet. Used wherever a document needs "clear A4 sized
 * separations" instead of one continuous scroll: print, public share, and the internal preview's
 * paged view. Pure — safe to render server-side (no client-only hooks), unlike the editor
 * canvas's `PaginatedSectionList` seam guide.
 */

import { paginateSections } from "@/lib/proposal-pagination";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

export function PagedDocument({
  proposal,
  sections,
  trackSections = false,
}: {
  proposal: ProposalDocument;
  sections: ProposalSection[];
  /** Tag each section with data-doc-section attributes for the public engagement tracker. */
  trackSections?: boolean;
}) {
  const pages = paginateSections(sections);

  return (
    <div className="doc-a4-stack">
      {pages.map((pageSections, pageIndex) => {
        const isCoverPage = pageSections.length === 1 && pageSections[0].key === "cover";
        return (
          <div key={pageIndex} className="doc-a4-page">
            <div
              className={
                isCoverPage ? "doc-a4-page__inner doc-a4-page__inner--cover" : "doc-a4-page__inner space-y-8"
              }
            >
              {pageSections.map((section, index) =>
                trackSections ? (
                  <div
                    key={section.id ?? `${section.key}-${index}`}
                    data-doc-section={section.key}
                    data-doc-section-title={section.title}
                  >
                    <ProposalSectionPreview section={section} proposal={proposal} index={index} />
                  </div>
                ) : (
                  <ProposalSectionPreview
                    key={section.id ?? `${section.key}-${index}`}
                    section={section}
                    proposal={proposal}
                    index={index}
                  />
                ),
              )}
            </div>
            {!isCoverPage ? (
              <div className="doc-a4-page__number print:hidden" aria-hidden="true">
                Page {pageIndex + 1} of {pages.length}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
