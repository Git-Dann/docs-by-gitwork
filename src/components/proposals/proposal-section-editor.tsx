/**
 * Section-editor dispatcher. Looks up the editor for the active section in the registry and
 * renders it. The old switch statement (~500 lines of branches) is gone — adding a new section
 * type is now: define data shape → write a SectionType module → register it.
 */

"use client";

import { getSectionType } from "@/lib/sections/registry";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

export function ProposalSectionEditor({
  proposal,
  section,
  sectionIndex,
  onProposalChange,
}: {
  proposal: ProposalDocument;
  section: ProposalSection;
  sectionIndex: number;
  onProposalChange: (proposal: ProposalDocument) => void;
}) {
  const sectionType = getSectionType(section.key);

  if (!sectionType) {
    return (
      <div className="app-subtle-panel p-6 text-sm text-[var(--text-2)]">
        This section type ({section.key}) is not configured yet.
      </div>
    );
  }

  function updateSectionData(data: ProposalSection["data"]) {
    onProposalChange({
      ...proposal,
      sections: proposal.sections.map((entry, index) =>
        index === sectionIndex ? { ...entry, data } : entry,
      ),
    });
  }

  const Editor = sectionType.Editor;
  return (
    <Editor
      data={section.data}
      onChange={updateSectionData}
      proposal={proposal}
      sectionIndex={sectionIndex}
      onProposalChange={onProposalChange}
    />
  );
}
