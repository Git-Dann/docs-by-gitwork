"use client";

// Super-Admin-only AI spend card for the sidebar footer (sits just above Settings), §159.
//
// Shows the AI budget: what has been spent this period against the budget set in Settings →
// Dispatch (default $200), as a figure and a bar that turns amber at 80% and red at 95%, the
// same levels the alerts use. The spend is Anthropic's own billed figure when an Anthropic Admin
// key is connected (Settings → Dispatch → Anthropic billing), labelled "Anthropic"; otherwise
// Foundry's estimate from list prices, labelled "est.". Every AI feature on the key counts.
//
// It used to show only once an Admin key worked, and read Anthropic's cents as dollars; no key
// was ever set, so nobody saw it. It now always shows for Super Admins. Clicking opens the
// budget's settings.
//
// Follows DESIGN.md — mono widget header, serif figure, hairline border, no shadow.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch } from "@/lib/api";
import { isSuperAdmin } from "@/types/auth";
import type { BudgetStatus } from "@/server/dispatch/assistant/budget";

function usd(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 || Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

export function AiSpendCard() {
  const { role } = usePermissions();
  const isSuper = isSuperAdmin(role);
  const { data } = useQuery({
    queryKey: ["ai-budget"],
    queryFn: () => apiFetch<BudgetStatus>("/api/admin/ai-budget"),
    enabled: isSuper,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!isSuper || !data) return null;

  const pct = data.budgetUsd > 0 ? Math.round((data.spentUsd / data.budgetUsd) * 100) : 0;
  const bar = pct >= 95 ? "bg-[var(--danger-500)]" : pct >= 80 ? "bg-[var(--warning-500)]" : "bg-[var(--brand-700)]";
  const sourceLabel = data.source === "anthropic" ? "Anthropic" : "est.";
  const sourceTitle =
    data.source === "anthropic"
      ? "Anthropic's own billed spend, plus today's estimate (Anthropic reports a day behind)."
      : "Foundry's estimate from list prices. Connect an Anthropic Admin key in Settings → Dispatch for Anthropic's own figures.";

  return (
    <Link
      href="/app/settings/dispatch"
      className="mb-2 block rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 transition hover:border-[var(--border-1)]"
      aria-label={`AI spend: ${usd(data.spentUsd)} of ${usd(data.budgetUsd)} budget ${data.period.label}, ${pct}% used`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">AI spend</span>
        <span className="font-mono text-[10px] text-[var(--text-4)]" title={sourceTitle}>
          {sourceLabel}
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span
          className="font-serif text-[22px] leading-none text-[var(--text-1)] tabular-nums"
          style={{ fontFamily: "var(--font-serif, Georgia), serif" }}
        >
          {usd(data.spentUsd)}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-4)]">of {usd(data.budgetUsd)}</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--text-4)]">
        <span>{pct}% used</span>
        <span>{data.period.label.replace(/^in /, "")}</span>
      </div>
    </Link>
  );
}
