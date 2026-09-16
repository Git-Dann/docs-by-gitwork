/**
 * Section type: `parties`
 *
 * The counterparties to an agreement. The structured editor lives in
 * `src/components/proposals/legal-editors.tsx`; the registry wraps it so the dispatcher can load it
 * uniformly.
 *
 * The Preview renders **clause prose**, not cards — an intro line then one `(a)/(b)/(c)` item per
 * party, exactly as the reference NDA reads:
 *
 *   This agreement is dated 4 August 2026 and is made between:
 *     (a) **Gitwork Group Ltd**, a company registered in England and Wales under number …,
 *         whose registered office is at … ("Gitwork");  ← the real values come from `@/lib/gitwork`
 *     (b) **Shuffle Love Ltd**, a company registered in England and Wales … ("the Client"); and
 *     (c) **Alex Doe**, in a personal capacity, care of … ("the Founder").
 *
 * It used to print a grid of `DISCLOSING PARTY / [party name]` cards, which duplicated the party
 * columns the cover already carries — the same fact stated twice, in two different visual grammars.
 * The cover owns the at-a-glance columns; this block owns the operative sentence.
 *
 * Markup is the document's own `.doc-clause-subs` list (`globals.css` → "Legal numbering"), the
 * same element a `prose` block's sub-items render into, so the `(a)` gutter, accent mono marker and
 * hanging indent are identical to a real clause instead of a lookalike.
 */

import { UserGroupIcon } from "@heroicons/react/24/outline";
import { PartiesEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
import {
  clauseItemPunctuation,
  partyDefinedTerm,
  partyDetailLines,
  partyDisplayName,
} from "@/lib/sections/parties-text";
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
  Preview: ({ data }) => {
    const parties = (data.parties ?? []).filter(
      (party) => partyDisplayName(party) || partyDetailLines(party).length,
    );
    return (
      <div className="max-w-4xl space-y-4 text-[16px] leading-8 text-[var(--text-2)]">
        {data.intro?.trim() ? <p>{renderInline(data.intro, "parties-intro")}</p> : null}
        {parties.length ? (
          <ol className="doc-clause-subs">
            {parties.map((party, index) => {
              const name = partyDisplayName(party);
              // Detail lines are clause FRAGMENTS here (not stacked lines as on the cover), so they
              // join into the one sentence the reference document sets.
              const details = partyDetailLines(party).join(", ");
              const term = partyDefinedTerm(party);
              return (
                <li key={party.id}>
                  {name ? (
                    <span className="font-semibold text-[var(--text-1)]">
                      {renderInline(name, `party-${index}-name`)}
                    </span>
                  ) : null}
                  {details ? (
                    <>
                      {name ? ", " : null}
                      {renderInline(details, `party-${index}-details`)}
                    </>
                  ) : null}
                  {term ? <> (&ldquo;{term}&rdquo;)</> : null}
                  {clauseItemPunctuation(index, parties.length)}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    );
  },
});

export const partiesDefaultData = DEFAULT;
