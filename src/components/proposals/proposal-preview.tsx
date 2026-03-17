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
  const exportSettings = proposal.exportSettings as Record<string, unknown> | undefined;
  const includeCover = exportSettings?.includeCover !== false;
  const includeSupportingLinks = exportSettings?.includeSupportingLinks !== false;
  const includeAssumptions = exportSettings?.includeAssumptions !== false;
  const includeOutOfScope = exportSettings?.includeOutOfScope !== false;
  const includeFooter = exportSettings?.includeFooter !== false;
  const visibleSections = sortedSections.filter((section) => {
    if (section.key === "cover" && !includeCover) {
      return false;
    }
    if (section.key === "supporting_links_assets" && !includeSupportingLinks) {
      return false;
    }
    if (section.key === "assumptions" && !includeAssumptions) {
      return false;
    }
    if (section.key === "out_of_scope" && !includeOutOfScope) {
      return false;
    }
    if (section.key === "signoff_footer" && !includeFooter) {
      return false;
    }
    return true;
  });

  const documentBody = (
    <article className={frame ? "rounded-xl border border-[var(--border-1)] bg-white p-6 sm:p-8" : "space-y-8"}>
      <div className="space-y-8">
        {visibleSections.map((section, index) => (
          <ProposalSectionPreview
            key={section.id ?? `${section.key}-${index}`}
            section={section}
            proposal={proposal}
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
        <aside className="sticky top-4 hidden h-fit rounded-xl border border-[var(--border-1)] bg-white p-4 xl:block">
          <TableOfContents sections={visibleSections} />
        </aside>

        {documentBody}
      </div>
    </div>
  );
}
