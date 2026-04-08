"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CurrencyField } from "@/components/proposals/currency-field";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { listRateCardPeople } from "@/lib/api";
import { cn, formatCurrency, parseNumber } from "@/lib/format";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";
import type {
  AssignmentTimelineMode,
  CostLineItemInput,
  CostingSectionData,
  PaymentScheduleRow,
  TimelinePhaseInput,
} from "@/types/proposal";

export interface CostBreakdownValue extends CostingSectionData {
  items: CostLineItemInput[];
  timelinePhases: TimelinePhaseInput[];
}

const techStackOptions = [
  "Django",
  "Flask",
  "Laravel",
  ".NET",
  "Java",
  "GitHub",
  "GitLab",
  "Bitbucket",
  "CSS",
  "Bootstrap",
  "AWS",
  "GCP",
  "Kubernetes",
  "FTP",
  "React",
  "Angular",
  "jQuery",
  "Vue",
  "MySQL",
  "PostgreSQL",
  "Firebase",
  "MongoDB",
  "Redis",
  "MS SQL",
  "JavaScript",
  "Python",
  "GoLang",
  "Swift",
  "TypeScript",
  "C#",
  "PHP",
  "C",
  "Azure",
];

const RATE_CARD_PREFIX = "rate-card:";
const PROPOSAL_ROLE_PREFIX = "proposal-role:";
const CUSTOM_ROLE_PREFIX = "custom-role:";
const CUSTOM_ROLE_VALUE = "__custom_role__";
const DAYS_PER_MONTH = 21;
const ROLE_FX_TO_GBP: Record<"GBP" | "USD" | "EUR", number> = {
  GBP: 1,
  USD: 0.7558603274120514,
  EUR: 0.86803,
};

type ProposalRoleOption = {
  id: string;
  title: string;
  detail: string;
  defaultMonthlyRate: number | null;
  sourceRate: number | null;
  sourceCurrencyCode: "GBP" | "USD" | "EUR" | null;
  billingPeriod: RateBillingPeriod | null;
  isManualRate: boolean;
};

type BudgetEditorState = {
  index: number | null;
  roleValue: string;
  customRole: string;
  techStack: string[];
  monthsRequired: number;
  monthlyCost: number;
  included: boolean;
};

type TimelineWindow = {
  unit: "DAY" | "WEEK" | "MONTH";
  end: number;
};

const proposalRoleBlueprints: Array<{
  id: string;
  title: string;
  description: string;
  requiresManualRate: boolean;
  fallbackSourceRate?: number;
  fallbackSourceCurrencyCode?: "GBP" | "USD" | "EUR";
  fallbackBillingPeriod?: RateBillingPeriod;
}> = [
  {
    id: "senior",
    title: "Senior Developer",
    description: "Senior developer benchmark from People & Rates.",
    requiresManualRate: false,
    fallbackSourceRate: 1900,
    fallbackSourceCurrencyCode: "USD",
    fallbackBillingPeriod: "MONTH",
  },
  {
    id: "mid-level",
    title: "Mid-level Developer",
    description: "Mid-level developer benchmark from People & Rates.",
    requiresManualRate: false,
    fallbackSourceRate: 1500,
    fallbackSourceCurrencyCode: "USD",
    fallbackBillingPeriod: "MONTH",
  },
  {
    id: "junior",
    title: "Junior Developer",
    description: "Junior developer benchmark from People & Rates.",
    requiresManualRate: false,
    fallbackSourceRate: 1300,
    fallbackSourceCurrencyCode: "USD",
    fallbackBillingPeriod: "MONTH",
  },
  {
    id: "dev-ops",
    title: "Dev Ops",
    description: "Manual role. Set the proposal rate yourself.",
    requiresManualRate: true,
  },
  {
    id: "product-manager",
    title: "Product Manager",
    description: "Manual role. Set the proposal rate yourself.",
    requiresManualRate: true,
  },
  {
    id: "design",
    title: "Design",
    description: "Manual role. Set the proposal rate yourself.",
    requiresManualRate: true,
  },
];

