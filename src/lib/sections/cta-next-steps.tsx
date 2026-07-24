/** Section type: `cta_next_steps` — closing call-to-action with primary + secondary buttons. */

import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { CTAEditor } from "@/components/proposals/cta-editor";
import { buttonStyles } from "@/components/ui/button-styles";
import { defineSection } from "@/lib/sections/types";
import { FormInput, SimpleForm } from "@/lib/sections/_shared";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { Markdown, safeUrl } from "@/lib/markdown";
import type { CtaSectionData } from "@/types/proposal";

export const ctaNextStepsSection = defineSection<CtaSectionData>({
  key: "cta_next_steps",
  displayName: "Next steps",
  description: "Closing CTA — primary + secondary actions.",
  category: "closing",
  icon: ArrowRightCircleIcon,
  defaultData: { headline: "", body: "" },
  defaultTitle: "Next steps",
  defaultDescription: "Closing call to action.",
  recommendedFor: ["PROPOSAL"],
  aiExpandable: true,
  Editor: ({ data, onChange, proposal, onProposalChange }) => (
    <div className="space-y-3">
      <SimpleForm>
        <FormInput
          label="Section headline"
          value={data.headline}
          onChange={(headline) => onChange({ ...data, headline })}
        />
        <MarkdownField
          label="Body"
          value={data.body}
          onChange={(body) => onChange({ ...data, body })}
          rows={4}
        />
      </SimpleForm>
      <CTAEditor
        ctas={proposal.ctas}
        onChange={(ctas) => onProposalChange({ ...proposal, ctas })}
      />
    </div>
  ),
  Preview: ({ data, proposal }) => {
    const primary = proposal.ctas.find((cta) => cta.role === "PRIMARY");
    const secondary = proposal.ctas.find((cta) => cta.role === "SECONDARY");
    return (
      <div className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-brand-soft)_100%)] p-6">
        <p className="app-eyebrow">Next Step</p>
        <p className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
          {data.headline}
        </p>
        <Markdown className="mt-3 max-w-3xl space-y-3 text-sm leading-7 text-[var(--text-2)]">
          {data.body}
        </Markdown>
        <div className="mt-5 flex flex-wrap gap-2">
          {primary ? (
            <a href={safeUrl(primary.destination) ?? "#"} rel="noopener noreferrer nofollow" className={buttonStyles({ variant: "primary", size: "md" })}>
              {primary.label}
            </a>
          ) : null}
          {secondary ? (
            <a href={safeUrl(secondary.destination) ?? "#"} rel="noopener noreferrer nofollow" className={buttonStyles({ variant: "secondary", size: "md" })}>
              {secondary.label}
            </a>
          ) : null}
        </div>
      </div>
    );
  },
});
