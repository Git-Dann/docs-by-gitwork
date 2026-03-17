"use client";

import { CTAEditor } from "@/components/proposals/cta-editor";
import { CostBreakdownTable } from "@/components/proposals/cost-breakdown-table";
import { CoverEditor } from "@/components/proposals/cover-editor";
import { AssetPicker } from "@/components/proposals/asset-picker";
import { LinkManager } from "@/components/proposals/link-manager";
import { ListItemsEditor } from "@/components/proposals/list-items-editor";
import { ObjectivesEditor } from "@/components/proposals/objectives-editor";
import { TimelineEditor } from "@/components/proposals/timeline-editor";
import { TouchpointEditor } from "@/components/proposals/touchpoint-editor";
import { proposalSectionBlueprints } from "@/lib/default-template";
import type {
  CostingSectionData,
  ProposalDocument,
  ProposalSection,
  SignoffFooterSectionData,
  SupportingLinksSectionData,
} from "@/types/proposal";

const defaultCostingData = proposalSectionBlueprints.find((entry) => entry.key === "costing")
  ?.data as CostingSectionData;

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
  function updateSectionData(data: ProposalSection["data"]) {
    onProposalChange({
      ...proposal,
      sections: proposal.sections.map((entry, index) =>
        index === sectionIndex
          ? {
              ...entry,
              data,
            }
          : entry,
      ),
    });
  }

  switch (section.key) {
    case "cover":
      return <CoverEditor value={section.data as never} onChange={updateSectionData as never} />;

    case "introduction": {
      const data = section.data as {
        statement: string;
        summary: string;
        graphic?: string;
      };

      return (
        <SimpleForm>
          <TextArea
            label="Company statement"
            value={data.statement}
            onChange={(statement) => updateSectionData({ ...data, statement })}
          />
          <TextArea
            label="Positioning summary"
            value={data.summary}
            onChange={(summary) => updateSectionData({ ...data, summary })}
          />
          <Input
            label="Section graphic URL"
            value={data.graphic ?? ""}
            onChange={(graphic) => updateSectionData({ ...data, graphic })}
          />
        </SimpleForm>
      );
    }

    case "product_overview": {
      const data = section.data as {
        platformDescription: string;
        audience: string;
        valueProposition: string;
        platformsSupported: string;
        workflowGraphic?: string;
      };

      return (
        <SimpleForm>
          <TextArea
            label="What the platform is"
            value={data.platformDescription}
            onChange={(platformDescription) => updateSectionData({ ...data, platformDescription })}
          />
          <Input
            label="Who it is for"
            value={data.audience}
            onChange={(audience) => updateSectionData({ ...data, audience })}
          />
          <Input
            label="Key value proposition"
            value={data.valueProposition}
            onChange={(valueProposition) => updateSectionData({ ...data, valueProposition })}
          />
          <Input
            label="Platforms supported"
            value={data.platformsSupported}
            onChange={(platformsSupported) => updateSectionData({ ...data, platformsSupported })}
          />
          <Input
            label="Architecture / workflow graphic URL"
            value={data.workflowGraphic ?? ""}
            onChange={(workflowGraphic) => updateSectionData({ ...data, workflowGraphic })}
          />
        </SimpleForm>
      );
    }

    case "objectives": {
      const data = section.data as { items: ProposalDocument["sections"][number]["data"] extends { items: infer T } ? T : never };
      return (
        <ObjectivesEditor
          items={(data.items as never[]) ?? []}
          onChange={(items) => updateSectionData({ ...data, items } as never)}
        />
      );
    }

    case "touchpoints": {
      const data = section.data as { items: ProposalDocument["sections"][number]["data"] extends { items: infer T } ? T : never };
      return (
        <TouchpointEditor
          items={(data.items as never[]) ?? []}
          onChange={(items) => updateSectionData({ ...data, items } as never)}
        />
      );
    }

    case "timeline": {
      const data = section.data as { viewMode: "LIST" | "MILESTONE" };
      return (
        <TimelineEditor
          phases={proposal.timelinePhases}
          viewMode={data.viewMode ?? "LIST"}
          onChange={({ phases, viewMode }) => {
            onProposalChange({
              ...proposal,
              timelinePhases: phases,
              sections: proposal.sections.map((entry, index) =>
                index === sectionIndex
                  ? {
                      ...entry,
                      data: {
                        ...data,
                        viewMode,
                      },
                    }
                  : entry,
              ),
            });
          }}
        />
      );
    }

    case "costing": {
      const data = section.data as CostingSectionData;

      return (
        <CostBreakdownTable
          value={{
            currency: data.currency ?? "GBP",
            discount: data.discount ?? 0,
            taxRate: data.taxRate ?? 0,
            monthlyCostSummary: data.monthlyCostSummary ?? defaultCostingData.monthlyCostSummary,
            durationSummary: data.durationSummary ?? defaultCostingData.durationSummary,
            totalCostLabel: data.totalCostLabel ?? defaultCostingData.totalCostLabel,
            supportingNarrative: data.supportingNarrative ?? defaultCostingData.supportingNarrative,
            paymentScheduleIntro: data.paymentScheduleIntro ?? defaultCostingData.paymentScheduleIntro,
            paymentTerms: data.paymentTerms ?? defaultCostingData.paymentTerms,
            vatNotice: data.vatNotice ?? defaultCostingData.vatNotice,
            ipTransferNotice: data.ipTransferNotice ?? defaultCostingData.ipTransferNotice,
            teamAllocations: data.teamAllocations ?? defaultCostingData.teamAllocations,
            paymentSchedule: data.paymentSchedule ?? defaultCostingData.paymentSchedule,
            additionalNotes: data.additionalNotes ?? defaultCostingData.additionalNotes,
            items: proposal.costLineItems,
          }}
          onChange={(next) => {
            onProposalChange({
              ...proposal,
              costLineItems: next.items,
              sections: proposal.sections.map((entry, index) =>
                index === sectionIndex
                  ? {
                      ...entry,
                      data: {
                        ...data,
                        currency: next.currency,
                        discount: next.discount,
                        taxRate: next.taxRate,
                        monthlyCostSummary: next.monthlyCostSummary,
                        durationSummary: next.durationSummary,
                        totalCostLabel: next.totalCostLabel,
                        supportingNarrative: next.supportingNarrative,
                        paymentScheduleIntro: next.paymentScheduleIntro,
                        paymentTerms: next.paymentTerms,
                        vatNotice: next.vatNotice,
                        ipTransferNotice: next.ipTransferNotice,
                        teamAllocations: next.teamAllocations,
                        paymentSchedule: next.paymentSchedule,
                        additionalNotes: next.additionalNotes,
                      },
                    }
                  : entry,
              ),
            });
          }}
        />
      );
    }

    case "cta_next_steps": {
      const data = section.data as {
        headline: string;
        body: string;
      };

      return (
        <div className="space-y-3">
          <SimpleForm>
            <Input
              label="Section headline"
              value={data.headline}
              onChange={(headline) => updateSectionData({ ...data, headline })}
            />
            <TextArea
              label="Body"
              value={data.body}
              onChange={(body) => updateSectionData({ ...data, body })}
            />
          </SimpleForm>
          <CTAEditor
            ctas={proposal.ctas}
            onChange={(ctas) =>
              onProposalChange({
                ...proposal,
                ctas,
              })
            }
          />
        </div>
      );
    }

    case "supporting_links_assets": {
      const data = section.data as SupportingLinksSectionData;
      return (
        <div className="space-y-3">
          <SimpleForm>
            <TextArea
              label="Section notes"
              value={data.notes}
              onChange={(notes) => updateSectionData({ ...data, notes })}
            />
          </SimpleForm>
          <LinkManager
            links={proposal.links}
            onChange={(links) =>
              onProposalChange({
                ...proposal,
                links,
              })
            }
          />
          <AssetPicker
            assets={proposal.assets}
            onChange={(assets) =>
              onProposalChange({
                ...proposal,
                assets,
              })
            }
          />
        </div>
      );
    }

    case "assumptions": {
      const data = section.data as { items: string[] };
      return (
        <ListItemsEditor
          title="Assumptions"
          items={data.items}
          onChange={(items) => updateSectionData({ ...data, items })}
        />
      );
    }

    case "out_of_scope": {
      const data = section.data as { items: string[] };
      return (
        <ListItemsEditor
          title="Out of scope"
          items={data.items}
          onChange={(items) => updateSectionData({ ...data, items })}
        />
      );
    }

    case "signoff_footer": {
      const data = section.data as SignoffFooterSectionData;

      return (
        <SimpleForm>
          <Input
            label="Prepared by"
            value={data.preparedBy}
            onChange={(preparedBy) => updateSectionData({ ...data, preparedBy })}
          />
          <Input
            label="Team / department"
            value={data.team}
            onChange={(team) => updateSectionData({ ...data, team })}
          />
          <Input
            label="Contact details"
            value={data.contactDetails}
            onChange={(contactDetails) => updateSectionData({ ...data, contactDetails })}
          />
          <TextArea
            label="Footer note"
            value={data.footerNote}
            onChange={(footerNote) => updateSectionData({ ...data, footerNote })}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-1)] bg-white px-4 py-3 text-sm text-[var(--text-2)] shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <input
                type="checkbox"
                checked={data.showBrandingBlock}
                onChange={(event) =>
                  updateSectionData({ ...data, showBrandingBlock: event.target.checked })
                }
                className="h-4 w-4"
              />
              Show Gitwork branding block
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-1)] bg-white px-4 py-3 text-sm text-[var(--text-2)] shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <input
                type="checkbox"
                checked={data.signaturePlaceholder}
                onChange={(event) =>
                  updateSectionData({ ...data, signaturePlaceholder: event.target.checked })
                }
                className="h-4 w-4"
              />
              Signature placeholder
            </label>
          </div>
        </SimpleForm>
      );
    }

    default:
      return (
        <div className="rounded-2xl border border-[var(--border-1)] bg-white p-6 text-sm text-[var(--text-2)]">
          This section type is not configured yet.
        </div>
      );
  }
}

function SimpleForm({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 rounded-2xl border border-[var(--border-1)] bg-white p-6">{children}</div>;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full"
      />
    </label>
  );
}
