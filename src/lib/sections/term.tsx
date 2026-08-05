/** Section type: `term` — effective date, duration, renewal, notice period, governing law. */

import { ScaleIcon } from "@heroicons/react/24/outline";
import type { SectionField } from "@/lib/sections/field-schema";
import { defineSection } from "@/lib/sections/types";
import { PrintTable, Td } from "@/lib/sections/_shared";
import type { TermSectionData } from "@/types/proposal";

const DEFAULT: TermSectionData = {
  effectiveDate: new Date().toISOString().slice(0, 10),
  initialTermMonths: 12,
  autoRenew: true,
  renewalTerm: "",
  noticePeriodDays: 60,
  governingLaw: "",
  terminationForCause: "",
};

/**
 * The first block to declare its editor rather than write one.
 *
 * This replaced `TermEditor`, sixty lines of longhand that also carried a real bug: every number
 * field ran `Number(e.target.value)`, so clearing "Notice period" saved `0` — "zero days' notice"
 * — instead of unsetting it. `applyFieldChange` yields `undefined` there, so the block's own
 * default applies on render.
 */
const FIELDS: ReadonlyArray<SectionField<TermSectionData>> = [
  { kind: "date", key: "effectiveDate", label: "Effective date" },
  { kind: "number", key: "initialTermMonths", label: "Initial term (months)", min: 1 },
  { kind: "number", key: "noticePeriodDays", label: "Notice period (days)", min: 0 },
  { kind: "text", key: "governingLaw", label: "Governing law", placeholder: "England and Wales" },
  {
    kind: "checkbox",
    key: "autoRenew",
    label: "Auto-renew at end of initial term",
  },
  {
    kind: "text",
    key: "renewalTerm",
    label: "Renewal term description",
    width: "full",
    placeholder: "Successive 12-month periods",
  },
  { kind: "textarea", key: "terminationForCause", label: "Termination for cause", rows: 4 },
];

export const termSection = defineSection<TermSectionData>({
  key: "term",
  displayName: "Term & Termination",
  description: "Duration, renewal, notice period, governing law.",
  category: "structure",
  icon: ScaleIcon,
  defaultData: DEFAULT,
  defaultTitle: "Term & Termination",
  defaultDescription: "Duration, renewal, notice period, governing law.",
  recommendedFor: ["SLA", "MSA", "SOW"],
  aiExpandable: true,
  fields: FIELDS,
  Preview: ({ data }) => {
    const rows: Array<[string, string]> = [
      ["Effective date", data.effectiveDate || "—"],
      ["Initial term", `${data.initialTermMonths ?? 12} months`],
      ["Auto-renew", data.autoRenew ? "Yes" : "No"],
      ["Renewal term", data.renewalTerm || "—"],
      ["Notice period", `${data.noticePeriodDays ?? 60} days`],
      ["Governing law", data.governingLaw || "—"],
    ];
    return (
      <div className="space-y-4">
        <PrintTable>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <Td top>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                    {k}
                  </span>
                </Td>
                <Td strong top>{v}</Td>
              </tr>
            ))}
          </tbody>
        </PrintTable>
        {data.terminationForCause ? (
          <div className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Termination for cause
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{data.terminationForCause}</p>
          </div>
        ) : null}
      </div>
    );
  },
});