function createRowId(prefix: string) {
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}-${generated}`;
}

export function CostBreakdownTable({
  value,
  onChange,
}: {
  value: CostBreakdownValue;
  onChange: (value: CostBreakdownValue) => void;
}) {
  const [rateCardPeople, setRateCardPeople] = useState<RateCardPersonRecord[]>([]);
  const [rateCardLoading, setRateCardLoading] = useState(true);
  const [rateCardError, setRateCardError] = useState<string | null>(null);
  const [budgetEditor, setBudgetEditor] = useState<BudgetEditorState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRateCardPeople() {
      setRateCardLoading(true);
      setRateCardError(null);

      try {
        const response = await listRateCardPeople();
        if (!cancelled) {
          setRateCardPeople(response.people);
        }
      } catch (error) {
        if (!cancelled) {
          setRateCardError(
            error instanceof Error
              ? error.message
              : "Unable to load People & Rates right now.",
          );
        }
      } finally {
        if (!cancelled) {
          setRateCardLoading(false);
        }
      }
    }

    void loadRateCardPeople();

    return () => {
      cancelled = true;
    };
  }, []);

  const timelinePhases = useMemo(
    () => [...(value.timelinePhases ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [value.timelinePhases],
  );

  const rateCardPeopleById = useMemo(
    () =>
      rateCardPeople.reduce<Record<string, RateCardPersonRecord>>((result, person) => {
        result[person.id] = person;
        return result;
      }, {}),
    [rateCardPeople],
  );

  const proposalRoleOptions = useMemo(
    () => buildProposalRoleOptions(rateCardPeople, value.currency),
    [rateCardPeople, value.currency],
  );

  const proposalRoleOptionsById = useMemo(
    () =>
      proposalRoleOptions.reduce<Record<string, ProposalRoleOption>>((result, option) => {
        result[option.id] = option;
        return result;
      }, {}),
    [proposalRoleOptions],
  );

  const timelineDurationSummary = summarizeTimelineDuration(timelinePhases, value.durationSummary);
  const assignmentTimelineMode = value.assignmentTimelineMode ?? {};
  const timelineEstimate = inferProjectTimelineEstimate(
    timelinePhases,
    timelineDurationSummary,
    value.items,
  );
  const suggestedDurationMonths = timelineEstimate.months;

  useEffect(() => {
    const currentAssignmentTimelineMode = value.assignmentTimelineMode ?? {};
    const normalizedItems = value.items.map((item, index) =>
      normalizeCostItem(
        item,
        index,
        currentAssignmentTimelineMode,
        timelinePhases.length > 0,
        suggestedDurationMonths,
      ),
    );
    const normalizedAssignmentTimelineMode = buildAssignmentTimelineMode(
      normalizedItems,
      currentAssignmentTimelineMode,
    );

    const itemsChanged = normalizedItems.some((item, index) => {
      const current = value.items[index];
      return (
        item.id !== current?.id ||
        item.itemName !== current?.itemName ||
        item.category !== current?.category ||
        item.quantity !== current?.quantity ||
        item.unitCost !== current?.unitCost ||
        item.subtotal !== current?.subtotal ||
        item.description !== current?.description
      );
    });

    const timelineModeChanged = !assignmentTimelineModeEqual(
      normalizedAssignmentTimelineMode,
      currentAssignmentTimelineMode,
    );

    if (
      timelineDurationSummary !== value.durationSummary ||
      itemsChanged ||
      timelineModeChanged
    ) {
      onChange({
        ...value,
        durationSummary: timelineDurationSummary,
        assignmentTimelineMode: normalizedAssignmentTimelineMode,
        items: normalizedItems,
      });
    }
  }, [
    onChange,
    suggestedDurationMonths,
    timelineDurationSummary,
    timelinePhases.length,
    value,
  ]);

  useEffect(() => {
    if (!value.items.length) {
      return;
    }

    let hasChanges = false;

    const migratedItems = value.items.map((item) => {
      const selectedRole = resolveSelectedProposalRole(
        item,
        rateCardPeopleById,
        proposalRoleOptionsById,
      );

      if (!selectedRole) {
        return item;
      }

      const normalizedItemName = `${PROPOSAL_ROLE_PREFIX}${selectedRole.id}`;
      const normalizedCategory = selectedRole.title;
      const normalizedUnitCost =
        item.unitCost > 0
          ? item.unitCost
          : suggestedUnitCostForRole(selectedRole, item.unitCost, null);

      if (
        item.itemName === normalizedItemName &&
        item.category === normalizedCategory &&
        item.unitCost === normalizedUnitCost
      ) {
        return item;
      }

      hasChanges = true;
      return {
        ...item,
        itemName: normalizedItemName,
        category: normalizedCategory,
        unitCost: normalizedUnitCost,
        subtotal: Number((item.quantity * normalizedUnitCost).toFixed(2)),
      };
    });

    if (!hasChanges) {
      return;
    }

    onChange({
      ...value,
      items: migratedItems,
    });
  }, [onChange, proposalRoleOptionsById, rateCardPeopleById, value]);

  const subtotal = value.items.reduce((total, item) => total + item.subtotal, 0);
  const discountAmount = subtotal * ((value.discount ?? 0) / 100);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const taxValue = discountedSubtotal * ((value.taxRate ?? 0) / 100);
  const grandTotal = discountedSubtotal + taxValue;
  const phaseBudgetMap = useMemo(
    () => buildPhaseBudgetMap(timelinePhases, grandTotal),
    [grandTotal, timelinePhases],
  );

  const paymentSchedule = useMemo(
    () =>
      (value.paymentSchedule ?? []).map((row, index) =>
        hydratePaymentScheduleRow(row, index, timelinePhases, phaseBudgetMap),
      ),
    [phaseBudgetMap, timelinePhases, value.paymentSchedule],
  );

  const paymentScheduleTotal = paymentSchedule.reduce(
    (sum, row) => sum + (row.amount ?? 0),
    0,
  );
  const paymentMatchesBudget = Math.abs(paymentScheduleTotal - grandTotal) < 0.5;

  function commitItems(
    items: CostLineItemInput[],
    nextAssignmentTimelineMode: Record<string, AssignmentTimelineMode>,
  ) {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      assignmentTimelineMode: nextAssignmentTimelineMode,
      items,
    });
  }

  function updateItem(
    index: number,
    patch: Partial<CostLineItemInput>,
    nextTimelineMode?: AssignmentTimelineMode,
  ) {
    const nextItems = value.items.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const next = {
        ...item,
        ...patch,
      };

      return normalizeCostItem(
        {
          ...next,
          subtotal: Number((next.quantity * next.unitCost).toFixed(2)),
        },
        itemIndex,
        assignmentTimelineMode,
        timelinePhases.length > 0,
        suggestedDurationMonths,
      );
    });

    const itemId = nextItems[index]?.id;
    const nextAssignmentTimelineMode = itemId
      ? {
          ...assignmentTimelineMode,
          [itemId]: nextTimelineMode ?? assignmentTimelineMode[itemId] ?? "DEFAULT",
        }
      : assignmentTimelineMode;

    commitItems(nextItems, nextAssignmentTimelineMode);
  }

  function removeItem(index: number) {
    const itemId = value.items[index]?.id;
    const nextAssignmentTimelineMode = { ...assignmentTimelineMode };
    if (itemId) {
      delete nextAssignmentTimelineMode[itemId];
    }

    commitItems(
      value.items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          sortOrder: itemIndex,
        })),
      nextAssignmentTimelineMode,
    );
  }

  function openBudgetEditor(index: number | null) {
    if (index === null) {
      const defaultRole = proposalRoleOptions[0];
      setBudgetEditor({
        index: null,
        roleValue: defaultRole ? `${PROPOSAL_ROLE_PREFIX}${defaultRole.id}` : CUSTOM_ROLE_VALUE,
        customRole: "",
        techStack: [],
        monthsRequired: suggestedDurationMonths,
        monthlyCost: defaultRole?.defaultMonthlyRate ?? 0,
        included: false,
      });
      return;
    }

    const item = value.items[index];
    const selectedRole = resolveSelectedProposalRole(
      item,
      rateCardPeopleById,
      proposalRoleOptionsById,
    );

    setBudgetEditor({
      index,
      roleValue: selectedRole
        ? `${PROPOSAL_ROLE_PREFIX}${selectedRole.id}`
        : CUSTOM_ROLE_VALUE,
      customRole: selectedRole ? "" : item.category,
      techStack: parseTechStackValue(item.description),
      monthsRequired: Math.max(1, item.quantity || suggestedDurationMonths),
      monthlyCost: item.unitCost > 0 ? item.unitCost : selectedRole?.defaultMonthlyRate ?? 0,
      included: item.unitCost <= 0,
    });
  }

  function closeBudgetEditor() {
    setBudgetEditor(null);
  }

  function saveBudgetEditor() {
    if (!budgetEditor) {
      return;
    }

    const selectedRole =
      budgetEditor.roleValue === CUSTOM_ROLE_VALUE
        ? null
        : proposalRoleOptionsById[budgetEditor.roleValue.replace(PROPOSAL_ROLE_PREFIX, "")];

    const roleTitle = selectedRole
      ? selectedRole.title
      : budgetEditor.customRole.trim() || "Flexible role";
    const quantity = Math.max(1, parseNumber(String(budgetEditor.monthsRequired), 1));
    const unitCost = budgetEditor.included
      ? 0
      : roundToCurrency(parseNumber(String(budgetEditor.monthlyCost), 0));
    const timelineMode =
      timelinePhases.length > 0 && quantity === suggestedDurationMonths ? "DEFAULT" : "MANUAL";

    if (budgetEditor.index === null) {
      const id = createRowId("cost");
      const nextAssignmentTimelineMode: Record<string, AssignmentTimelineMode> = {
        ...assignmentTimelineMode,
        [id]: timelineMode,
      };

      commitItems(
        [
          ...value.items,
          normalizeCostItem(
            {
              id,
              category: roleTitle,
              itemName: selectedRole
                ? `${PROPOSAL_ROLE_PREFIX}${selectedRole.id}`
                : buildCustomRoleReference(roleTitle),
              description: budgetEditor.techStack.join(", "),
              quantity,
              unitCost,
              subtotal: roundToCurrency(quantity * unitCost),
              costKind: "ONE_OFF",
              sortOrder: value.items.length,
            },
            value.items.length,
            nextAssignmentTimelineMode,
            timelinePhases.length > 0,
            suggestedDurationMonths,
          ),
        ],
        nextAssignmentTimelineMode,
      );
      setBudgetEditor(null);
      return;
    }

    updateItem(
      budgetEditor.index,
      {
        category: roleTitle,
        itemName: selectedRole
          ? `${PROPOSAL_ROLE_PREFIX}${selectedRole.id}`
          : buildCustomRoleReference(roleTitle),
        description: budgetEditor.techStack.join(", "),
        quantity,
        unitCost,
      },
      timelineMode,
    );
    setBudgetEditor(null);
  }

  function commitPaymentRows(rows: PaymentScheduleRow[]) {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      paymentSchedule: rows,
    });
  }

  function updatePaymentRow(index: number, nextRow: PaymentScheduleRow) {
    commitPaymentRows(
      paymentSchedule.map((row, rowIndex) => (rowIndex === index ? nextRow : row)),
    );
  }

  function addPaymentRow() {
    commitPaymentRows([
      ...paymentSchedule,
      createPaymentScheduleRow(timelinePhases, phaseBudgetMap),
    ]);
  }

  function removePaymentRow(index: number) {
    commitPaymentRows(
      paymentSchedule.filter((_, rowIndex) => rowIndex !== index),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricFieldCard label="Currency">
          <CurrencyField
            value={value.currency}
            onChange={(currency) =>
              onChange({
                ...value,
                currency,
              })
            }
          />
        </MetricFieldCard>
        <MetricFieldCard label="Discount">
          <input
            value={formatEditableNumber(value.discount ?? 0)}
            onChange={(event) =>
              onChange({
                ...value,
                discount: parseNumber(event.target.value, 0),
              })
            }
            inputMode="decimal"
            className="w-full border-0 bg-transparent p-0 text-[26px] font-semibold tracking-[-0.04em] text-[var(--text-1)] outline-none"
          />
          <span className="text-sm font-medium text-[var(--text-3)]">%</span>
        </MetricFieldCard>
        <MetricFieldCard label="VAT">
          <input
            value={formatEditableNumber(value.taxRate ?? 0)}
            onChange={(event) =>
              onChange({
                ...value,
                taxRate: parseNumber(event.target.value, 0),
              })
            }
            inputMode="decimal"
            className="w-full border-0 bg-transparent p-0 text-[26px] font-semibold tracking-[-0.04em] text-[var(--text-1)] outline-none"
          />
          <span className="text-sm font-medium text-[var(--text-3)]">%</span>
        </MetricFieldCard>
      </div>

      <section className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between gap-4">
          <h4 className="text-base font-semibold text-[var(--text-1)]">Budget breakdown</h4>
          <Button
            type="button"
            variant="secondary"
            size="md"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => openBudgetEditor(null)}
          >
            Add
          </Button>
        </div>

        <div className="mt-4 app-table-shell overflow-x-auto">
          <table className="app-table min-w-full text-sm">
            <thead>
              <tr>
                <th className="w-[220px] text-left">People</th>
                <th className="w-[220px] text-left">Tech Stack</th>
                <th className="w-[120px] text-right">Months Rqd.</th>
                <th className="w-[120px] text-right">
                  Day Rate ({currencySymbol(value.currency)})
                </th>
                <th className="w-[140px] text-right">
                  Monthly Cost ({currencySymbol(value.currency)})
                </th>
                <th className="w-[56px]" />
              </tr>
            </thead>
            <tbody>
              {value.items.length ? (
                value.items.map((item, index) => {
                  const selectedRole = resolveSelectedProposalRole(
                    item,
                    rateCardPeopleById,
                    proposalRoleOptionsById,
                  );
                  const title =
                    selectedRole?.title ?? item.category ?? "Flexible role";
                  const subtitle = resolveBudgetRowSubtitle(
                    title,
                    value.teamAllocations,
                    rateCardPeople,
                  );
                  const monthlyCost = item.unitCost > 0 ? roundToCurrency(item.unitCost) : null;
                  const dayRate =
                    monthlyCost && monthlyCost > 0
                      ? roundToDecimal(monthlyCost / DAYS_PER_MONTH, 1)
                      : null;

                  return (
                    <tr
                      key={item.id ?? `cost-${index}`}
                      className="cursor-pointer"
                      onClick={() => openBudgetEditor(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openBudgetEditor(index);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>
                        <div className="min-w-[150px]">
                          <p className="text-sm font-medium text-[var(--text-1)]">{title}</p>
                          <p className="mt-0.5 text-sm text-[var(--text-3)]">{subtitle}</p>
                        </div>
                      </td>
                      <td>
                        <TechStackPreview stacks={parseTechStackValue(item.description)} />
                      </td>
                      <td className="text-right text-[var(--text-2)]">
                        {formatPlainNumber(item.quantity)}
                      </td>
                      <td className="text-right text-[var(--text-2)]">
                        {dayRate === null ? "Inc." : formatPlainNumber(dayRate, 1)}
                      </td>
                      <td className="text-right text-[var(--text-2)]">
                        {monthlyCost === null ? "Inc." : formatPlainNumber(monthlyCost)}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          variant="utility"
                          size="icon-md"
                          className="text-rose-500 hover:text-rose-600"
                          aria-label="Delete budget row"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeItem(index);
                          }}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-sm text-[var(--text-4)]">
                    Add a budget row to start building the commercial plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <TotalsCard
            lines={[
              {
                label: "Subtotal",
                value: formatCurrency(discountedSubtotal, value.currency),
              },
              {
                label: `VAT (${value.taxRate ?? 0}%)`,
                value: formatCurrency(taxValue, value.currency),
              },
              {
                label: "Grand total",
                value: formatCurrency(grandTotal, value.currency),
                strong: true,
              },
            ]}
          />
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between gap-4">
          <h4 className="text-base font-semibold text-[var(--text-1)]">Payment Schedule</h4>
          <Button
            type="button"
            variant="secondary"
            size="md"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={addPaymentRow}
          >
            Add
          </Button>
        </div>

        <div className="mt-4 app-table-shell overflow-x-auto">
          <table className="app-table min-w-[840px] text-sm">
            <thead>
              <tr>
                <th className="w-[120px] text-left">Phase</th>
                <th className="w-[120px] text-left">Duration</th>
                <th className="w-[120px] text-right">
                  <span className="block">Total Cost ({currencySymbol(value.currency)})</span>
                  <span className="block text-[10px] font-semibold text-[var(--text-4)]">
                    (Excl. VAT)
                  </span>
                </th>
                <th className="w-[140px] text-left">Milestone</th>
                <th className="w-[160px] text-left">Timing</th>
                <th className="w-[96px] text-right">Payment %</th>
                <th className="w-[120px] text-right">
                  <span className="block">Amount ({currencySymbol(value.currency)})</span>
                  <span className="block text-[10px] font-semibold text-[var(--text-4)]">
                    (Excl. VAT)
                  </span>
                </th>
                <th className="w-[56px]" />
              </tr>
            </thead>
            <tbody>
              {paymentSchedule.length ? (
                paymentSchedule.map((row, index) => (
                  <tr key={row.id}>
                    <td>
                      <InlineCellInput
                        value={row.phaseLabel ?? ""}
                        placeholder="Phase 1"
                        onChange={(phaseLabel) =>
                          updatePaymentRow(
                            index,
                            reconcilePaymentScheduleRow(
                              {
                                ...row,
                                phaseLabel,
                                timelinePhaseId:
                                  findMatchingPhaseId(phaseLabel, timelinePhases) ?? "",
                              },
                              timelinePhases,
                              phaseBudgetMap,
                              row.paymentPercent != null ? "percent" : "amount",
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <InlineCellInput
                        value={row.phaseDuration ?? ""}
                        placeholder="8 Weeks"
                        onChange={(phaseDuration) =>
                          updatePaymentRow(
                            index,
                            reconcilePaymentScheduleRow(
                              {
                                ...row,
                                phaseDuration,
                              },
                              timelinePhases,
                              phaseBudgetMap,
                              row.paymentPercent != null ? "percent" : "amount",
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <InlineCellNumber
                        value={row.phaseTotal ?? 0}
                        placeholder="0"
                        align="right"
                        onChange={(phaseTotal) =>
                          updatePaymentRow(
                            index,
                            reconcilePaymentScheduleRow(
                              {
                                ...row,
                                phaseTotal,
                              },
                              timelinePhases,
                              phaseBudgetMap,
                              "amount",
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <InlineCellInput
                        value={row.action}
                        placeholder="Deposit"
                        onChange={(action) => updatePaymentRow(index, { ...row, action })}
                      />
                    </td>
                    <td>
                      <InlineCellInput
                        value={row.periodCovered}
                        placeholder="Project Kickoff"
                        onChange={(periodCovered) =>
                          updatePaymentRow(index, { ...row, periodCovered })
                        }
                      />
                    </td>
                    <td className="text-right">
                      <InlineCellNumber
                        value={row.paymentPercent ?? 0}
                        placeholder="0"
                        align="right"
                        onChange={(paymentPercent) =>
                          updatePaymentRow(
                            index,
                            reconcilePaymentScheduleRow(
                              {
                                ...row,
                                paymentPercent,
                              },
                              timelinePhases,
                              phaseBudgetMap,
                              "percent",
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <InlineCellNumber
                        value={row.amount ?? 0}
                        placeholder="0"
                        align="right"
                        onChange={(amount) =>
                          updatePaymentRow(
                            index,
                            reconcilePaymentScheduleRow(
                              {
                                ...row,
                                amount,
                              },
                              timelinePhases,
                              phaseBudgetMap,
                              "amount",
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-right">
                      <Button
                        type="button"
                        variant="utility"
                        size="icon-md"
                        className="text-rose-500 hover:text-rose-600"
                        aria-label="Delete payment row"
                        onClick={() => removePaymentRow(index)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-sm text-[var(--text-4)]">
                    Add a payment row to map billing against the proposal total.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <TotalsCard
            lines={[
              {
                label: "Budget Breakdown",
                value: formatCurrency(grandTotal, value.currency),
              },
              {
                label: "Payment Schedule",
                value: formatCurrency(paymentScheduleTotal, value.currency),
              },
              {
                label: `${formatCurrency(paymentScheduleTotal, value.currency)} allocated of ${formatCurrency(grandTotal, value.currency)}`,
                value: "",
                strong: true,
                stackLabel: true,
                tone: paymentMatchesBudget ? "default" : "warning",
              },
            ]}
          />
        </div>
      </section>

      {budgetEditor ? (
        <BudgetEditorDialog
          value={budgetEditor}
          currency={value.currency}
          rateCardLoading={rateCardLoading}
          rateCardError={rateCardError}
          proposalRoleOptions={proposalRoleOptions}
          proposalRoleOptionsById={proposalRoleOptionsById}
          onChange={setBudgetEditor}
          onClose={closeBudgetEditor}
          onSave={saveBudgetEditor}
          onRemove={
            budgetEditor.index === null
              ? null
              : () => {
                  removeItem(budgetEditor.index ?? 0);
                  closeBudgetEditor();
                }
          }
        />
      ) : null}
    </div>
  );
}

function MetricFieldCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
      <p className="text-xs font-medium text-[var(--text-4)]">{label}</p>
      <div className="mt-2 flex items-end gap-2">{children}</div>
    </div>
  );
}

function TotalsCard({
  lines,
}: {
  lines: Array<{
    label: string;
    value: string;
    strong?: boolean;
    stackLabel?: boolean;
    tone?: "default" | "warning";
  }>;
}) {
  return (
    <div className="w-full max-w-[290px] rounded-[12px] border border-[var(--border-2)] bg-white px-4 py-4 text-right shadow-[var(--shadow-xs)]">
      <div className="space-y-2">
        {lines.map((line) => (
          <div
            key={`${line.label}-${line.value}`}
            className={cn(
              line.stackLabel
                ? "text-[15px] leading-[22px]"
                : "flex items-center justify-end gap-2 text-[13px] leading-[19px]",
              line.strong ? "font-semibold text-[var(--text-1)]" : "font-medium text-[var(--text-2)]",
              line.tone === "warning" ? "text-amber-700" : null,
            )}
          >
            {line.stackLabel ? (
              <span>{line.label}</span>
            ) : (
              <>
                <span>{line.label}:</span>
                <span>{line.value}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TechStackPreview({
  stacks,
}: {
  stacks: string[];
}) {
  if (!stacks.length) {
    return <span className="text-sm text-[var(--text-4)]">No stack set</span>;
  }

  const visibleStacks = stacks.slice(0, 2);
  const hiddenStacks = stacks.slice(2);

  const content = (
    <span className="inline-flex max-w-[180px] flex-wrap gap-1.5">
      {visibleStacks.map((stack) => (
        <StackBadge key={stack} label={stack} />
      ))}
      {hiddenStacks.length ? <StackBadge label="..." /> : null}
    </span>
  );

  return hiddenStacks.length ? (
    <Tooltip label={stacks.join(", ")}>
      <span>{content}</span>
    </Tooltip>
  ) : (
    content
  );
}

function StackBadge({
  label,
}: {
  label: string;
}) {
  const tone = stackTone(label);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function InlineCellInput({
  value,
  placeholder,
  onChange,
  align = "left",
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full border-0 bg-transparent p-0 text-sm font-medium text-[var(--text-1)] outline-none placeholder:font-normal placeholder:text-[var(--text-4)]",
        align === "right" ? "text-right" : "text-left",
      )}
    />
  );
}

function InlineCellNumber({
  value,
  placeholder,
  onChange,
  align = "right",
}: {
  value: number;
  placeholder?: string;
  onChange: (value: number) => void;
  align?: "left" | "right";
}) {
  return (
    <input
      value={value ? formatEditableNumber(value) : ""}
      onChange={(event) => onChange(parseNumber(event.target.value, 0))}
      inputMode="decimal"
      placeholder={placeholder}
      className={cn(
        "w-full border-0 bg-transparent p-0 text-sm font-medium text-[var(--text-1)] outline-none placeholder:font-normal placeholder:text-[var(--text-4)]",
        align === "right" ? "text-right" : "text-left",
      )}
    />
  );
}

function BudgetEditorDialog({
  value,
  currency,
  rateCardLoading,
  rateCardError,
  proposalRoleOptions,
  proposalRoleOptionsById,
  onChange,
  onClose,
  onSave,
  onRemove,
}: {
  value: BudgetEditorState;
  currency: "GBP" | "USD" | "EUR";
  rateCardLoading: boolean;
  rateCardError: string | null;
  proposalRoleOptions: ProposalRoleOption[];
  proposalRoleOptionsById: Record<string, ProposalRoleOption>;
  onChange: (value: BudgetEditorState) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove: (() => void) | null;
}) {
  const selectedRole =
    value.roleValue === CUSTOM_ROLE_VALUE
      ? null
      : proposalRoleOptionsById[value.roleValue.replace(PROPOSAL_ROLE_PREFIX, "")] ?? null;
  const roleGuidance = selectedRole
    ? buildRoleGuidance(selectedRole, currency)
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="app-dialog-backdrop absolute inset-0" onClick={onClose} />

      <div className="app-dialog-panel relative z-10 w-full max-w-[560px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              {value.index === null ? "Add budget row" : "Edit budget row"}
            </h3>
          </div>

          <Button type="button" variant="utility" size="icon-md" onClick={onClose} aria-label="Close dialog">
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Developer</span>
            <select
              value={value.roleValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                const nextRole =
                  nextValue === CUSTOM_ROLE_VALUE
                    ? null
                    : proposalRoleOptionsById[nextValue.replace(PROPOSAL_ROLE_PREFIX, "")] ?? null;

                onChange({
                  ...value,
                  roleValue: nextValue,
                  customRole: nextValue === CUSTOM_ROLE_VALUE ? value.customRole : "",
                  monthlyCost:
                    nextRole?.defaultMonthlyRate && !value.included
                      ? nextRole.defaultMonthlyRate
                      : value.monthlyCost,
                });
              }}
              className="app-select w-full"
            >
              {proposalRoleOptions.map((role) => (
                <option key={role.id} value={`${PROPOSAL_ROLE_PREFIX}${role.id}`}>
                  {role.title}
                </option>
              ))}
              <option value={CUSTOM_ROLE_VALUE}>Flexible role</option>
            </select>
          </label>

          {value.roleValue === CUSTOM_ROLE_VALUE ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Role title</span>
              <input
                value={value.customRole}
                onChange={(event) =>
                  onChange({
                    ...value,
                    customRole: event.target.value,
                  })
                }
                className="app-input"
                placeholder="QA, Strategy, Technical Lead"
              />
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Months required</span>
              <input
                value={formatEditableNumber(value.monthsRequired)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    monthsRequired: Math.max(1, parseNumber(event.target.value, 1)),
                  })
                }
                inputMode="decimal"
                className="app-input"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">
                Monthly cost ({currencySymbol(currency)})
              </span>
              <input
                value={value.monthlyCost ? formatEditableNumber(value.monthlyCost) : ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    monthlyCost: parseNumber(event.target.value, 0),
                  })
                }
                inputMode="decimal"
                className="app-input"
                disabled={value.included}
                placeholder="0"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={value.included}
              onChange={(event) =>
                onChange({
                  ...value,
                  included: event.target.checked,
                })
              }
              className="app-checkbox"
            />
            Included in commercial total
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-2)]">Tech Stack</span>
            <div className="max-h-[220px] overflow-y-auto rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
              <div className="flex flex-wrap gap-2">
                {techStackOptions.map((option) => {
                  const selected = value.techStack.includes(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          techStack: selected
                            ? value.techStack.filter((entry) => entry !== option)
                            : [...value.techStack, option].sort((left, right) =>
                                left.localeCompare(right),
                              ),
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        selected
                          ? "border-[var(--brand-300)] bg-[var(--surface-brand-soft)] text-[var(--brand-700)]"
                          : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--text-3)]">
            {rateCardLoading
              ? "Loading People & Rates…"
              : rateCardError
                ? "People & Rates are unavailable right now."
                : roleGuidance?.message ?? "Manual role. Set the proposal rate yourself."}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div>
            {onRemove ? (
              <Button type="button" variant="danger" size="sm" onClick={onRemove}>
                Remove
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={onSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseTechStackValue(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeCostItem(
  item: CostLineItemInput,
  index: number,
  assignmentTimelineMode: Record<string, AssignmentTimelineMode>,
  hasTimeline: boolean,
  suggestedDurationMonths: number,
) {
  const id = item.id ?? createRowId(`cost-${index + 1}`);
  const timelineMode = assignmentTimelineMode[id] ?? "DEFAULT";
  const quantity =
    hasTimeline && timelineMode !== "MANUAL" ? suggestedDurationMonths : item.quantity;

  return {
    ...item,
    id,
    quantity,
    itemName:
      item.itemName.trim() || buildCustomRoleReference(item.category || `role-${index + 1}`),
    subtotal: Number((quantity * item.unitCost).toFixed(2)),
  };
}

function summarizeTimelineDuration(phases: TimelinePhaseInput[], fallback: string) {
  if (!phases.length) {
    return fallback;
  }

  const windows = phases
    .map((phase) => phase.duration.trim())
    .filter(Boolean);

  return windows.length ? windows.join(" • ") : fallback;
}

function inferProjectDurationMonths(durationSummary: string, items: CostLineItemInput[]) {
  const parsedSummary = parseTimelineWindow(durationSummary);
  if (parsedSummary) {
    return Math.max(1, Math.ceil(convertWindowToDays(parsedSummary) / 20));
  }

  const monthsMatch = durationSummary.match(/(\d+(?:\.\d+)?)\s*month/i);
  if (monthsMatch) {
    return Math.max(1, Number(monthsMatch[1]));
  }

  const weekMatch = durationSummary.match(/(\d+(?:\.\d+)?)\s*week/i);
  if (weekMatch) {
    return Math.max(1, Math.ceil(Number(weekMatch[1]) / 4));
  }

  const existingMax = items.reduce(
    (max, item) => Math.max(max, Number(item.quantity) || 0),
    0,
  );
  return existingMax > 0 ? existingMax : 1;
}

function buildAssignmentTimelineMode(
  items: CostLineItemInput[],
  existing: Record<string, AssignmentTimelineMode>,
) {
  return items.reduce<Record<string, AssignmentTimelineMode>>((result, item, index) => {
    const id = item.id ?? `cost-${index + 1}`;
    result[id] = existing[id] ?? "DEFAULT";
    return result;
  }, {});
}

function assignmentTimelineModeEqual(
  left: Record<string, AssignmentTimelineMode>,
  right: Record<string, AssignmentTimelineMode>,
) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key, index) => key === rightKeys[index] && left[key] === right[key],
  );
}

function inferProjectTimelineEstimate(
  phases: TimelinePhaseInput[],
  durationSummary: string,
  items: CostLineItemInput[],
) {
  const parsedWindows = phases
    .map((phase) => parseTimelineWindow(phase.duration))
    .filter((window): window is TimelineWindow => Boolean(window));

  if (parsedWindows.length === phases.length && parsedWindows.length > 0) {
    const totalDays = Math.max(...parsedWindows.map((window) => convertWindowToDays(window)));
    const months = Math.max(1, Math.ceil(totalDays / 20));
    return {
      months,
      helperText: durationSummary.trim() ? `Current delivery plan: ${durationSummary}.` : "",
      billingHelperText: `Billing uses ${formatMonthLabel(months)} at the current monthly rate.`,
    };
  }

  const months = inferProjectDurationMonths(durationSummary, items);
  return {
    months,
    helperText: durationSummary.trim() ? `Current delivery plan: ${durationSummary}.` : "",
    billingHelperText: `Billing uses ${formatMonthLabel(months)} at the current monthly rate.`,
  };
}

function parseTimelineWindow(value: string): TimelineWindow | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const leadingUnitMatch = trimmed.match(
    /\b(day|days|week|weeks|month|months)\s*(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?/i,
  );

  if (leadingUnitMatch) {
    return {
      unit: normalizeTimelineUnit(leadingUnitMatch[1]),
      end: Number(leadingUnitMatch[3] ?? leadingUnitMatch[2]),
    };
  }

  const trailingUnitMatch = trimmed.match(
    /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(day|days|week|weeks|month|months)\b/i,
  );

  if (trailingUnitMatch) {
    return {
      unit: normalizeTimelineUnit(trailingUnitMatch[3]),
      end: Number(trailingUnitMatch[2] ?? trailingUnitMatch[1]),
    };
  }

  return null;
}

function normalizeTimelineUnit(value: string): TimelineWindow["unit"] {
  if (value.toLowerCase().startsWith("day")) {
    return "DAY";
  }

  if (value.toLowerCase().startsWith("week")) {
    return "WEEK";
  }

  return "MONTH";
}

function convertWindowToDays(window: TimelineWindow) {
  switch (window.unit) {
    case "DAY":
      return window.end;
    case "WEEK":
      return window.end * 5;
    case "MONTH":
      return window.end * 20;
  }
}

function formatMonthLabel(months: number) {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function buildProposalRoleOptions(
  people: RateCardPersonRecord[],
  proposalCurrency: "GBP" | "USD" | "EUR",
): ProposalRoleOption[] {
  return proposalRoleBlueprints.map((blueprint) => {
    if (blueprint.requiresManualRate) {
      return {
        id: blueprint.id,
        title: blueprint.title,
        detail: blueprint.description,
        defaultMonthlyRate: null,
        sourceRate: null,
        sourceCurrencyCode: null,
        billingPeriod: null,
        isManualRate: true,
      };
    }

    const matchingPeople = people.filter(
      (person) => roleLevelFromArea(person.area) === blueprint.id,
    );
    const sourceRates = matchingPeople
      .map((person) => Number(person.sourceRate))
      .filter((rate) => rate > 0);
    const convertedRates = matchingPeople
      .map((person) => convertSourceRateToMonthlyProposalCurrency(person, proposalCurrency))
      .filter((rate): rate is number => rate !== null && rate > 0);

    const fallbackMonthlyRate =
      blueprint.fallbackSourceRate &&
      blueprint.fallbackSourceCurrencyCode &&
      blueprint.fallbackBillingPeriod
        ? convertMonthlyRateBetweenCurrencies(
            convertSourceRateToMonthlyAmount(
              blueprint.fallbackSourceRate,
              blueprint.fallbackBillingPeriod,
            ),
            blueprint.fallbackSourceCurrencyCode,
            proposalCurrency,
          )
        : null;

    const defaultMonthlyRate = average(convertedRates) ?? fallbackMonthlyRate;
    const sourceRate = average(sourceRates) ?? blueprint.fallbackSourceRate ?? null;
    const sourceCurrencyCode =
      normalizeSupportedCurrency(matchingPeople[0]?.sourceCurrencyCode ?? "") ??
      blueprint.fallbackSourceCurrencyCode ??
      null;
    const billingPeriod =
      matchingPeople[0]?.billingPeriod ?? blueprint.fallbackBillingPeriod ?? null;
    const rosterCount = matchingPeople.length;

    return {
      id: blueprint.id,
      title: blueprint.title,
      detail:
        rosterCount > 0
          ? `${blueprint.description} Built from ${rosterCount} saved ${rosterCount === 1 ? "person" : "people"}.`
          : `${blueprint.description} Using the current shared benchmark.`,
      defaultMonthlyRate: defaultMonthlyRate
        ? Number(defaultMonthlyRate.toFixed(2))
        : null,
      sourceRate: sourceRate ? Number(sourceRate.toFixed(2)) : null,
      sourceCurrencyCode,
      billingPeriod,
      isManualRate: false,
    };
  });
}

function getSelectedRateCardPerson(
  item: CostLineItemInput,
  peopleById: Record<string, RateCardPersonRecord>,
) {
  if (!item.itemName.startsWith(RATE_CARD_PREFIX)) {
    return null;
  }

  const personId = item.itemName.replace(RATE_CARD_PREFIX, "");
  return peopleById[personId] ?? null;
}

function resolveSelectedProposalRole(
  item: CostLineItemInput,
  peopleById: Record<string, RateCardPersonRecord>,
  roleOptionsById: Record<string, ProposalRoleOption>,
) {
  if (item.itemName.startsWith(PROPOSAL_ROLE_PREFIX)) {
    const roleId = item.itemName.replace(PROPOSAL_ROLE_PREFIX, "");
    return roleOptionsById[roleId] ?? null;
  }

  const selectedPerson = getSelectedRateCardPerson(item, peopleById);
  if (selectedPerson) {
    const roleId = roleLevelFromArea(selectedPerson.area);
    return roleId ? roleOptionsById[roleId] ?? null : null;
  }

  const normalizedCategory = slugify(item.category);
  if (!normalizedCategory) {
    return null;
  }

  return (
    Object.values(roleOptionsById).find(
      (role) => slugify(role.title) === normalizedCategory,
    ) ?? null
  );
}

function buildCustomRoleReference(role: string) {
  const fallback = role.trim() || "custom-role";
  return `${CUSTOM_ROLE_PREFIX}${slugify(fallback)}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function suggestedUnitCostForRole(
  role: ProposalRoleOption,
  currentValue: number,
  currentRoleId: string | null,
) {
  if (role.defaultMonthlyRate === null) {
    if (currentRoleId == null || currentRoleId === role.id) {
      return currentValue;
    }
    return 0;
  }

  if (currentRoleId === role.id && currentValue > 0) {
    return currentValue;
  }

  return Number(role.defaultMonthlyRate.toFixed(2));
}

