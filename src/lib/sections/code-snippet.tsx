/**
 * Section type: `code_snippet` — a monospace code block for technical documents.
 *
 * Built out for **data-ingestion guides**, which is what this block is mostly for: a field list,
 * a schema, a sample payload, a `curl` call. Presenting those as a one-column table fights the
 * format — a code block is the honest shape for something the reader is going to copy.
 *
 * Four things it now does that matter for a document rather than a web page:
 *
 *  · **Wraps by default.** A horizontally scrolling `<pre>` silently CUTS OFF everything past the
 *    page edge when the document is printed to PDF, because there is no scrollbar to drag on
 *    paper. Wrapped continuation lines are indented so the wrap reads as a wrap.
 *  · **Copy button.** The whole point of an ingestion guide is that the reader takes the schema
 *    away with them.
 *  · **Optional line numbers**, so prose can cite "line 7" and mean it.
 *  · **Light token colouring** via `src/lib/code-highlight.ts` — keys distinguished from values,
 *    which is the one distinction that makes a field list readable. Dependency-free and
 *    token-based, so it costs nothing in a PDF and inherits the document theme.
 *
 * There is no `dangerouslySetInnerHTML` here: the tokeniser returns tokens and this maps them to
 * elements, the same contract `src/lib/markdown.tsx` follows.
 */

import { CodeBracketSquareIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput, FormTextArea } from "@/lib/sections/_shared";
import { CopyCodeButton } from "@/lib/sections/copy-code-button";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
import { CODE_LANGUAGES, tokenizeCodeBlock, type Token } from "@/lib/code-highlight";
import type { CodeSnippetSectionData } from "@/types/proposal";

/** Token → colour. Document tokens only, so it re-themes with the document and prints correctly. */
const TOKEN_STYLE: Record<Token["kind"], string> = {
  key: "text-[var(--brand-700)]",
  keyword: "text-[var(--brand-700)]",
  string: "text-[var(--text-1)]",
  number: "text-[var(--text-1)]",
  comment: "italic text-[var(--text-4)]",
  punct: "text-[var(--text-3)]",
  plain: "",
};

export const codeSnippetSection = defineSection<CodeSnippetSectionData>({
  key: "code_snippet",
  displayName: "Code / schema",
  description: "Monospace code, schema or payload — with copy, line numbers and print-safe wrapping.",
  category: "narrative",
  icon: CodeBracketSquareIcon,
  defaultData: {
    language: "JSON",
    filename: "",
    code: "",
    showLineNumbers: false,
    wrapLines: true,
  },
  defaultTitle: "Schema",
  defaultDescription: "Fields, types and an example payload.",
  recommendedFor: ["SOW", "HANDOVER", "BRIEF"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <div className="@container">
        <div className="grid gap-2 @[26rem]:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Language</span>
            <select
              className="app-select app-select-chevron pr-9"
              value={data.language ?? "JSON"}
              onChange={(event) => onChange({ ...data, language: event.target.value })}
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
          <FormInput
            label="Filename (optional)"
            value={data.filename ?? ""}
            onChange={(filename) => onChange({ ...data, filename })}
            placeholder="vehicles.csv"
          />
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Code</span>
        <textarea
          value={data.code}
          onChange={(event) => onChange({ ...data, code: event.target.value })}
          rows={12}
          spellCheck={false}
          className="w-full rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)] px-3 py-2 font-mono text-[12px] leading-6 text-[var(--text-1)] focus:border-[var(--brand-600)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-600)]/20"
          placeholder={"customer_id,make,model,year\nabc-123,Ford,Ranger,2019"}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={data.showLineNumbers ?? false}
          onChange={(event) => onChange({ ...data, showLineNumbers: event.target.checked })}
        />
        Show line numbers
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={data.wrapLines ?? true}
          onChange={(event) => onChange({ ...data, wrapLines: event.target.checked })}
        />
        Wrap long lines
        <span className="text-[11px] text-[var(--text-4)]">
          (off = scrolls, and clips when printed)
        </span>
      </label>

      <FormTextArea
        label="Caption (optional)"
        value={data.caption ?? ""}
        onChange={(caption) => onChange({ ...data, caption })}
        rows={2}
      />
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    if (!data.code?.trim()) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          Empty block — paste a schema, a field list or a sample payload in the editor.
        </p>
      );
    }

    const language = data.language ?? "JSON";
    const rows = tokenizeCodeBlock(data.code, language);
    const wrap = data.wrapLines ?? true;
    const numbers = data.showLineNumbers ?? false;
    const gutter = String(rows.length).length;

    return (
      <div className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-canvas)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-3)] bg-white px-4 py-2">
          <span className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            {data.filename || language}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {data.filename ? (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                {language}
              </span>
            ) : null}
            <CopyCodeButton code={data.code} />
          </span>
        </div>

        <pre
          className={
            wrap
              ? // `whitespace-pre-wrap` + a hanging indent: the wrap is visible AS a wrap rather
                // than looking like a new line of data, which matters in a field list.
                "px-4 py-3 font-mono text-[12px] leading-6 text-[var(--text-1)] [overflow-wrap:anywhere] whitespace-pre-wrap"
              : "overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-[var(--text-1)]"
          }
        >
          <code>
            {rows.map((tokens, index) => (
              <span key={index} className="block">
                {numbers ? (
                  <span
                    aria-hidden="true"
                    className="mr-3 inline-block select-none text-right text-[var(--text-4)]"
                    style={{ width: `${gutter}ch` }}
                  >
                    {index + 1}
                  </span>
                ) : null}
                {tokens.length ? (
                  tokens.map((token, position) => (
                    <span key={position} className={TOKEN_STYLE[token.kind]}>
                      {token.text}
                    </span>
                  ))
                ) : (
                  // A genuinely blank line still needs to occupy a row.
                  <span>{"​"}</span>
                )}
              </span>
            ))}
          </code>
        </pre>

        {data.caption ? (
          <p className="border-t border-[var(--border-3)] bg-white px-4 py-2 text-[12px] leading-6 italic text-[var(--text-3)]">
            {renderInline(data.caption, "code-cap")}
          </p>
        ) : null}
      </div>
    );
  },
});
