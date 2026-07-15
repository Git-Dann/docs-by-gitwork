"use client";

// Portal analytics — task throughput, mix, per-dev output, per-client activity.
// GA4-style, on the Foundry widget grammar. Consumes GET /api/analytics/portal.

import Link from "next/link";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from "@/types/tasks";
import {
  usePortalAnalytics,
  formatLeadTimeDays,
  formatBucketLabel,
  formatPct,
  formatMoney,
} from "@/hooks/use-analytics";
import {
  WidgetCard,
  StatTile,
  BarMeter,
  DualSparkline,
  ProgressCell,
  MONO,
  SERIF,
  analyticsTd,
  analyticsTh,
  analyticsThStyle,
} from "@/components/analytics/analytics-widgets";

function DevAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic user avatar, not a static asset
      <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-brand)] text-[10px] font-semibold text-[var(--brand-700)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PortalAnalyticsSection({ days }: { days?: number }) {
  const { data, isPending, error } = usePortalAnalytics({ days });

  if (error) {
    return <p className="text-sm font-medium text-[var(--danger-500)]">{(error as Error).message}</p>;
  }

  if (isPending && !data) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${i < 2 ? (i === 0 ? "col-span-12 lg:col-span-8" : "col-span-12 lg:col-span-4") : "col-span-12 sm:col-span-6 lg:col-span-4"} h-40 animate-pulse rounded-[10px] bg-[var(--surface-1)]`} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const bucket = data.range.bucket;
  const statusTotal = data.byStatus.reduce((a, s) => a + s.count, 0);
  const priorityTotal = data.byPriority.reduce((a, s) => a + s.count, 0);

  const hasThroughput = data.throughput.some((t) => t.created > 0 || t.completed > 0);
  // Thin axis labels to at most ~6 ticks so they don't collide.
  const tickEvery = Math.max(1, Math.ceil(data.throughput.length / 6));

  return (
    <div className="grid grid-cols-12 items-start gap-4">
      {/* 01 // THROUGHPUT */}
      <WidgetCard
        number="01"
        label="Throughput"
        className="col-span-12 lg:col-span-8"
        status={
          <span className="inline-flex items-center gap-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-3)]">
              <span className="inline-block h-0.5 w-3" style={{ background: "var(--brand-500)" }} /> Completed
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-4)]">
              <span className="inline-block h-0.5 w-3 border-t border-dashed" style={{ borderColor: "var(--text-4)" }} /> Created
            </span>
          </span>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">
              {data.totals.completedInRange}
            </div>
            <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
              {`Completed · ${data.totals.createdInRange} created · ${formatPct(data.totals.completionRate)} rate`}
            </div>
          </div>
        </div>
        <div className="mt-4 h-14">
          {hasThroughput ? (
            <DualSparkline
              primary={data.throughput.map((t) => t.completed)}
              secondary={data.throughput.map((t) => t.created)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-4)]">No activity in this range</div>
          )}
        </div>
        {hasThroughput ? (
          <div className="mt-1.5 flex justify-between" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: "var(--text-4)" }}>
            {data.throughput.map((t, i) => (
              <span key={t.bucket}>{i % tickEvery === 0 ? formatBucketLabel(t.bucket, bucket) : ""}</span>
            ))}
          </div>
        ) : null}
      </WidgetCard>

      {/* 02 // DELIVERY KPIS */}
      <WidgetCard number="02" label="Delivery" className="col-span-12 lg:col-span-4">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile figure={data.totals.openNow} label="Open now" />
          <StatTile figure={data.totals.overdueNow} label="Overdue" tone={data.totals.overdueNow > 0 ? "danger" : "default"} />
          <StatTile figure={data.totals.inProgressNow} label="In progress" />
          <StatTile
            figure={formatLeadTimeDays(data.totals.avgLeadTimeMs)}
            label="Avg lead time"
            sub={data.totals.leadTimeSamples ? `${data.totals.leadTimeSamples} samples` : "no timing data"}
          />
        </div>
      </WidgetCard>

      {/* 03 // STATUS MIX */}
      <WidgetCard number="03" label="Status mix" className="col-span-12 sm:col-span-6 lg:col-span-4">
        <div className="space-y-3">
          {data.byStatus.length ? (
            data.byStatus.map((s) => (
              <BarMeter key={s.status} label={TASK_STATUS_LABELS[s.status]} value={s.count} total={statusTotal} />
            ))
          ) : (
            <p className="text-sm text-[var(--text-4)]">No tasks yet.</p>
          )}
        </div>
      </WidgetCard>

      {/* 04 // PRIORITY MIX */}
      <WidgetCard number="04" label="Priority mix" className="col-span-12 sm:col-span-6 lg:col-span-4">
        <div className="space-y-3">
          {data.byPriority.length ? (
            data.byPriority.map((p) => (
              <BarMeter
                key={p.priority}
                label={TASK_PRIORITY_LABELS[p.priority]}
                value={p.count}
                total={priorityTotal}
                color={p.priority === "HIGH" ? "var(--warning-500)" : "var(--brand-700)"}
              />
            ))
          ) : (
            <p className="text-sm text-[var(--text-4)]">No open tasks.</p>
          )}
        </div>
      </WidgetCard>

      {/* 05 // CAPACITY & COST */}
      <WidgetCard number="05" label="Capacity & cost" className="col-span-12 sm:col-span-6 lg:col-span-4">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile figure={data.totals.activeDevs} label="Devs on projects" />
          <StatTile
            figure={data.totals.monthlyCost ? formatMoney(data.totals.monthlyCost.amount, data.totals.monthlyCost.currency) : "—"}
            label="Monthly burn"
            sub={data.totals.monthlyCost ? "active dev cost" : "no priced devs"}
          />
          <StatTile figure={data.totals.avgWorkingDays ?? "—"} label="Avg days / project" />
          <StatTile figure={formatPct(data.totals.completionRate)} label="Completion rate" />
        </div>
      </WidgetCard>

      {/* 06 // DEV OUTPUT */}
      <WidgetCard number="06" label="Dev output" className="col-span-12 lg:col-span-5" bodyClassName="p-0">
        {data.leaderboard.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Developer</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Completed</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Open</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Avg lead</th>
                  <th className={analyticsTh} style={analyticsThStyle}>Standup</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((d) => (
                  <tr key={d.userId}>
                    <td className={analyticsTd}>
                      <span className="flex items-center gap-2.5">
                        <DevAvatar name={d.name} avatarUrl={d.avatarUrl} />
                        <span className="font-medium text-[var(--text-1)]">{d.name}</span>
                      </span>
                    </td>
                    <td className={`${analyticsTd} text-right`}>
                      <span className="tabular-nums" style={{ fontFamily: SERIF, fontSize: 18, color: "var(--text-1)" }}>{d.completed}</span>
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{d.openAssigned}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{formatLeadTimeDays(d.avgLeadTimeMs)}</td>
                    <td className={analyticsTd}><ProgressCell value={d.standupCompliancePct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-[var(--text-4)]">No developer output in this range.</p>
        )}
      </WidgetCard>

      {/* 07 // CLIENT ACTIVITY */}
      <WidgetCard number="07" label="Client activity" className="col-span-12 lg:col-span-7" bodyClassName="p-0">
        {data.clients.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Client</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Devs</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Cost/mo</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Days</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Open</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Overdue</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Done</th>
                  <th className={`${analyticsTh} text-center`} style={analyticsThStyle}>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => (
                  <tr key={c.clientId}>
                    <td className={analyticsTd}>
                      <Link href={`/app/portal/${c.slug}/tasks`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{c.devs || "—"}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }} title={c.monthlyCost?.unpricedDevs ? `${c.monthlyCost.unpricedDevs} unpriced` : undefined}>
                      {c.monthlyCost ? formatMoney(c.monthlyCost.amount, c.monthlyCost.currency) : "—"}
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{c.workingDays ?? "—"}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{c.open}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: c.overdue > 0 ? "var(--danger-500)" : "var(--text-3)" }}>{c.overdue}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{c.completedInRange}</td>
                    <td className={`${analyticsTd} text-center`}>
                      {c.health ? (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full align-middle"
                          title={c.health.reasons.join(" · ")}
                          style={{ background: c.health.level === "green" ? "var(--success-500)" : c.health.level === "amber" ? "var(--warning-500)" : "var(--danger-500)" }}
                        />
                      ) : (
                        <span className="text-[var(--text-4)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-[var(--text-4)]">No client activity in this range.</p>
        )}
      </WidgetCard>
    </div>
  );
}
