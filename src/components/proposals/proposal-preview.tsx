import { TableOfContents } from "@/components/proposals/table-of-contents";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import { resolveProposalMergeVariables } from "@/lib/merge-variables";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

export function ProposalPreview({
  proposal,
  className,
  showTableOfContents = true,
  frame = true,
  trackSections = false,
  activeSectionId,
  onSelectSection,
  editable = false,
  onSectionChange,
}: {
  proposal: ProposalDocument;
  className?: string;
  showTableOfContents?: boolean;
  frame?: boolean;
  /**
   * Tag each section with data-doc-section attributes so the public engagement tracker can
   * measure per-section dwell. Off everywhere except the public /docs/[token] view, so the
   * editor and print DOM stay unchanged.
   */
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
  // Substitute merge variables ({{client_name}}, {{total}}, …) for the rendered/exported view.
  // In editable mode we render the RAW proposal so inline edits bind to the real template text
  // (and the operator sees the {{tokens}}), matching the old section forms.
  const resolved = editable ? proposal : resolveProposalMergeVariables(proposal);
  const sortedSections = [...resolved.sections].sort((left, right) => left.sortOrder - right.sortOrder);
  const visibleSections = sortedSections.filter((section) => section.isVisible);

  const documentBody = (
    <article
      className={
        frame
          ? "proposal-document mx-auto w-full max-w-[860px] rounded-[10px] border border-[var(--doc-line-soft)] p-8 shadow-[var(--shadow-sm)] sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
          : "proposal-document mx-auto w-full max-w-[860px] rounded-[10px] border border-[var(--doc-line-soft)] p-8 sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0"
      }
    >
      <div className="space-y-8 print:space-y-7">
        {visibleSections.map((section, index) =>
          trackSections ? (
            <div
              key={section.id ?? `${section.key}-${index}`}
              data-doc-section={section.key}
              data-doc-section-title={section.title}
            >
              <ProposalSectionPreview section={section} proposal={resolved} index={index} />
            </div>
          ) : (
            <ProposalSectionPreview
              key={section.id ?? `${section.key}-${index}`}
              section={section}
              proposal={resolved}
              index={index}
              activeSectionId={activeSectionId}
              onSelectSection={onSelectSection}
              editable={editable}
              onChange={
                onSectionChange
                  ? (next) => onSectionChange(section.id ?? section.key, next)
                  : undefined
              }
            />
          ),
        )}
      </div>
    </article>
  );

  if (!showTableOfContents) {
    return <div className={className}>{documentBody}</div>;
  }

  return (
    <div className={className}>
      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,840px)] xl:justify-center">
        <aside className="app-card sticky top-4 hidden h-fit p-4 xl:block">
          <TableOfContents sections={visibleSections} />
        </aside>

        {documentBody}
      </div>
    </div>
  );
}
