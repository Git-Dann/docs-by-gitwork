/**
 * The client wiki's Markdown renderer — React elements only, never `dangerouslySetInnerHTML`.
 *
 * This replaces a string builder in `wiki-page-editor.tsx` that escaped `& < >` and then injected
 * the result as HTML. Escaping made `<script>` inert, but the link rule wrote the URL straight into
 * `href="$2"`: `[x](javascript:alert(1))` produced a live `javascript:` link, and a URL containing
 * a double quote could break out of the attribute altogether. Wiki pages are read on the client's
 * public share page, and the client intake API writes into the same wiki, so that surface needs the
 * same guarantees as the other renderers rather than a separate, weaker set.
 *
 * What is shared, and what is local:
 * - **Inline marks and links** come from `renderInline` in `src/lib/markdown.tsx`, so every href
 *   passes the same `safeUrl` allow-list (http, https, mailto, site-relative, bare domains) as Docs.
 *   Only the classes differ — the wiki keeps its own look — and `_x_` is left as text because wiki
 *   pages are full of identifiers like `MY_VAR_NAME`.
 * - **List parsing and nesting** come from `src/lib/markdown-lists.ts`, as in Docs.
 * - **Headings, fenced code, blockquotes, rules and tables** are drawn here, because Docs
 *   deliberately does not support them (CLAUDE.md §41.3) and the wiki always has.
 *
 * The line rules and classes match the old string builder, so existing pages look the same.
 */

import type { ReactNode } from "react";
import { renderInline, type InlineRenderOptions } from "@/lib/markdown";
import {
  buildListTree,
  listStartAttr,
  parseListLine,
  type ListTree,
  type ParsedListLine,
} from "@/lib/markdown-lists";

const INLINE: InlineRenderOptions = {
  linkClassName: "text-[var(--brand-700)] underline hover:no-underline",
  codeClassName:
    "rounded bg-[var(--surface-1)] px-1 py-px text-[12px] font-mono text-[var(--brand-700)]",
  strongClassName: "font-semibold",
  underscoreItalic: false,
};

function inline(text: string, key: string): ReactNode[] {
  return renderInline(text, key, INLINE);
}

const TABLE_ROW = /^\|.+\|$/;
const TABLE_SEPARATOR = /^\|\s*[-:]+\s*(\|\s*[-:]+\s*)*\|$/;

function splitCells(line: string): string[] {
  return line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function renderList(list: ListTree, key: string, depth: number): ReactNode {
  const items = list.items.map((item, i) => (
    <li key={i}>
      {inline(item.text, `${key}-li${i}`)}
      {item.child ? renderList(item.child, `${key}-li${i}-n`, depth + 1) : null}
    </li>
  ));
  const base =
    depth === 0
      ? "my-2 ml-4 space-y-1 text-sm text-[var(--text-2)]"
      : "mt-1 ml-4 space-y-1";
  return list.ordered ? (
    <ol key={key} start={listStartAttr(list)} className={`${base} list-decimal`}>
      {items}
    </ol>
  ) : (
    <ul key={key} className={`${base} ${depth === 0 ? "list-disc" : "list-[circle]"}`}>
      {items}
    </ul>
  );
}

/**
 * Consecutive list lines → one or more lists. A new top-level list starts when a line back at the
 * group's starting indent switches kind (bullets to numbers or back), which is how the old renderer
 * drew a bullet list followed by a numbered one: as two lists, not one.
 */
function groupLists(lines: ParsedListLine[]): ParsedListLine[][] {
  const groups: ParsedListLine[][] = [];
  for (const line of lines) {
    const current = groups[groups.length - 1];
    if (
      !current ||
      (line.indent <= current[0].indent && line.ordered !== current[0].ordered)
    ) {
      groups.push([line]);
    } else {
      current.push(line);
    }
  }
  return groups;
}

function renderTable(rows: string[], key: string): ReactNode {
  const hasHeader = rows.length > 1 && TABLE_SEPARATOR.test(rows[1].trim());
  const header = hasHeader ? splitCells(rows[0]) : null;
  const body = rows
    .slice(hasHeader ? 2 : 0)
    .filter((row) => !TABLE_SEPARATOR.test(row.trim()))
    .map(splitCells);
  return (
    <div key={key} className="overflow-x-auto my-4">
      <table className="min-w-full text-sm border-collapse border border-[rgba(0,0,0,0.1)] rounded-[6px]">
        {header ? (
          <thead>
            <tr>
              {header.map((cell, c) => (
                <th
                  key={c}
                  className="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-left font-semibold text-[var(--text-1)] bg-[var(--surface-0)]"
                >
                  {inline(cell, `${key}-h${c}`)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, c) => (
                <td
                  key={c}
                  className="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-[var(--text-2)]"
                >
                  {inline(cell, `${key}-r${r}c${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render a wiki page's Markdown to React elements. */
export function renderWikiMarkdown(md: string): ReactNode[] {
  if (!md.trim()) {
    return [
      <p key="empty" className="text-[var(--text-4)] italic">
        Nothing to preview yet.
      </p>,
    ];
  }

  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `w${i}`;

    // Fenced code: everything up to the closing fence (or the end) is literal text.
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++; // the closing fence, if there was one
      out.push(
        <pre
          key={key}
          className="overflow-x-auto rounded-[6px] bg-[var(--surface-1)] p-3 text-[12.5px] font-mono my-3"
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      out.push(
        <blockquote
          key={key}
          className="my-3 border-l-[3px] border-[var(--brand-500)] bg-[var(--surface-0)] px-4 py-2.5 rounded-r-[6px] text-sm text-[var(--text-2)]"
        >
          {inline(line.slice(2), key)}
        </blockquote>,
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      out.push(
        <h3 key={key} className="mt-5 mb-1.5 text-[15px] font-semibold text-[var(--text-1)]">
          {inline(line.slice(4), key)}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        <h2
          key={key}
          className="mt-6 mb-2 text-[17px] font-semibold text-[var(--text-1)] border-b border-[rgba(0,0,0,0.07)] pb-1.5"
        >
          {inline(line.slice(3), key)}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(
        <h1 key={key} className="mt-4 mb-3 text-[20px] font-bold text-[var(--text-1)]">
          {inline(line.slice(2), key)}
        </h1>,
      );
      i++;
      continue;
    }

    if (line.trim() === "---") {
      out.push(<hr key={key} className="my-5 border-[rgba(0,0,0,0.09)]" />);
      i++;
      continue;
    }

    if (parseListLine(line)) {
      const listLines: ParsedListLine[] = [];
      while (i < lines.length) {
        const parsed = parseListLine(lines[i]);
        if (!parsed) break;
        listLines.push(parsed);
        i++;
      }
      groupLists(listLines).forEach((group, g) =>
        out.push(renderList(buildListTree(group), `${key}-g${g}`, 0)),
      );
      continue;
    }

    if (TABLE_ROW.test(line.trim())) {
      const rows: string[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i].trim())) rows.push(lines[i++]);
      out.push(renderTable(rows, key));
      continue;
    }

    if (line.trim() !== "") {
      out.push(
        <p key={key} className="my-1.5 text-sm leading-6 text-[var(--text-2)]">
          {inline(line, key)}
        </p>,
      );
    }
    i++;
  }

  return out;
}

/** Convenience wrapper so callers can render it as a component. */
export function WikiMarkdown({ content, className }: { content: string; className?: string }) {
  return <div className={className}>{renderWikiMarkdown(content)}</div>;
}
