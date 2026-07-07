import type { ReactNode } from "react";
import {
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  FireIcon,
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { renderInline } from "@/lib/markdown";

/**
 * Handbook article renderer — an XSS-safe, infographic-grade renderer for the editorial reading
 * surface. On top of the shared inline grammar it adds directive blocks (steps / check / avoid /
 * grid / pills / stats), admonition callouts, roman-numeral section headers, drop-cap lede,
 * pull-quotes and styled code + tables — all themed by the scoped `.handbook-reader` palette. Renders
 * to React elements only (never dangerouslySetInnerHTML). Kept separate from `lib/markdown.tsx`.
 *
 * DIRECTIVE SYNTAX (open `::: name [Heading]`, close `:::`):
 *   ::: steps            — `- item` lines → numbered workflow pills with arrows
 *   ::: check [EYEBROW]  — `- item` lines → light card, green ✓ items (2-col)
 *   ::: avoid [EYEBROW]  — `- item` lines → dark card, red ✗ items  (adjacent check+avoid = side by side)
 *   ::: grid             — `### Card Title` + body lines → responsive card grid
 *   ::: pills [EYEBROW]  — `- item` lines → row of green-dot pills
 *   ::: stats            — `- Label` (or `Label :: caption`) lines → dark numbered stat band
 */

type Admonition = "NOTE" | "TIP" | "WARNING" | "IMPORTANT";

type Card = { title: string; body: string[] };

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "admonition"; type: Admonition; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "p"; lines: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "checklist"; tone: "check" | "avoid"; eyebrow: string; items: string[] }
  | { kind: "grid"; cards: Card[] }
  | { kind: "pills"; eyebrow: string; items: string[] }
  | { kind: "stats"; items: string[] };

// A render unit is a Block, or a paired check+avoid rendered side by side.
type Unit = { kind: "single"; block: Block } | { kind: "pair"; a: Block; b: Block };

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}
function bullets(lines: string[]): string[] {
  return lines
    .filter((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim());
}
function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of map) while (v >= val) { out += sym; v -= val; }
  return out || "i";
}

const ADMONITION_RE = /^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*$/i;
const DIRECTIVE_OPEN_RE = /^:::\s*(steps|check|avoid|grid|pills|stats)\s*(.*)$/i;

