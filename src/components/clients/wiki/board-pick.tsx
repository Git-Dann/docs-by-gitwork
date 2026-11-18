"use client";

/**
 * The Board's value cells (§126, §127.1): how a property reads and is changed, shared by the
 * Table's rows and the card dialog's properties rail, so the two look and behave the same.
 *
 * A value reads like a spreadsheet cell, not a form control: text or a chip, no box. A pick-one
 * value keeps the native <select> (so a click or the keyboard opens the system picker, and a
 * screen reader hears a select), laid invisibly over the cell. The chevron and a tint appear only
 * on hover or focus, so a column or a rail of them isn't a wall of boxed dropdowns.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";

/** Urgent and High stand out; the rest read as plain text. -700 shades, as the chips use. */
export const PRIORITY_TONE: Record<string, string> = {
  URGENT: "font-medium text-red-700",
  HIGH: "font-medium text-amber-700",
};

export interface PickOption {
  value: string;
  label: string;
}

/**
 * A pick-one value. `reveal` says what hover shows the chevron: the Table row ("row", the
 * `group/row` on its <tr>), or the cell itself ("cell") where there is no row.
 */
export function PickCell({
  label,
  value,
  onChange,
  display,
  options,
  reveal = "cell",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the cell shows. Null reads as an empty cell (an em dash). */
  display: ReactNode;
  options: PickOption[];
  reveal?: "row" | "cell";
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <span
      className={cn(
        "group/cell relative flex h-8 min-w-0 items-center gap-1 rounded-[4px] px-2 text-[13px] hover:bg-[var(--surface-2)] focus-within:bg-[var(--surface-2)] focus-within:ring-2 focus-within:ring-[var(--brand-focus-ring)]",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[var(--text-2)]" title={current || undefined}>
        {display ?? <span className="text-[var(--text-4)]">—</span>}
      </span>
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-[var(--text-4)] opacity-0 group-focus-within/cell:opacity-100",
          reveal === "row" ? "group-hover/row:opacity-100" : "group-hover/cell:opacity-100",
        )}
      />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * A text, number or date value: reads as text, and becomes a box over the cell when clicked.
 * Enter or leaving it saves, Escape keeps the old value.
 */
export function InlineText({
  label,
  value,
  display,
  placeholder = "—",
  type = "text",
  suggestions,
  maxLength,
  onCommit,
  className,
}: {
  label: string;
  /** The value the editor starts from. */
  value: string;
  /** What the cell shows when not editing (defaults to the value). */
  display?: ReactNode;
  placeholder?: string;
  type?: "text" | "number" | "date";
  suggestions?: string[];
  maxLength?: number;
  /** Called with the new value only when it changed. */
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <TextEditor
        label={label}
        initial={value}
        type={type}
        suggestions={suggestions}
        maxLength={maxLength}
        onDone={(v) => {
          setEditing(false);
          if (v !== null) onCommit(v);
        }}
      />
    );
  }
  const shown = display ?? value;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label}: ${value || "not set"}. Click to change`}
      className={cn(
        "block h-8 w-full min-w-0 truncate rounded-[4px] px-2 text-left text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)]",
        !value && "text-[var(--text-4)]",
        className,
      )}
      title={value ? `${value} (click to change)` : "Click to set"}
    >
      {value ? shown : placeholder}
    </button>
  );
}

/** The box a text cell becomes: Enter or leaving it saves, Escape keeps the old value. */
export function TextEditor({
  label,
  initial,
  onDone,
  type = "text",
  suggestions,
  maxLength,
}: {
  label?: string;
  initial: string;
  onDone: (value: string | null) => void;
  type?: "text" | "number" | "date";
  suggestions?: string[];
  maxLength?: number;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const listId = useMemo(() => (suggestions ? `board-sugg-${Math.random().toString(36).slice(2, 8)}` : undefined), [suggestions]);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v === null || v === initial ? null : v);
  };
  return (
    <>
      <input
        ref={ref}
        aria-label={label}
        className="app-input h-8 w-full px-2 text-[16px] sm:text-[13px]"
        type={type}
        step={type === "number" ? 0.5 : undefined}
        min={type === "number" ? 0 : undefined}
        value={value}
        maxLength={maxLength}
        list={listId}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(value);
          }
          if (e.key === "Escape") {
            // The dialog closes on Escape too: this Escape only cancels the edit.
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            finish(null);
          }
        }}
      />
      {suggestions && listId ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