function buildRoleGuidance(
  role: ProposalRoleOption,
  proposalCurrency: "GBP" | "USD" | "EUR",
) {
  if (role.isManualRate) {
    return {
      tone: "neutral" as const,
      message: `Manual role. Set the ${proposalCurrency} monthly rate for this proposal.`,
    };
  }

  if (
    role.sourceRate === null ||
    role.sourceCurrencyCode === null ||
    role.billingPeriod === null ||
    role.defaultMonthlyRate === null
  ) {
    return {
      tone: "warning" as const,
      message: `Benchmark pricing is unavailable right now. Set the ${proposalCurrency} monthly rate manually.`,
    };
  }

  const sourceSummary = `${formatCurrency(role.sourceRate, role.sourceCurrencyCode)} · ${rateBillingLabel(role.billingPeriod)}`;
  const proposalSummary = formatCurrency(role.defaultMonthlyRate, proposalCurrency);

  return {
    tone: "neutral" as const,
    message: `Shared benchmark: ${sourceSummary}. Proposal default: ${proposalSummary} per month.`,
  };
}

function rateBillingLabel(period: RateBillingPeriod) {
  switch (period) {
    case "DAY":
      return "per day";
    case "WEEK":
      return "per week";
    case "MONTH":
      return "per month";
  }
}

