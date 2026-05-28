/** Section type: `introduction` — company statement and positioning summary. */

import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { EditorHint, FormTextArea, SimpleForm } from "@/lib/sections/_shared";
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
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <FormTextArea
        label="Company statement"
        value={data.statement}
        onChange={(statement) => onChange({ ...data, statement })}
      />
      <FormTextArea
        label="Positioning summary"
        value={data.summary}
        onChange={(summary) => onChange({ ...data, summary })}
      />
      <EditorHint message="Section graphics are managed in Supporting Links & Assets." />
    </SimpleForm>
  ),
  Preview: ({ data }) => (
    <div className="max-w-4xl space-y-5">
      {data.statement ? (
        <p className="text-[22px] leading-[1.7] tracking-[-0.02em] text-[var(--text-1)]">
          {data.statement}
        </p>
      ) : null}
      {data.summary ? (
        <p className="max-w-3xl text-[16px] leading-8 text-[var(--text-2)]">{data.summary}</p>
      ) : null}
    </div>
  ),
});
