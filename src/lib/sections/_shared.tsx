/**
 * Tiny shared primitives used across multiple section previews. Kept here (rather than each
 * section duplicating its own table cell components) so an SLA / SOW table reads visually the
 * same regardless of which section produced it.
 */

import type { ReactNode } from "react";
import { renderInline } from "@/lib/markdown";

export function SectionIntro({ intro }: { intro?: string }) {
  if (!intro?.trim()) return null;
  // Inline markdown: bold/italic/links/code inside intros work across every section that uses
  // this shared primitive (exclusions, escalation, penalties, signatures, parties, term, …).
  return <p className="text-sm leading-7 text-[var(--text-2)]">{renderInline(intro, "sec-intro")}</p>;
}

export function PrintTable({ children }: { children: ReactNode }) {
  return (
    <div className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children: ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}) {
  return (
    <th
      style={{ textAlign: align, width }}
      className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-4 py-2.5 font-[var(--font-mono),'JetBrains_Mono',monospace] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  strong,
  top,
}: {
  children: ReactNode;
  align?: "left" | "center" | "right";
  strong?: boolean;
  top?: boolean;
}) {
  return (
    <td
      style={{ textAlign: align, verticalAlign: top ? "top" : "middle" }}
      className={`border-t border-[var(--border-3)] px-4 py-3 text-[13px] leading-6 ${
        strong ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]"
      }`}
    >
      {children}
    </td>
  );
}

/** Card wrapper used by sections that render a list of items as card grids. */
export function ItemCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <article className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5">
      {eyebrow ? (
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <p className="mt-2 text-base font-semibold text-[var(--text-1)]">{title}</p>
      ) : null}
      {children}
    </article>
  );
}

/** Title + content card (used by product_overview and costing previews). */
export function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-4)] uppercase">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{content || "—"}</p>
    </article>
  );
}

/** Label / value row used in totals breakdowns. */
export function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-3)]"}>{label}</span>
      <span className={bold ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}>{value}</span>
    </div>
  );
}

// ── Form primitives reused across section editors ────────────────────────────────────────

export function SimpleForm({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="app-input"
      />
    </label>
  );
}

export function FormTextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="app-textarea"
      />
    </label>
  );
}

export function EditorHint({ message }: { message: string }) {
  return (
    <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-3 text-sm leading-6 text-[var(--text-3)]">
      {message}
    </p>
  );
}

export function PlatformSupportField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  const selectedValues = new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  function toggle(option: string) {
    const next = new Set(selectedValues);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    onChange(Array.from(next).join(", "));
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.has(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={
                selected
                  ? "inline-flex items-center rounded-full border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]"
                  : "inline-flex items-center rounded-full border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]"
              }
            >
              {option}
            </button>
          );
        })}
      </div>
    </label>
  );
}
