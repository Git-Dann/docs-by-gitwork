"use client";

import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { CurrencyField } from "@/components/proposals/currency-field";
import { ListItemsEditor } from "@/components/proposals/list-items-editor";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, parseNumber } from "@/lib/format";
import type { CostLineItemInput, CostingSectionData, PaymentScheduleRow } from "@/types/proposal";

export interface CostBreakdownValue extends CostingSectionData {
  items: CostLineItemInput[];
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
  const subtotal = value.items.reduce((total, item) => total + item.subtotal, 0);
  const discountAmount = subtotal * ((value.discount ?? 0) / 100);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const taxValue = discountedSubtotal * ((value.taxRate ?? 0) / 100);
  const grandTotal = discountedSubtotal + taxValue;
  const paymentScheduleTotal = value.paymentSchedule.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const paymentMatchesBudget = Math.abs(paymentScheduleTotal - discountedSubtotal) < 0.01;
  const billablePeopleCount = value.items.filter((item) => item.category.trim().length > 0 && item.unitCost > 0).length;
  const monthlyRunRate = value.items.reduce((sum, item) => sum + (item.unitCost > 0 ? item.unitCost : 0), 0);

  function updateItem(index: number, patch: Partial<CostLineItemInput>) {
    const nextItems = value.items.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const next = {
        ...item,
        ...patch,
      };

      return {
        ...next,
        subtotal: Number((next.quantity * next.unitCost).toFixed(2)),
      };
    });

    onChange({
      ...value,
      items: nextItems,
    });
  }

  function addItem() {
    onChange({
      ...value,
      items: [
        ...value.items,
        {
          category: "",
          itemName: "",
          description: "",
          quantity: 1,
          unitCost: 0,
          subtotal: 0,
          costKind: "ONE_OFF",
          sortOrder: value.items.length,
        },
      ],
    });
  }

  function removeItem(index: number) {
    onChange({
      ...value,
      items: value.items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    });
  }

  function updatePaymentRow(index: number, patch: Partial<PaymentScheduleRow>) {
    onChange({
      ...value,
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
      paymentSchedule: [
        ...value.paymentSchedule,
        {
          id: createRowId("payment"),
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
      paymentSchedule: value.paymentSchedule.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Commercial settings"
        description="Core pricing controls and the commercial totals used across the proposal."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-[var(--text-3)]">Currency</span>
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
            label="People"
            value={`${billablePeopleCount} ${billablePeopleCount === 1 ? "row" : "rows"}`}
          />
          <MiniMetric label="Monthly run rate" value={formatCurrency(monthlyRunRate, value.currency)} />
          <MiniMetric
            label={`Discount (${value.discount}%)`}
            value={`-${formatCurrency(discountAmount, value.currency)}`}
          />
          <MiniMetric label="Grand total" value={formatCurrency(grandTotal, value.currency)} />
        </div>
      </SectionCard>

      <SectionCard
        title="Budget breakdown"
        description="Repurpose this as your people-based delivery budget. Each row represents a person or role allocation."
      >
        <div className="app-table-shell overflow-x-auto">
          <table className="app-table min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">People</th>
                <th className="text-left">Tech Stack</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {value.items.map((item, index) => (
                <tr key={item.id ?? `cost-${index}`}>
                  <td className="align-top">
                    <input
                      value={item.category}
                      onChange={(event) => updateItem(index, { category: event.target.value })}
                      className={cn(tableInputClasses, "min-w-[180px]")}
                      placeholder="Engineer, PM, QA..."
                    />
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
                    <input
                      value={item.quantity}
                      onChange={(event) => updateItem(index, { quantity: parseNumber(event.target.value, 0) })}
                      className={cn(tableInputClasses, "w-14 min-w-0 text-right")}
                    />
                  </td>
                  <td className="align-top text-right">
                    <input
                      value={item.unitCost}
                      onChange={(event) => updateItem(index, { unitCost: parseNumber(event.target.value, 0) })}
                      className={cn(tableInputClasses, "w-28 min-w-0 text-right")}
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <Button
            type="button"
            onClick={addItem}
            variant="secondary"
            size="xs"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add person
          </Button>

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
        description="Milestone-based billing, structured in the same table system as the budget breakdown."
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <TextAreaField
            label="Payment schedule intro"
            value={value.paymentScheduleIntro}
            onChange={(paymentScheduleIntro) => onChange({ ...value, paymentScheduleIntro })}
            rows={3}
          />
          <div className="space-y-3">
            <TextAreaField
              label="Payment terms"
              value={value.paymentTerms}
              onChange={(paymentTerms) => onChange({ ...value, paymentTerms })}
              rows={2}
            />
            <TextAreaField
              label="VAT notice"
              value={value.vatNotice}
              onChange={(vatNotice) => onChange({ ...value, vatNotice })}
              rows={2}
            />
            <TextAreaField
              label="IP transfer notice"
              value={value.ipTransferNotice}
              onChange={(ipTransferNotice) => onChange({ ...value, ipTransferNotice })}
              rows={2}
            />
          </div>
        </div>

        <div className="app-table-shell overflow-x-auto">
          <table className="app-table min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Action</th>
                <th className="text-left">Period covered</th>
                <th className="text-left">Included work</th>
                <th className="text-right">Amount (ex VAT)</th>
                <th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {value.paymentSchedule.map((row, index) => (
                <tr key={row.id}>
                  <td className="align-top">
                    <input
                      value={row.action}
                      onChange={(event) => updatePaymentRow(index, { action: event.target.value })}
                      className={cn(tableInputClasses, "min-w-[150px]")}
                    />
                  </td>
                  <td className="align-top">
                    <input
                      value={row.periodCovered}
                      onChange={(event) => updatePaymentRow(index, { periodCovered: event.target.value })}
                      className={cn(tableInputClasses, "min-w-[130px]")}
                    />
                  </td>
                  <td className="align-top">
                    <textarea
                      value={row.includedWork}
                      onChange={(event) => updatePaymentRow(index, { includedWork: event.target.value })}
                      rows={2}
                      className={cn(tableTextAreaClasses, "min-w-[280px]")}
                    />
                  </td>
                  <td className="align-top text-right">
                    <input
                      value={row.amount ?? ""}
                      onChange={(event) =>
                        updatePaymentRow(index, { amount: parseNullableNumber(event.target.value) })
                      }
                      className={cn(tableInputClasses, "w-28 min-w-0 text-right")}
                    />
                  </td>
                  <td className="align-top text-right">
                    <Button
                      type="button"
                      onClick={() => removePaymentRow(index)}
                      variant="danger"
                      size="icon-sm"
                      aria-label="Remove payment milestone"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <Button
            type="button"
            onClick={addPaymentRow}
            variant="secondary"
            size="xs"
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          >
            Add milestone
          </Button>

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

      <ListItemsEditor
        title="Additional notes"
        items={value.additionalNotes}
        onChange={(additionalNotes) => onChange({ ...value, additionalNotes })}
      />
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
  function toggle(option: string) {
    onChange(
      value.includes(option)
        ? value.filter((entry) => entry !== option)
        : [...value, option].sort((left, right) => left.localeCompare(right)),
    );
  }

  return (
    <details className="relative">
      <summary className="flex min-h-9 min-w-[260px] list-none items-center justify-between gap-3 rounded-[12px] border border-[var(--border-2)] bg-white px-3 py-2 pr-4 text-left text-sm text-[var(--text-1)] [&::-webkit-details-marker]:hidden">
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
            <span className="text-[var(--text-3)]">Select tech stack</span>
          )}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
      </summary>

      <div className="absolute left-0 z-20 mt-2 max-h-80 w-[320px] overflow-y-auto rounded-[20px] border border-[var(--border-2)] bg-white p-2 shadow-[var(--shadow-lg)]">
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
      </div>
    </details>
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

function TextAreaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows ?? 4}
        className="proposal-field-compact w-full"
      />
    </label>
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

function parseNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  return parseNumber(value, 0);
}

function parseTechStackValue(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const tableInputClasses = "app-input-compact min-w-[120px] text-[var(--text-1)]";

const tableTextAreaClasses = "proposal-field-compact w-full text-[var(--text-1)]";