function roleLevelFromArea(area: string) {
  const normalized = area.trim().toLowerCase();
  if (normalized.startsWith("senior")) {
    return "senior";
  }
  if (normalized.startsWith("mid level") || normalized.startsWith("mid-level")) {
    return "mid-level";
  }
  if (normalized.startsWith("junior")) {
    return "junior";
  }
  return null;
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function convertSourceRateToMonthlyProposalCurrency(
  person: RateCardPersonRecord,
  proposalCurrency: "GBP" | "USD" | "EUR",
) {
  return convertMonthlyRateBetweenCurrencies(
    convertSourceRateToMonthlyAmount(person.sourceRate, person.billingPeriod),
    normalizeSupportedCurrency(person.sourceCurrencyCode),
    proposalCurrency,
  );
}

function convertSourceRateToMonthlyAmount(
  sourceRate: number,
  billingPeriod: RateBillingPeriod,
) {
  switch (billingPeriod) {
    case "DAY":
      return sourceRate * 20;
    case "WEEK":
      return sourceRate * 4;
    case "MONTH":
      return sourceRate;
  }
}

function convertMonthlyRateBetweenCurrencies(
  amount: number,
  sourceCurrencyCode: "GBP" | "USD" | "EUR" | null,
  targetCurrencyCode: "GBP" | "USD" | "EUR",
) {
  if (!sourceCurrencyCode) {
    return null;
  }

  const sourceRateToGBP = ROLE_FX_TO_GBP[sourceCurrencyCode];
  const targetRateToGBP = ROLE_FX_TO_GBP[targetCurrencyCode];

  if (!sourceRateToGBP || !targetRateToGBP) {
    return null;
  }

  const amountInGBP = amount * sourceRateToGBP;
  return amountInGBP / targetRateToGBP;
}

function normalizeSupportedCurrency(value: string): "GBP" | "USD" | "EUR" | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "GBP" || normalized === "USD" || normalized === "EUR") {
    return normalized;
  }
  return null;
}

