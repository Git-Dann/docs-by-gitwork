"use client";

// Dispatch in Analytics → AI usage (§155): questions, cost per question, the cache doing its job,
// the budget, and who asks. Counts and costs only; chats are private.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/hooks/use-analytics";
import { WidgetCard, StatTile, BarMeter, MONO, analyticsTd, analyticsTh, analyticsThStyle } from "@/components/analytics/analytics-widgets";
import type { DispatchUsage } from "@/server/dispatch/assistant/usage";

const SURFACE_LABEL: Record<string, string> = { web: "In the app", slack: "Slack" };

export function DispatchUsageCards({ days, firstNumber }: { days?: number; firstNumber: number }) {
  const { data } = useQuery({
    queryKey: ["dispatch-usage", days ?? 90],
    queryFn: () => apiFetch<{ usage: DispatchUsage }>(`/api/admin/dispatch-usage?days=${days ?? 90}`).then((r) => r.usage),
    staleTime: 30_000,
  });
  if (!data) return null;
  const n = (i: number) => String(firstNumber + i).padStart(2, "0");
  const b = data.budget;
  const budgetPct = b.budgetUsd > 0 ? Math.round((b.spentUsd / b.budgetUsd) * 100) : 0;
  const surfaceTotal = data.bySurface.reduce((a, s) => a + s.questions, 0);

  return (
    <>
      <WidgetCard number={n(0)} label="Dispatch" className="col-span-12 lg:col-span-4">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile figure={data.questions} label="Questions" />
          <StatTile figure={formatUsd(data.costPerQuestion)} label="Per question" sub={`${formatUsd(data.costUsd)} in range`} />
          <StatTile
            figure={data.cacheHitRate == null ? "—" : `${Math.round(data.cacheHitRate * 100)}%`}
            label="From cache"
            sub="share of prompt"
            tone={data.cacheHitRate != null && data.cacheHitRate < 0.3 && data.questions > 10 ? "warning" : "default"}
          />
          <StatTile
            figure={`${budgetPct}%`}
            label="AI budget"
            sub={`${formatUsd(b.spentUsd)} of ${formatUsd(b.budgetUsd)} ${b.period.label}`}
            tone={budgetPct >= 95 ? "danger" : budgetPct >= 80 ? "warning" : "default"}
          />
        </div>
        {surfaceTotal ? (
          <div className="mt-4 space-y-3">
            {data.bySurface.map((s) => (
              <BarMeter key={s.surface} label={SURFACE_LABEL[s.surface] ?? s.surface} value={s.questions} total={surfaceTotal} />
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-4)]">
          The budget counts every AI feature on the Anthropic key; Dispatch is {formatUsd(b.dispatchUsd)} of it. Set it in Settings → Dispatch.
        </p>
      </WidgetCard>

      <WidgetCard number={n(1)} label="Dispatch by person" className="col-span-12 lg:col-span-8" bodyClassName="p-0">
        {data.byPerson.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Person</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Questions</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Est. cost</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Per question</th>
                </tr>
              </thead>
              <tbody>
                {data.byPerson.slice(0, 25).map((p) => (
                  <tr key={p.userId}>
                    <td className={analyticsTd}>
                      <span className="font-medium text-[var(--text-1)]">{p.name}</span>
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{p.questions}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{formatUsd(p.costUsd)}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>
                      {p.questions ? formatUsd(p.costUsd / p.questions) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-[var(--text-4)]">Nobody has asked Dispatch anything in this range.</p>
        )}
      </WidgetCard>
    </>
  );
}
