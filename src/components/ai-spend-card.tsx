"use client";

// Super-Admin-only AI spend card for the sidebar footer (sits just above Settings).
// Reads real billed cost from the provider Cost APIs via /api/admin/ai-cost.
//
// Visibility: HIDDEN until AI spend is actually set up and reporting. The card renders nothing
// for non-super-admins, and nothing while it's unconfigured / loading / erroring — so the
// sidebar stays clean with no "not set up" or "couldn't load" placeholder. It reappears on its
// own the moment a working Anthropic *organization* Admin key (sk-ant-admin…) returns cost
// data — no toggle, no redeploy beyond adding the key.
//
// Follows DESIGN.md — mono widget header, serif figure, hairline border, no shadow.

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
  const { data } = useAiCost(isSuper);

  if (!isSuper) return null;

  const okProviders = (data?.providers ?? []).filter((p) => p.status === "ok");
  // Hidden until set up: only render once a working Admin key actually returns cost data.
  // No placeholder states in the sidebar — the card simply isn't there until spend reporting
  // is live, then appears automatically.
  if (okProviders.length === 0) return null;

  const today = okProviders.reduce((s, p) => s + p.today, 0);
  const mtd = okProviders.reduce((s, p) => s + p.monthToDate, 0);
  const currency = okProviders[0]?.currency ?? "USD";
  const label = okProviders.map((p) => PROVIDER_LABEL[p.provider] ?? p.provider).join(" · ");

  return (
    <div className="mb-2 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
          AI spend
        </span>
        <span className="font-mono text-[10px] text-[var(--text-4)]">{label}</span>
      </div>

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
    </div>
  );
}
