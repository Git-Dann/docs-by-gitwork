/** Section type: `prose` — freeform paragraph(s). */

import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { Markdown } from "@/lib/markdown";
import { InlineTextArea } from "@/lib/sections/inline-text";
import type { ProseSectionData } from "@/types/proposal";

export const proseSection = defineSection<ProseSectionData>({
  key: "prose",
  displayName: "Prose",
  description: "A freeform paragraph block. Supports Markdown — bold, italic, links, lists.",
  category: "narrative",
  icon: DocumentTextIcon,
  defaultData: { content: "" },
  defaultTitle: "Prose",
  defaultDescription: "Freeform paragraph(s).",
  aiExpandable: true,
  inlineEditable: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <MarkdownField
        label="Content"
        value={data.content}
        onChange={(content) => onChange({ ...data, content })}
        rows={8}
        placeholder="Write freely. **Bold**, *italic*, [links](https://…), and - bullet lists are supported."
      />
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      return (
        <InlineTextArea
          value={data.content}
          onChange={(content) => onChange({ ...data, content })}
          placeholder="Write freely. Markdown supported — **bold**, *italic*, [links](…), - lists."
          ariaLabel="Prose content"
          className="max-w-4xl text-[15px] leading-7 text-[var(--text-1)]"
          enableFormatBar
        />
      );
    }
    if (!data.content?.trim()) {
      return <p className="text-sm italic text-[var(--text-4)]">Empty prose block — add content in the editor.</p>;
    }
    return <Markdown className="max-w-4xl space-y-4">{data.content}</Markdown>;
  },
});
