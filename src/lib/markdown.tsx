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

// One pass matches the earliest inline marker; precedence:
//   link → size wrapper → bold → italic → underscore-italic → code.
// The size wrapper — `<sm>…</sm>` / `<lg>…</lg>` — is a custom XSS-safe extension used by the
// selection-based font-size control. Never rendered via dangerouslySetInnerHTML; the renderer
// explicitly maps the tag to a styled <span> and recursively parses the inner text so nested
// formatting still works.
// Exported so rich-inline-editor.tsx's canvas editor can parse/serialize with the exact same
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
 * Leading indentation of a line, in "columns". A tab counts as 2 columns so a tab-indented list
 * nests the same as a 2-space-indented one (the two are mixed freely in pasted content).
 */
function leadingIndent(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") columns += 1;
    else if (char === "\t") columns += 2;
    else break;
  }
  return columns;
}

type ParsedListLine = { indent: number; ordered: boolean; text: string };

/** A single list line → its depth, kind and text. Null when the line isn't a list item at all. */
function parseListLine(line: string): ParsedListLine | null {
  const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
  if (unordered) return { indent: leadingIndent(line), ordered: false, text: unordered[1] };
  const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
  if (ordered) return { indent: leadingIndent(line), ordered: true, text: ordered[1] };
  return null;
}

type ListTree = { ordered: boolean; items: Array<{ text: string; child: ListTree | null }> };

/**
 * Build a nested list tree from flat lines, using INDENTATION as the only depth signal: a line
 * indented further than the one before it opens a nested list under that previous item; a line
 * indented less closes back out to the matching level. Depth is unlimited, so ≥2 levels work.
 */
function buildListTree(lines: ParsedListLine[]): ListTree {
  const root: ListTree = { ordered: lines[0].ordered, items: [] };
  // Stack of open lists, each remembering the indentation its own items sit at.
  const open: Array<{ indent: number; list: ListTree }> = [{ indent: lines[0].indent, list: root }];

  for (const line of lines) {
    while (open.length > 1 && line.indent < open[open.length - 1].indent) open.pop();
    let top = open[open.length - 1];
    if (line.indent > top.indent && top.list.items.length > 0) {
      const parent = top.list.items[top.list.items.length - 1];
      // A parent may already own a nested list (indent out, then back in) — append to it.
      if (!parent.child) parent.child = { ordered: line.ordered, items: [] };
      open.push({ indent: line.indent, list: parent.child });
      top = open[open.length - 1];
    }
    top.list.items.push({ text: line.text, child: null });
  }
  return root;
}

function renderListTree(
  list: ListTree,
  keyPrefix: string,
  bodySize: string,
  depth: number,
): ReactNode {
  const items = list.items.map((item, i) => (
    <li key={i}>
      {renderInline(item.text, `${keyPrefix}-li${i}`)}
      {item.child ? renderListTree(item.child, `${keyPrefix}-li${i}-n`, bodySize, depth + 1) : null}
    </li>
  ));

  // Only the top level carries the body type scale; nested lists inherit it from their parent item.
  const scale = depth === 0 ? cn("text-[var(--text-2)]", bodySize) : "";

  if (list.ordered) {
    return (
      <ol key={keyPrefix} className={cn("list-decimal space-y-1 pl-5", scale)}>
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
    <ul key={keyPrefix} className={cn("doc-bullets list-disc space-y-1 pl-5", scale)}>
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
    return renderListTree(buildListTree(listLines), key, bodySize, 0);
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
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    out.push(
      // Same `doc-bullets` house marker as `renderList` above. This used to be `list-disc` only,
      // so the SAME markdown rendered as a purple → in one block and a grey dot in another.
      <ul
        key={`${keyPrefix}-ul-${out.length}`}
        className="doc-bullets my-1 list-disc space-y-0.5 pl-5"
      >
        {items.map((item, index) => (
          <li key={index}>{renderInline(item, `${keyPrefix}-li-${out.length}-${index}`)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((line, index) => {
    // `- ` or `* ` with optional leading indent. The trailing space is required, so a line that
    // merely starts with a hyphen (a negative number, an en-dashed aside) is not a bullet.
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
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

  flushBullets();
  return out;
}
