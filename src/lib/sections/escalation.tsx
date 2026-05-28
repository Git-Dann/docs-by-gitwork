/** Section type: `escalation` — escalation ladder for unresolved incidents. */

import { EscalationEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { SectionIntro } from "@/lib/sections/_shared";
import type { EscalationSectionData } from "@/types/proposal";

export const escalationSection = defineSection<EscalationSectionData>({
  key: "escalation",
  displayName: "Escalation",
  description: "Ladder for escalating unresolved incidents.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => <EscalationEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <ol className="space-y-3">
        {(data.levels ?? []).map((l) => (
          <li
            key={l.id}
            className="proposal-block-avoid flex gap-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-200)] font-[family-name:var(--font-display)] text-lg text-[var(--brand-700)]">
              {l.level}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-[var(--text-1)]">{l.contact || "—"}</p>
              <p className="text-sm text-[var(--text-3)]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Trigger:
                </span>{" "}
                {l.timeframe}
              </p>
              <p className="text-sm text-[var(--text-2)]">{l.criteria}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  ),
});
