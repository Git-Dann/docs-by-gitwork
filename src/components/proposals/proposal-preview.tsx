import { TableOfContents } from "@/components/proposals/table-of-contents";
import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";
import type { ProposalDocument } from "@/types/proposal";

export function ProposalPreview({
  proposal,
  className,
  showTableOfContents = true,
  frame = true,
}: {
  proposal: ProposalDocument;
  className?: string;
  showTableOfContents?: boolean;
  frame?: boolean;
}) {
  const sortedSections = [...proposal.sections].sort((left, right) => left.sortOrder - right.sortOrder);
  const visibleSections = sortedSections.filter((section) => section.isVisible);

  const documentBody = (
    <article
      className={
        frame
          ? "proposal-document app-surface p-6 sm:p-8 print:rounded-none print:border-0 print:p-0"
          : "proposal-document rounded-[28px] border border-[var(--border-2)] bg-white p-6 sm:p-8 print:rounded-none print:border-0 print:p-0"
      }
    >
      <div className="space-y-10 print:space-y-8">
        {visibleSections.map((section, index) => (
          <ProposalSectionPreview
            key={section.id ?? `${section.key}-${index}`}
            section={section}
            proposal={proposal}
            index={index}
          />
        ))}
      </div>
    </article>
  );

  if (!showTableOfContents) {
    return <div className={className}>{documentBody}</div>;
  }

  return (
    <div className={className}>
      <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
        <aside className="app-card sticky top-4 hidden h-fit p-4 xl:block">
          <TableOfContents sections={visibleSections} />
        </aside>

        {documentBody}
      </div>
    </div>
  );
}
