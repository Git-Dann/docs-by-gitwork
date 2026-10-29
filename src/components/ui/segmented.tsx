"use client";

/**
 * The platform's pick-one control (DESIGN.md): a hairline well with the chosen option
 * raised, mono caps labels, an optional count per option. Used wherever a list switches
 * between a few views (Active / Archived on Team and on Staff → People).
 */

import { cn } from "@/lib/format";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech, e.g. "Show". */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition",
            value === o.value ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-sm)]" : "text-[var(--text-3)] hover:text-[var(--text-1)]",
          )}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className="rounded-[4px] bg-[var(--surface-2)] px-1.5 text-[10px] text-[var(--text-3)]">{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
