import type { ReactNode } from "react";
import {
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  FireIcon,
} from "@heroicons/react/24/outline";
import { renderInline } from "@/lib/markdown";

/**
 * Handbook article renderer — an XSS-safe superset of the shared `Markdown` component tuned for a
 * developer knowledgebase, with editorial flair: admonition callouts, a drop-cap lede, pull-quotes,
 * serif section headings, and styled code + tables. Renders to React elements only (never
 * dangerouslySetInnerHTML), reusing the shared inline grammar. Kept separate from `lib/markdown.tsx`
 * so the widely-used shared renderer is untouched.
 */

type Admonition = "NOTE" | "TIP" | "WARNING" | "IMPORTANT";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "admonition"; type: Admonition; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "p"; lines: string[] };

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

const ADMONITION_RE = /^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*$/i;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

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
      i += 1;
      blocks.push({ kind: "code", lang, lines: code });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // Table — header row followed by a separator row.
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

    // Blockquote — may be an admonition (`> [!TIP]` on the first line) or a plain pull-quote.
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const adm = quote.length > 0 ? ADMONITION_RE.exec(quote[0].trim()) : null;
      if (adm) {
        blocks.push({
          kind: "admonition",
          type: adm[1].toUpperCase() as Admonition,
          lines: quote.slice(1).filter((l, idx, arr) => !(idx === 0 && l.trim() === "") && !(idx === arr.length - 1 && l.trim() === "")),
        });
      } else {
        blocks.push({ kind: "quote", lines: quote });
      }
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

    // Paragraph.
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

const ADMONITION_STYLE: Record<
  Admonition,
  { label: string; icon: typeof InformationCircleIcon; wrap: string; accent: string; iconColor: string }
> = {
  NOTE: {
    label: "Note",
    icon: InformationCircleIcon,
    wrap: "border-[var(--brand-300)] bg-[var(--surface-brand-soft)]",
    accent: "text-[var(--brand-800)]",
    iconColor: "text-[var(--brand-600)]",
  },
  TIP: {
    label: "Tip",
    icon: LightBulbIcon,
    wrap: "border-emerald-200 bg-emerald-50",
    accent: "text-emerald-800",
    iconColor: "text-emerald-600",
  },
  WARNING: {
    label: "Watch out",
    icon: ExclamationTriangleIcon,
    wrap: "border-amber-200 bg-amber-50",
    accent: "text-amber-800",
    iconColor: "text-amber-600",
  },
  IMPORTANT: {
    label: "Important",
    icon: FireIcon,
    wrap: "border-rose-200 bg-rose-50",
    accent: "text-rose-800",
    iconColor: "text-rose-600",
  },
};

function inlineLines(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, i) =>
    i === 0
      ? renderInline(line, `${key}-l${i}`)
      : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-l${i}`)],
  );
}

function renderBlock(block: Block, idx: number, firstParagraphIdx: number): ReactNode {
  const key = `hb-${idx}`;
  switch (block.kind) {
    case "heading": {
      const text = renderInline(block.text, `${key}-h`);
      if (block.level <= 2) {
        // Section heading — editorial serif, brand hairline accent above.
        return (
          <h2 key={key} className="mt-10 first:mt-0">
            <span className="mb-2 block h-px w-8 bg-[var(--brand-500)]" aria-hidden />
            <span
              className="block text-[26px] leading-tight tracking-[-0.02em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {text}
            </span>
          </h2>
        );
      }
      if (block.level === 3)
        return (
          <h3 key={key} className="mt-7 text-lg font-semibold text-[var(--text-1)]">
            {text}
          </h3>
        );
      return (
        <h4
          key={key}
          className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]"
        >
          {text}
        </h4>
      );
    }
    case "code":
      return (
        <div key={key} className="overflow-x-auto rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)]">
          {block.lang ? (
            <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" aria-hidden />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                {block.lang}
              </span>
            </div>
          ) : null}
          <pre className="px-4 py-3 font-mono text-[13px] leading-6 text-[var(--text-1)]">
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );
    case "admonition": {
      const s = ADMONITION_STYLE[block.type];
      const Icon = s.icon;
      return (
        <div key={key} className={`rounded-[10px] border px-4 py-3.5 ${s.wrap}`}>
          <div className={`mb-1.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${s.accent}`}>
            <Icon className={`h-4 w-4 ${s.iconColor}`} />
            {s.label}
          </div>
          <div className="space-y-2 text-[15px] leading-7 text-[var(--text-2)]">
            {block.lines.length ? (
              <p>{inlineLines(block.lines, `${key}-a`)}</p>
            ) : null}
          </div>
        </div>
      );
    }
    case "quote":
      // Editorial pull-quote.
      return (
        <blockquote
          key={key}
          className="my-2 border-l-2 border-[var(--brand-500)] pl-5 text-[19px] italic leading-8 text-[var(--text-2)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {block.lines.map((l, i) => (
            <p key={i}>{renderInline(l, `${key}-q${i}`)}</p>
          ))}
        </blockquote>
      );
    case "ul":
      return (
        <ul key={key} className="list-disc space-y-1.5 pl-5 text-[16px] leading-8 text-[var(--text-2)] marker:text-[var(--brand-500)]">
          {block.items.map((l, i) => (
            <li key={i}>{renderInline(l, `${key}-li${i}`)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="list-decimal space-y-1.5 pl-5 text-[16px] leading-8 text-[var(--text-2)] marker:font-mono marker:text-[var(--brand-600)]">
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
                  <th key={i} className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
                    {renderInline(cell, `${key}-th${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--border-3)] last:border-0 even:bg-[var(--surface-1)]">
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
    case "p": {
      const isLede = idx === firstParagraphIdx;
      return (
        <p
          key={key}
          className={
            isLede
              ? "text-[17px] leading-8 text-[var(--text-2)] first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-[52px] first-letter:font-normal first-letter:leading-[0.8] first-letter:text-[var(--brand-700)] first-letter:[font-family:var(--font-display)]"
              : "text-[16px] leading-8 text-[var(--text-2)]"
          }
        >
          {inlineLines(block.lines, key)}
        </p>
      );
    }
  }
}

export function ArticleMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content ?? "");
  if (blocks.length === 0) {
    return <p className="text-sm italic text-[var(--text-4)]">This article has no content yet.</p>;
  }
  // Drop-cap the very first paragraph, but only when it truly opens the article (no heading before it).
  const firstBlock = blocks[0];
  const firstParagraphIdx = firstBlock?.kind === "p" ? 0 : -1;
  return <div className={className ?? "space-y-4"}>{blocks.map((b, i) => renderBlock(b, i, firstParagraphIdx))}</div>;
}
