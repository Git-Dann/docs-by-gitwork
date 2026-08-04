/**
 * Inline canvas text editing.
 *
 * A borderless, transparent, auto-growing textarea that inherits the typography of its wrapper —
 * so editing a block reads exactly like the rendered document (no form fields, no modal). Used by
 * the editable Preview modes of the text-first blocks (heading, prose, callout, introduction,
 * cover title) so you click straight into the text and type.
 *
 * Typography lives on the WRAPPER (via `className`/`style`); the textarea + its sizing replica use
 * `font: inherit` so they match it exactly — putting the type on the field directly would let the
 * inline reset override the caller's classes. Auto-grow uses the grid-replica trick (a hidden
 * sibling holds the same text, sizing the cell) — no JS height juggling.
 */

"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

const FIELD_RESET: CSSProperties = {
  gridArea: "1 / 1 / 2 / 2",
  font: "inherit",
  letterSpacing: "inherit",
  color: "inherit",
  textAlign: "inherit",
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  width: "100%",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export function InlineTextArea({
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
  /** Typography classes — applied to the WRAPPER; the field inherits them. */
  className?: string;
  /** Inline typography (for blocks that style via `style`, e.g. heading) — applied to the wrapper. */
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`inline-edit grid w-full rounded-[4px] transition-colors focus-within:bg-[var(--surface-brand)]/50 ${className ?? ""}`}
      style={style}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={1}
        spellCheck
        style={{ ...FIELD_RESET, resize: "none", overflow: "hidden", outline: "none" }}
      />
      {/* Hidden replica sizes the grid cell to the content so the textarea auto-grows. The trailing
          space keeps the last line from collapsing as you type. */}
      <div aria-hidden style={{ ...FIELD_RESET, visibility: "hidden", pointerEvents: "none" }}>
        {value ? `${value} ` : placeholder || " "}
      </div>
    </div>
  );
}

/**
 * Inline-FLOW editable text — a single-line, plain-text `contenteditable` that shrinks to its
 * content, so a sibling glyph sits immediately after the last character.
 *
 * `InlineTextArea` cannot do that: it's a `<textarea>` whose auto-grow replica sizes at `width:100%`,
 * so the field is always the full width of its column and anything rendered after it lands at the
 * end of the FIELD, not the end of the TEXT. That's exactly what pushed the cover title's accent
 * period out to the right margin. Use this wherever rendered text and a trailing mark share one
 * line; keep `InlineTextArea` for multi-line body fields.
 *
 * Contract: the value is a PLAIN STRING. Enter is blocked and paste is forced to plain text, so no
 * markup or newline can enter the round-trip; formatting is not offered (use `RichInlineEditor` for
 * Markdown-backed prose). Typography is inherited from the wrapper — the document scope already
 * makes `[contenteditable]` inherit the family + letter-spacing (`globals.css`).
 */
export function InlineEditableText({
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
  const ref = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);

  // External value → DOM, but never while focused: writing during an edit would reset the caret to
  // the start on every autosave-driven re-render.
  useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  const commit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = (el.textContent ?? "").replace(/\s*\n+\s*/g, " ");
    if (next !== value) onChange(next);
  }, [onChange, value]);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="false"
      spellCheck
      data-placeholder={placeholder ?? ""}
      // `:empty::before` carries the placeholder — an inline box with no text has no room for an
      // overlay, and it keeps a click target when the field is empty.
      className={`inline-edit-text rounded-[3px] outline-none transition-colors focus:bg-[var(--surface-brand)]/50 [&:empty]:before:text-[var(--text-4)] [&:empty]:before:opacity-70 [&:empty]:before:content-[attr(data-placeholder)] ${className ?? ""}`}
      style={{ display: "inline", ...style }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onInput={commit}
      onKeyDown={(event) => {
        // Single-line field: a newline would be silently flattened on commit, so don't accept one.
        if (event.key === "Enter") event.preventDefault();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain").replace(/\s*\n+\s*/g, " ");
        // Deprecated but still the only API that inserts text into the browser's own undo stack.
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

/**
 * Editor-only "add a row" affordance for list blocks (objectives, scope, milestones…). Rendered
 * inside the editable Preview, never in the export — a dashed, low-emphasis button.
 */
export function InlineAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:bg-[var(--surface-brand)]/40 hover:text-[var(--brand-700)]"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** Editor-only "remove this row" affordance — a hover-revealed × on a list item (wrap the row in
 *  a `group/row` so it appears on hover). */
export function InlineRemoveButton({ onClick, label = "Remove" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] opacity-0 transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)] focus-visible:opacity-100 group-hover/row:opacity-100"
    >
      <XMarkIcon className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Inline editable string-list (assumptions, out-of-scope, checklist items…). Each row is an
 * auto-growing field with a leading marker and a hover × to remove; a "+" adds a row. Editor-only.
 */
export function InlineStringList({
  items,
  onChange,
  marker,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  /** Leading marker per row (e.g. "01", a tick icon). */
  marker: (index: number) => ReactNode;
  placeholder?: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="group/row flex items-start gap-3">
          <span className="pt-1.5">{marker(index)}</span>
          <div className="flex-1">
            <InlineTextArea
              value={item}
              onChange={(next) => onChange(items.map((entry, i) => (i === index ? next : entry)))}
              placeholder={placeholder}
              ariaLabel={`Item ${index + 1}`}
              className="text-sm leading-7 text-[var(--text-2)]"
            />
          </div>
          <span className="pt-1">
            <InlineRemoveButton onClick={() => onChange(items.filter((_, i) => i !== index))} />
          </span>
        </div>
      ))}
      <InlineAddButton label={addLabel} onClick={() => onChange([...items, ""])} />
    </div>
  );
}
