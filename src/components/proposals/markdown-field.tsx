/**
 * Markdown editor field (Phase 2) — a drop-in replacement for the plain FormTextArea used across
 * section editors. A formatting toolbar (bold, italic, link, heading, lists) and keyboard
 * shortcuts (⌘/Ctrl+B, +I, +K) wrap the current selection in Markdown; the stored value is plain
 * Markdown text, rendered by <Markdown/> in the preview. Backward compatible — existing plain text
 * is valid Markdown and renders unchanged.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LinkIcon, ListBulletIcon, NumberedListIcon } from "@heroicons/react/24/outline";
import { MERGE_VARIABLES } from "@/lib/merge-variables";
import { toggleBulletLines } from "@/lib/sections/inline-format-toolbar";
import { InlineFormatBar, useTextareaSelectionRect } from "@/lib/sections/inline-format-toolbar";

export function MarkdownField({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
  showMergeVars = true,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Proposal merge-variable insert menu ({{client_name}} etc.). Off for
   *  contexts that have no merge variables (e.g. the task form). */
  showMergeVars?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [varsOpen, setVarsOpen] = useState(false);
  const selectionRect = useTextareaSelectionRect(ref, true);
  const focused = useRef(false);

  // External value → DOM sync, but NEVER while the operator has the field focused — that
  // would clobber their caret position mid-edit (e.g. on an autosave-triggered refetch or
  // when the parent state pipeline momentarily re-commits a stale value). Same guard the
  // contentEditable RichInlineEditor uses for the same reason. The textarea below uses
  // defaultValue (uncontrolled) so React never touches its .value while you type; this
  // effect handles the external-update case.
  useEffect(() => {
    const ta = ref.current;
    if (!ta || focused.current) return;
    if (ta.value !== value) ta.value = value;
  }, [value]);

  // Push a toolbar-computed edit into the uncontrolled textarea + report to the parent,
  // then place the caret. Written as one atomic op so the DOM value and the state stay in
  // sync (the useEffect above skips syncing while focused).
  const applyEdit = useCallback(
    (nextValue: string, selectionStart: number, selectionEnd: number) => {
      const ta = ref.current;
      if (!ta) return;
      ta.value = nextValue;
      ta.focus();
      ta.setSelectionRange(selectionStart, selectionEnd);
      onChange(nextValue);
    },
    [onChange],
  );

  /** Toggle `- ` on the touched lines. Shares the pure transform with the inline canvas fields, so
   *  a bulleted list behaves identically wherever text is edited. */
  const bullets = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const next = toggleBulletLines(ta.value, ta.selectionStart, ta.selectionEnd);
    applyEdit(next.value, next.start, next.end);
  }, [applyEdit]);

  const wrap = useCallback(
    (prefix: string, suffix = prefix, placeholderText = "text") => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const hasSelection = s !== e;
      const sel = hasSelection ? v.slice(s, e) : placeholderText;

      // Toggle-off: selection is already exactly wrapped in this marker → strip it.
      // Also handles the case where the selection SITS INSIDE an existing wrapper
      // (user selected the inner text without grabbing the markers) — detect and unwrap.
      if (hasSelection && sel.startsWith(prefix) && sel.endsWith(suffix) && sel.length >= prefix.length + suffix.length) {
        const inner = sel.slice(prefix.length, sel.length - suffix.length);
        applyEdit(v.slice(0, s) + inner + v.slice(e), s, s + inner.length);
        return;
      }
      const before = v.slice(Math.max(0, s - prefix.length), s);
      const after = v.slice(e, e + suffix.length);
      if (hasSelection && before === prefix && after === suffix) {
        applyEdit(
          v.slice(0, s - prefix.length) + sel + v.slice(e + suffix.length),
          s - prefix.length,
          s - prefix.length + sel.length,
        );
        return;
      }

      applyEdit(
        v.slice(0, s) + prefix + sel + suffix + v.slice(e),
        s + prefix.length,
        s + prefix.length + sel.length,
      );
    },
    [applyEdit],
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
      applyEdit(v.slice(0, lineStart) + prefixed + v.slice(e), lineStart, lineStart + prefixed.length);
    },
    [applyEdit],
  );

  const link = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || "link text";
    const insert = `[${sel}](https://)`;
    // Select the "https://" so the user can immediately type the URL.
    const urlStart = s + sel.length + 3;
    applyEdit(v.slice(0, s) + insert + v.slice(e), urlStart, urlStart + 8);
  }, [applyEdit]);

  const insertToken = useCallback(
    (token: string) => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const insert = `{{${token}}}`;
      applyEdit(v.slice(0, s) + insert + v.slice(e), s + insert.length, s + insert.length);
      setVarsOpen(false);
    },
    [applyEdit],
  );

  // Wrap the current selection in a size marker (<sm>…</sm> / <lg>…</lg>). "base" (Normal) strips
  // any surrounding size marker rather than adding one — one round-trip S → M → L stays clean.
  const applySize = useCallback(
    (preset: "sm" | "base" | "lg") => {
      const ta = ref.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      if (s === e) return;
      const sel = v.slice(s, e);
      // Detect a wrapper the user is toggling off / replacing.
      const wrapped = /^<(sm|lg)>([\s\S]*)<\/\1>$/.exec(sel);
      const inner = wrapped ? wrapped[2] : sel;
      const next = preset === "base" ? inner : `<${preset}>${inner}</${preset}>`;
      applyEdit(v.slice(0, s) + next + v.slice(e), s, s + next.length);
    },
    [applyEdit],
  );

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
          {showMergeVars ? (
            <>
              <Divider />
              <div className="relative">
                <ToolbarButton label="Insert merge variable" onClick={() => setVarsOpen((v) => !v)}>
                  <span className="font-mono text-[11px] leading-none">{"{ }"}</span>
                </ToolbarButton>
                {varsOpen ? (
                  <div className="absolute left-0 top-9 z-20 w-60 overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-white py-1 shadow-[var(--shadow-lg)]">
                    <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-4)]">
                      Insert variable
                    </p>
                    {MERGE_VARIABLES.map((variable) => (
                      <button
                        key={variable.token}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertToken(variable.token)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-1)]"
                      >
                        <span className="text-[var(--text-2)]">{variable.label}</span>
                        <code className="font-mono text-[10px] text-[var(--text-4)]">{`{{${variable.token}}}`}</code>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          <span className="ml-auto pr-1 font-mono text-[9px] uppercase tracking-[1px] text-[var(--text-4)]">
            Markdown
          </span>
        </div>
        <textarea
          ref={ref}
          defaultValue={value}
          placeholder={placeholder}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
          }}
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
      <InlineFormatBar
        rect={selectionRect}
        onBold={() => wrap("**")}
        onItalic={() => wrap("*")}
        onCode={() => wrap("`")}
        onLink={link}
        onBullets={bullets}
        onSize={applySize}
      />
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
