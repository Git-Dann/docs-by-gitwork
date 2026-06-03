/**
 * Markdown editor field (Phase 2) — a drop-in replacement for the plain FormTextArea used across
 * section editors. A formatting toolbar (bold, italic, link, heading, lists) and keyboard
 * shortcuts (⌘/Ctrl+B, +I, +K) wrap the current selection in Markdown; the stored value is plain
 * Markdown text, rendered by <Markdown/> in the preview. Backward compatible — existing plain text
 * is valid Markdown and renders unchanged.
 */

"use client";

import { useCallback, useRef } from "react";
import { LinkIcon, ListBulletIcon, NumberedListIcon } from "@heroicons/react/24/outline";

export function MarkdownField({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-apply a selection after React commits the controlled value (which otherwise resets caret).
  const restoreSelection = useCallback((start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }, []);

  const wrap = useCallback(
    (prefix: string, suffix = prefix, placeholderText = "text") => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const sel = v.slice(s, e) || placeholderText;
      onChange(v.slice(0, s) + prefix + sel + suffix + v.slice(e));
      restoreSelection(s + prefix.length, s + prefix.length + sel.length);
    },
    [onChange, restoreSelection],
  );

  const linePrefix = useCallback(
    (prefix: string) => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const block = v.slice(lineStart, e);
      const prefixed = block
        .split("\n")
        .map((l) => (l.startsWith(prefix) ? l : `${prefix}${l}`))
        .join("\n");
      onChange(v.slice(0, lineStart) + prefixed + v.slice(e));
      restoreSelection(lineStart, lineStart + prefixed.length);
    },
    [onChange, restoreSelection],
  );

  const link = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || "link text";
    const insert = `[${sel}](https://)`;
    onChange(v.slice(0, s) + insert + v.slice(e));
    // Select the "https://" so the user can immediately type the URL.
    const urlStart = s + sel.length + 3;
    restoreSelection(urlStart, urlStart + 8);
  }, [onChange, restoreSelection]);

  return (
    <label className="block space-y-1.5">
      {label ? <span className="text-sm font-medium text-[var(--text-2)]">{label}</span> : null}
      <div className="overflow-hidden rounded-[8px] border border-[var(--border-2)] focus-within:border-[var(--brand-500)]">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-1">
          <ToolbarButton label="Bold (⌘B)" onClick={() => wrap("**")}>
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Italic (⌘I)" onClick={() => wrap("*")}>
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton label="Link (⌘K)" onClick={link}>
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="Heading" onClick={() => linePrefix("## ")}>
            <span className="text-[11px] font-bold">H</span>
          </ToolbarButton>
          <ToolbarButton label="Bulleted list" onClick={() => linePrefix("- ")}>
            <ListBulletIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" onClick={() => linePrefix("1. ")}>
            <NumberedListIcon className="h-4 w-4" />
          </ToolbarButton>
          <span className="ml-auto pr-1 font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-4)]">
            Markdown
          </span>
        </div>
        <textarea
          ref={ref}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
              const k = e.key.toLowerCase();
              if (k === "b") {
                e.preventDefault();
                wrap("**");
              } else if (k === "i") {
                e.preventDefault();
                wrap("*");
              } else if (k === "k") {
                e.preventDefault();
                link();
              }
            }
          }}
          rows={rows}
          className="block w-full resize-y border-0 bg-white px-3 py-2 text-sm leading-6 text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
        />
      </div>
    </label>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep textarea focus/selection
      onClick={onClick}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-[5px] px-1.5 text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2,#eef0f3)] hover:text-[var(--text-1)]"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-[var(--border-2)]" />;
}
