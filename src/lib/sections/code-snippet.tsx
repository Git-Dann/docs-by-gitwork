/**
 * Section type: `code_snippet` — monospace code block with a language pill and optional filename
 * header. Useful for technical SOWs and developer-facing docs.
 *
 * No syntax highlighting in v1 — the JetBrains Mono face on a tinted surface reads fine on its
 * own and avoids pulling in a syntax highlighter library.
 */

import { CodeBracketSquareIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import type { CodeSnippetSectionData } from "@/types/proposal";

export const codeSnippetSection = defineSection<CodeSnippetSectionData>({
  key: "code_snippet",
  displayName: "Code Snippet",
  description: "Monospace code block with optional language label and filename.",
  category: "narrative",
  icon: CodeBracketSquareIcon,
  defaultData: { language: "TypeScript", filename: "", code: "" },
  defaultTitle: "Code snippet",
  defaultDescription: "Monospace code with language label.",
  recommendedFor: ["SOW"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <div className="@container">
        <div className="grid gap-2 @[26rem]:grid-cols-2">
          <FormInput
            label="Language label"
            value={data.language ?? ""}
            onChange={(language) => onChange({ ...data, language })}
            placeholder="TypeScript"
          />
          <FormInput
            label="Filename (optional)"
            value={data.filename ?? ""}
            onChange={(filename) => onChange({ ...data, filename })}
            placeholder="server/index.ts"
          />
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Code</span>
        <textarea
          value={data.code}
          onChange={(e) => onChange({ ...data, code: e.target.value })}
          rows={10}
          spellCheck={false}
          className="w-full rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)] px-3 py-2 font-mono text-[12px] leading-6 text-[var(--text-1)] focus:border-[var(--brand-600)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-600)]/20"
          placeholder="// Paste code here…"
        />
      </label>
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    if (!data.code?.trim()) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          Empty snippet — paste some code in the editor.
        </p>
      );
    }
    return (
      <div className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)]">
        {(data.language || data.filename) ? (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-3)] bg-white px-4 py-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              {data.filename || data.language}
            </span>
            {data.language && data.filename ? (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                {data.language}
              </span>
            ) : null}
          </div>
        ) : null}
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-[var(--text-1)]">
          <code>{data.code}</code>
        </pre>
      </div>
    );
  },
});
