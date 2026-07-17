/** Section type: `prose` — freeform paragraph(s). */

import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { Markdown } from "@/lib/markdown";
import { RichInlineEditor } from "@/lib/sections/rich-inline-editor";
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
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Content</span>
        {/* WYSIWYG: shows bold/italic/links as real formatting (not **stars**), stores Markdown. */}
        <div className="rounded-[8px] border border-[var(--border-2)] px-3 py-2 text-sm leading-6 focus-within:border-[var(--brand-500)]">
          <RichInlineEditor
            value={data.content}
            onChange={(content) => onChange({ ...data, content })}
            placeholder="Write freely. Highlight text to bold / italicise / link it."
            ariaLabel="Prose content"
            className="text-[var(--text-1)]"
          />
        </div>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        Highlight text to format it — no markdown symbols. Edits sync with the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      return (
        <RichInlineEditor
          value={data.content}
          onChange={(content) => onChange({ ...data, content })}
          placeholder="Write freely. Highlight text to bold/italicise/link it."
          ariaLabel="Prose content"
          className="max-w-4xl text-[15px] leading-7 text-[var(--text-1)]"
        />
      );
    }
    if (!data.content?.trim()) {
      return <p className="text-sm italic text-[var(--text-4)]">Empty prose block — add content in the editor.</p>;
    }
    return <Markdown className="max-w-4xl space-y-4">{data.content}</Markdown>;
  },
});
