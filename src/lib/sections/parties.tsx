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

/** Max cards per row. 4–5 parties wrap to a second row rather than squashing to slivers. */
const MAX_COLUMNS = 3;

/** `PARTY A` / `PARTY B` / … fallback when a party carries no explicit role. */
function partyFallbackLabel(index: number): string {
  return `Party ${String.fromCharCode(65 + (index % 26))}`;
}

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
  Preview: ({ data }) => {
    const parties = data.parties ?? [];
    // Adapts to the party count: 1–3 sit on one row, 4–5 wrap. Never more than 3 across.
    const columns = Math.min(Math.max(parties.length, 1), MAX_COLUMNS);
    return (
      <div className="space-y-4">
        {data.intro?.trim() ? (
          <p className="text-sm leading-7 text-[var(--text-2)]">
            {renderInline(data.intro, "parties-intro")}
          </p>
        ) : null}
        {parties.length ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
          >
            {parties.map((p, index) => (
              <div
                key={p.id}
                className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-5"
              >
                <p
                  className="font-mono text-[10px] font-semibold uppercase"
                  style={{ letterSpacing: "0.14em", color: "var(--doc-accent)" }}
                >
                  {p.role?.trim() || partyFallbackLabel(index)}
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-normal leading-tight text-[var(--text-1)]">
                  {p.name || p.organization || "—"}
                </p>
                {p.organization && p.organization !== p.name ? (
                  <p className="mt-1.5 text-[12.5px] leading-[1.4] text-[var(--text-3)]">
                    {p.organization}
                  </p>
                ) : null}
                {p.email ? (
                  <p className="mt-1 text-[12.5px] leading-[1.4] text-[var(--text-3)]">{p.email}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
});

export const partiesDefaultData = DEFAULT;
