"use client";

/**
 * WYSIWYG-lite canvas editor for Markdown-backed fields (prose content, introduction summary): a
 * contentEditable surface that DISPLAYS bold/italic/code/links as actual formatting (not literal
 * `**stars**`), while the value stored/passed to `onChange` stays the same plain Markdown string
 * everything else in the app (the public renderer, MCP, exports) already expects.
 *
 * InlineTextArea (a plain <textarea>) can't do this — browsers don't support mixed inline styling
 * inside a native textarea, so a bold span is fundamentally impossible there; that's why the
 * canvas showed raw asterisks even with the floating format bar wired up. contentEditable can
 * render real <strong>/<em>/<code>/<a>, and — unlike the textarea's synthetic "mirror div" trick —
 * the Selection API gives an exact rect for the floating bar directly, including a single
 * highlighted word.
 *
 * Sync model: the DOM is the source of truth *while focused* (external `value` changes are only
 * applied when the field is blurred, so an autosave/refetch never clobbers an in-progress edit or
 * jumps the caret); on blur (and after each formatting command) the DOM is serialized back to
 * Markdown and pushed via `onChange`.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { INLINE_RE, safeUrl } from "@/lib/markdown";
import {
  useFormatTargetRegistration,
  type FormatCommand,
} from "@/lib/sections/format-target";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(text: string): string {
  const out: string[] = [];
  let rest = text;
  while (rest.length) {
    const m = rest.match(INLINE_RE);
    if (!m || m.index === undefined) {
      out.push(escapeHtml(rest));
      break;
    }
    if (m.index > 0) out.push(escapeHtml(rest.slice(0, m.index)));
    const token = m[0];
    if (token.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = lm ? safeUrl(lm[2]) : null;
      out.push(
        lm && href
          ? `<a href="${escapeHtml(href)}">${escapeHtml(lm[1])}</a>`
          : escapeHtml(lm?.[1] ?? token),
      );
    } else if (token.startsWith("**")) {
      out.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      out.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    } else if (token.startsWith("`")) {
      out.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    }
    rest = rest.slice(m.index + token.length);
  }
  return out.join("");
}

function markdownToHtml(markdown: string): string {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => `<div>${block.split("\n").map(inlineMarkdownToHtml).join("<br>")}</div>`)
    .join("");
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  if (el.tagName === "BR") return "\n";
  const inner = Array.from(el.childNodes).map(inlineNodeToMarkdown).join("");
  if (!inner.trim()) return inner;
  switch (el.tagName) {
    case "STRONG":
    case "B":
      return `**${inner}**`;
    case "EM":
    case "I":
      return `*${inner}*`;
    case "CODE":
      return `\`${inner}\``;
    case "A":
      return `[${inner}](${el.getAttribute("href") ?? ""})`;
    default:
      return inner;
  }
}

function htmlToMarkdown(root: HTMLElement): string {
  const paragraphs: string[] = [];
  let current: Node[] = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.map(inlineNodeToMarkdown).join(""));
    current = [];
  };
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && /^(DIV|P)$/.test((node as HTMLElement).tagName)) {
      flush();
      paragraphs.push(Array.from(node.childNodes).map(inlineNodeToMarkdown).join(""));
    } else {
      current.push(node);
    }
  });
  flush();
  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
}

export function RichInlineEditor({
  value,
  onChange,
  placeholder,
  className,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [empty, setEmpty] = useState(!value.trim());

  // External value -> DOM, but never while the operator has this field focused — that would
  // clobber their caret position mid-edit (e.g. on an autosave-triggered refetch).
  useEffect(() => {
    const el = elRef.current;
    if (!el || focused.current) return;
    el.innerHTML = markdownToHtml(value);
    setEmpty(!value.trim());
  }, [value]);

  const serialize = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    onChange(htmlToMarkdown(el));
  }, [onChange]);

  const applyInline = useCallback(
    (tag: "strong" | "em" | "code") => {
      const el = elRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;

      const wrapper = document.createElement(tag);
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);

      const next = document.createRange();
      next.selectNodeContents(wrapper);
      sel.removeAllRanges();
      sel.addRange(next);

      serialize();
    },
    [serialize],
  );

  const applyLink = useCallback(() => {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.appendChild(range.extractContents());
    range.insertNode(a);
    sel.removeAllRanges();
    serialize();
  }, [serialize]);

  // Registers with the ONE persistent formatting bar rather than rendering its own floating one.
  // Same command set as a plain field, different substrate: this is a contenteditable, so the
  // browser's own list command is the right tool — it handles the nesting, splitting and merging
  // that a string transform cannot see. The <textarea> fields use `toggleBulletLines` instead.
  const formatId = useId();
  const { register, unregister } = useFormatTargetRegistration();
  const commands = useMemo(
    () => new Set<FormatCommand>(["bold", "italic", "link", "code", "bullets"]),
    [],
  );
  const runCommand = useCallback(
    (command: FormatCommand) => {
      if (command === "bold") return applyInline("strong");
      if (command === "italic") return applyInline("em");
      if (command === "code") return applyInline("code");
      if (command === "link") return applyLink();
      // Deprecated, but still the only API that participates in the browser's undo stack.
      document.execCommand("insertUnorderedList");
    },
    [applyInline, applyLink],
  );

  return (
    <div
      className={`inline-edit relative w-full rounded-[4px] transition-colors focus-within:bg-[var(--surface-brand)]/50 ${className ?? ""}`}
      style={style}
    >
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        onFocus={() => {
          focused.current = true;
          register({ id: formatId, commands, run: runCommand });
          // Normalise Enter → a new paragraph <div> across browsers (Firefox otherwise defaults
          // to a bare <br>), so htmlToMarkdown's paragraph splitting behaves consistently.
          if (typeof document.execCommand === "function") {
            try {
              document.execCommand("defaultParagraphSeparator", false, "div");
            } catch {
              // Unsupported in this browser — paragraphs still round-trip, just via <br> instead.
            }
          }
        }}
        onBlur={() => {
          focused.current = false;
          unregister(formatId);
          serialize();
        }}
        onInput={() => setEmpty(!(elRef.current?.textContent ?? "").trim())}
        className="rich-inline-editable min-h-[1.5em] outline-none [&_a]:text-[var(--brand-700)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-[var(--surface-1)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]"
      />
      {empty ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 top-0 left-0 text-[var(--text-4)]">
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}
