"use client";

// Foundry analytics dashboard shell — "GA4 for Foundry" (super-admin only).
//
// Extensible by design: a scope-tab row switches between analytics scopes. Portal ships first;
// DevSignal, Pulse, and AI usage are declared here as "soon" tabs so the surface is ready to grow
// without reshaping the page. Each scope is its own section component under the shared range filter.

import { useState } from "react";
import { PortalAnalyticsSection } from "@/components/analytics/portal-analytics-section";
import { AiUsageSection } from "@/components/analytics/ai-usage-section";

type ScopeId = "portal" | "ai-usage" | "devsignal" | "pulse";

const SCOPES: Array<{ id: ScopeId; label: string; ready: boolean }> = [
  { id: "portal", label: "Portal", ready: true },
  { id: "ai-usage", label: "AI usage", ready: true },
  { id: "devsignal", label: "DevSignal", ready: false },
  { id: "pulse", label: "Pulse", ready: false },
];

const RANGE_OPTIONS: Array<{ label: string; days?: number }> = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

export function AnalyticsDashboard() {
  const [scope, setScope] = useState<ScopeId>("portal");
  const [rangeIdx, setRangeIdx] = useState(1); // default 90d
  const days = RANGE_OPTIONS[rangeIdx].days;

  return (
    <div className="space-y-5">
      {/* Scope tabs + range control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {SCOPES.map((s) => {
            const active = s.id === scope;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!s.ready}
                onClick={() => s.ready && setScope(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : s.ready
                      ? "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                      : "cursor-not-allowed text-[var(--text-4)]"
                }`}
              >
                {s.label}
                {!s.ready ? (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }} className="rounded-[3px] bg-[var(--surface-1)] px-1 py-0.5 text-[var(--text-4)]">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
          {RANGE_OPTIONS.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                i === rangeIdx
                  ? "bg-[var(--brand-700)] text-white"
                  : "bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {scope === "portal" ? <PortalAnalyticsSection days={days} /> : null}
      {scope === "ai-usage" ? <AiUsageSection days={days} /> : null}
    </div>
  );
}
