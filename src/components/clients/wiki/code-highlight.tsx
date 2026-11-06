"use client";

/**
 * Syntax colouring for Code Handover: the version viewer and the compare view use the
 * same tokenizer, so a line looks the same in both. Moved out of wiki-code-section.tsx.
 */

import { useMemo, type ReactNode } from "react";

// ── Lightweight, dependency-free syntax highlighting ────────────────────────
// Tuned for firmware / C-family (the .ino/.cpp/.h this section handles), with a
// broad keyword set that also covers JS/Python so other pasted files still get
// comments/strings/numbers coloured. Tokenises the RAW string then renders React
// spans (React escapes text — no dangerouslySetInnerHTML, XSS-safe).
export const CODE_KEYWORDS = new Set([
  // C / C++ / Arduino
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
  "void", "int", "long", "short", "char", "unsigned", "signed", "float", "double", "bool", "boolean",
  "byte", "word", "const", "static", "volatile", "struct", "class", "enum", "union", "typedef", "sizeof",
  "new", "delete", "public", "private", "protected", "namespace", "using", "template", "typename", "auto",
  "this", "nullptr", "true", "false", "goto", "extern", "inline", "operator", "virtual", "override",
  "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int8_t", "int16_t", "int32_t", "int64_t", "size_t", "String",
  "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "setup", "loop",
  // JS / TS
  "function", "var", "let", "import", "from", "export", "async", "await", "try", "catch", "finally",
  "throw", "typeof", "instanceof", "of", "in", "yield", "interface", "type", "as", "extends", "implements",
  // Python
  "def", "print", "is", "not", "and", "or", "None", "True", "False", "elif", "lambda", "with", "pass", "self",
]);

