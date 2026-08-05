"use client";

/**
 * Floating Bold/Italic/Link/Code bar for plain <textarea>-based Markdown fields — appears above
 * whatever text is currently selected, portalled to <body> with `fixed` positioning so it's never
 * clipped by a parent's `overflow:hidden` (the canvas panel, a modal, an outline drill-in, …).
 *
 * Shared by InlineTextArea (canvas) and MarkdownField (form editor) — both are plain textareas, so
 * both need the same trick to find out *where on screen* the selection actually is: textareas
 * don't expose a per-character DOM Range/getBoundingClientRect the way contentEditable does, so
 * this measures it via an invisible "mirror" div that copies the textarea's box model/typography
 * exactly, then reads the offsetTop/offsetLeft of a marker span wrapping the selected text. Works
 * for any selection length, including a single highlighted word — it doesn't rely on
 * whole-line/paragraph heuristics.
 */

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LinkIcon, ListBulletIcon } from "@heroicons/react/24/outline";

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIRRORED_STYLE_PROPS = [
  "box-sizing", "width", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "line-height",
  "text-align", "text-indent", "text-transform", "word-spacing", "tab-size",
];

function measureSelectionRect(ta: HTMLTextAreaElement): SelectionRect | null {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  if (s === e) return null;

  const style = window.getComputedStyle(ta);
  const mirror = document.createElement("div");
  MIRRORED_STYLE_PROPS.forEach((prop) => {
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  });
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflowWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-99999px";
  mirror.style.height = "auto";

  mirror.appendChild(document.createTextNode(value.slice(0, s)));
  const mark = document.createElement("span");
  mark.textContent = value.slice(s, e);
  mirror.appendChild(mark);
  mirror.appendChild(document.createTextNode(value.slice(e)));

  document.body.appendChild(mirror);
  const relTop = mark.offsetTop;
  const relLeft = mark.offsetLeft;
  const height = mark.offsetHeight;
  const width = mark.offsetWidth;
  document.body.removeChild(mirror);

  const taRect = ta.getBoundingClientRect();
  return {
    top: taRect.top + relTop - ta.scrollTop,
    left: taRect.left + relLeft - ta.scrollLeft,
    width,
    height,
  };
}

/** Tracks the live on-screen selection rect inside a textarea while `enabled`; null when disabled,
 *  unfocused, or the selection is collapsed (no highlight). */
export function useTextareaSelectionRect(
  ref: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
): SelectionRect | null {
  const [rect, setRect] = useState<SelectionRect | null>(null);

  const update = useCallback(() => {
    const ta = ref.current;
    if (!ta || document.activeElement !== ta) {
      setRect(null);
      return;
    }
    setRect(measureSelectionRect(ta));
  }, [ref]);

  useEffect(() => {
    if (!enabled) {
      setRect(null);
      return;
    }
    const ta = ref.current;
    if (!ta) return;
    const clear = () => setRect(null);
    ta.addEventListener("select", update);
    ta.addEventListener("mouseup", update);
    ta.addEventListener("keyup", update);
    ta.addEventListener("scroll", update);
    ta.addEventListener("blur", clear);
    return () => {
      ta.removeEventListener("select", update);
      ta.removeEventListener("mouseup", update);
      ta.removeEventListener("keyup", update);
      ta.removeEventListener("scroll", update);
      ta.removeEventListener("blur", clear);
    };
  }, [ref, update, enabled]);

  return rect;
}

/**
 * Toggle `- ` on every line the selection touches.
 *
 * Pure and exported so the transform is unit-testable without a DOM — the line/selection maths is
 * where this goes wrong, not the button.
 *
 * Whole-line, not selection-wrapping: a bullet is a property of a LINE, so selecting three words
 * mid-line still bullets that whole line. Removal is only offered when EVERY touched line is
 * already a bullet; a mixed selection normalises into a clean list instead.
 */
export function toggleBulletLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

  const lines = value.slice(lineStart, lineEnd).split("\n");
  const BULLET = /^(\s*)[-*]\s+/;
  const allBulleted = lines.every((line) => !line.trim() || BULLET.test(line));

  const next = lines
    .map((line) => {
      // A blank line is spacing; bulleting it would print an empty list item.
      if (!line.trim()) return line;
      if (allBulleted) return line.replace(BULLET, "$1");
      // Already a bullet in a MIXED selection: leave it, rather than adding a second marker.
      if (BULLET.test(line)) return line;
      return line.replace(/^(\s*)/, "$1- ");
    })
    .join("\n");

  return {
    value: value.slice(0, lineStart) + next + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + next.length,
  };
}

