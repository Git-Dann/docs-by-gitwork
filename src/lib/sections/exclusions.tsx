/** Section type: `exclusions` — events excluded from SLA targets. */

import { ExclusionsEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { SectionIntro } from "@/lib/sections/_shared";
import type { ExclusionsSectionData } from "@/types/proposal";

export const exclusionsSection = defineSection<ExclusionsSectionData>({
  key: "exclusions",
  displayName: "Exclusions",
  description: "Events that don't count against the SLA targets.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => <ExclusionsEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <ul className="space-y-3">
        {(data.items ?? []).map((it) => (
          <li
            key={it.id}
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4"
          >
            <p className="font-medium text-[var(--text-1)]">{it.exclusion || "—"}</p>
            {it.rationale ? (
              <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{it.rationale}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  ),
});
