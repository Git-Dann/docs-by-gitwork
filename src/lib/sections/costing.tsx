/**
 * Section type: `costing` — the project's commercial breakdown.
 *
 * The editor is `CostBreakdownTable`, which is one of the heaviest editors in the codebase
 * because it integrates with several other proposal collections: cost line items, timeline
 * phases, and the costing section's own JSON data. Most of this module is just plumbing those
 * cross-references through the unified Editor signature.
 *
 * The preview renders the budget table + a small totals box, the payment schedule cards
 * (linked to timeline phases by id), and any free-text commercial notes.
 */

import { CurrencyPoundIcon } from "@heroicons/react/24/outline";
import { CostBreakdownTable } from "@/components/proposals/cost-breakdown-table";
import { proposalSectionBlueprints } from "@/lib/default-template";
import { formatCurrency } from "@/lib/format";
import { InfoCard, Row } from "@/lib/sections/_shared";
import { renderLines } from "@/lib/markdown";
import { defineSection } from "@/lib/sections/types";
import type { CostingSectionData } from "@/types/proposal";

const DEFAULT_COSTING = proposalSectionBlueprints.find((entry) => entry.key === "costing")
  ?.data as CostingSectionData;

function formatMilestoneAmount(
  value: number | null | undefined,
  currency: "GBP" | "USD" | "EUR",
  taxRate: number,
) {
  if (value == null) return "-";
  return `${formatCurrency(value, currency)}${taxRate > 0 ? " + VAT" : ""}`;
}

