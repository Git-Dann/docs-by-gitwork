/**
 * Minimal, XSS-safe Markdown renderer (Phase 2).
 *
 * Renders a deliberately small Markdown subset to React elements — headings, bold, italic, inline
 * code, links (with URL sanitisation), and unordered/ordered lists — never via
 * dangerouslySetInnerHTML, so there's no HTML-injection surface. Safe to render client-supplied
 * and operator-supplied text on the public /docs/[token] page.
 *
 * Pure (no hooks), so it works in both server components (the public preview) and client
 * components (the editor's live preview). Plain text degrades gracefully: existing proposals with
 * no Markdown render exactly as before, just as paragraphs.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/format";
// Parsing and nesting are SHARED with the Drive/PDF renderer (`src/server/document-to-html.ts`)
// rather than written twice — see the header of that module for why. Only the drawing is local.
import {
  buildListTree,
  listStartAttr,
  parseListLine,
  type ListTree,
  type ParsedListLine,
} from "@/lib/markdown-lists";

// One pass matches the earliest inline marker; precedence:
//   link → size wrapper → bold → italic → underscore-italic → code.
// The size wrapper — `<sm>…</sm>` / `<lg>…</lg>` — is a custom XSS-safe extension used by the
// selection-based font-size control. Never rendered via dangerouslySetInnerHTML; the renderer
// explicitly maps the tag to a styled <span> and recursively parses the inner text so nested
// formatting still works.
// Exported so the canvas editor's seam can parse/serialize with the exact same
// rules as this renderer — one source of truth for what counts as Markdown here.
export const INLINE_RE =
  /(\[[^\]]+\]\([^)\s]+\))|(<(?:sm|lg)>[^\n<]+<\/(?:sm|lg)>)|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(`[^`\n]+`)/;

/** Allow only safe URL schemes; bare domains become https; anything odd (javascript:, data:) is dropped. */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[/#]/.test(url)) return url; // site-relative or anchor
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
  return null;
}

