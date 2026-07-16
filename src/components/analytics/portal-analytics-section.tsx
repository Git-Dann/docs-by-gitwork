"use client";

// Portal analytics — a chart-led delivery/cost/capacity backend. GA4-style, on the Foundry
// widget grammar. Every grid row sums to 12 columns so the bento tiles with no gaps.

import type { CSSProperties } from "react";
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
  TrendBadge,
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

type Engagement = "FIXED_SCOPE" | "PHASED" | "ROLLING" | "RETAINER" | "UNSET";
const ENGAGEMENT_LABEL: Record<Engagement, string> = {
  FIXED_SCOPE: "Fixed scope",
  PHASED: "Phased",
  ROLLING: "Rolling",
  RETAINER: "Retainer",
  UNSET: "Unset",
};
function engagementColor(e: Engagement): string {
  switch (e) {
    case "FIXED_SCOPE": return "var(--brand-700)";
    case "PHASED": return "var(--brand-500)";
    case "ROLLING": return "var(--brand-300)";
    case "RETAINER": return "var(--success-500)";
    default: return "var(--text-4)";
  }
}
/** Ongoing for rolling/retainer; otherwise a short date. */
function endsOngoing(type: Engagement | null): boolean {
  return type === "ROLLING" || type === "RETAINER";
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

const CAPTION: CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" };
const HERO: CSSProperties = { fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" };

function EngagementChip({ type }: { type: Engagement | null }) {
  const e: Engagement = type ?? "UNSET";
  const color = engagementColor(e);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5" style={{ background: "var(--surface-1)" }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-3)" }}>{ENGAGEMENT_LABEL[e]}</span>
    </span>
  );
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

