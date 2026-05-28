/** Section type: `term` — effective date, duration, renewal, notice period, governing law. */

import { TermEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { PrintTable, Td } from "@/lib/sections/_shared";
import type { TermSectionData } from "@/types/proposal";

export const termSection = defineSection<TermSectionData>({
  key: "term",
  displayName: "Term & Termination",
  description: "Duration, renewal, notice period, governing law.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => <TermEditor data={data} onChange={onChange} />,
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