export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length) {
    const m = rest.match(INLINE_RE);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = lm ? safeUrl(lm[2]) : null;
      out.push(
        lm && href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-[var(--brand-700)] underline underline-offset-2"
          >
            {lm[1]}
          </a>
        ) : (
          lm?.[1] ?? token
        ),
      );
    } else if (token.startsWith("<sm>") || token.startsWith("<lg>")) {
      // <sm>…</sm> / <lg>…</lg> — per-selection size wrapper. Inner text is recursively parsed
      // so a user can bold/italic inside a sized run.
      const tag = token.slice(1, 3);
      const inner = token.slice(4, -5);
      const sizeClass = tag === "sm" ? "text-[0.85em]" : "text-[1.2em]";
      out.push(
        <span key={key} className={sizeClass}>
          {renderInline(inner, `${key}-in`)}
        </span>,
      );
    } else if (token.startsWith("***")) {
      // Bold-italic. Without this the toolbar could WRITE `***x***` (italic applied to bold text)
      // and the document would render literal asterisks around it — stray punctuation in a
      // client's proposal.
      out.push(
        <strong key={key} className="font-semibold text-[var(--text-1)]">
          <em>{token.slice(3, -3)}</em>
        </strong>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-[var(--text-1)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("_")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-[var(--surface-1)] px-1 py-0.5 font-mono text-[0.9em] text-[var(--text-1)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

/**
 * Options rather than more positional parameters, because the two callers differ in ways that
 * matter and getting either wrong is a silent visual change across every document.
 */
interface ListRenderOptions {
  /**
   * Spacing/indent utilities for the list element itself. Block Markdown sits in prose and wants
   * `space-y-1`; a document FIELD is tighter at `space-y-0.5`.
   */
  listClass?: string;
  /**
   * Extra classes for the TOP-LEVEL list only — the body type scale and colour.
   *
   * ⚠️ Empty by default, and that is deliberate. This used to be a hard-coded
   * `cn("text-[var(--text-2)]", bodySize)`, which was correct for block Markdown and wrong for a
   * document field: fields had no text colour on their lists, so routing them through here added
   * one to every bullet in every existing document — a change nobody asked for, arriving as a side
   * effect of teaching this renderer ordered lists. Callers state what they want.
   */
  topClass?: string;
}

function renderListTree(
  list: ListTree,
  keyPrefix: string,
  depth: number,
  { listClass = "space-y-1 pl-5", topClass = "" }: ListRenderOptions = {},
): ReactNode {
  const items = list.items.map((item, i) => (
    <li key={i}>
      {renderInline(item.text, `${keyPrefix}-li${i}`)}
      {item.child
        ? renderListTree(item.child, `${keyPrefix}-li${i}-n`, depth + 1, { listClass, topClass })
        : null}
    </li>
  ));

  // Only the top level carries the body type scale; nested lists inherit it from their parent item.
  const scale = depth === 0 ? topClass : "";

  if (list.ordered) {
    return (
      <ol
        key={keyPrefix}
        // A list that starts anywhere other than 1 keeps its number. The editor stores what the
        // author wrote (`100.`), so drawing `1.` here would be the renderer disagreeing with the
        // document — the same class of gap that let ordered lists work in the Drive copy and not
        // on the page. Omitted when it is 1, which is the HTML default.
        start={listStartAttr(list)}
        className={cn("list-decimal", listClass, scale)}
      >
        {items}
      </ol>
    );
  }
  // `doc-bullets` owns the marker (accent → / ›) and the hanging indent inside `.proposal-document`.
  // The `list-disc space-y-1 pl-5` utilities are a deliberate FALLBACK for the surfaces that render
  // Markdown OUTSIDE a document (the task drawer, starter detail): the doc rules are scoped to
  // `.proposal-document` and unlayered, so inside a document they win over Tailwind's
  // `@layer utilities` and these classes are inert — outside one they're the only marker there is.
  return (
    <ul key={keyPrefix} className={cn("doc-bullets list-disc", listClass, scale)}>
      {items}
    </ul>
  );
}

function linesToInline(lines: string[], keyPrefix: string): ReactNode[] {
  // Single newlines become <br/> so deliberate line breaks survive.
  return lines.flatMap((line, i) =>
    i === 0
      ? renderInline(line, `${keyPrefix}-l${i}`)
      : [<br key={`${keyPrefix}-br${i}`} />, ...renderInline(line, `${keyPrefix}-l${i}`)],
  );
}

function renderBlock(block: string, idx: number, compact: boolean): ReactNode {
  const lines = block.split("\n");
  const key = `b${idx}`;
  // compact matches the site-wide body-copy convention exactly: plain `text-sm`, no explicit
  // leading override, so it gets Tailwind's own paired line-height like every other text-sm
  // element on the site (the summary line, What You Get items, etc.) — never the looser leading-6.
  const bodySize = compact ? "text-sm" : "text-[16px] leading-8";

  // Heading
  const heading = /^(#{1,6})\s+(.*)$/.exec(block.trim());
  if (heading && lines.length === 1) {
    const level = heading[1].length;
    const text = renderInline(heading[2], `${key}-h`);
    if (level <= 1)
      return (
        <h2 key={key} className="text-xl font-semibold tracking-[-0.2px] text-[var(--text-1)]">
          {text}
        </h2>
      );
    if (level === 2)
      return (
        <h3 key={key} className="text-lg font-semibold text-[var(--text-1)]">
          {text}
        </h3>
      );
    return (
      <h4 key={key} className="text-base font-semibold text-[var(--text-1)]">
        {text}
      </h4>
    );
  }

  // List — unordered or ordered, NESTING-AWARE (indentation defines depth). A block is a list only
  // when EVERY line is a list item, exactly as before; the change is that indentation is now
  // measured rather than stripped, so sub-lists survive.
  const listLines: ParsedListLine[] = [];
  let allLines = lines.length > 0;
  for (const line of lines) {
    const parsed = parseListLine(line);
    if (!parsed) {
      allLines = false;
      break;
    }
    listLines.push(parsed);
  }
  if (allLines && listLines.length > 0) {
    return renderListTree(buildListTree(listLines), key, 0, {
      topClass: cn("text-[var(--text-2)]", bodySize),
    });
  }

  // Paragraph
  return (
    <p key={key} className={cn("text-[var(--text-2)]", bodySize)}>
      {linesToInline(lines, key)}
    </p>
  );
}

export function Markdown({
  children,
  className,
  compact,
}: {
  children: string | null | undefined;
  className?: string;
  /** Renders paragraph/list body text at the app's standard text-sm/leading-6 size instead of the
   * larger 16px/leading-8 doc-reading size — for Markdown embedded in a compact card, not a full
   * document preview. */
  compact?: boolean;
}) {
  const text = (children ?? "").replace(/\r\n/g, "\n");
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b.trim().length > 0);

  if (blocks.length === 0) return null;

  return (
    <div className={className ?? "space-y-4"}>{blocks.map((block, idx) => renderBlock(block, idx, Boolean(compact)))}</div>
  );
}

/**
 * Render a plain-text field as LINES, turning `- ` / `* ` runs into real bullet lists.
 *
 * Block text fields (a step's description, a breakdown item, an objective) are stored as plain
 * strings with newlines, and were rendered straight into a `<p>`. HTML collapses newlines to
 * spaces, so everything an author typed on separate lines came out as one run-on paragraph —
 * which is exactly what happened to a seven-line ingest description.
 *
 * Authors were already typing `- ` at the start of each line to fake a list, so that is the
 * syntax this honours rather than inventing one. Consecutive dashed lines become a single `<ul>`;
 * everything else keeps its own line. Inline markdown (bold, italic, links, code) still applies
 * per line via `renderInline`, so this composes with the existing formatting rather than
 * replacing it.
 *
 * Used by every block that renders a multi-line text field, so bullets work the same everywhere.
 */
export function renderLines(text: string, keyPrefix: string): ReactNode[] {
  // Empty in, empty out — otherwise `"".split("\n")` yields one blank line and the field
  // renders a stray spacer where the author left nothing at all.
  if (!text) return [];

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let listLines: ParsedListLine[] = [];

  // ⚠️ Accumulate the PARSED lines, not their text.
  //
  // This used to push `bullet[1]` — the text after the marker — into a string array and emit one
  // flat <ul>. That threw away two things before anything could use them: the indentation (so
  // `- a\n  - nested` rendered as two siblings) and the marker KIND (so `1. One` was not a list at
  // all, and fell through to a plain <span> that showed the author a literal "1."). Keeping the
  // parse result means both survive to the tree builder.
  const flushList = () => {
    if (!listLines.length) return;
    const parsed = listLines;
    listLines = [];
    out.push(
      // The same `buildListTree` / `renderListTree` pair that block Markdown has always used —
      // ordered lists and unlimited nesting, already written, already correct, 180 lines up this
      // file. `my-1 space-y-0.5 pl-5` is the spacing a document field already had; only the
      // markers and the indentation are new.
      renderListTree(buildListTree(parsed), `${keyPrefix}-list-${out.length}`, 0, {
        listClass: "my-1 space-y-0.5 pl-5",
      }),
    );
  };

  lines.forEach((line, index) => {
    // `- `, `* ` or `1. ` with optional leading indent. The trailing space is required, so a line
    // that merely starts with a hyphen (a negative number, an en-dashed aside) or with digits and
    // a full stop ("1.5 million") is not a list item.
    //
    // ⚠️ "1975. A good year" IS one, at `start="1975"` — the space is there. That is CommonMark's
    // own reading and, more to the point, the editor's: markdown-it parses it as an ordered list,
    // so drawing it as a paragraph here would put the renderer and the editor back out of step.
    // Ambiguous, and resolved the same way on both sides rather than resolved differently.
    const listLine = parseListLine(line);
    if (listLine) {
      listLines.push(listLine);
      return;
    }
    flushList();
    if (!line.trim()) {
      // A blank line is deliberate spacing between paragraphs, not something to drop.
      out.push(<span key={`${keyPrefix}-gap-${index}`} className="block h-2" aria-hidden="true" />);
      return;
    }
    out.push(
      <span key={`${keyPrefix}-line-${index}`} className="block">
        {renderInline(line, `${keyPrefix}-t-${index}`)}
      </span>,
    );
  });

  flushList();
  return out;
}