/** AM/PM check-in pill — green tick when posted, red cross when missed. */
function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? "var(--success-500)" : "var(--danger-500)";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-[4px] border px-1.5 py-0.5"
      style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", borderColor: color, color }}
      title={`${label} update ${ok ? "posted" : "missing"}`}
    >
      {label} {ok ? "✓" : "✗"}
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
  const tr = data.trends;
  const fin = data.financials;
  const cap = data.capacity;
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
  const engagementTotal = data.byEngagement.reduce((a, e) => a + e.count, 0);
  const endingSoon = [...data.clients]
    .filter((c) => c.endDate != null)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
    .slice(0, 8);
  const totalClientCostAmt = fin.totalClientCost?.amount ?? 0;
  // Today's check-in status by dev — entries only list those who missed AM/PM or are away;
  // anyone absent from the map checked in both. Drives the "Today" column on Developer output.
  const checkinByUser = new Map(data.checkins.entries.map((e) => [e.userId, e]));

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ── Row 1 · KPI scorecard (4 × span-3 = 12) ── */}
      <WidgetCard number="01" label="Completed" hint="Tasks the team finished during the selected period. The arrow compares it with the previous period of the same length." className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div className="flex items-center gap-2">
          <div style={HERO} className="tabular-nums">{t.completedInRange}</div>
          <TrendBadge delta={tr.completed} goodWhen="up" />
        </div>
        <div className="mt-1 flex items-center gap-1.5" style={CAPTION}>
          <span>{`${t.createdInRange} created · ${formatPct(t.completionRate)} completed`}</span>
          <TrendBadge delta={tr.completionRate} goodWhen="up" compact />
        </div>
        <div className="mt-3 h-8">
          {hasThroughput ? <AreaSparkline points={completedSeries} height={32} /> : null}
        </div>
      </WidgetCard>

      <WidgetCard number="02" label="Open work" hint="Unfinished tasks right now. Overdue = past their due date." className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div className="flex items-end gap-4">
          <div>
            <div style={HERO} className="tabular-nums">{t.openNow}</div>
            <div className="mt-1" style={CAPTION}>Open now</div>
          </div>
          <div className="pb-1">
            <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, color: t.overdueNow > 0 ? "var(--danger-500)" : "var(--text-2)" }} className="tabular-nums">{t.overdueNow}</div>
            <div className="mt-1" style={CAPTION}>Overdue</div>
          </div>
        </div>
        <div className="mt-3" style={CAPTION}>
          {`${t.inProgressNow} in progress${t.overdueRate != null ? ` · ${formatPct(t.overdueRate)} overdue` : ""}`}
        </div>
      </WidgetCard>

      <WidgetCard number="03" label="Developers on projects" hint="Developers currently assigned to a live client project." className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div style={HERO} className="tabular-nums">{t.activeDevs}</div>
        <div className="mt-1" style={CAPTION}>Currently assigned</div>
        <div className="mt-3" style={CAPTION}>
          {t.avgWorkingDays != null ? `${t.avgWorkingDays} avg days / project` : "no dated timeline"}
        </div>
      </WidgetCard>

      <WidgetCard number="04" label="Monthly cost" hint="What we pay developers per month across active client work. Also shows the average time a task takes to finish." className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div style={HERO} className="tabular-nums">
          {t.monthlyCost ? formatMoney(t.monthlyCost.amount, t.monthlyCost.currency) : "—"}
        </div>
        <div className="mt-1" style={CAPTION}>Developer cost / month</div>
        <div className="mt-3 flex items-center gap-1.5" style={CAPTION}>
          <span>{t.leadTimeSamples ? `${formatLeadTimeDays(t.avgLeadTimeMs)} avg to finish a task` : "no timing data"}</span>
          {t.leadTimeSamples ? <TrendBadge delta={tr.avgLeadTimeMs} goodWhen="down" compact /> : null}
        </div>
      </WidgetCard>

      {/* ── Row 2 · Financials + capacity (8 + 4) ── */}
      <WidgetCard number="05" label="Client billing" hint="What clients are billed for developer time each month, split by how their work is scoped (fixed / phased / rolling / retainer)." className="col-span-12 lg:col-span-8"
        status={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>billed / month</span>}>
        {fin.totalClientCost ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="sm:w-44 sm:shrink-0">
              <div style={HERO} className="tabular-nums">{formatMoney(fin.totalClientCost.amount, fin.totalClientCost.currency)}</div>
              <div className="mt-1" style={CAPTION}>Total client cost / mo</div>
              <div className="mt-2" style={CAPTION}>
                {`${fin.clientsWithCost} client${fin.clientsWithCost === 1 ? "" : "s"} priced${fin.unpricedDevs ? ` · ${fin.unpricedDevs} unpriced dev${fin.unpricedDevs === 1 ? "" : "s"}` : ""}`}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {fin.costByEngagement.map((e) => {
                const pct = Math.round((e.amount / Math.max(1, totalClientCostAmt)) * 100);
                const type = e.type as Engagement;
                return (
                  <div key={e.type}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[var(--text-2)]">{ENGAGEMENT_LABEL[type]}</span>
                      <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>
                        {formatMoney(e.amount, fin.totalClientCost?.currency)}
                        <span className="text-[var(--text-4)]">{` · ${pct}%`}</span>
                      </span>
                    </div>
                    <span className="widget-progress block h-1.5 w-full">
                      <span className="widget-progress__fill block h-full" style={{ width: `${pct}%`, background: engagementColor(type) }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No priced client cost yet — link dev rates in Code → Rate Card.</p>
        )}
      </WidgetCard>

      <WidgetCard number="06" label="Team capacity" hint="How much of the developer team is actively carrying work: how many have tasks vs. how many are on the roster." className="col-span-12 lg:col-span-4">
        <div className="flex items-baseline gap-2">
          <div style={HERO} className="tabular-nums">{cap.contributingDevs}</div>
          <div className="text-sm text-[var(--text-4)] tabular-nums" style={{ fontFamily: MONO }}>{`/ ${cap.rosterDevs}`}</div>
        </div>
        <div className="mt-1" style={CAPTION}>Developers with active work</div>
        <div className="mt-3 space-y-1.5" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-3)" }}>
          <div className="flex items-center justify-between">
            <span style={CAPTION}>On roster, no work</span>
            <span className="tabular-nums" style={{ color: cap.idleDevs > 0 ? "var(--warning-500)" : "var(--text-3)" }}>{cap.idleDevs}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={CAPTION}>Avg open tasks / dev</span>
            <span className="tabular-nums">{cap.avgOpenPerDev ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={CAPTION}>Avg completed / dev</span>
            <span className="tabular-nums">{cap.avgCompletedPerDev ?? "—"}</span>
          </div>
        </div>
      </WidgetCard>

      {/* ── Row 3 · Throughput trend + status donut (8 + 4) ── */}
      <WidgetCard
        number="07"
        label="Work created vs completed"
        hint="New tasks opened vs. tasks finished over time — shows whether the team is keeping pace with incoming work."
        className="col-span-12 lg:col-span-8"
        status={
          <span className="inline-flex items-center gap-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <TrendBadge delta={tr.completed} goodWhen="up" compact />
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

      <WidgetCard number="08" label="Status mix" hint="Where all tasks currently sit in the workflow (backlog → to-do → in progress → done)." className="col-span-12 lg:col-span-4">
        {statusTotal ? (
          <Donut
            centerLabel="tasks"
            segments={data.byStatus.map((s) => ({ label: TASK_STATUS_LABELS[s.status], value: s.count, color: statusColor(s.status) }))}
          />
        ) : (
          <p className="text-sm text-[var(--text-4)]">No tasks yet.</p>
        )}
      </WidgetCard>

      {/* ── Row 4 · Net flow + cumulative + priority (4 + 4 + 4) ── */}
      <WidgetCard number="09" label="Backlog trend" hint="Tasks finished minus new tasks each period. Green bars = clearing the backlog; red bars = the backlog is growing." className="col-span-12 lg:col-span-4"
        status={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>completed − created</span>}>
        <div className="h-28">
          {hasThroughput ? (
            <MiniColumns values={netFlow} positiveColor="var(--success-500)" negativeColor="var(--danger-500)" height={112} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-4)]">No activity</div>
          )}
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>Green = clearing backlog · red = backlog growing</p>
      </WidgetCard>

      <WidgetCard number="10" label="Total delivered" hint="Running total of completed tasks across the period." className="col-span-12 lg:col-span-4">
        <div style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1, color: "var(--text-1)" }} className="tabular-nums">
          {cumulativeDone[cumulativeDone.length - 1] ?? 0}
        </div>
        <div className="mt-1" style={CAPTION}>Completed tasks, running total</div>
        <div className="mt-2 h-20">
          {hasThroughput ? <AreaSparkline points={cumulativeDone} height={80} color="var(--brand-600)" /> : null}
        </div>
      </WidgetCard>

      <WidgetCard number="11" label="Priority mix" hint="Priority breakdown of the open (unfinished) tasks." className="col-span-12 lg:col-span-4">
        {priorityTotal ? (
          <Donut
            centerLabel="open"
            segments={data.byPriority.map((p) => ({ label: TASK_PRIORITY_LABELS[p.priority], value: p.count, color: priorityColor(p.priority) }))}
          />
        ) : (
          <p className="text-sm text-[var(--text-4)]">No open tasks.</p>
        )}
      </WidgetCard>

      {/* ── Row 5 · Lead-time histogram + client cost (6 + 6) ── */}
      <WidgetCard number="12" label="Time to complete" hint="How long tasks take from when work starts to when they're finished. Shorter is better." className="col-span-12 lg:col-span-6"
        status={<span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>start → finish</span>}>
        {t.leadTimeSamples ? (
          <>
            <div className="h-28"><MiniColumns values={data.leadTimeBuckets.map((b) => b.count)} positiveColor="var(--brand-500)" height={112} /></div>
            <div className="mt-1.5 flex justify-between" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: "var(--text-4)" }}>
              {data.leadTimeBuckets.map((b) => (
                <span key={b.label} className="flex-1 text-center">{b.label}</span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              <span>{t.leadTimeSamples} measured · {formatLeadTimeDays(t.avgLeadTimeMs)} average</span>
              <TrendBadge delta={tr.avgLeadTimeMs} goodWhen="down" compact />
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No timing data yet (a task must move from In progress to Done to be measured).</p>
        )}
      </WidgetCard>

      <WidgetCard number="13" label="Cost by client" hint="Monthly developer cost per client, largest first." className="col-span-12 lg:col-span-6">
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

      {/* ── Row 6 · Engagement mix + ending soon (4 + 8) ── */}
      <WidgetCard number="14" label="Engagement mix" hint="How client work is scoped — Fixed scope: set deliverable & end date · Phased: milestone stages · Rolling: ongoing monthly · Retainer: fixed monthly allowance." className="col-span-12 lg:col-span-4">
        {engagementTotal ? (
          <Donut
            centerLabel="clients"
            segments={data.byEngagement.map((e) => ({ label: ENGAGEMENT_LABEL[e.type], value: e.count, color: engagementColor(e.type) }))}
          />
        ) : (
          <p className="text-sm text-[var(--text-4)]">No clients yet.</p>
        )}
      </WidgetCard>

      <WidgetCard number="15" label="Ending soon" hint="Fixed-scope & phased projects ordered by how close they are to their end date. Red = past the end date but still has open work." className="col-span-12 lg:col-span-8"
        status={
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
            {`${t.clientsEndingSoon} ≤30d`}
            {t.clientsPastEnd ? <span style={{ color: "var(--danger-500)" }}>{` · ${t.clientsPastEnd} overrun`}</span> : null}
          </span>
        }>
        {endingSoon.length ? (
          <div className="space-y-2.5">
            {endingSoon.map((c) => {
              const d = c.daysLeft ?? 0;
              const over = d < 0;
              const soon = d >= 0 && d <= 30;
              const barColor = over ? "var(--danger-500)" : soon ? "var(--warning-500)" : "var(--brand-500)";
              // Bar fills as the end approaches: 0 days → full, 180+ days → empty.
              const pct = Math.max(4, Math.min(100, Math.round((1 - Math.min(Math.max(d, 0), 180) / 180) * 100)));
              return (
                <div key={c.clientId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link href={`/app/portal/${c.slug}/tasks`} className="truncate text-xs font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">{c.name}</Link>
                      <EngagementChip type={c.engagementType} />
                    </span>
                    <span className="shrink-0 tabular-nums" style={{ fontFamily: MONO, fontSize: 11, color: over ? "var(--danger-500)" : "var(--text-3)" }}>
                      {c.endDate ? shortDate(c.endDate) : "—"}
                      <span style={{ color: over ? "var(--danger-500)" : "var(--text-4)" }}>{` · ${over ? `${Math.abs(d)}d over` : d === 0 ? "today" : `${d}d left`}`}</span>
                    </span>
                  </div>
                  <span className="widget-progress block h-1.5 w-full">
                    <span className="widget-progress__fill block h-full" style={{ width: `${pct}%`, background: barColor }} />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-4)]">No dated engagements yet — set a client&apos;s engagement type + end date in Portal.</p>
        )}
      </WidgetCard>

      {/* ── Row 7 · Dev output + client activity tables (6 + 6) ── */}
      <WidgetCard
        number="16"
        label="Developer output"
        hint={`Per developer: tasks completed, tasks still open, today's check-ins (AM = morning, PM = end-of-day; anyone booked off shows as away), and overall check-in rate. Today = ${shortDate(data.checkins.workDate)}.`}
        className="col-span-12 lg:col-span-6"
        bodyClassName="p-0"
        status={
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
            <span style={{ color: data.checkins.missedCount > 0 ? "var(--danger-500)" : "var(--text-4)" }}>{`${data.checkins.missedCount} missed today`}</span>
            {data.checkins.absentCount ? ` · ${data.checkins.absentCount} away` : ""}
          </span>
        }
      >
        {data.leaderboard.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Developer</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Done</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Open</th>
                  <th className={analyticsTh} style={analyticsThStyle} title="Today's morning (AM) and end-of-day (PM) updates">Today</th>
                  <th className={analyticsTh} style={analyticsThStyle} title="Share of working days they posted their end-of-day update">Check-in rate</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((d) => {
                  const ci = checkinByUser.get(d.userId);
                  return (
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
                    <td className={analyticsTd}>
                      {ci?.absent ? (
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-4)" }}>{ci.absenceReason}</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <CheckPill ok={ci ? ci.am : true} label="AM" />
                          <CheckPill ok={ci ? ci.pm : true} label="PM" />
                        </span>
                      )}
                    </td>
                    <td className={analyticsTd}><ProgressCell value={d.standupCompliancePct} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-[var(--text-4)]">No developer output in this range.</p>
        )}
      </WidgetCard>

      <WidgetCard number="17" label="Client activity" hint="Per-client summary — engagement type, end date, developers, monthly cost, open/overdue/completed tasks, and a health dot (green/amber/red)." className="col-span-12 lg:col-span-6" bodyClassName="p-0">
        {data.clients.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={analyticsTh} style={analyticsThStyle}>Client</th>
                  <th className={analyticsTh} style={analyticsThStyle}>Type</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Ends</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Devs</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Cost/mo</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Open</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Overdue</th>
                  <th className={`${analyticsTh} text-right`} style={analyticsThStyle}>Done</th>
                  <th className={`${analyticsTh} text-center`} style={analyticsThStyle}>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => {
                  const d = c.daysLeft;
                  const over = d != null && d < 0;
                  return (
                  <tr key={c.clientId}>
                    <td className={analyticsTd}>
                      <Link href={`/app/portal/${c.slug}/tasks`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">{c.name}</Link>
                    </td>
                    <td className={analyticsTd}><EngagementChip type={c.engagementType} /></td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 11, color: over ? "var(--danger-500)" : "var(--text-3)" }}>
                      {c.endDate ? (
                        <span title={d != null ? (over ? `${Math.abs(d)}d over` : `${d}d left`) : undefined}>{shortDate(c.endDate)}</span>
                      ) : (
                        <span className="text-[var(--text-4)]">{endsOngoing(c.engagementType) ? "Ongoing" : "—"}</span>
                      )}
                    </td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-3)" }}>{c.devs || "—"}</td>
                    <td className={`${analyticsTd} text-right tabular-nums`} style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }} title={c.monthlyCost?.unpricedDevs ? `${c.monthlyCost.unpricedDevs} unpriced` : undefined}>
                      {c.monthlyCost ? formatMoney(c.monthlyCost.amount, c.monthlyCost.currency) : "—"}
                    </td>
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
                  );
                })}
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
