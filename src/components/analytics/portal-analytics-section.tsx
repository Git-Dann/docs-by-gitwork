"use client";

// Portal analytics — a chart-led delivery/cost/capacity backend. GA4-style, on the Foundry
// widget grammar. Every grid row sums to 12 columns so the bento tiles with no gaps.

import Link from "next/link";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
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
  DualSparkline,
  AreaSparkline,
  MiniColumns,
  Donut,
  ProgressCell,
  MONO,
  SERIF,
  analyticsTd,
  analyticsTh,
  analyticsThStyle,
} from "@/components/analytics/analytics-widgets";

function statusColor(s: TaskStatus): string {
  switch (s) {
    case "BACKLOG": return "var(--text-4)";
    case "TODO": return "var(--brand-300)";
    case "DOING": return "var(--warning-500)";
    case "IN_REVIEW": return "var(--brand-500)";
    case "UI_DONE": return "var(--brand-700)";
    case "DONE": return "var(--success-500)";
    default: return "var(--brand-500)";
  }
}
function priorityColor(p: TaskPriority): string {
  return p === "HIGH" ? "var(--danger-500)" : p === "MEDIUM" ? "var(--warning-500)" : "var(--brand-300)";
}

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

function AxisLabels({ labels }: { labels: string[] }) {
  const tickEvery = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div className="mt-1.5 flex justify-between" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: "var(--text-4)" }}>
      {labels.map((l, i) => (
        <span key={i}>{i % tickEvery === 0 ? l : ""}</span>
      ))}
    </div>
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
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="col-span-12 h-36 animate-pulse rounded-[10px] bg-[var(--surface-1)] sm:col-span-6 lg:col-span-3" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals;
  const bucket = data.range.bucket;
  const axis = data.throughput.map((b) => formatBucketLabel(b.bucket, bucket));
  const completedSeries = data.throughput.map((b) => b.completed);
  const createdSeries = data.throughput.map((b) => b.created);
  const netFlow = data.throughput.map((b) => b.completed - b.created); // +ve = burning down
  let running = 0;
  const cumulativeDone = completedSeries.map((v) => (running += v));
  const statusTotal = data.byStatus.reduce((a, s) => a + s.count, 0);
  const priorityTotal = data.byPriority.reduce((a, s) => a + s.count, 0);
  const topCost = [...data.clients]
    .filter((c) => c.monthlyCost)
    .sort((a, b) => (b.monthlyCost?.amount ?? 0) - (a.monthlyCost?.amount ?? 0))
    .slice(0, 6);
  const maxCost = Math.max(1, ...topCost.map((c) => c.monthlyCost?.amount ?? 0));
  const hasThroughput = data.throughput.some((b) => b.created > 0 || b.completed > 0);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ── Row 1 · KPI scorecard (4 × span-3 = 12) ── */}
      <WidgetCard number="01" label="Completed" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">
          {t.completedInRange}
        </div>
        <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
          {`${t.createdInRange} created · ${formatPct(t.completionRate)} rate`}
        </div>
        <div className="mt-3 h-8">
          {hasThroughput ? <AreaSparkline points={completedSeries} height={32} /> : null}
        </div>
      </WidgetCard>

      <WidgetCard number="02" label="Open work" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div className="flex items-end gap-4">
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">{t.openNow}</div>
            <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Open now</div>
          </div>
          <div className="pb-1">
            <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, color: t.overdueNow > 0 ? "var(--danger-500)" : "var(--text-2)" }} className="tabular-nums">{t.overdueNow}</div>
            <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Overdue</div>
          </div>
        </div>
        <div className="mt-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
          {`${t.inProgressNow} in progress`}
        </div>
      </WidgetCard>

      <WidgetCard number="03" label="Devs on projects" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">{t.activeDevs}</div>
        <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Active placements</div>
        <div className="mt-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
          {t.avgWorkingDays != null ? `${t.avgWorkingDays} avg days / project` : "no dated timeline"}
        </div>
      </WidgetCard>

      <WidgetCard number="04" label="Monthly burn" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }} className="tabular-nums">
          {t.monthlyCost ? formatMoney(t.monthlyCost.amount, t.monthlyCost.currency) : "—"}
        </div>
        <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Active dev cost / mo</div>
        <div className="mt-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
          {t.leadTimeSamples ? `${formatLeadTimeDays(t.avgLeadTimeMs)} avg lead time` : "no lead-time data"}
        </div>
      </WidgetCard>

      {/* ── Row 2 · Throughput trend + status donut (8 + 4) ── */}
      <WidgetCard
        number="05"
        label="Throughput"
        className="col-span-12 lg:col-span-8"
        status={
          <span className="inline-flex items-center gap-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-3)]"><span className="inline-block h-0.5 w-3" style={{ background: "var(--brand-500)" }} /> Completed</span>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-4)]"><span className="inline-block h-0.5 w-3 border-t border-dashed" style={{ borderColor: "var(--text-4)" }} /> Created</span>
          </span>
        }
      >
        <div className="h-40">
          {hasThroughput ? (
            <DualSparkline primary={completedSeries} secondary={createdSeries} height={160} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-4)]">No activity in this range</div>
          )}
        </div>
        {hasThroughput ? <AxisLabels labels={axis} /> : null}
      </WidgetCard>

      <WidgetCard number="06" label="Status mix" className="col-span-12 lg:col-span-4">
        {statusTotal ? (
          <Donut
            centerLabel="tasks"
            segments={data.byStatus.map((s) => ({ label: TASK_STATUS_LABELS[s.status], value: s.count, color: statusColor(s.status) }))}
          />
        ) : (
          <p className="text-sm text-[var(--text-4)]">No tasks yet.</p>
        )}
      </WidgetCard>

      {/* ── Row 3 · Net flow + cumulative + priority (4 + 4 + 4) ── */}
      <WidgetCard number="07" label="Net flow" className="col-span-12 lg:col-span-4"
        status={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>done − created</span>}>
        <div className="h-28">
          {hasThroughput ? (
            <MiniColumns values={netFlow} positiveColor="var(--success-500)" negativeColor="var(--danger-500)" height={112} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-4)]">No activity</div>
          )}
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>Green = burning down · red = backlog growing</p>
      </WidgetCard>

      <WidgetCard number="08" label="Cumulative done" className="col-span-12 lg:col-span-4">
        <div style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1, color: "var(--text-1)" }} className="tabular-nums">
          {cumulativeDone[cumulativeDone.length - 1] ?? 0}
        </div>
        <div className="mt-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Completed, cumulative</div>
        <div className="mt-2 h-20">
          {hasThroughput ? <AreaSparkline points={cumulativeDone} height={80} color="var(--brand-600)" /> : null}
        </div>
      </WidgetCard>

      <WidgetCard number="09" label="Priority mix" className="col-span-12 lg:col-span-4">
        {priorityTotal ? (
          <Donut
            centerLabel="open"
            segments={data.byPriority.map((p) => ({ label: TASK_PRIORITY_LABELS[p.priority], value: p.count, color: priorityColor(p.priority) }))}
          />
        ) : (
          <p className="text-sm text-[var(--text-4)]">No open tasks.</p>
        )}
      </WidgetCard>

      {/* ── Row 4 · Lead-time histogram + client cost (6 + 6) ── */}
      <WidgetCard number="10" label="Lead time" className="col-span-12 lg:col-span-6"
        status={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>doing → done</span>}>
        {t.leadTimeSamples ? (
          <>
            <div className="h-28"><MiniColumns values={data.leadTimeBuckets.map((b) => b.count)} positiveColor="var(--brand-500)" height={112} /></div>
            <div className="mt-1.5 flex justify-between" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: "var(--text-4)" }}>
              {data.leadTimeBuckets.map((b) => (
                <span key={b.label} className="flex-1 text-center">{b.label}</span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>{t.leadTimeSamples} timed · {formatLeadTimeDays(t.avgLeadTimeMs)} avg</p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No lead-time data (tasks need a DOING → DONE transition).</p>
        )}
      </WidgetCard>

      <WidgetCard number="11" label="Cost by client" className="col-span-12 lg:col-span-6">
        {topCost.length ? (
          <div className="space-y-2.5">
            {topCost.map((c) => {
              const amt = c.monthlyCost?.amount ?? 0;
              const pct = Math.round((amt / maxCost) * 100);
              return (
                <div key={c.clientId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-2)]">{c.name}</span>
                    <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>
                      {formatMoney(amt, c.monthlyCost?.currency)}
                      <span className="text-[var(--text-4)]">{` · ${c.devs} dev${c.devs === 1 ? "" : "s"}`}</span>
                    </span>
                  </div>
                  <span className="widget-progress block h-1.5 w-full">
                    <span className="widget-progress__fill block h-full" style={{ width: `${pct}%`, background: "var(--brand-700)" }} />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No priced dev cost yet — link dev rates in Code → Rate Card.</p>
        )}
      </WidgetCard>

      {/* ── Row 5 · Dev output + client activity tables (5 + 7) ── */}
      <WidgetCard number="12" label="Dev output" className="col-span-12 lg:col-span-5" bodyClassName="p-0">
        {data.leaderboard.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Developer</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Done</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Open</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Lead</th>
                  <th className={analyticsTh} style={analyticsThStyle}>Standup</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((d) => (
                  <tr key={d.userId}>
                    <td className={analyticsTd}>
                      <span className="flex items-center gap-2.5">
                        <DevAvatar name={d.name} avatarUrl={d.avatarUrl} />
                        <span className="truncate font-medium text-[var(--text-1)]">{d.name}</span>
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

      <WidgetCard number="13" label="Client activity" className="col-span-12 lg:col-span-7" bodyClassName="p-0">
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
                      <Link href={`/app/portal/${c.slug}/tasks`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">{c.name}</Link>
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
                        <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" title={c.health.reasons.join(" · ")}
                          style={{ background: c.health.level === "green" ? "var(--success-500)" : c.health.level === "amber" ? "var(--warning-500)" : "var(--danger-500)" }} />
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
