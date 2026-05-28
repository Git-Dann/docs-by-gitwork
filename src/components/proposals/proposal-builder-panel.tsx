"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { ProposalSectionEditor } from "@/components/proposals/proposal-section-editor";
import { Button } from "@/components/ui/button";
import type {
  ObjectiveItem,
  ProposalDocument,
  ProposalSection,
  TimelinePhaseInput,
  TouchpointItem,
} from "@/types/proposal";

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
      <article className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">07 // BUILDER</span>
          <span className="widget-header-right">IDLE</span>
        </div>
        <div className="widget-body">
          <p className="text-sm text-[var(--text-3)]">No section selected.</p>
        </div>
      </article>
    );
  }

  const sectionIndex = proposal.sections.findIndex((section) => {
    return (section.id ?? section.key) === activeEntry.id;
  });

  function createDraftId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  }

  let headerAction: ReactNode = null;

  if (sectionIndex >= 0) {
    if (activeSection.key === "objectives") {
      const data = activeSection.data as { items?: ObjectiveItem[] };
      headerAction = (
        <Button
          type="button"
          variant="secondary"
          size="md"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() =>
            onProposalChange({
              ...proposal,
              sections: proposal.sections.map((entry, index) =>
                index === sectionIndex
                  ? {
                      ...entry,
                      data: {
                        ...data,
                        items: [
                          ...(data.items ?? []),
                          {
                            id: createDraftId(),
                            title: "",
                            description: "",
                            icon: "sparkles",
                          } satisfies ObjectiveItem,
                        ],
                      },
                    }
                  : entry,
              ),
            })
          }
        >
          Add
        </Button>
      );
    }

    if (activeSection.key === "touchpoints") {
      const data = activeSection.data as { items?: TouchpointItem[] };
      headerAction = (
        <Button
          type="button"
          variant="secondary"
          size="md"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() =>
            onProposalChange({
              ...proposal,
              sections: proposal.sections.map((entry, index) =>
                index === sectionIndex
                  ? {
                      ...entry,
                      data: {
                        ...data,
                        items: [
                          ...(data.items ?? []),
                          {
                            id: createDraftId(),
                            title: "",
                            summary: "",
                            features: [],
                            notes: "",
                            callout: "",
                          } satisfies TouchpointItem,
                        ],
                      },
                    }
                  : entry,
              ),
            })
          }
        >
          Add
        </Button>
      );
    }

    if (activeSection.key === "timeline") {
      const data = activeSection.data as { viewMode?: "LIST" | "MILESTONE" };
      const nextSortOrder = [...proposal.timelinePhases].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ).length;

      headerAction = (
        <Button
          type="button"
          variant="secondary"
          size="md"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() =>
            onProposalChange({
              ...proposal,
              timelinePhases: [
                ...proposal.timelinePhases,
                {
                  id: createDraftId(),
                  name: "",
                  duration: "",
                  summary: "",
                  deliverables: [],
                  sortOrder: nextSortOrder,
                  viewMode: data.viewMode ?? "LIST",
                } satisfies TimelinePhaseInput,
              ],
            })
          }
        >
          Add
        </Button>
      );
    }
  }

  const moduleNumber = String((activeEntry?.order ?? sectionIndex + 1) || 1).padStart(2, "0");
  const moduleLabel = activeSection.title.toUpperCase();

  return (
    <article className="proposal-form-theme widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">{moduleNumber} {"// "}{moduleLabel}</span>
        <span className="widget-header-right">BUILDER</span>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h3 className="font-[family-name:var(--font-display)] text-[28px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)]">
              {activeSection.title}
            </h3>
            {activeSection.description ? (
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                {activeSection.description}
              </p>
            ) : null}
          </div>

          {headerAction ? <div className="pt-1">{headerAction}</div> : null}
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
      </div>
    </article>
  );
}