export type CodeToken = { t: "com" | "str" | "num" | "kw" | "pre" | "txt"; v: string };

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const n = code.length;
  let i = 0;
  const isWord = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === "/" && c2 === "/") {
      let j = i + 2;
      while (j < n && code[j] !== "\n") j++;
      tokens.push({ t: "com", v: code.slice(i, j) });
      i = j;
    } else if (c === "/" && c2 === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      tokens.push({ t: "com", v: code.slice(i, j) });
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        j++;
      }
      tokens.push({ t: "str", v: code.slice(i, j) });
      i = j;
    } else if (c === "#") {
      let j = i + 1;
      while (j < n && /[A-Za-z]/.test(code[j])) j++;
      tokens.push({ t: "pre", v: code.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(c2 ?? ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXbBoL._]/.test(code[j])) j++;
      tokens.push({ t: "num", v: code.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && isWord(code[j])) j++;
      const w = code.slice(i, j);
      tokens.push({ t: CODE_KEYWORDS.has(w) ? "kw" : "txt", v: w });
      i = j;
    } else {
      let j = i + 1;
      while (j < n && !/[/"'`#A-Za-z_0-9]/.test(code[j])) j++;
      tokens.push({ t: "txt", v: code.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

export function HighlightedCode({ code }: { code: string }) {
  const tokens = useMemo(() => tokenizeCode(code), [code]);
  return (
    <>
      {tokens.map((tk, idx): ReactNode =>
        tk.t === "txt" ? tk.v : (
          <span key={idx} className={`wch-${tk.t}`}>
            {tk.v}
          </span>
        ),
      )}
    </>
  );
}

// Theme-aware token colours — legible on the dark internal view and the light
// public view. Rendered once per section.
export const CODE_HL_CSS = `
.wch-com{color:#6a737d;font-style:italic}
.wch-kw{color:#8250df}
.wch-str{color:#0a7d55}
.wch-num{color:#b45309}
.wch-pre{color:#a3306e}
[data-theme="dark"] .wch-com{color:#7d8590}
[data-theme="dark"] .wch-kw{color:#c39cff}
[data-theme="dark"] .wch-str{color:#6bd6a8}
[data-theme="dark"] .wch-num{color:#e0a45e}
[data-theme="dark"] .wch-pre{color:#f0a3c8}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .wch-com{color:#7d8590}
  :root:not([data-theme="light"]) .wch-kw{color:#c39cff}
  :root:not([data-theme="light"]) .wch-str{color:#6bd6a8}
  :root:not([data-theme="light"]) .wch-num{color:#e0a45e}
  :root:not([data-theme="light"]) .wch-pre{color:#f0a3c8}
}
`;

/**
 * A file's tokens split into lines. The whole file is tokenised first, so a block comment
 * or string that spans lines is still coloured on every line it covers.
 */
export function tokenLines(code: string): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const tk of tokenizeCode(code.replace(/\r\n?/g, "\n"))) {
    const parts = tk.v.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ t: tk.t, v: part });
    });
  }
  // A final newline ends the last line rather than starting an empty one.
  if (lines.length > 1 && lines[lines.length - 1].length === 0 && code.endsWith("\n")) lines.pop();
  return lines;
}

/** A file with line numbers. The numbers stay put while long lines scroll sideways. */
export function NumberedCode({ code, maxHeightClass = "max-h-[420px]" }: { code: string; maxHeightClass?: string }) {
  const lines = useMemo(() => tokenLines(code), [code]);
  return (
    <pre className={`${maxHeightClass} overflow-auto bg-[var(--surface-0)] py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]`} style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace" }}>
      <code className="flex min-w-max">
        <span aria-hidden className="sticky left-0 shrink-0 select-none bg-[var(--surface-0)] pl-3 pr-3 text-right text-[var(--text-4)]" data-line-numbers>
          {lines.map((_, i) => `${i + 1}`).join("\n")}
        </span>
        <span className="pr-4">
          {lines.map((line, i) => (
            <span key={i} className="block min-h-[1.625em]">
              {line.length === 0
                ? " "
                : line.map((tk, j) => (tk.t === "txt" ? tk.v : <span key={j} className={`wch-${tk.t}`}>{tk.v}</span>))}
            </span>
          ))}
        </span>
      </code>
    </pre>
  );
}

/** A run of one token's text, and whether it falls inside the emphasised range. */
export interface LineSegment {
  t: CodeToken["t"];
  v: string;
  marked: boolean;
}

/**
 * Split a line's tokens at the edges of an emphasised range [start, end), so a token the
 * range cuts through keeps its colour on both sides. Concatenating every segment's text
 * always gives back the line exactly.
 */
export function segmentLine(text: string, mark: { start: number; end: number } | null): LineSegment[] {
  const out: LineSegment[] = [];
  let at = 0;
  for (const tk of tokenizeCode(text)) {
    const from = at;
    const to = at + tk.v.length;
    at = to;
    const cuts = [from, to];
    if (mark) {
      if (mark.start > from && mark.start < to) cuts.push(mark.start);
      if (mark.end > from && mark.end < to) cuts.push(mark.end);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (a === b) continue;
      const marked = mark ? a >= mark.start && b <= mark.end : false;
      const prev = out[out.length - 1];
      const v = text.slice(a, b);
      // Merge with the previous run when nothing about it differs, to keep the DOM small.
      if (prev && prev.t === tk.t && prev.marked === marked) prev.v += v;
      else out.push({ t: tk.t, v, marked });
    }
  }
  return out;
}

/** One line, coloured, with an optional emphasised range drawn as a <mark>. */
export function HighlightedLine({
  text,
  mark = null,
  markClassName = "",
}: {
  text: string;
  mark?: { start: number; end: number } | null;
  markClassName?: string;
}) {
  const segments = useMemo(() => segmentLine(text, mark), [text, mark]);
  if (!text) return <> </>;
  return (
    <>
      {segments.map((sg, i) => {
        const inner: ReactNode = sg.t === "txt" ? sg.v : <span className={`wch-${sg.t}`}>{sg.v}</span>;
        return sg.marked ? (
          <mark key={i} className={`rounded-[2px] text-inherit ${markClassName}`}>
            {inner}
          </mark>
        ) : (
          <span key={i}>{inner}</span>
        );
      })}
    </>
  );
}