function parseGridCards(lines: string[]): Card[] {
  const cards: Card[] = [];
  let cur: Card | null = null;
  for (const l of lines) {
    const h = /^###\s+(.*)$/.exec(l.trim());
    if (h) {
      cur = { title: h[1], body: [] };
      cards.push(cur);
    } else if (cur) {
      cur.body.push(l);
    }
  }
  return cards;
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i += 1; continue; }

    // Directive block.
    const dir = DIRECTIVE_OPEN_RE.exec(line.trim());
    if (dir) {
      const name = dir[1].toLowerCase();
      const heading = (dir[2] ?? "").trim();
      const inner: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== ":::") { inner.push(lines[i]); i += 1; }
      i += 1; // consume closing :::
      if (name === "steps") blocks.push({ kind: "steps", items: bullets(inner) });
      else if (name === "grid") blocks.push({ kind: "grid", cards: parseGridCards(inner) });
      else if (name === "pills") blocks.push({ kind: "pills", eyebrow: heading, items: bullets(inner) });
      else if (name === "stats") blocks.push({ kind: "stats", items: bullets(inner) });
      else blocks.push({ kind: "checklist", tone: name === "avoid" ? "avoid" : "check", eyebrow: heading, items: bullets(inner) });
      continue;
    }

    // Fenced code.
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      const lang = fence[1] ?? "";
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ kind: "code", lang, lines: code });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { blocks.push({ kind: "hr" }); i += 1; continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) { blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); i += 1; continue; }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") { rows.push(splitRow(lines[i])); i += 1; }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      const adm = quote.length > 0 ? ADMONITION_RE.exec(quote[0].trim()) : null;
      if (adm) {
        const body = quote.slice(1);
        while (body.length && body[0].trim() === "") body.shift();
        while (body.length && body[body.length - 1].trim() === "") body.pop();
        blocks.push({ kind: "admonition", type: adm[1].toUpperCase() as Admonition, lines: body });
      } else {
        blocks.push({ kind: "quote", lines: quote });
      }
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i += 1; }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i += 1; }
      blocks.push({ kind: "ol", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === "" || /^```/.test(l.trim()) || /^:::/.test(l.trim()) ||
        /^(#{1,6})\s+/.test(l.trim()) || /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l) ||
        /^\s*>\s?/.test(l) || /^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())
      ) break;
      para.push(l);
      i += 1;
    }
    if (para.length) blocks.push({ kind: "p", lines: para });
  }

  return blocks;
}

// ── Rendering ──────────────────────────────────────────────────────────────────

const ADMONITION_STYLE: Record<Admonition, { label: string; icon: typeof InformationCircleIcon; bar: string; icon_c: string }> = {
  NOTE: { label: "Note", icon: InformationCircleIcon, bar: "var(--hb-blue)", icon_c: "var(--hb-blue)" },
  TIP: { label: "Tip", icon: LightBulbIcon, bar: "var(--hb-green)", icon_c: "var(--hb-green)" },
  WARNING: { label: "Watch out", icon: ExclamationTriangleIcon, bar: "#d97706", icon_c: "#d97706" },
  IMPORTANT: { label: "Important", icon: FireIcon, bar: "var(--hb-red)", icon_c: "var(--hb-red)" },
};

function inlineLines(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, i) =>
    i === 0 ? renderInline(line, `${key}-l${i}`) : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-l${i}`)],
  );
}

