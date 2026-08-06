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
    } else if (token.startsWith("***")) {
      out.push(`<strong><em>${escapeHtml(token.slice(3, -3))}</em></strong>`);
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

export function markdownToHtml(markdown: string): string {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      // A block whose every line is a bullet becomes a real <ul>. Without this the editor could
      // not RESTORE a list it had just written: the round trip was one-way, so a list survived
      // until the next re-render and then silently reverted to plain lines.
      if (lines.length && lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        const items = lines
          .map((line) => `<li>${inlineMarkdownToHtml(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("");
        // `doc-bullets` is REQUIRED, not decoration: Tailwind's preflight resets `ul` to
        // `list-style: none`, and there is no bare `ul` rule inside `.proposal-document` — so a
        // classless <ul> renders with no marker at all. That is why bullets looked dead across
        // the whole document while the markup was perfectly correct.
        return `<ul class="doc-bullets">${items}</ul>`;
      }
      return `<div>${lines.map(inlineMarkdownToHtml).join("<br>")}</div>`;
    })
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
      // A <strong> wrapping only an <em> is bold-italic; `inner` already carries the `*`, so
      // emitting `**` around it produces `***x***` rather than `***x**` + a stray marker.
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

/**
 * The `tag` element the selection sits INSIDE, if any — i.e. "is this already bold?"
 *
 * Walks up from the range's common ancestor, stopping at the editor root so a `<strong>` in some
 * other part of the page can never be unwrapped. `B`/`I` are matched alongside `STRONG`/`EM`
 * because a browser's own commands and pasted HTML both produce them, and `inlineNodeToMarkdown`
 * already treats the pairs as equivalent — so a paste-in `<b>` must toggle off like ours.
 */
function enclosingTag(
  root: HTMLElement,
  range: Range,
  tag: "strong" | "em" | "code",
): HTMLElement | null {
  const names = tag === "strong" ? ["STRONG", "B"] : tag === "em" ? ["EM", "I"] : ["CODE"];
  let node: Node | null = range.commonAncestorContainer;

  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && names.includes((node as HTMLElement).tagName)) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

/** Replace an element with its own children, and return a range covering what it held. */
function unwrap(element: HTMLElement): Range {
  const parent = element.parentNode;
  const range = document.createRange();
  if (!parent) return range;

  const first = element.firstChild;
  const last = element.lastChild;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);

  // Select what was unwrapped, so the text stays highlighted and can be re-toggled immediately.
  if (first && last) {
    range.setStartBefore(first);
    range.setEndAfter(last);
  }
  parent.normalize();
  return range;
}

export function htmlToMarkdown(root: HTMLElement): string {
  const paragraphs: string[] = [];
  let current: Node[] = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.map(inlineNodeToMarkdown).join(""));
    current = [];
  };
  root.childNodes.forEach((node) => {
    const tag = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement).tagName : "";
    // A list serialises to `- ` lines — the same syntax `renderLines` reads and authors already
    // type by hand. `htmlToMarkdown` previously had NO list case at all, so `insertUnorderedList`
    // produced a list in the DOM that the very next serialisation threw away.
    if (tag === "UL" || tag === "OL") {
      flush();
      const items = Array.from((node as HTMLElement).querySelectorAll("li"))
        .map((li) => `- ${inlineNodeToMarkdown(li).trim()}`)
        .filter((line) => line !== "- ");
      if (items.length) paragraphs.push(items.join("\n"));
      return;
    }
    if (/^(DIV|P)$/.test(tag)) {
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

      // TOGGLE, not apply. This used to wrap unconditionally, so pressing Bold twice produced
      // `<strong><strong>x</strong></strong>` — which serialises to `****x****` and reads as
      // literal asterisks. Bold could be turned on and never off, in every prose and
      // introduction block. (The <textarea> fields go through `wrapSelection`, which was fixed
      // separately; this is the OTHER path, and it had no behavioural test at all.)
      const enclosing = enclosingTag(el, range, tag);
      if (enclosing) {
        const restored = unwrap(enclosing);
        sel.removeAllRanges();
        sel.addRange(restored);
        serialize();
        return;
      }

      const wrapper = document.createElement(tag);
      wrapper.appendChild(range.extractContents());
      // A selection spanning "plain **bold**" would otherwise nest the existing marker inside
      // the new one. Strip any same-tag descendants so the result is one flat wrapper.
      wrapper.querySelectorAll(tag).forEach((nested) => unwrap(nested as HTMLElement));
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
  // Same ref discipline as `InlineTextArea`: the registry stores this closure once, on focus, so
  // it must not freeze anything. These commands act on the DOM (always current), but they call
  // `serialize`, which closes over `onChange` — a stale one would write the edit into a handler
  // the block has moved on from. Stable identity, always-fresh targets.
  const handlers = useRef({ applyInline, applyLink, serialize });
  handlers.current = { applyInline, applyLink, serialize };

  const runCommand = useCallback((command: FormatCommand) => {
    const { applyInline, applyLink } = handlers.current;
    if (command === "bold") return applyInline("strong");
    if (command === "italic") return applyInline("em");
    if (command === "code") return applyInline("code");
    if (command === "link") return applyLink();
    // Deprecated, but still the only API that participates in the browser's undo stack.
    document.execCommand("insertUnorderedList");
    // The browser makes a bare <ul>, which has no marker inside `.proposal-document` (preflight
    // resets `list-style`). Without this the list you just made looks unmarked until you click
    // away and the field re-renders from Markdown.
    elRef.current?.querySelectorAll("ul, ol").forEach((list) => list.classList.add("doc-bullets"));
    // ⚠️ And SERIALISE. `applyInline` and `applyLink` each end by writing the DOM back to the
    // value; this path did not, so the list appeared and then vanished on the next render, when
    // the field is re-rendered from a `value` that never learned about it. That is why the
    // button looked dead rather than wrong.
    handlers.current.serialize();
  }, []);

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