function resolveBudgetRowSubtitle(
  roleTitle: string,
  teamAllocations: CostingSectionData["teamAllocations"],
  rateCardPeople: RateCardPersonRecord[],
) {
  const matchingAllocation = (teamAllocations ?? []).find(
    (entry) => slugify(entry.role) === slugify(roleTitle),
  );

  if (matchingAllocation?.teamMemberName?.trim()) {
    return matchingAllocation.teamMemberName;
  }

  const matchingPerson = rateCardPeople.find((person) =>
    slugify(person.area).includes(slugify(roleTitle)),
  );

  return matchingPerson?.name ?? "TBC";
}

function stackTone(label: string) {
  switch (label.toLowerCase()) {
    case "docs":
      return "border-[#e9d7fe] bg-[#f9f5ff] text-[#6941c6]";
    case "commercial":
      return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
    case "delivery oversight":
      return "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]";
    case "signed":
      return "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]";
    case "delivery":
      return "border-[#e5e5e5] bg-[#fafafa] text-[#404040]";
    case "legal":
      return "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]";
    case "...":
      return "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]";
    default:
      return "border-[var(--border-2)] bg-white text-[var(--text-2)]";
  }
}

function currencySymbol(currency: "GBP" | "USD" | "EUR") {
  switch (currency) {
    case "GBP":
      return "£";
    case "USD":
      return "$";
    case "EUR":
      return "€";
  }
}

function roundToCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundToDecimal(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function formatPlainNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatEditableNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function buildPhaseBudgetMap(
  phases: TimelinePhaseInput[],
  totalBudget: number,
) {
  if (!phases.length) {
    return {} as Record<string, number>;
  }

  const phaseDurations = estimatePhaseDurations(phases);
  const totalDuration = phaseDurations.reduce((sum, duration) => sum + duration, 0) || phases.length;
  const budgetMap: Record<string, number> = {};
  let allocated = 0;

  phases.forEach((phase, index) => {
    const key = phase.id ?? phase.name;
    const remaining = roundToCurrency(totalBudget - allocated);
    const amount =
      index === phases.length - 1
        ? remaining
        : roundToCurrency(totalBudget * (phaseDurations[index] / totalDuration));

    budgetMap[key] = amount;
    allocated += amount;
  });

  return budgetMap;
}

function estimatePhaseDurations(phases: TimelinePhaseInput[]) {
  const parsedWindows = phases.map((phase) => parseTimelineWindow(phase.duration));

  if (parsedWindows.some((window) => !window)) {
    return phases.map(() => 1);
  }

  let previousEnd = 0;
  return parsedWindows.map((window) => {
    const nextEnd = convertWindowToDays(window as TimelineWindow);
    const duration = Math.max(nextEnd - previousEnd, 1);
    previousEnd = Math.max(previousEnd, nextEnd);
    return duration;
  });
}

function findMatchingPhaseId(label: string, phases: TimelinePhaseInput[]) {
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedLabel) {
    return null;
  }

  const match = phases.find(
    (phase) => phase.name.trim().toLowerCase() === normalizedLabel,
  );

  return match?.id ?? null;
}

