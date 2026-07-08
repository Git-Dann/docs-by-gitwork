"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowPathIcon,
  ServerStackIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { useGolfDataConsole } from "@/hooks/use-wiki";
import type {
  ConsoleTone,
  GolfConsoleMetric,
  GolfDataConsole,
  GolfPipelineNode,
} from "@/server/golf-data-console";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";

// ── tone helpers ──────────────────────────────────────────────────────────────

function toneColor(tone: ConsoleTone | undefined): string {
  switch (tone) {
    case "ok":
      return "var(--success-500)";
    case "warn":
      return "var(--warning-500)";
    case "bad":
      return "var(--danger-500)";
    default:
      return "var(--brand-600)";
  }
}

function statusTone(status: string): ConsoleTone {
  const s = status.toLowerCase();
  if (["valid", "healthy", "succeeded"].includes(s)) return "ok";
  if (["warning", "degraded"].includes(s)) return "warn";
  if (["failed", "down", "critical"].includes(s)) return "bad";
  if (["info"].includes(s)) return "info";
  if (["error"].includes(s)) return "warn";
  return "info";
}

function toneBg(tone: ConsoleTone): { bg: string; fg: string } {
  switch (tone) {
    case "ok":
      return { bg: "var(--success-50)", fg: "var(--success-500)" };
    case "warn":
      return { bg: "var(--warning-50)", fg: "var(--warning-500)" };
    case "bad":
      return { bg: "var(--danger-50)", fg: "var(--danger-500)" };
    default:
      return { bg: "var(--brand-50)", fg: "var(--brand-700)" };
  }
}

// ── primitives ────────────────────────────────────────────────────────────────

