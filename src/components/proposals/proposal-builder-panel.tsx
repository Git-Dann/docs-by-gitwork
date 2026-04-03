"use client";

import { ProposalSectionEditor } from "@/components/proposals/proposal-section-editor";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

export function ProposalBuilderPanel({
  proposal,
  sections,
  activeId,
  onProposalChange,
}: {
  proposal: ProposalDocument;
  sections: Array<{ id: string; section: ProposalSection; order: number }>;
  activeId: string | null;
  onProposalChange: (proposal: ProposalDocument) => void;
}) {
  const activeEntry = sections.find((entry) => entry.id === activeId) ?? sections[0];
  const activeSection = activeEntry?.section;

  if (!activeSection) {
    return (
      <article className="app-card p-6">
        <p className="text-sm text-[var(--text-3)]">No section selected.</p>
      </article>
    );
  }

  const sectionIndex = proposal.sections.findIndex((section) => {
    return (section.id ?? section.key) === activeEntry.id;
  });

  return (
    <article className="proposal-form-theme app-card space-y-5 p-5 sm:p-6">
      <div>
        <h3 className="text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
          {activeSection.title}
        </h3>
        {activeSection.description ? (
          <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{activeSection.description}</p>
        ) : null}
      </div>

      <div className="pt-1">
        {sectionIndex >= 0 ? (
          <ProposalSectionEditor
            proposal={proposal}
            section={activeSection}
            sectionIndex={sectionIndex}
            onProposalChange={onProposalChange}
          />
        ) : (
          <p className="text-sm text-[var(--text-3)]">Unable to load section editor.</p>
        )}
      </div>
    </article>
  );
}
