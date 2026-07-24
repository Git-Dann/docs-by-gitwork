/**
 * Section type: `parties`
 *
 * Lists the counterparties to an agreement. The structured editor lives in
 * `src/components/proposals/legal-editors.tsx`; the registry wraps it so the dispatcher can
 * load it uniformly. Previews print as a 2-column card grid.
 */

import { UserGroupIcon } from "@heroicons/react/24/outline";
import { PartiesEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
import type { PartiesSectionData } from "@/types/proposal";

const DEFAULT: PartiesSectionData = {
  intro: "",
  parties: [],
};

export const partiesSection = defineSection<PartiesSectionData>({
  key: "parties",
  displayName: "Parties",
  description: "Counterparties to this Agreement.",
  category: "people",
  icon: UserGroupIcon,
  defaultData: DEFAULT,
  defaultTitle: "Parties",
  defaultDescription: "Counterparties to this Agreement.",
  recommendedFor: ["SLA", "SOW", "MSA", "NDA", "CO"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => <PartiesEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      {data.intro?.trim() ? (
        <p className="text-sm leading-7 text-[var(--text-2)]">
          {renderInline(data.intro, "parties-intro")}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(data.parties ?? []).map((p) => (
          <div key={p.id} className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              {p.role || "Party"}
            </p>
            <p className="mt-2 text-base font-semibold text-[var(--text-1)]">
              {p.name || p.organization || "—"}
            </p>
            {p.organization && p.organization !== p.name ? (
              <p className="mt-0.5 text-sm text-[var(--text-3)]">{p.organization}</p>
            ) : null}
            {p.email ? <p className="mt-2 text-sm text-[var(--text-3)]">{p.email}</p> : null}
          </div>
        ))}
      </div>
    </div>
  ),
});

export const partiesDefaultData = DEFAULT;