function hydratePaymentScheduleRow(
  row: PaymentScheduleRow,
  index: number,
  phases: TimelinePhaseInput[],
  phaseBudgetMap: Record<string, number>,
) {
  const matchedPhase = row.timelinePhaseId
    ? phases.find((phase) => phase.id === row.timelinePhaseId) ?? null
    : null;
  const phaseKey = matchedPhase ? matchedPhase.id ?? matchedPhase.name : "";
  const phaseTotal =
    row.phaseTotal ?? (phaseKey ? phaseBudgetMap[phaseKey] ?? null : null);

  return reconcilePaymentScheduleRow(
    {
      id: row.id || createRowId(`payment-${index + 1}`),
      timelinePhaseId: matchedPhase?.id ?? row.timelinePhaseId ?? "",
      phaseLabel: row.phaseLabel ?? matchedPhase?.name ?? "",
      phaseDuration: row.phaseDuration ?? matchedPhase?.duration ?? "",
      phaseTotal,
      action: row.action,
      periodCovered: row.periodCovered,
      paymentPercent: row.paymentPercent ?? null,
      includedWork: row.includedWork ?? "",
      amount: row.amount ?? null,
    },
    phases,
    phaseBudgetMap,
    row.paymentPercent != null ? "percent" : "amount",
  );
}

