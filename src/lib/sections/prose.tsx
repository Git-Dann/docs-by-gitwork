/** Section type: `prose` — freeform paragraph(s), or house-numbered legal clauses. */

import type { CSSProperties } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { Markdown, renderInline } from "@/lib/markdown";
import { RichInlineEditor } from "@/lib/sections/rich-inline-editor";
import type { ProseSectionData } from "@/types/proposal";

type ProseStyle = NonNullable<ProseSectionData["style"]>;

/** A clause plus its `(a)`/`(b)` sub-items. Numbering itself is CSS counters — never stored. */
type Clause = { text: string; subs: string[] };

/**
 * Leading list/number markers a typist naturally carries over from a pasted contract. Numbering is
 * automatic in clause style, so a literal `1.1` in the text would render as "1.1 1.1 …".
 *
 * The numeric form deliberately requires either an inner dot (`1.1 `) or trailing punctuation
 * (`1. ` / `1) `) — otherwise a clause opening "2026 was the baseline year" would lose its year.
 */
const CLAUSE_MARKER_RE = /^(?:\d+\.\d+(?:\.\d+)*[.)]?|\d+[.)])\s+/;
const SUB_MARKER_RE = /^(?:\(?[a-z]\)|[-*]|[ivx]+[.)])\s+/i;
const BULLET_MARKER_RE = /^[-*]\s+/;

/** Leading indentation in columns; a tab counts as 2, matching the Markdown renderer. */
function indentColumns(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") columns += 1;
    else if (char === "\t") columns += 2;
    else break;
  }
  return columns;
}

/**
 * Split content into clauses + sub-items. A non-indented line is a clause; a line indented by 2+
 * columns is a sub-item of the clause above it. Blank lines are separators only — a sub-item never
 * escapes its clause because of one.
 */
export function parseClauses(content: string): Clause[] {
  const clauses: Clause[] = [];
  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    if (!rawLine.trim()) continue;
    const indented = indentColumns(rawLine) >= 2;
    const line = rawLine.trim();
    if (indented && clauses.length > 0) {
      clauses[clauses.length - 1].subs.push(line.replace(SUB_MARKER_RE, ""));
      continue;
    }
    clauses.push({
      text: line.replace(BULLET_MARKER_RE, "").replace(CLAUSE_MARKER_RE, ""),
      subs: [],
    });
  }
  return clauses;
}

/**
 * The section number is interpolated into a CSS `content:` string, so it's restricted to characters
 * that can't terminate the quoted value or the declaration.
 */
function safeClauseSection(raw: string | undefined): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 8);
  return cleaned || "1";
}

function ClauseList({ content, section }: { content: string; section: string }) {
  const clauses = parseClauses(content);
  if (clauses.length === 0) return null;
  return (
    <ol
      className="doc-clauses max-w-4xl text-[16px] leading-8 text-[var(--text-2)]"
      // The counter's prefix must be a QUOTED CSS string — it's consumed by `content:`.
      style={{ "--doc-clause-section": `"${section}"` } as CSSProperties}
    >
      {clauses.map((clause, i) => (
        <li key={i}>
          {renderInline(clause.text, `clause-${i}`)}
          {clause.subs.length > 0 ? (
            <ol className="doc-clause-subs">
              {clause.subs.map((sub, j) => (
                <li key={j}>{renderInline(sub, `clause-${i}-sub-${j}`)}</li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

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
  Editor: ({ data, onChange }) => {
    const style: ProseStyle = data.style ?? "prose";
    return (
      // @container so the field grid keys off the ~280–360px rail, never the viewport.
      <div className="@container">
        <SimpleForm>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
            <select
              value={style}
              onChange={(event) =>
                onChange({ ...data, style: event.target.value as ProseStyle })
              }
              className="app-select w-full"
            >
              <option value="prose">Prose — paragraphs</option>
              <option value="clauses">Clauses — numbered 1.1, 1.2 …</option>
            </select>
          </label>

          {style === "clauses" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Section no.</span>
              <input
                type="text"
                inputMode="numeric"
                value={data.clauseSection ?? ""}
                onChange={(event) => onChange({ ...data, clauseSection: event.target.value })}
                placeholder="1"
                className="app-input w-full @[26rem]:w-24"
                aria-label="Clause section number"
              />
              <span className="block text-xs leading-5 text-[var(--text-4)]">
                Drives the clause numbers — <code>2</code> renders 2.1, 2.2, 2.3.
              </span>
            </label>
          ) : null}

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
            {style === "clauses"
              ? "One clause per line. Indent a line (2 spaces) to make it an (a)/(b) sub-item — numbering is automatic, so don't type it."
              : "Highlight text to format it — no markdown symbols. Edits sync with the canvas."}
          </p>
        </SimpleForm>
      </div>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    // Editing stays the WYSIWYG text surface in BOTH styles — clause numbering is a render, and a
    // per-clause editable list would break inline typing (paste, multi-line select, ⌘Z).
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
    if (data.style === "clauses") {
      return <ClauseList content={data.content} section={safeClauseSection(data.clauseSection)} />;
    }
    return <Markdown className="max-w-4xl space-y-4">{data.content}</Markdown>;
  },
});