function WidgetCard({
  number,
  label,
  status,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  number: string;
  label: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`widget-card ${className}`}>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
        {status ? <span className="widget-header__status">{status}</span> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  const { bg, fg } = toneBg(tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5"
      style={{ background: bg, color: fg, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: fg }} />
      {status}
    </span>
  );
}

function Sparkline({ points, tone }: { points: number[]; tone: ConsoleTone }) {
  const w = 120;
  const h = 28;
  const stroke = toneColor(tone);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${((1 - p) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}

function ProgressCell({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{value}%</span>
      <span className="widget-progress" style={{ width: 44 }}>
        <span className="widget-progress__fill" style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

const th = "px-3 py-2 text-left align-middle";
const td = "px-3 py-2.5 align-middle border-t border-[var(--border-2)]";
const thStyle = { fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--text-4)" };
const monoCell = { fontFamily: MONO, fontSize: 12, color: "var(--text-3)" };

function MetricPanel({ metric, number }: { metric: GolfConsoleMetric; number: string }) {
  return (
    <WidgetCard number={number} label={metric.label} bodyClassName="px-4 pb-3 pt-3">
      <div className="flex items-baseline justify-between">
        <span style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
          {metric.value}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="inline-flex items-center gap-1.5" style={{ color: toneColor(metric.tone) }}>
          {metric.tone === "ok" ? (
            <CheckCircleIcon className="h-3.5 w-3.5" />
          ) : (
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          )}
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {metric.sub}
          </span>
        </span>
        <span className="w-[92px] shrink-0">
          <Sparkline points={metric.spark} tone={metric.tone} />
        </span>
      </div>
    </WidgetCard>
  );
}

// ── pipeline node ─────────────────────────────────────────────────────────────

function PipelineNode({ node }: { node: GolfPipelineNode }) {
  const tone = node.tone;
  const borderColor = tone ? toneColor(tone) : "var(--border-1)";
  return (
    <div
      className="flex items-center gap-2 rounded-[6px] border bg-[var(--surface-0)] px-2.5 py-2"
      style={{ borderColor, minWidth: 128 }}
    >
      <CircleStackIcon className="h-4 w-4 shrink-0" style={{ color: tone ? toneColor(tone) : "var(--text-4)" }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>{node.label}</span>
    </div>
  );
}

function Arrow() {
  return <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />;
}

// ── main ──────────────────────────────────────────────────────────────────────

export function GolfDataConsoleView({ slug }: { slug: string; clientName?: string }) {
  const { data, isPending, isError, refetch, isFetching } = useGolfDataConsole(slug, true);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-[var(--text-4)]">Loading golf data console…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border-1)] py-14 text-center">
        <p className="text-[13px] text-[var(--text-4)]">Couldn&apos;t load the golf data snapshot.</p>
        <button className="app-button-secondary mt-3" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const snapshot = data as GolfDataConsole;

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: toneColor(snapshot.systemStatus.tone), fontFamily: MONO, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: toneColor(snapshot.systemStatus.tone) }} />
            {snapshot.systemStatus.label}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>· Updated {snapshot.updatedAt}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 sm:inline-flex"
            style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-3)" }}
          >
            {snapshot.rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {snapshot.metrics.map((m, i) => (
          <MetricPanel key={m.key} metric={m} number={String(i + 1).padStart(2, "0")} />
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Left + center span 2 on xl */}
        <div className="space-y-3 xl:col-span-2">
          {/* Providers */}
          <WidgetCard number="06" label="Providers" status={`${snapshot.providers.length} sources`} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Provider", "Domain", "Status", "Last import", "Next import", "Success 7d", "Issues"].map((h) => (
                      <th key={h} className={th} style={thStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.providers.map((p) => (
                    <tr key={p.name}>
                      <td className={td}>
                        <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
                          {p.name}
                          {p.live ? (
                            <span
                              className="rounded-[3px] px-1 py-0.5"
                              style={{ background: "var(--brand-50)", color: "var(--brand-700)", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em" }}
                            >
                              LIVE
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className={td} style={monoCell}>{p.domain}</td>
                      <td className={td}><StatusBadge status={p.status} /></td>
                      <td className={td} style={monoCell}>{p.lastImport}</td>
                      <td className={td} style={monoCell}>{p.nextImport}</td>
                      <td className={td}><ProgressCell value={p.success} /></td>
                      <td className={td} style={{ ...monoCell, color: p.issues > 0 ? "var(--warning-500)" : "var(--text-4)" }}>{p.issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WidgetCard>

          {/* Import runs */}
          <WidgetCard number="07" label="Import Runs" bodyClassName="p-0">
            <div className="p-4 pb-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--success-500)" }} /> Succeeded
                </span>
                <span className="inline-flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning-500)" }} /> Warning
                </span>
                <span className="inline-flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--danger-500)" }} /> Failed
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Run ID", "Provider", "Started", "Duration", "Status"].map((h) => (
                      <th key={h} className={th} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.runs.map((r) => (
                    <tr key={r.runId}>
                      <td className={td} style={{ ...monoCell, color: "var(--brand-700)" }}>{r.runId}</td>
                      <td className={td} style={monoCell}>{r.provider}</td>
                      <td className={td} style={monoCell}>{r.started}</td>
                      <td className={td} style={monoCell}>{r.duration}</td>
                      <td className={td}><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                  {snapshot.runs.length === 0 ? (
                    <tr>
                      <td className={td} colSpan={5} style={{ ...monoCell, textAlign: "center" }}>
                        No import runs in range
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WidgetCard>

          {/* Schema / pipeline */}
          <WidgetCard number="08" label="Schema / Pipeline" bodyClassName="p-4">
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-3">
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Providers</span>
                  {snapshot.pipeline.providers.map((n) => (
                    <PipelineNode key={n.label} node={n} />
                  ))}
                </div>
                <Arrow />
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Transform</span>
                  {snapshot.pipeline.stages.map((n, i) => (
                    <div key={n.label} className="flex items-center gap-2">
                      <PipelineNode node={n} />
                      {i < snapshot.pipeline.stages.length - 1 ? null : null}
                    </div>
                  ))}
                </div>
                <Arrow />
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Datasets</span>
                  {snapshot.pipeline.datasets.map((n) => (
                    <PipelineNode key={n.label} node={n} />
                  ))}
                </div>
              </div>
            </div>
          </WidgetCard>

          {/* Dataset versions + version comparison */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WidgetCard number="09" label="Dataset Versions" bodyClassName="p-0">
              <DatasetVersions datasets={snapshot.datasets} />
            </WidgetCard>

            <WidgetCard number="10" label="Version Comparison" bodyClassName="p-4">
              <div className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-3)" }}>
                <span className="rounded-[6px] border border-[var(--border-2)] px-2 py-1">{snapshot.diff.before}</span>
                <span className="text-[var(--text-4)]">vs</span>
                <span className="rounded-[6px] border border-[var(--border-2)] px-2 py-1">{snapshot.diff.after}</span>
              </div>
              <dl className="mt-3 divide-y divide-[var(--border-2)]">
                {snapshot.diff.rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2">
                    <dt className="text-[13px] text-[var(--text-3)]">{row.label}</dt>
                    <dd style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: row.positive ? "var(--success-500)" : "var(--text-2)" }}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </WidgetCard>
          </div>

          {/* Exporters */}
          <WidgetCard number="11" label="Exporters" status="Delivered records 7d" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Exporter", "Destination", "Schedule", "Last export", "Status", "Success", "Records"].map((h) => (
                      <th key={h} className={th} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.exporters.map((e) => (
                    <tr key={e.name}>
                      <td className={td}><span className="text-[13px] font-medium text-[var(--text-1)]">{e.name}</span></td>
                      <td className={td} style={monoCell}>{e.destination}</td>
                      <td className={td} style={monoCell}>{e.schedule}</td>
                      <td className={td} style={monoCell}>{e.lastExport}</td>
                      <td className={td}><StatusBadge status={e.status} /></td>
                      <td className={td}><ProgressCell value={e.success} /></td>
                      <td className={td} style={{ ...monoCell, color: "var(--text-2)" }}>{e.records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WidgetCard>
        </div>

        {/* Right rail — Validation */}
        <div className="space-y-3">
          <WidgetCard number="12" label="Validation" status={snapshot.validation.runId} bodyClassName="p-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { n: snapshot.validation.critical, l: "Critical", tone: "bad" as ConsoleTone },
                { n: snapshot.validation.errors, l: "Errors", tone: "warn" as ConsoleTone },
                { n: snapshot.validation.warnings, l: "Warnings", tone: "warn" as ConsoleTone },
                { n: snapshot.validation.info, l: "Info", tone: "info" as ConsoleTone },
              ].map((b) => (
                <div key={b.l} className="rounded-[6px] border border-[var(--border-2)] px-2 py-2 text-center">
                  <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, color: b.n > 0 ? toneColor(b.tone) : "var(--text-2)" }}>{b.n}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>{b.l}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Total issues</div>
                <div style={{ fontFamily: SERIF, fontSize: 24, color: "var(--text-1)" }}>{snapshot.validation.total}</div>
              </div>
              <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Affected datasets</div>
                <div style={{ fontFamily: SERIF, fontSize: 24, color: "var(--text-1)" }}>{snapshot.validation.affectedDatasets}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Top issues</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {["Issue", "Dataset", "Count", "Severity"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left" style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.validation.issues.map((i, idx) => (
                      <tr key={idx}>
                        <td className="border-t border-[var(--border-2)] px-2 py-2 text-[12px] text-[var(--text-2)]">{i.issue}</td>
                        <td className="border-t border-[var(--border-2)] px-2 py-2" style={monoCell}>{i.dataset}</td>
                        <td className="border-t border-[var(--border-2)] px-2 py-2" style={monoCell}>{i.count}</td>
                        <td className="border-t border-[var(--border-2)] px-2 py-2"><StatusBadge status={i.severity} /></td>
                      </tr>
                    ))}
                    {snapshot.validation.issues.length === 0 ? (
                      <tr>
                        <td className="border-t border-[var(--border-2)] px-2 py-3 text-center" colSpan={4} style={monoCell}>
                          No open issues 🎉
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Dataset detail</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {snapshot.validation.detail.map((d) => (
                  <div key={d.label}>
                    <dt style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>{d.label}</dt>
                    <dd className="text-[13px]" style={{ color: d.tone ? toneColor(d.tone) : "var(--text-1)", fontWeight: d.tone ? 600 : 400 }}>{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </WidgetCard>

          {/* Live courses rollup */}
          <WidgetCard number="13" label="Courses (Live)" status="from intake" bodyClassName="p-4">
            <div className="grid grid-cols-2 gap-3">
              <RollupStat value={snapshot.courses.total} label="Total courses" icon={<CircleStackIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.added} label="Added to app" tone="ok" icon={<CheckCircleIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.pending} label="Pending" tone={snapshot.courses.pending > 0 ? "warn" : "ok"} icon={<InboxArrowDownIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.countries} label="Countries" icon={<ServerStackIcon className="h-4 w-4" />} />
            </div>
            <div className="mt-3 rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
              <div className="flex items-center justify-between">
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Provenance coverage</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{snapshot.courses.coveragePct}%</span>
              </div>
              <span className="widget-progress mt-1.5 block">
                <span className="widget-progress__fill" style={{ width: `${snapshot.courses.coveragePct}%` }} />
              </span>
              {snapshot.courses.missingCountry > 0 ? (
                <p className="mt-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--warning-500)" }}>
                  {snapshot.courses.missingCountry} missing country
                </p>
              ) : null}
            </div>
          </WidgetCard>

          <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-4)]">
            <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium">Courses</span> is live from Wedge&apos;s course intake. Equipment, Weather,
              exporters and pipeline reflect the Gitwork Golf Data platform configuration.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function RollupStat({ value, label, tone, icon }: { value: number; label: string; tone?: ConsoleTone; icon: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-[var(--border-2)] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, color: tone ? toneColor(tone) : "var(--text-1)" }}>{value}</span>
        <span style={{ color: "var(--text-4)" }}>{icon}</span>
      </div>
      <div className="mt-1" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>{label}</div>
    </div>
  );
}

function DatasetVersions({ datasets }: { datasets: GolfDataConsole["datasets"] }) {
  const domains = Object.keys(datasets);
  const [active, setActive] = useState(domains[0] ?? "");
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-[var(--border-2)] px-3 pt-2">
        {domains.map((d) => {
          const on = d === active;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setActive(d)}
              className="border-b-2 px-2 pb-2 pt-1 transition-colors"
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: on ? "var(--brand-700)" : "var(--text-4)",
                borderColor: on ? "var(--brand-600)" : "transparent",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Version", "Records", "Created", "Status"].map((h) => (
                <th key={h} className={th} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(datasets[active] ?? []).map((v) => (
              <tr key={v.version}>
                <td className={td} style={{ ...monoCell, color: "var(--brand-700)" }}>{v.version}</td>
                <td className={td} style={{ ...monoCell, color: "var(--text-2)" }}>{v.records}</td>
                <td className={td} style={monoCell}>{v.created}</td>
                <td className={td}><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