/** Bold/italic/link/code wrap-the-selection helpers for a plain <textarea> — the same
 *  string-splice approach MarkdownField's static toolbar already uses, factored out so
 *  InlineTextArea can share it instead of re-implementing selection-preserving edits. */
export function useTextareaFormatting(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
) {
  const restoreSelection = useCallback(
    (start: number, end: number) => {
      requestAnimationFrame(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(start, end);
      });
    },
    [ref],
  );

  const wrap = useCallback(
    (prefix: string, suffix = prefix) => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e } = ta;
      if (s === e) return;
      const sel = value.slice(s, e);
      onChange(value.slice(0, s) + prefix + sel + suffix + value.slice(e));
      restoreSelection(s + prefix.length, s + prefix.length + sel.length);
    },
    [ref, value, onChange, restoreSelection],
  );

  const link = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (s === e) return;
    const sel = value.slice(s, e);
    const insert = `[${sel}](https://)`;
    onChange(value.slice(0, s) + insert + value.slice(e));
    const urlStart = s + sel.length + 3;
    restoreSelection(urlStart, urlStart + 8);
  }, [ref, value, onChange, restoreSelection]);

  const bullets = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const next = toggleBulletLines(value, ta.selectionStart, ta.selectionEnd);
    onChange(next.value);
    restoreSelection(next.start, next.end);
  }, [ref, value, onChange, restoreSelection]);

  return { wrap, link, bullets };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), Math.max(min, max));
}

const BAR_HEIGHT = 40;
const BAR_WIDTH = 276;
const VIEWPORT_GAP = 8;

export function InlineFormatBar({
  rect,
  onBold,
  onItalic,
  onBullets,
  onLink,
  onCode,
  onSize,
}: {
  rect: SelectionRect | null;
  onBold: () => void;
  onItalic: () => void;
  onBullets?: () => void;
  onLink: () => void;
  onCode: () => void;
  /** Optional — wrap the current selection in a size marker. Undefined = size UI hidden (used by
   *  contexts that haven't wired the wrap helper yet). */
  onSize?: (preset: "sm" | "base" | "lg") => void;
}) {
  if (!rect || typeof document === "undefined") return null;

  const width = onSize ? BAR_WIDTH : 168;
  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    VIEWPORT_GAP,
    Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
  );
  const top = Math.max(rect.top - BAR_HEIGHT - 6, VIEWPORT_GAP);

  return createPortal(
    <div
      role="toolbar"
      aria-label="Text formatting"
      // A click here must not blur the textarea first — that would collapse the selection before
      // the click handler ever runs.
      onMouseDown={(event) => event.preventDefault()}
      className="fixed z-[1000] flex items-center gap-0.5 rounded-[8px] border border-white/10 bg-[#1a1a1e] p-1 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      style={{ top, left, width }}
    >
      <BarButton label="Bold" onClick={onBold}>
        <span className="text-[13px] font-bold">B</span>
      </BarButton>
      <BarButton label="Italic" onClick={onItalic}>
        <span className="text-[13px] italic">I</span>
      </BarButton>
      {onBullets ? (
        <BarButton label="Bulleted list" onClick={onBullets}>
          <ListBulletIcon className="h-4 w-4" />
        </BarButton>
      ) : null}
      <BarButton label="Code" onClick={onCode}>
        <span className="font-mono text-[11px]">{"</>"}</span>
      </BarButton>
      <BarButton label="Link" onClick={onLink}>
        <LinkIcon className="h-3.5 w-3.5" />
      </BarButton>
      {onSize ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <BarButton label="Small" onClick={() => onSize("sm")}>
            <span className="font-mono text-[10px] font-semibold uppercase">S</span>
          </BarButton>
          <BarButton label="Normal" onClick={() => onSize("base")}>
            <span className="font-mono text-[10px] font-semibold uppercase">M</span>
          </BarButton>
          <BarButton label="Large" onClick={() => onSize("lg")}>
            <span className="font-mono text-[10px] font-semibold uppercase">L</span>
          </BarButton>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-7 min-w-7 flex-1 items-center justify-center rounded-[5px] transition-colors hover:bg-white/15"
    >
      {children}
    </button>
  );
}
