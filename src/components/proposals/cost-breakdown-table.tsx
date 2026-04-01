"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { CurrencyField } from "@/components/proposals/currency-field";
import { Button } from "@/components/ui/button";
import { listRateCardPeople } from "@/lib/api";
import { cn, formatCurrency, parseNumber } from "@/lib/format";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";
import type { CostLineItemInput, CostingSectionData, PaymentScheduleRow, TimelinePhaseInput } from "@/types/proposal";

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

const CUSTOM_ROLE_VALUE = "__custom_role__";
const RATE_CARD_PREFIX = "rate-card:";
const CUSTOM_ROLE_PREFIX = "custom-role:";

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

  useEffect(() => {
    const normalizedItems = value.items.map((item, index) => normalizeCostItem(item, index));
    const changed = normalizedItems.some((item, index) => {
      const current = value.items[index];
      return item.itemName !== current?.itemName || item.subtotal !== current?.subtotal;
    });

    if (changed) {
      onChange({
        ...value,
        items: normalizedItems,
      });
    }
  }, [onChange, value]);

  const rateCardPeopleById = useMemo(
    () =>
      rateCardPeople.reduce<Record<string, RateCardPersonRecord>>((result, person) => {
        result[person.id] = person;
        return result;
      }, {}),
    [rateCardPeople],
  );
  const timelinePhases = useMemo(
    () => [...(value.timelinePhases ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [value.timelinePhases],
  );
  const timelinePhaseById = useMemo(
    () =>
      timelinePhases.reduce<Record<string, TimelinePhaseInput>>((result, phase) => {
        if (phase.id) {
          result[phase.id] = phase;
        }
        return result;
      }, {}),
    [timelinePhases],
  );

  const subtotal = value.items.reduce((total, item) => total + item.subtotal, 0);
  const discountAmount = subtotal * ((value.discount ?? 0) / 100);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const taxValue = discountedSubtotal * ((value.taxRate ?? 0) / 100);
  const grandTotal = discountedSubtotal + taxValue;
  const paymentScheduleTotal = value.paymentSchedule.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const paymentMatchesBudget = Math.abs(paymentScheduleTotal - discountedSubtotal) < 0.01;
  const billablePeopleCount = value.items.filter((item) => item.category.trim().length > 0 && item.unitCost > 0).length;
  const monthlyRunRate = value.items.reduce((sum, item) => sum + (item.unitCost > 0 ? item.unitCost : 0), 0);
  const timelineDurationSummary = summarizeTimelineDuration(timelinePhases, value.durationSummary);
  const suggestedDurationMonths = inferProjectDurationMonths(timelineDurationSummary, value.items);

  function updateItem(index: number, patch: Partial<CostLineItemInput>) {
    const nextItems = value.items.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const next = {
        ...item,
        ...patch,
      };

      return normalizeCostItem({
        ...next,
        subtotal: Number((next.quantity * next.unitCost).toFixed(2)),
      }, itemIndex);
    });

    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      items: nextItems,
    });
  }

  function addItem() {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      items: [
        ...value.items,
        normalizeCostItem({
          category: "",
          itemName: `${CUSTOM_ROLE_PREFIX}new-person`,
          description: "",
          quantity: suggestedDurationMonths,
          unitCost: 0,
          subtotal: 0,
          costKind: "ONE_OFF",
          sortOrder: value.items.length,
        }, value.items.length),
      ],
    });
  }

  function removeItem(index: number) {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      items: value.items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    });
  }

  function updatePaymentRow(index: number, patch: Partial<PaymentScheduleRow>) {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      paymentSchedule: value.paymentSchedule.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              ...patch,
            }
          : row,
      ),
    });
  }

  function addPaymentRow() {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      paymentSchedule: [
        ...value.paymentSchedule,
        {
          id: createRowId("payment"),
          timelinePhaseId: "",
          action: "",
          periodCovered: "",
          includedWork: "",
          amount: 0,
        },
      ],
    });
  }

  function removePaymentRow(index: number) {
    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      paymentSchedule: value.paymentSchedule.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  function buildPaymentScheduleFromTimeline() {
    if (!timelinePhases.length) {
      return;
    }

    onChange({
      ...value,
      durationSummary: timelineDurationSummary,
      paymentSchedule: timelinePhases.map((phase, index) => createPaymentMilestoneFromPhase(phase, index)),
    });
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Commercial settings"
        description="Set the commercial frame for this proposal. The team duration now inherits from the delivery timeline, so commercials stay tied to the actual plan."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Currency</span>
            <CurrencyField
              value={value.currency}
              onChange={(currency) => onChange({ ...value, currency })}
            />
          </label>

          <NumberField
            label="Discount (%)"
            value={value.discount}
            onChange={(discount) => onChange({ ...value, discount })}
          />

          <NumberField
            label="VAT (%)"
            value={value.taxRate}
            onChange={(taxRate) => onChange({ ...value, taxRate })}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MiniMetric
            label="Budget rows"
            value={`${billablePeopleCount} ${billablePeopleCount === 1 ? "role" : "roles"}`}
          />
          <MiniMetric label="Timeline default" value={formatDurationSummary(timelineDurationSummary)} />
          <MiniMetric label="Monthly run rate" value={formatCurrency(monthlyRunRate, value.currency)} />
          <MiniMetric label="Grand total" value={formatCurrency(grandTotal, value.currency)} />
        </div>
      </SectionCard>

      <SectionCard
        title="Budget breakdown"
        description="Build the delivery budget row by row. Start from a saved person or use a flexible role when you only want the commercial shape without naming anyone."
      >
        {timelinePhases.length ? (
          <div className="rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                  Timeline default
                </p>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  Team rows now inherit the delivery timeline by default. Override any role when a
                  person joins later, finishes earlier, or only covers one phase.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1 text-sm font-medium text-[var(--text-1)]">
                {formatDurationSummary(timelineDurationSummary)}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {timelinePhases.map((phase) => (
                <div
                  key={phase.id ?? `${phase.name}-${phase.sortOrder}`}
                  className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <p className="text-sm font-semibold text-[var(--text-1)]">{phase.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">{phase.duration}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-3)] shadow-[var(--shadow-xs)]">
            Add your delivery timeline above first. Budget rows will then inherit that duration automatically.
          </div>
        )}

        <div className="rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-3)] shadow-[var(--shadow-xs)]">
          Cost breakdown should reflect the people actually working on the project. Use saved People & Rates entries when you want named assignments, or switch to a flexible role when you only want the commercial shape.
        </div>

        <div className="app-table-shell overflow-x-auto">
          <table className="app-table min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Assignment</th>
                <th className="text-left">Delivery focus</th>
                <th className="text-right">Timeline</th>
                <th className="text-right">Monthly rate</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {value.items.map((item, index) => {
                const selectedRateCardPerson = getSelectedRateCardPerson(item, rateCardPeopleById);
                const rateGuidance = selectedRateCardPerson
                  ? buildRateGuidance(selectedRateCardPerson, value.currency)
                  : null;

                return (
                <tr key={item.id ?? `cost-${index}`}>
                  <td className="align-top">
                    <div className="min-w-[280px] space-y-2">
                      <select
                        value={selectedRateCardPerson ? `${RATE_CARD_PREFIX}${selectedRateCardPerson.id}` : CUSTOM_ROLE_VALUE}
                        onChange={(event) => {
                          const nextValue = event.target.value;

                          if (nextValue === CUSTOM_ROLE_VALUE) {
                            updateItem(index, {
                              itemName: buildCustomRoleReference(item.category),
                            });
                            return;
                          }

                          const person = rateCardPeopleById[nextValue.replace(RATE_CARD_PREFIX, "")];
                          if (!person) {
                            return;
                          }

                          updateItem(index, {
                            itemName: `${RATE_CARD_PREFIX}${person.id}`,
                            category: person.name,
                            unitCost: suggestedUnitCostForPerson(person, value.currency, item.unitCost),
                          });
                        }}
                        className="app-select-compact w-full text-sm"
                      >
                        <option value={CUSTOM_ROLE_VALUE}>Flexible role</option>
                        {rateCardPeople.length > 0 ? (
                          <optgroup label="People & Rates">
                            {rateCardPeople.map((person) => (
                              <option key={person.id} value={`${RATE_CARD_PREFIX}${person.id}`}>
                                {person.name} · {person.area}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>

                      {selectedRateCardPerson ? (
                        <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {selectedRateCardPerson.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-3)]">
                            {selectedRateCardPerson.area}
                          </p>
                          <p
                            className={cn(
                              "mt-2 text-xs",
                              rateGuidance?.tone === "warning"
                                ? "text-amber-700"
                                : "text-[var(--text-3)]",
                            )}
                          >
                            {rateGuidance?.message}
                          </p>
                        </div>
                      ) : (
                        <input
                          value={item.category}
                          onChange={(event) =>
                            updateItem(index, {
                              category: event.target.value,
                              itemName: buildCustomRoleReference(event.target.value),
                            })
                          }
                          className={cn(tableInputClasses, "min-w-[220px]")}
                          placeholder="Delivery team, QA, Product oversight..."
                        />
                      )}
                    </div>
                  </td>
                  <td className="align-top">
                    <TechStackMultiSelect
                      value={parseTechStackValue(item.description)}
                      onChange={(nextStacks) =>
                        updateItem(index, {
                          description: nextStacks.join(", "),
                        })
                      }
                    />
                  </td>
                  <td className="align-top text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <DurationInput
                        value={item.quantity}
                        onChange={(quantity) => updateItem(index, { quantity })}
                      />
                      <span className="text-[11px] text-[var(--text-3)]">
                        {item.quantity === suggestedDurationMonths ? "Uses timeline default" : "Manual override"}
                      </span>
                    </div>
                  </td>
                  <td className="align-top text-right">
                    <MoneyInput
                      currency={value.currency}
                      value={item.unitCost}
                      onChange={(unitCost) => updateItem(index, { unitCost })}
                    />
                  </td>
                  <td className="align-top text-right text-xs font-medium text-[var(--text-1)]">
                    {formatCurrency(item.subtotal, value.currency)}
                  </td>
                  <td className="align-top text-right">
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      variant="danger"
                      size="icon-sm"
                      aria-label="Remove budget row"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Button
              type="button"
              onClick={addItem}
              variant="secondary"
              size="xs"
              leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
            >
              Add budget row
            </Button>
            <p className="text-xs text-[var(--text-3)]">
              {rateCardLoading
                ? "Loading People & Rates…"
                : rateCardError
                  ? "People & Rates are unavailable right now. You can still use flexible roles."
                  : "Saved people auto-fill when the proposal currency matches the stored roster currency. Flexible roles keep the budget anonymous when needed."}
            </p>
          </div>

          <div className="w-full max-w-xs space-y-1 rounded-[18px] border border-[var(--border-2)] bg-white p-4 text-sm shadow-[var(--shadow-xs)]">
            <SummaryRow label="Subtotal" value={formatCurrency(subtotal, value.currency)} />
            <SummaryRow
              label={`Discount (${value.discount}%)`}
              value={`-${formatCurrency(discountAmount, value.currency)}`}
            />
            <SummaryRow label={`VAT (${value.taxRate}%)`} value={formatCurrency(taxValue, value.currency)} />
            <SummaryRow label="Grand total" value={formatCurrency(grandTotal, value.currency)} strong />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Payment schedule"
        description="Describe how the project is invoiced over time. Milestones can link directly to the delivery timeline so commercials and delivery stay in step."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <NoticeCard>
            <TextAreaField
              label="Intro shown above the milestones"
              value={value.paymentScheduleIntro}
              onChange={(paymentScheduleIntro) => onChange({ ...value, paymentScheduleIntro })}
              rows={3}
              placeholder="Explain how the project is invoiced and how the milestones map to delivery."
            />
          </NoticeCard>
          <NoticeCard>
            <TextAreaField
              label="Payment terms"
              value={value.paymentTerms}
              onChange={(paymentTerms) => onChange({ ...value, paymentTerms })}
              rows={3}
              placeholder="Invoices are issued with a 7-day payment term."
            />
          </NoticeCard>
          <NoticeCard>
            <TextAreaField
              label="VAT note"
              value={value.vatNotice}
              onChange={(vatNotice) => onChange({ ...value, vatNotice })}
              rows={3}
              placeholder="All prices are exclusive of VAT."
            />
          </NoticeCard>
          <NoticeCard>
            <TextAreaField
              label="IP transfer note"
              value={value.ipTransferNotice}
              onChange={(ipTransferNotice) => onChange({ ...value, ipTransferNotice })}
              rows={3}
              placeholder="IP transfers on receipt of the relevant payment."
            />
          </NoticeCard>
        </div>

        {value.paymentSchedule.length ? (
          <div className="space-y-3">
            {value.paymentSchedule.map((row, index) => (
              <article
                key={row.id}
                className="rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                      Milestone {index + 1}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-3)]">
                      What gets invoiced, when it lands, and what delivery it covers.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => removePaymentRow(index)}
                    variant="danger"
                    size="icon-sm"
                    aria-label="Remove payment milestone"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div
                  className={cn(
                    "mt-4 grid gap-3",
                    timelinePhases.length
                      ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_160px]"
                      : "md:grid-cols-[minmax(0,1fr)_220px_160px]",
                  )}
                >
                  <FieldInput
                    label="Milestone name"
                    value={row.action}
                    onChange={(action) => updatePaymentRow(index, { action })}
                    placeholder="Kickoff invoice"
                  />
                  {timelinePhases.length ? (
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-[var(--text-2)]">Linked timeline phase</span>
                      <select
                        value={row.timelinePhaseId ?? ""}
                        onChange={(event) => {
                          const nextPhaseId = event.target.value;
                          if (!nextPhaseId) {
                            updatePaymentRow(index, { timelinePhaseId: "", periodCovered: row.periodCovered });
                            return;
                          }

                          const phase = timelinePhaseById[nextPhaseId];
                          if (!phase) {
                            return;
                          }

                          updatePaymentRow(index, {
                            timelinePhaseId: nextPhaseId,
                            action: row.action.trim() ? row.action : phase.name,
                            periodCovered: phase.duration,
                            includedWork: row.includedWork.trim()
                              ? row.includedWork
                              : phase.deliverables.length
                                ? phase.deliverables.join(", ")
                                : phase.summary,
                          });
                        }}
                        className="app-select-compact w-full text-sm"
                      >
                        <option value="">Not linked</option>
                        {timelinePhases.map((phase) => (
                          <option key={phase.id ?? phase.name} value={phase.id ?? ""}>
                            {phase.name} · {phase.duration}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <FieldInput
                    label="Timing"
                    value={row.periodCovered}
                    onChange={(periodCovered) => updatePaymentRow(index, { periodCovered })}
                    placeholder="Week 1"
                  />
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-[var(--text-2)]">Amount (ex VAT)</span>
                    <MoneyInput
                      currency={value.currency}
                      value={row.amount ?? 0}
                      onChange={(amount) => updatePaymentRow(index, { amount })}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <TextAreaField
                    label="What this milestone covers"
                    value={row.includedWork}
                    onChange={(includedWork) => updatePaymentRow(index, { includedWork })}
                    rows={3}
                    placeholder="What the client receives or what delivery checkpoint this invoice unlocks"
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
            No milestones yet. Add a billing step to explain how the delivery is invoiced.
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={addPaymentRow}
              variant="secondary"
              size="xs"
              leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
            >
              Add milestone
            </Button>
            {timelinePhases.length ? (
              <Button
                type="button"
                onClick={buildPaymentScheduleFromTimeline}
                variant="secondary"
                size="xs"
              >
                Use timeline phases
              </Button>
            ) : null}
          </div>

          <div className="space-y-1 text-right text-sm">
            <p className="text-[var(--text-3)]">
              Payment schedule total:{" "}
              <span className="font-semibold text-[var(--text-1)]">
                {formatCurrency(paymentScheduleTotal, value.currency)}
              </span>
            </p>
            <p className={cn("text-xs", paymentMatchesBudget ? "text-emerald-700" : "text-amber-700")}>
              {paymentMatchesBudget
                ? "Milestones match the discounted ex-VAT subtotal."
                : "Milestones do not yet match the discounted ex-VAT subtotal."}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Commercial notes"
        description="Add the small print and delivery assumptions in short notes that are easy to scan in the final proposal."
      >
        <NotesEditor
          items={value.additionalNotes}
          onChange={(additionalNotes) => onChange({ ...value, additionalNotes })}
        />
      </SectionCard>
    </div>
  );
}

function MoneyInput({
  currency,
  value,
  onChange,
}: {
  currency: "GBP" | "USD" | "EUR";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-h-9 w-[144px] min-w-0 overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-xs)] focus-within:border-[var(--brand-300)]">
      <span className="inline-flex min-w-[54px] items-center justify-center border-r border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
        {currency}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(parseNumber(event.target.value, 0))}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-right text-sm font-medium text-[var(--text-1)] outline-none"
      />
    </div>
  );
}

function DurationInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-h-9 w-[148px] min-w-0 overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-xs)] focus-within:border-[var(--brand-300)]">
      <input
        value={value}
        onChange={(event) => onChange(parseNumber(event.target.value, 0))}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-right text-sm font-medium text-[var(--text-1)] outline-none"
      />
      <span className="inline-flex min-w-[70px] items-center justify-center border-l border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
        months
      </span>
    </div>
  );
}

function NoticeCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
      {children}
    </div>
  );
}

function TechStackMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function toggle(option: string) {
    onChange(
      value.includes(option)
        ? value.filter((entry) => entry !== option)
        : [...value, option].sort((left, right) => left.localeCompare(right)),
    );
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setMenuStyle({
        top: rect.bottom + 8,
        left: rect.left,
        width: Math.max(rect.width, 320),
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-9 min-w-[260px] w-full list-none items-center justify-between gap-3 rounded-[12px] border border-[var(--border-2)] bg-white px-3 py-2 pr-4 text-left text-sm text-[var(--text-1)]"
        aria-expanded={isOpen}
      >
        <span className="flex flex-wrap gap-1.5">
          {value.length ? (
            value.map((entry) => (
              <span
                key={entry}
                className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]"
              >
                {entry}
              </span>
            ))
          ) : (
            <span className="text-[var(--text-3)]">Select delivery focus</span>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-3)] transition-transform",
            isOpen ? "rotate-180" : null,
          )}
        />
      </button>

      {isOpen && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[80] max-h-80 overflow-y-auto rounded-[20px] border border-[var(--border-2)] bg-white p-2 shadow-[var(--shadow-lg)]"
              style={{
                top: menuStyle.top,
                left: menuStyle.left,
                width: menuStyle.width,
              }}
            >
              {techStackOptions.map((option) => {
                const selected = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--surface-1)]"
                  >
                    <span className={selected ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]"}>
                      {option}
                    </span>
                    {selected ? <CheckIcon className="h-4 w-4 text-[var(--brand-600)]" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-subtle-panel space-y-4 p-4">
      <div>
        <p className="app-eyebrow">Section</p>
        <h4 className="mt-2 text-base font-semibold tracking-tight text-[var(--text-1)]">{title}</h4>
        <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(parseNumber(event.target.value, 0))}
        className="app-input-compact w-full"
      />
    </label>
  );
}

function FieldInput({
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
        className="app-input-compact w-full"
        placeholder={placeholder}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows ?? 4}
        className="proposal-field-compact w-full"
        placeholder={placeholder}
      />
    </label>
  );
}

function NotesEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.length ? (
        items.map((item, index) => (
          <div
            key={`${index}-${item}`}
            className="flex items-start gap-3 rounded-[16px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]"
          >
            <div className="rounded-full bg-[var(--surface-brand-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">
              Note {index + 1}
            </div>
            <input
              value={item}
              onChange={(event) =>
                onChange(items.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))
              }
              className="app-input-compact flex-1"
              placeholder="Add a commercial note or delivery assumption"
            />
            <Button
              type="button"
              onClick={() => onChange(items.filter((_, entryIndex) => entryIndex !== index))}
              variant="danger"
              size="icon-sm"
              aria-label="Remove note"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))
      ) : (
        <div className="rounded-[14px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
          No commercial notes yet. Add anything the client should know around billing, support, or handover.
        </div>
      )}

      <Button
        type="button"
        onClick={() => onChange([...items, ""])}
        variant="secondary"
        size="xs"
        leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
      >
        Add commercial note
      </Button>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}>{label}</span>
      <span className={strong ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}>{value}</span>
    </div>
  );
}

function parseTechStackValue(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeCostItem(item: CostLineItemInput, index: number): CostLineItemInput {
  return {
    ...item,
    itemName: item.itemName.trim() || buildCustomRoleReference(item.category || `role-${index + 1}`),
    subtotal: Number((item.quantity * item.unitCost).toFixed(2)),
  };
}

function summarizeTimelineDuration(
  phases: TimelinePhaseInput[],
  fallback: string,
) {
  if (!phases.length) {
    return fallback;
  }

  const windows = phases
    .map((phase) => phase.duration.trim())
    .filter(Boolean);

  return windows.length ? windows.join(" • ") : fallback;
}

function inferProjectDurationMonths(durationSummary: string, items: CostLineItemInput[]) {
  const monthsMatch = durationSummary.match(/(\d+(?:\.\d+)?)\s*month/i);
  if (monthsMatch) {
    return Math.max(1, Number(monthsMatch[1]));
  }

  const weekMatch = durationSummary.match(/(\d+(?:\.\d+)?)\s*week/i);
  if (weekMatch) {
    return Math.max(1, Math.ceil(Number(weekMatch[1]) / 4));
  }

  const existingMax = items.reduce((max, item) => Math.max(max, Number(item.quantity) || 0), 0);
  return existingMax > 0 ? existingMax : 1;
}

function formatDurationSummary(value: string) {
  const trimmed = value.trim();
  return trimmed || "Not set";
}

function createPaymentMilestoneFromPhase(phase: TimelinePhaseInput, index: number): PaymentScheduleRow {
  return {
    id: createRowId(`payment-${index + 1}`),
    timelinePhaseId: phase.id ?? "",
    action: phase.name,
    periodCovered: phase.duration,
    includedWork: phase.deliverables.length ? phase.deliverables.join(", ") : phase.summary,
    amount: 0,
  };
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

function suggestedUnitCostForPerson(
  person: RateCardPersonRecord,
  proposalCurrency: "GBP" | "USD" | "EUR",
  currentValue: number,
) {
  if (person.sourceCurrencyCode !== proposalCurrency) {
    return currentValue;
  }

  switch (person.billingPeriod) {
    case "DAY":
      return Number((person.sourceRate * 20).toFixed(2));
    case "WEEK":
      return Number((person.sourceRate * 4).toFixed(2));
    case "MONTH":
      return person.sourceRate;
  }
}

function buildRateGuidance(
  person: RateCardPersonRecord,
  proposalCurrency: "GBP" | "USD" | "EUR",
) {
  const sourceSummary = `${formatCurrency(person.sourceRate, person.sourceCurrencyCode)} · ${rateBillingLabel(person.billingPeriod)}`;

  if (person.sourceCurrencyCode !== proposalCurrency) {
    return {
      tone: "warning" as const,
      message: `Saved source rate: ${sourceSummary}. Proposal currency is ${proposalCurrency}, so set the converted amount in the rate field.`,
    };
  }

  if (person.billingPeriod === "DAY") {
    return {
      tone: "neutral" as const,
      message: `Saved source rate: ${sourceSummary}. The proposal rate field has been pref-filled as a 20-day monthly equivalent.`,
    };
  }

  if (person.billingPeriod === "WEEK") {
    return {
      tone: "neutral" as const,
      message: `Saved source rate: ${sourceSummary}. The proposal rate field has been pref-filled as a 4-week monthly equivalent.`,
    };
  }

  return {
    tone: "neutral" as const,
    message: `Using saved source rate: ${sourceSummary}.`,
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

const tableInputClasses = "app-input-compact min-w-[120px] text-[var(--text-1)]";
