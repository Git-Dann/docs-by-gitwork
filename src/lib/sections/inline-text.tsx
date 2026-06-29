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

import type { CSSProperties } from "react";

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
