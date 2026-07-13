"use client";

// Shared, mode-agnostic control-rail primitives for Studio. Extracted verbatim from
// studio-workspace.tsx so both the Social and App-Screenshots modes reuse them without
// duplication. Purely presentational — no Studio domain logic lives here.

import type { ReactNode } from "react";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[var(--brand-700)] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-0)] px-3 py-2 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]";

export function PanelHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--border-2)] px-5 py-3.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</span>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</span>
        {hint ? <span className="text-[10px] text-[var(--text-4)]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--border-2)]" />
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min = 100,
  max = 5000,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      className="app-input w-full"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-2)]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={"relative h-[22px] w-[38px] shrink-0 rounded-full transition " + (checked ? "bg-[var(--brand-700)]" : "bg-[var(--border-1)]")}
      >
        <span className={"absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all " + (checked ? "left-[19px]" : "left-[3px]")} />
      </button>
      {label}
    </label>
  );
}

export function IconBtn({ onClick, aria, children }: { onClick: () => void; aria: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[var(--text-3)] transition hover:bg-[var(--surface-0)] hover:text-[var(--text-1)]"
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  full,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div
      className={(full ? "grid w-full " : "inline-flex ") + "rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition " +
              (active ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-3)] hover:text-[var(--text-1)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
