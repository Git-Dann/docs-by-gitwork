import { TableOfContents } from "@/components/proposals/table-of-contents";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import { resolveProposalMergeVariables } from "@/lib/merge-variables";
import type { ProposalDocument } from "@/types/proposal";

export function ProposalPreview({
  proposal,
  className,
  showTableOfContents = true,
  frame = true,
  trackSections = false,
  activeSectionId,
  onSelectSection,
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
  /** Editor-only: id of the selected block (active ring). Omitted on public/print → read-only. */
  activeSectionId?: string | null;
  /** Editor-only: click a rendered block to select it. Omitted on public/print → read-only. */
  onSelectSection?: (id: string) => void;
}) {
  // Substitute merge variables ({{client_name}}, {{total}}, …) for the rendered/exported view.
  // The editor's section forms still show the raw tokens — only this render surface resolves them.
  const resolved = resolveProposalMergeVariables(proposal);
  const sortedSections = [...resolved.sections].sort((left, right) => left.sortOrder - right.sortOrder);
  const visibleSections = sortedSections.filter((section) => section.isVisible);

  const documentBody = (
    <article
      className={
        frame
          ? "proposal-document mx-auto w-full max-w-[840px] app-surface p-6 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0"
          : "proposal-document mx-auto w-full max-w-[840px] rounded-[10px] border border-[var(--border-2)] bg-white p-6 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0"
      }
    >
      <div className="space-y-10 print:space-y-8">
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