function renderCardBody(lines: string[], key: string): ReactNode {
  const bl = parseBlocks(lines.join("\n"));
  return (
    <div className="space-y-2">
      {bl.map((b, i) => {
        if (b.kind === "ul")
          return (
            <ul key={i} className="space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-[14px] leading-6 text-[var(--hb-body)]">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hb-green)]" />
                  <span>{renderInline(it, `${key}-c${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="text-[14px] leading-6 text-[var(--hb-body)]">
            {inlineLines(b.kind === "p" ? b.lines : [b.kind === "heading" ? b.text : ""], `${key}-p${i}`)}
          </p>
        );
      })}
    </div>
  );
}

function ChecklistCard({ block, k }: { block: Extract<Block, { kind: "checklist" }>; k: string }) {
  const dark = block.tone === "avoid";
  const Icon = dark ? XMarkIcon : CheckIcon;
  return (
    <div
      className="rounded-[14px] border p-5"
      style={
        dark
          ? { background: "var(--hb-navy)", borderColor: "var(--hb-navy)" }
          : { background: "var(--hb-card)", borderColor: "var(--hb-border)" }
      }
    >
      {block.eyebrow ? (
        <div className="hb-mono mb-3 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: dark ? "var(--hb-on-dark-muted)" : "var(--hb-muted)" }}>
          {block.eyebrow}
        </div>
      ) : null}
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {block.items.map((it, j) => (
          <li key={j} className="flex items-start gap-2 text-[14px] leading-6" style={{ color: dark ? "var(--hb-on-dark)" : "var(--hb-body)" }}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: dark ? "var(--hb-red)" : "var(--hb-green)" }} />
            <span>{renderInline(it, `${k}-${j}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderBlock(block: Block, idx: number, romanRef: { n: number }, firstParagraphIdx: number): ReactNode {
  const key = `hb-${idx}`;
  switch (block.kind) {
    case "heading": {
      const text = renderInline(block.text, `${key}-h`);
      if (block.level <= 2) {
        romanRef.n += 1;
        const num = toRoman(romanRef.n);
        return (
          <h2 key={key} className="mt-12 flex items-baseline gap-3 first:mt-0">
            <span className="hb-serif shrink-0 text-[22px] italic leading-none text-[var(--hb-blue)]">{num}.</span>
            <span className="hb-serif text-[28px] leading-tight tracking-[-0.01em] text-[var(--hb-ink)]">{text}</span>
          </h2>
        );
      }
      if (block.level === 3)
        return <h3 key={key} className="mt-7 text-[17px] font-semibold text-[var(--hb-ink)]">{text}</h3>;
      return (
        <h4 key={key} className="hb-mono mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--hb-muted)]">
          {text}
        </h4>
      );
    }
    case "code":
      return (
        <div key={key} className="overflow-x-auto rounded-[12px] border border-[var(--hb-border)]" style={{ background: "#0f172a" }}>
          {block.lang ? (
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#5b8def" }} />
              <span className="hb-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--hb-on-dark-muted)" }}>{block.lang}</span>
            </div>
          ) : null}
          <pre className="hb-mono overflow-x-auto px-4 py-3.5 text-[13px] leading-6" style={{ color: "#e6edf7" }}>
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );
    case "admonition": {
      const s = ADMONITION_STYLE[block.type];
      const Icon = s.icon;
      return (
        <div key={key} className="rounded-[12px] border border-[var(--hb-border)] bg-[var(--hb-card)] p-0.5">
          <div className="rounded-[10px] px-4 py-3.5" style={{ borderLeft: `3px solid ${s.bar}`, background: "var(--hb-panel)" }}>
            <div className="hb-mono mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: s.bar }}>
              <Icon className="h-4 w-4" style={{ color: s.icon_c }} />
              {s.label}
            </div>
            <p className="text-[15px] leading-7 text-[var(--hb-body)]">{inlineLines(block.lines, `${key}-a`)}</p>
          </div>
        </div>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="hb-serif my-2 border-l-2 border-[var(--hb-blue)] pl-5 text-[21px] italic leading-8 text-[var(--hb-ink)]">
          {block.lines.map((l, i) => <p key={i}>{renderInline(l, `${key}-q${i}`)}</p>)}
        </blockquote>
      );
    case "ul":
      return (
        <ul key={key} className="space-y-1.5 pl-1 text-[16px] leading-7 text-[var(--hb-body)]">
          {block.items.map((l, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[var(--hb-blue)]" />
              <span>{renderInline(l, `${key}-li${i}`)}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="space-y-2 text-[16px] leading-7 text-[var(--hb-body)]">
          {block.items.map((l, i) => (
            <li key={i} className="flex gap-3">
              <span className="hb-mono mt-0.5 shrink-0 text-[12px] font-semibold text-[var(--hb-blue)]">{String(i + 1).padStart(2, "0")}</span>
              <span>{renderInline(l, `${key}-li${i}`)}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-[12px] border border-[var(--hb-border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr style={{ background: "var(--hb-panel)" }} className="border-b border-[var(--hb-border)]">
                {block.header.map((cell, i) => (
                  <th key={i} className="hb-mono px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--hb-muted)]">
                    {renderInline(cell, `${key}-th${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--hb-border-soft)] last:border-0">
                  {block.header.map((_, c) => (
                    <td key={c} className="px-3.5 py-2.5 align-top text-[15px] text-[var(--hb-body)]">{renderInline(row[c] ?? "", `${key}-td${r}-${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={key} className="border-t border-[var(--hb-border)]" />;
    case "steps":
      return (
        <div key={key} className="rounded-[16px] border border-[var(--hb-border)] p-5" style={{ background: "var(--hb-panel)" }}>
          <div className="flex flex-wrap items-center gap-2">
            {block.items.map((it, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hb-border)] bg-[var(--hb-card)] px-3.5 py-1.5">
                  <span className="hb-mono text-[10px] font-semibold text-[var(--hb-blue)]">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[13px] font-medium text-[var(--hb-ink)]">{renderInline(it, `${key}-s${i}`)}</span>
                </span>
                {i < block.items.length - 1 ? <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--hb-muted)]" /> : null}
              </span>
            ))}
          </div>
        </div>
      );
    case "checklist":
      return <ChecklistCard key={key} block={block} k={key} />;
    case "grid":
      return (
        <div key={key} className="grid gap-4 sm:grid-cols-2">
          {block.cards.map((c, i) => (
            <div key={i} className="rounded-[14px] border border-[var(--hb-border)] bg-[var(--hb-card)] p-5">
              <h3 className="hb-serif text-[19px] leading-tight text-[var(--hb-ink)]">{renderInline(c.title, `${key}-ct${i}`)}</h3>
              <div className="mt-2">{renderCardBody(c.body, `${key}-cb${i}`)}</div>
            </div>
          ))}
        </div>
      );
    case "pills":
      return (
        <div key={key}>
          {block.eyebrow ? <div className="hb-mono mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--hb-muted)]">{block.eyebrow}</div> : null}
          <div className="flex flex-wrap gap-2">
            {block.items.map((it, i) => (
              <span key={i} className="inline-flex items-center gap-2 rounded-full border border-[var(--hb-border)] bg-[var(--hb-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--hb-ink)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--hb-green)]" />
                {renderInline(it, `${key}-pl${i}`)}
              </span>
            ))}
          </div>
        </div>
      );
    case "stats":
      return (
        <div key={key} className="grid grid-cols-2 overflow-hidden rounded-[16px] sm:grid-cols-3" style={{ background: "var(--hb-navy)" }}>
          {block.items.map((it, i) => {
            const [label, caption] = it.split("::").map((s) => s.trim());
            return (
              <div key={i} className="border-b border-r border-white/10 p-5">
                <div className="hb-serif text-[26px] leading-none" style={{ color: "#5b8def" }}>{String(i + 1).padStart(2, "0")}</div>
                <div className="hb-serif mt-2 text-[17px] leading-snug" style={{ color: "var(--hb-on-dark)" }}>{label}</div>
                {caption ? <div className="mt-1 text-[12px]" style={{ color: "var(--hb-on-dark-muted)" }}>{caption}</div> : null}
              </div>
            );
          })}
        </div>
      );
    case "p": {
      const isLede = idx === firstParagraphIdx;
      return (
        <p
          key={key}
          className={
            isLede
              ? "text-[18px] leading-8 text-[var(--hb-body)] first-letter:float-left first-letter:mr-2.5 first-letter:mt-1 first-letter:text-[56px] first-letter:leading-[0.8] first-letter:text-[var(--hb-blue)] first-letter:[font-family:var(--font-display)]"
              : "text-[16px] leading-8 text-[var(--hb-body)]"
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
    return <p className="text-sm italic text-[var(--hb-muted)]">This article has no content yet.</p>;
  }

  // Pair an adjacent check + avoid (in either order) into a side-by-side row.
  const units: Unit[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = blocks[i + 1];
    if (b.kind === "checklist" && n && n.kind === "checklist" && b.tone !== n.tone) {
      units.push({ kind: "pair", a: b, b: n });
      i += 1;
    } else {
      units.push({ kind: "single", block: b });
    }
  }

  const firstParagraphIdx = blocks[0]?.kind === "p" ? 0 : -1;
  const romanRef = { n: 0 };
  let blockIdx = 0;

  return (
    <div className={className ?? "space-y-6"}>
      {units.map((u, i) => {
        if (u.kind === "pair") {
          const a = renderBlock(u.a, blockIdx++, romanRef, firstParagraphIdx);
          const b = renderBlock(u.b, blockIdx++, romanRef, firstParagraphIdx);
          return (
            <div key={`pair-${i}`} className="grid gap-4 md:grid-cols-2">
              {a}
              {b}
            </div>
          );
        }
        return <div key={`u-${i}`}>{renderBlock(u.block, blockIdx++, romanRef, firstParagraphIdx)}</div>;
      })}
    </div>
  );
}
