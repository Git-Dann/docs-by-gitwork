"use client";

/**
 * Small pieces shared by a person's profile, their documents and Backstage → Me, so the
 * three read as one record (docs/hr-platform.md).
 */

import { cn } from "@/lib/format";
import { dateAttention } from "@/lib/hr";

export const today = () => new Date().toISOString().slice(0, 10);

export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A label over a value, in the house data-label voice. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="widget-data-label text-[var(--text-4)]">{label}</dt>
      <dd className="mt-1 break-words text-[14px] text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

/** A date that is passed or coming up within 30 days gets a chip saying so. */
export function DateWithAttention({ value }: { value: string | null }) {
  const attention = dateAttention(value, today());
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {formatDate(value)}
      {attention ? (
        <span
          className={cn(
            "rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.8px]",
            attention === "passed"
              ? "border-[var(--danger-500)] text-[var(--danger-500)]"
              : "border-[var(--warning-500)] text-[var(--warning-500)]",
          )}
        >
          {attention === "passed" ? "Passed" : "Soon"}
        </span>
      ) : null}
    </span>
  );
}

export const label = "block text-[12px] font-medium text-[var(--text-2)]";

/** The one control a card's header carries, in the header's own mono voice: no extra row. */
export function HeaderAction({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--brand-600)] hover:underline"
    >
      {children}
    </button>
  );
}