function createPaymentScheduleRow(
  phases: TimelinePhaseInput[],
  phaseBudgetMap: Record<string, number>,
) {
  const firstPhase = phases[0];
  const phaseKey = firstPhase ? firstPhase.id ?? firstPhase.name : "";

  return reconcilePaymentScheduleRow(
    {
      id: createRowId("payment"),
      timelinePhaseId: firstPhase?.id ?? "",
      phaseLabel: firstPhase?.name ?? "",
      phaseDuration: firstPhase?.duration ?? "",
      phaseTotal: phaseKey ? phaseBudgetMap[phaseKey] ?? null : null,
      action: "",
      periodCovered: "",
      paymentPercent: 0,
      includedWork: "",
      amount: 0,
    },
    phases,
    phaseBudgetMap,
    "percent",
  );
}

function reconcilePaymentScheduleRow(
  row: PaymentScheduleRow,
  phases: TimelinePhaseInput[],
  phaseBudgetMap: Record<string, number>,
  driver: "amount" | "percent",
) {
  const matchedPhase = row.timelinePhaseId
    ? phases.find((phase) => phase.id === row.timelinePhaseId) ?? null
    : null;
  const matchedPhaseKey = matchedPhase ? matchedPhase.id ?? matchedPhase.name : "";
  const nextPhaseLabel = row.phaseLabel ?? matchedPhase?.name ?? "";
  const nextPhaseDuration = row.phaseDuration ?? matchedPhase?.duration ?? "";
  const nextPhaseTotal =
    row.phaseTotal ?? (matchedPhaseKey ? phaseBudgetMap[matchedPhaseKey] ?? null : null);

  const amount =
    row.amount == null
      ? driver === "percent" && nextPhaseTotal != null
        ? roundToCurrency(nextPhaseTotal * ((row.paymentPercent ?? 0) / 100))
        : 0
      : row.amount;

  const paymentPercent =
    row.paymentPercent == null
      ? nextPhaseTotal
        ? roundToDecimal((amount / nextPhaseTotal) * 100, 2)
        : 0
      : row.paymentPercent;

  return {
    ...row,
    timelinePhaseId: matchedPhase?.id ?? row.timelinePhaseId ?? "",
    phaseLabel: nextPhaseLabel,
    phaseDuration: nextPhaseDuration,
    phaseTotal: nextPhaseTotal,
    amount:
      driver === "percent" && nextPhaseTotal != null
        ? roundToCurrency(nextPhaseTotal * (paymentPercent / 100))
        : amount,
    paymentPercent:
      driver === "amount" && nextPhaseTotal
        ? roundToDecimal((amount / nextPhaseTotal) * 100, 2)
        : paymentPercent,
  };
}
