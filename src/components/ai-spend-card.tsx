"use client";

// Super-Admin-only AI spend card for the sidebar footer (sits just above Settings).
// Reads real billed cost from the provider Cost APIs via /api/admin/ai-cost. Self-gates:
// renders nothing for non-super-admins. Follows DESIGN.md — mono widget header, serif
// figure, hairline border, no shadow.

import { usePermissions } from "@/hooks/use-permissions";
import { useAiCost } from "@/hooks/use-ai-cost";
import { isSuperAdmin } from "@/types/auth";

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const PROVIDER_LABEL: Record<string, string> = { ANTHROPIC: "Anthropic", OPENAI: "OpenAI" };

export function AiSpendCard() {
  const { role } = usePermissions();
  const isSuper = isSuperAdmin(role);
  const { data, isPending, isError } = useAiCost(isSuper);

  if (!isSuper) return null;

  const okProviders = (data?.providers ?? []).filter((p) => p.status === "ok");
  const today = okProviders.reduce((s, p) => s + p.today, 0);
  const mtd = okProviders.reduce((s, p) => s + p.monthToDate, 0);
  const currency = okProviders[0]?.currency ?? "USD";
  const label = okProviders.map((p) => PROVIDER_LABEL[p.provider] ?? p.provider).join(" · ");
  const anyConfigured = data?.configured ?? false;

  // When configured but the fetch failed, surface *why* (super-admin only card). 401/403 ⇒
  // the key isn't an Admin key — the single most common cause. Full detail on hover.
  const erroredProvider = (data?.providers ?? []).find((p) => p.status === "error");
  const errorDetail = erroredProvider?.error ?? "";
  const looksLikeAuth = /\b401\b|\b403\b|authenticat|permission|admin|x-api-key|invalid/i.test(errorDetail);
  const errorHint = looksLikeAuth
    ? "Key rejected — use an Admin key (sk-ant-admin…)."
    : "Couldn't load spend right now.";

  return (
    <div className="mb-2 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
          AI spend
        </span>
        {okProviders.length > 0 ? (
          <span className="font-mono text-[10px] text-[var(--text-4)]">{label}</span>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-[var(--surface-1)]" />
      ) : !anyConfigured ? (
        <p
          className="mt-1 text-[11px] leading-tight text-[var(--text-4)]"
          title="Set the ANTHROPIC_ADMIN_KEY environment variable (a read-only org Admin key) to show real billed spend here."
        >
          Not set up — add an admin key.
        </p>
      ) : isError || okProviders.length === 0 ? (
        <p
          className="mt-1 text-[11px] leading-tight text-[var(--text-4)]"
          title={errorDetail || undefined}
        >
          {errorHint}
        </p>
      ) : (
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span
            className="font-serif text-[22px] leading-none text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-serif, Georgia), serif" }}
            title="Month to date"
          >
            {fmt(mtd, currency)}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-4)]">
            {fmt(today, currency)} today
          </span>
        </div>
      )}
    </div>
  );
}
