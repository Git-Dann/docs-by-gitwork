/** Section type: `signatures` — signature blocks for each party. */

import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { SignaturesEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { SectionIntro } from "@/lib/sections/_shared";
import type { SignaturesSectionData } from "@/types/proposal";

export const signaturesSection = defineSection<SignaturesSectionData>({
  key: "signatures",
  displayName: "Signatures",
  description: "Authorised signatories for each party.",
  category: "people",
  icon: FingerPrintIcon,
  defaultData: { intro: "", blocks: [] },
  defaultTitle: "Signatures",
  defaultDescription: "Authorised signatories for each party.",
  recommendedFor: ["SLA", "SOW", "MSA", "NDA", "CO"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => <SignaturesEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <div className="grid gap-4 sm:grid-cols-2">
        {(data.blocks ?? []).map((b) => (
          <div
            key={b.id}
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-5"
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              For and on behalf of
            </p>
            <p className="mt-2 text-base font-semibold text-[var(--text-1)]">{b.partyName || "—"}</p>
            <div className="mt-6 border-b border-[var(--text-1)]" style={{ height: 32 }} />
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Signature
            </p>
            <div className="mt-4 space-y-1">
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Name: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatoryName || "—"}</span>
              </p>
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Role: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatoryRole || "—"}</span>
              </p>
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Date: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatureDate || "—"}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
});
