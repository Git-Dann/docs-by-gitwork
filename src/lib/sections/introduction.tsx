/** Section type: `introduction` — company statement and positioning summary. */

import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { EditorHint, FormTextArea, SimpleForm } from "@/lib/sections/_shared";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { Markdown } from "@/lib/markdown";
import { InlineTextArea } from "@/lib/sections/inline-text";
import type { IntroductionSectionData } from "@/types/proposal";

const DEFAULT: IntroductionSectionData = { statement: "", summary: "", graphic: "" };

export const introductionSection = defineSection<IntroductionSectionData>({
  key: "introduction",
  displayName: "Introduction",
  description: "Company statement and positioning summary.",
  category: "narrative",
  icon: ChatBubbleLeftEllipsisIcon,
  defaultData: DEFAULT,
  defaultTitle: "Introduction",
  defaultDescription: "Company statement and positioning summary.",
  recommendedFor: ["PROPOSAL", "SOW", "MSA"],
  aiExpandable: true,
  inlineEditable: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <FormTextArea
        label="Company statement"
        value={data.statement}
        onChange={(statement) => onChange({ ...data, statement })}
      />
      <MarkdownField
        label="Positioning summary"
        value={data.summary}
        onChange={(summary) => onChange({ ...data, summary })}
        rows={5}
      />
      <EditorHint message="Section graphics are managed in Supporting Links & Assets." />
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      return (
        <div className="max-w-4xl space-y-5">
          <InlineTextArea
            value={data.statement}
            onChange={(statement) => onChange({ ...data, statement })}
            placeholder="Company statement…"
            ariaLabel="Company statement"
            className="text-[22px] leading-[1.7] tracking-[-0.02em] text-[var(--text-1)]"
          />
          <InlineTextArea
            value={data.summary}
            onChange={(summary) => onChange({ ...data, summary })}
            placeholder="Positioning summary (Markdown supported)…"
            ariaLabel="Positioning summary"
            className="max-w-3xl text-[15px] leading-7 text-[var(--text-2)]"
          />
        </div>
      );
    }
    return (
      <div className="max-w-4xl space-y-5">
        {data.statement ? (
          <p className="text-[22px] leading-[1.7] tracking-[-0.02em] text-[var(--text-1)]">
            {data.statement}
          </p>
        ) : null}
        {data.summary ? (
          <Markdown className="max-w-3xl space-y-4">{data.summary}</Markdown>
        ) : null}
      </div>
    );
  },
});
