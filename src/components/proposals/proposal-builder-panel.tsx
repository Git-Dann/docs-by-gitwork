"use client";

import { PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useState, type ReactNode } from "react";
import { ProposalSectionEditor } from "@/components/proposals/proposal-section-editor";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
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
  const sectionType = SECTION_REGISTRY[activeSection.key];
  const aiExpandable = sectionType?.aiExpandable === true;

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

          <div className="flex items-center gap-2 pt-1">
            {aiExpandable ? (
              <AiExpandControl
                documentId={proposal.id}
                sectionKey={activeSection.key}
                onApplied={onProposalChange}
              />
            ) : null}
            {headerAction}
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
      </div>
    </article>
  );
}

/**
 * Per-section "Expand with AI" control.
 *
 * Compact button → click to open an inline instruction box → submit calls the section-AI
 * endpoint and patches the local draft. Designed to live in the builder panel header next to
 * the existing "Add" action.
 */
function AiExpandControl({
  documentId,
  sectionKey,
  onApplied,
}: {
  documentId: string;
  sectionKey: string;
  onApplied: (next: ProposalDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (instruction.trim().length < 2) {
      setError("Add a short instruction so the model knows what to change.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ proposal: ProposalDocument }>(
        `/api/documents/${documentId}/ai/section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionKey, instruction: instruction.trim() }),
        },
      );
      onApplied(res.proposal);
      setOpen(false);
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        leadingIcon={<SparklesIcon className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Expand with AI
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--brand-300)] bg-[var(--brand-200)]/30 p-3" style={{ minWidth: 280 }}>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        className="app-textarea"
        rows={2}
        placeholder="e.g. Make this more concise and remove the marketing language"
        maxLength={2000}
      />
      {error ? (
        <p className="text-xs font-medium text-[var(--danger-500)]">{error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={submitting}
          leadingIcon={<SparklesIcon className="h-3.5 w-3.5" />}
        >
          Generate
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => {
            setOpen(false);
            setInstruction("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
