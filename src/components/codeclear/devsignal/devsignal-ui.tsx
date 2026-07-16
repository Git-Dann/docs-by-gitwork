"use client";

import { cn } from "@/lib/format";

/**
 * DevSignal admin cards, styled to match the Pulse surface (plain bordered cards,
 * a sans `font-semibold` header with a hairline divider, tabular-nums stats) —
 * NOT the Foundry-HQ editorial `WidgetCard` treatment (mono `NN //` labels + serif
 * numerals) it used before. Keeps DevSignal reading as one system with Pulse.
 */

export function Section({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-[var(--border-2)] pb-3">
          <div className="flex items-baseline gap-2">
            {title && <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>}
            {meta && <span className="text-xs text-[var(--text-4)]">{meta}</span>}
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-4)]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--text-1)]">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{hint}</p>}
    </div>
  );
}
