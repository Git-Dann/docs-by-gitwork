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
      <article className="rounded-2xl border border-[var(--border-1)] bg-white p-6">
        <p className="text-sm text-[var(--text-3)]">No section selected.</p>
      </article>
    );
  }

  const sectionIndex = proposal.sections.findIndex((section) => {
    return (section.id ?? section.key) === activeEntry.id;
  });

  return (
    <article className="proposal-form-theme space-y-5 rounded-2xl border border-[var(--border-1)] bg-white p-6">
      <div className="border-b border-[var(--border-1)] pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">Builder</p>
          <h3 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text-1)]">{activeSection.title}</h3>
        </div>
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