export const costingSection = defineSection<CostingSectionData>({
  key: "costing",
  displayName: "Costing",
  description: "Budget, payment schedule, and commercial notes.",
  category: "commercials",
  icon: CurrencyPoundIcon,
  defaultData: DEFAULT_COSTING,
  defaultTitle: "Costing",
  defaultDescription: "Budget, payment schedule, and commercial notes.",
  recommendedFor: ["PROPOSAL", "SOW", "CO"],
  aiExpandable: false,
  Editor: ({ data, proposal, sectionIndex, onProposalChange }) => (
    <CostBreakdownTable
      value={{
        currency: data.currency ?? "GBP",
        discount: data.discount ?? 0,
        taxRate: data.taxRate ?? 0,
        monthlyCostSummary: data.monthlyCostSummary ?? DEFAULT_COSTING.monthlyCostSummary,
        durationSummary: data.durationSummary ?? DEFAULT_COSTING.durationSummary,
        totalCostLabel: data.totalCostLabel ?? DEFAULT_COSTING.totalCostLabel,
        supportingNarrative: data.supportingNarrative ?? DEFAULT_COSTING.supportingNarrative,
        paymentScheduleIntro: data.paymentScheduleIntro ?? DEFAULT_COSTING.paymentScheduleIntro,
        paymentTerms: data.paymentTerms ?? DEFAULT_COSTING.paymentTerms,
        vatNotice: data.vatNotice ?? DEFAULT_COSTING.vatNotice,
        ipTransferNotice: data.ipTransferNotice ?? DEFAULT_COSTING.ipTransferNotice,
        teamAllocations: data.teamAllocations ?? DEFAULT_COSTING.teamAllocations,
        paymentSchedule: data.paymentSchedule ?? DEFAULT_COSTING.paymentSchedule,
        additionalNotes: data.additionalNotes ?? DEFAULT_COSTING.additionalNotes,
        assignmentTimelineMode: data.assignmentTimelineMode ?? DEFAULT_COSTING.assignmentTimelineMode,
        items: proposal.costLineItems,
        timelinePhases: proposal.timelinePhases,
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
                    assignmentTimelineMode: next.assignmentTimelineMode,
                  },
                }
              : entry,
          ),
        });
      }}
    />
  ),
  Preview: ({ data, proposal }) => {
    const items = [...proposal.costLineItems].sort((a, b) => a.sortOrder - b.sortOrder);
    const timelinePhases = [...proposal.timelinePhases].sort((a, b) => a.sortOrder - b.sortOrder);
    const timelinePhaseById = timelinePhases.reduce<Record<string, (typeof timelinePhases)[number]>>(
      (result, phase) => {
        if (phase.id) result[phase.id] = phase;
        return result;
      },
      {},
    );
    const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
    const discountPercent = data.discount || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const discounted = Math.max(subtotal - discountAmount, 0);
    const taxValue = discounted * ((data.taxRate || 0) / 100);
    const paymentSchedule = data.paymentSchedule ?? [];
    const additionalNotes = data.additionalNotes ?? [];
    const total = discounted + taxValue;

    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            Budget breakdown
          </h3>
          <div className="app-table-shell overflow-x-auto">
            <table className="app-table min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Assignment</th>
                  <th className="text-left">Delivery focus</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Monthly rate</th>
                  <th className="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id ?? `${item.category}-${item.itemName}`}>
                    <td className="text-[var(--text-2)]">{item.category || "-"}</td>
                    <td>
                      {item.description?.trim() ? (
                        <p className="text-sm leading-6 text-[var(--text-2)]">{renderLines(item.description, "cost")}</p>
                      ) : (
                        <span className="text-xs text-[var(--text-3)]">—</span>
                      )}
                    </td>
                    <td className="text-right text-[var(--text-2)]">{item.quantity}</td>
                    <td className="text-right text-[var(--text-2)]">
                      {formatCurrency(item.unitCost, data.currency)}
                    </td>
                    <td className="text-right text-[var(--text-1)]">
                      {formatCurrency(item.subtotal, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="proposal-block-avoid ml-auto max-w-xs space-y-1 rounded-[10px] border border-[var(--border-2)] bg-white p-4 text-sm shadow-[var(--shadow-xs)]">
            <Row label="Subtotal" value={formatCurrency(subtotal, data.currency)} />
            <Row label={`Discount (${discountPercent}%)`} value={`-${formatCurrency(discountAmount, data.currency)}`} />
            <Row label={`VAT (${data.taxRate || 0}%)`} value={formatCurrency(taxValue, data.currency)} />
            <Row label="Grand total" value={formatCurrency(total, data.currency)} bold />
          </div>
        </div>

        {data.paymentScheduleIntro ||
        data.paymentTerms ||
        data.vatNotice ||
        data.ipTransferNotice ||
        paymentSchedule.length ? (
          <div className="space-y-4">
            <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Payment schedule
            </h3>
            <div className="max-w-4xl space-y-4 text-[16px] leading-8 text-[var(--text-2)]">
              {data.paymentScheduleIntro ? (
                <p className="font-medium text-[var(--text-1)]">{data.paymentScheduleIntro}</p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-3">
                {data.paymentTerms ? <InfoCard title="Payment terms" content={data.paymentTerms} /> : null}
                {data.vatNotice ? <InfoCard title="VAT note" content={data.vatNotice} /> : null}
                {data.ipTransferNotice ? <InfoCard title="IP transfer" content={data.ipTransferNotice} /> : null}
              </div>
            </div>

            {paymentSchedule.length ? (
              <div className="grid gap-3">
                {paymentSchedule.map((row, index) => (
                  <article
                    key={row.id}
                    className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4"
                  >
                    {row.timelinePhaseId && timelinePhaseById[row.timelinePhaseId] ? (
                      <p className="mb-3 inline-flex rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-4)]">
                        Linked to {timelinePhaseById[row.timelinePhaseId]?.name}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                          Milestone {index + 1}
                        </p>
                        <p className="mt-1 text-base font-semibold text-[var(--text-1)]">
                          {row.action || "Milestone"}
                        </p>
                        {row.periodCovered ? (
                          <p className="mt-1 text-sm text-[var(--text-3)]">{row.periodCovered}</p>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {formatMilestoneAmount(row.amount, data.currency, data.taxRate)}
                      </p>
                    </div>
                    {row.includedWork ? (
                      <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{row.includedWork}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {additionalNotes.length ? (
          <div className="space-y-4">
            <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Commercial notes
            </h3>
            <ul className="space-y-3">
              {additionalNotes.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-[16px] leading-8 text-[var(--text-2)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  },
});
