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

// One pass matches the earliest inline marker; precedence: link → bold → italic → underscore-italic → code.
const INLINE_RE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(`[^`\n]+`)/;

/** Allow only safe URL schemes; bare domains become https; anything odd (javascript:, data:) is dropped. */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[/#]/.test(url)) return url; // site-relative or anchor
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
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

function linesToInline(lines: string[], keyPrefix: string): ReactNode[] {
  // Single newlines become <br/> so deliberate line breaks survive.
  return lines.flatMap((line, i) =>
    i === 0
      ? renderInline(line, `${keyPrefix}-l${i}`)
      : [<br key={`${keyPrefix}-br${i}`} />, ...renderInline(line, `${keyPrefix}-l${i}`)],
  );
}

function renderBlock(block: string, idx: number): ReactNode {
  const lines = block.split("\n");
  const key = `b${idx}`;

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

  // Unordered list
  if (lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul key={key} className="list-disc space-y-1 pl-5 text-[16px] leading-8 text-[var(--text-2)]">
        {lines.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^\s*[-*]\s+/, ""), `${key}-li${i}`)}</li>
        ))}
      </ul>
    );
  }

  // Ordered list
  if (lines.length > 0 && lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol key={key} className="list-decimal space-y-1 pl-5 text-[16px] leading-8 text-[var(--text-2)]">
        {lines.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""), `${key}-li${i}`)}</li>
        ))}
      </ol>
    );
  }

  // Paragraph
  return (
    <p key={key} className="text-[16px] leading-8 text-[var(--text-2)]">
      {linesToInline(lines, key)}
    </p>
  );
}

export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  const text = (children ?? "").replace(/\r\n/g, "\n");
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b.trim().length > 0);

  if (blocks.length === 0) return null;

  return <div className={className ?? "space-y-4"}>{blocks.map(renderBlock)}</div>;
}
