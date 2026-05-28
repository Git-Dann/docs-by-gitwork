/** Section type: `prose` — freeform paragraph(s). */

import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { FormTextArea, SimpleForm } from "@/lib/sections/_shared";
import type { ProseSectionData } from "@/types/proposal";

export const proseSection = defineSection<ProseSectionData>({
  key: "prose",
  displayName: "Prose",
  description: "A freeform paragraph block. Use line breaks for separate paragraphs.",
  category: "narrative",
  icon: DocumentTextIcon,
  defaultData: { content: "" },
  defaultTitle: "Prose",
  defaultDescription: "Freeform paragraph(s).",
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <FormTextArea
        label="Content"
        value={data.content}
        onChange={(content) => onChange({ ...data, content })}
        rows={8}
      />
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    const paragraphs = (data.content ?? "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    if (!paragraphs.length) {
      return <p className="text-sm italic text-[var(--text-4)]">Empty prose block — add content in the editor.</p>;
    }
    return (
      <div className="max-w-4xl space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-[16px] leading-8 text-[var(--text-2)]">
            {paragraph}
          </p>
        ))}
      </div>
    );
  },
});
