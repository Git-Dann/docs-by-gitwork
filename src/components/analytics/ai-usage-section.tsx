"use client";

// AI usage analytics — per-call tokens, estimated cost, latency, errors, broken down by
// module / model / user over time. GA4-style, on the Foundry widget grammar.

import {
  useAiUsageAnalytics,
  formatUsd,
  formatTokens,
  formatBucketLabel,
} from "@/hooks/use-analytics";
import {
  WidgetCard,
  StatTile,
  BarMeter,
  DualSparkline,
  TrendBadge,
  MONO,
  SERIF,
  analyticsTd,
  analyticsTh,
  analyticsThStyle,
} from "@/components/analytics/analytics-widgets";

export function AiUsageSection({ days }: { days?: number }) {
  const { data, isPending, error } = useAiUsageAnalytics({ days });

  if (error) {
    return <p className="text-sm font-medium text-[var(--danger-500)]">{(error as Error).message}</p>;
  }

  if (isPending && !data) {
    return (
      <div className="grid grid-cols-12 items-start gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="col-span-12 h-40 animate-pulse rounded-[10px] bg-[var(--surface-1)] sm:col-span-6 lg:col-span-4" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const bucket = data.range.bucket;
  const hasSeries = data.timeSeries.some((t) => t.calls > 0);
  const tickEvery = Math.max(1, Math.ceil(data.timeSeries.length / 6));
  const moduleTotalCost = data.byModule.reduce((a, m) => a + m.costUsd, 0);
  const modelTotalCost = data.byModel.reduce((a, m) => a + m.costUsd, 0);

  return (
    <div className="grid grid-cols-12 items-start gap-4">
      {/* 01 // AI SPEND */}
      <WidgetCard number="01" label="AI spend" className="col-span-12 lg:col-span-4">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            figure={formatUsd(data.reconciliation.providerBilledUsd)}
            label="Billed MTD"
            sub="provider (authoritative)"
          />
          <StatTile figure={formatUsd(data.totals.costUsd)} label="Est. in range" sub="from list pricing" />
          <StatTile figure={data.totals.calls} label="Calls" />
          <StatTile figure={formatTokens(data.totals.tokens)} label="Tokens" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-4)]">{data.reconciliation.note}</p>
      </WidgetCard>

      {/* 02 // USAGE OVER TIME */}
      <WidgetCard
        number="02"
        label="Usage over time"
        className="col-span-12 lg:col-span-8"
        status={
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Calls · Cost
          </span>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">
                {formatUsd(data.totals.costUsd)}
              </div>
              <TrendBadge delta={data.trends.costUsd} goodWhen="down" />
            </div>
            <div className="mt-1 flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
              <span>{`Estimated · ${data.totals.calls} calls`}</span>
              <TrendBadge delta={data.trends.calls} goodWhen="neutral" compact />
            </div>
          </div>
        </div>
        <div className="mt-4 h-14">
          {hasSeries ? (
            <DualSparkline
              primary={data.timeSeries.map((t) => t.costUsd)}
              secondary={data.timeSeries.map((t) => t.calls)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-4)]">No AI calls logged in this range</div>
          )}
        </div>
        {hasSeries ? (
          <div className="mt-1.5 flex justify-between" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: "var(--text-4)" }}>
            {data.timeSeries.map((t, i) => (
              <span key={t.bucket}>{i % tickEvery === 0 ? formatBucketLabel(t.bucket, bucket) : ""}</span>
            ))}
          </div>
        ) : null}
      </WidgetCard>

      {/* 03 // BY MODULE */}
      <WidgetCard number="03" label="By module" className="col-span-12 sm:col-span-6 lg:col-span-4">
        <div className="space-y-3">
          {data.byModule.length ? (
            data.byModule.slice(0, 10).map((m) => (
              <BarMeter key={m.module} label={m.module} value={Math.round(m.costUsd * 10000)} total={Math.round(moduleTotalCost * 10000) || 1} />
            ))
          ) : (
            <p className="text-sm text-[var(--text-4)]">No usage logged yet.</p>
          )}
        </div>
        {data.byModule.length ? (
          <p className="mt-3 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>Bars show share of estimated cost.</p>
        ) : null}
      </WidgetCard>

      {/* 04 // BY MODEL */}
      <WidgetCard number="04" label="By model" className="col-span-12 sm:col-span-6 lg:col-span-4">
        <div className="space-y-3">
          {data.byModel.length ? (
            data.byModel.slice(0, 10).map((m) => (
              <BarMeter key={m.model} label={m.model} value={Math.round(m.costUsd * 10000)} total={Math.round(modelTotalCost * 10000) || 1} />
            ))
          ) : (
            <p className="text-sm text-[var(--text-4)]">No usage logged yet.</p>
          )}
        </div>
      </WidgetCard>

      {/* 05 // ERRORS & LATENCY */}
      <WidgetCard number="05" label="Health" className="col-span-12 sm:col-span-12 lg:col-span-4">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            figure={data.totals.errorRate == null ? "—" : `${Math.round(data.totals.errorRate * 100)}%`}
            label="Error rate"
            tone={data.totals.errorRate != null && data.totals.errorRate > 0.05 ? "danger" : "default"}
          />
          <StatTile
            figure={data.totals.avgLatencyMs == null ? "—" : `${(data.totals.avgLatencyMs / 1000).toFixed(1)}s`}
            label="Avg latency"
          />
        </div>
      </WidgetCard>

      {/* 06 // BY USER */}
      <WidgetCard number="06" label="By user" className="col-span-12" bodyClassName="p-0">
        {data.byUser.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>User</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Calls</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Tokens</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byUser.slice(0, 25).map((u) => (
                  <tr key={u.userId ?? "__none__"}>
                    <td className={analyticsTd}>
                      <span className="font-medium text-[var(--text-1)]">{u.name}</span>
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{u.calls}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{formatTokens(u.tokens)}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{formatUsd(u.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-[var(--text-4)]">No AI usage attributed yet.</p>
        )}
      </WidgetCard>
    </div>
  );
}
