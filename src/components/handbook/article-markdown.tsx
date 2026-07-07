import type { ReactNode } from "react";
import { renderInline } from "@/lib/markdown";

/**
 * Handbook article renderer — an XSS-safe superset of the shared `Markdown` component tuned for a
 * developer knowledgebase. Adds fenced code blocks, tables, blockquotes and horizontal rules on top
 * of the shared inline grammar (bold/italic/code/links), and styles everything as an editorial
 * reading surface on Foundry blue. Renders to React elements only — never dangerouslySetInnerHTML,
 * so there is no HTML-injection surface. Kept separate from `lib/markdown.tsx` so the widely-used
 * shared renderer's behaviour is untouched.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "p"; lines: string[] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code block.
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      const lang = fence[1] ?? "";
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence (if present)
      blocks.push({ kind: "code", lang, lines: code });
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // Table — a header row followed by a separator row.
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — gather consecutive non-blank lines until a structural marker.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === "" ||
        /^```/.test(l.trim()) ||
        /^(#{1,6})\s+/.test(l.trim()) ||
        /^\s*[-*]\s+/.test(l) ||
        /^\s*\d+\.\s+/.test(l) ||
        /^\s*>\s?/.test(l) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())
      ) {
        break;
      }
      para.push(l);
      i += 1;
    }
    if (para.length) blocks.push({ kind: "p", lines: para });
  }

  return blocks;
}

function renderBlock(block: Block, idx: number): ReactNode {
  const key = `hb-${idx}`;
  switch (block.kind) {
    case "heading": {
      const text = renderInline(block.text, `${key}-h`);
      if (block.level <= 1)
        return (
          <h2
            key={key}
            className="mt-10 border-b border-[var(--border-2)] pb-2 text-[26px] leading-tight tracking-[-0.02em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {text}
          </h2>
        );
      if (block.level === 2)
        return (
          <h3 key={key} className="mt-8 text-lg font-semibold text-[var(--text-1)]">
            {text}
          </h3>
        );
      return (
        <h4
          key={key}
          className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]"
        >
          {text}
        </h4>
      );
    }
    case "code":
      return (
        <div
          key={key}
          className="overflow-x-auto rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)]"
        >
          {block.lang ? (
            <div className="border-b border-[var(--border-2)] px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              {block.lang}
            </div>
          ) : null}
          <pre className="px-4 py-3 font-mono text-[13px] leading-6 text-[var(--text-1)]">
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-[var(--brand-600)] bg-[var(--surface-brand-soft)] px-4 py-2 text-[16px] leading-8 text-[var(--text-2)]"
        >
          {block.lines.map((l, i) => (
            <p key={i}>{renderInline(l, `${key}-q${i}`)}</p>
          ))}
        </blockquote>
      );
    case "ul":
      return (
        <ul key={key} className="list-disc space-y-1.5 pl-5 text-[16px] leading-8 text-[var(--text-2)]">
          {block.items.map((l, i) => (
            <li key={i}>{renderInline(l, `${key}-li${i}`)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="list-decimal space-y-1.5 pl-5 text-[16px] leading-8 text-[var(--text-2)]">
          {block.items.map((l, i) => (
            <li key={i}>{renderInline(l, `${key}-li${i}`)}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-[8px] border border-[var(--border-2)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-2)] bg-[var(--surface-1)]">
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
                  >
                    {renderInline(cell, `${key}-th${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--border-3)] last:border-0">
                  {block.header.map((_, c) => (
                    <td key={c} className="px-3 py-2 align-top text-[var(--text-2)]">
                      {renderInline(row[c] ?? "", `${key}-td${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={key} className="border-t border-[var(--border-2)]" />;
    case "p":
      return (
        <p key={key} className="text-[16px] leading-8 text-[var(--text-2)]">
          {block.lines.flatMap((line, i) =>
            i === 0
              ? renderInline(line, `${key}-l${i}`)
              : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-l${i}`)],
          )}
        </p>
      );
  }
}

export function ArticleMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content ?? "");
  if (blocks.length === 0) {
    return <p className="text-sm italic text-[var(--text-4)]">This article has no content yet.</p>;
  }
  return <div className={className ?? "space-y-4"}>{blocks.map(renderBlock)}</div>;
}
