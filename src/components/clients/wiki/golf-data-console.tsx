"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowPathIcon,
  ServerStackIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  MapPinIcon,
  ArrowRightIcon,
  BoltIcon,
  KeyIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import { useGolfDataConsole, useGolfCourseBackend, useGolfIntegrations, useRunGolfJob, useGolfClubsList } from "@/hooks/use-wiki";
import { usePermissions } from "@/hooks/use-permissions";
import type {
  ConsoleTone,
  GolfConsoleMetric,
  GolfDataConsole,
  GolfPipelineNode,
} from "@/server/golf-data-console";
import type { CourseBackendData, CourseIntegration, RunJobResult } from "@/server/bigwedge-course-api";
import type { GolfClubDTO } from "@/server/golf-clubs";

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
  bodyClassName = "p-4",
}: {
  number: string;
  label: string;
  status?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="widget-card">
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
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${((1 - p) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={toneColor(tone)} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
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
          {metric.tone === "ok" ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <ExclamationTriangleIcon className="h-3.5 w-3.5" />}
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{metric.sub}</span>
        </span>
        <span className="w-[92px] shrink-0">
          <Sparkline points={metric.spark} tone={metric.tone} />
        </span>
      </div>
    </WidgetCard>
  );
}

function PipelineNode({ node }: { node: GolfPipelineNode }) {
  const tone = node.tone;
  return (
    <div className="flex items-center gap-2 rounded-[6px] border bg-[var(--surface-0)] px-2.5 py-2" style={{ borderColor: tone ? toneColor(tone) : "var(--border-1)", minWidth: 128 }}>
      <CircleStackIcon className="h-4 w-4 shrink-0" style={{ color: tone ? toneColor(tone) : "var(--text-4)" }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>{node.label}</span>
    </div>
  );
}

function Arrow() {
  return <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />;
}

function RollupStat({ value, label, tone, icon }: { value: number | string; label: string; tone?: ConsoleTone; icon: ReactNode }) {
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
              style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: on ? "var(--brand-700)" : "var(--text-4)", borderColor: on ? "var(--brand-600)" : "transparent" }}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>{["Version", "Records", "Created", "Status"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {(datasets[active] ?? []).map((v) => (
              <tr key={v.version + v.label}>
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

// ── main ──────────────────────────────────────────────────────────────────────

type View = "overview" | "clubs" | "course-backend" | "integrations";

export function GolfDataConsoleView({ slug }: { slug: string; clientName?: string }) {
  const [view, setView] = useState<View>("overview");
  const overview = useGolfDataConsole(slug, true);
  const clubs = useGolfClubsList(slug, view === "clubs");
  const backend = useGolfCourseBackend(slug, view === "course-backend");
  const integrations = useGolfIntegrations(slug, view === "integrations");

  const active =
    view === "overview" ? overview : view === "clubs" ? clubs : view === "course-backend" ? backend : integrations;
  const refreshing = active.isFetching;
  const refetch = () => active.refetch();

  const snapshot = overview.data;

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {snapshot ? (
            <>
              <span className="inline-flex items-center gap-1.5" style={{ color: toneColor(snapshot.systemStatus.tone), fontFamily: MONO, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: toneColor(snapshot.systemStatus.tone) }} />
                {snapshot.systemStatus.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>· Updated {snapshot.updatedAt}</span>
            </>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>Gitwork Golf Data</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <select
            value={view}
            onChange={(e) => setView(e.target.value as View)}
            className="app-select-compact"
            aria-label="Console view"
          >
            <option value="overview">Platform overview</option>
            <option value="clubs">Clubs</option>
            <option value="course-backend">Course backend</option>
            <option value="integrations">Integrations</option>
          </select>

          <button
            type="button"
            onClick={refetch}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {view === "overview" ? (
        <OverviewView state={overview} />
      ) : view === "clubs" ? (
        <ClubsView state={clubs} />
      ) : view === "course-backend" ? (
        <CourseBackendView state={backend} />
      ) : (
        <IntegrationsView slug={slug} state={integrations} />
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewView({ state }: { state: ReturnType<typeof useGolfDataConsole> }) {
  const { data, isPending, isError, refetch } = state;

  if (isPending) return <Loading label="Loading golf data console…" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} label="Couldn't load the golf data snapshot." />;

  const snapshot = data;

  return (
    <>
      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {snapshot.metrics.map((m, i) => (
          <MetricPanel key={m.key} metric={m} number={String(i + 1).padStart(2, "0")} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {/* Providers */}
          <WidgetCard number="06" label="Providers" status={`${snapshot.providers.length} live`} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>{["Provider", "Domain", "Status", "Last import", "Success", "Issues"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {snapshot.providers.map((p) => (
                    <tr key={p.name}>
                      <td className={td}>
                        <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
                          {p.name}
                          {p.live ? (
                            <span className="rounded-[3px] px-1 py-0.5" style={{ background: "var(--brand-50)", color: "var(--brand-700)", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em" }}>LIVE</span>
                          ) : null}
                        </span>
                      </td>
                      <td className={td} style={monoCell}>{p.domain}</td>
                      <td className={td}><StatusBadge status={p.status} /></td>
                      <td className={td} style={monoCell}>{p.lastImport}</td>
                      <td className={td}><ProgressCell value={p.success} /></td>
                      <td className={td} style={{ ...monoCell, color: p.issues > 0 ? "var(--warning-500)" : "var(--text-4)" }}>{p.issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WidgetCard>

          {/* Import runs */}
          <WidgetCard number="07" label="Import Runs" status="course intake · 7d" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>{["Run ID", "Provider", "Started", "Duration", "Status"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr>
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
                    <tr><td className={td} colSpan={5} style={{ ...monoCell, textAlign: "center" }}>No import runs in range</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WidgetCard>

          {/* Pipeline */}
          <WidgetCard number="08" label="Schema / Pipeline" bodyClassName="p-4">
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-3">
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Providers</span>
                  {snapshot.pipeline.providers.map((n) => <PipelineNode key={n.label} node={n} />)}
                </div>
                <Arrow />
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Transform</span>
                  {snapshot.pipeline.stages.map((n) => <PipelineNode key={n.label} node={n} />)}
                </div>
                <Arrow />
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Datasets</span>
                  {snapshot.pipeline.datasets.map((n) => <PipelineNode key={n.label} node={n} />)}
                </div>
              </div>
            </div>
          </WidgetCard>

          {/* Dataset versions + comparison */}
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
                    <dd style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: row.positive ? "var(--success-500)" : "var(--text-2)" }}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </WidgetCard>
          </div>

        </div>

        {/* Right rail */}
        <div className="space-y-3">
          <WidgetCard number="11" label="Validation" status={snapshot.validation.runId} bodyClassName="p-4">
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
            <div className="mt-4">
              <div className="mb-1.5" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)" }}>Top issues</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr>{["Issue", "Dataset", "Count", "Severity"].map((h) => <th key={h} className="px-2 py-1.5 text-left" style={thStyle}>{h}</th>)}</tr></thead>
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
                      <tr><td className="border-t border-[var(--border-2)] px-2 py-3 text-center" colSpan={4} style={monoCell}>No open issues 🎉</td></tr>
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

          <WidgetCard number="12" label="Courses (Live)" status="from intake" bodyClassName="p-4">
            <div className="grid grid-cols-2 gap-3">
              <RollupStat value={snapshot.courses.total} label="Total courses" icon={<CircleStackIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.added} label="Added to app" tone="ok" icon={<CheckCircleIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.pending} label="Pending" tone={snapshot.courses.pending > 0 ? "warn" : "ok"} icon={<ExclamationTriangleIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.courses.countries} label="Countries" icon={<GlobeAltIcon className="h-4 w-4" />} />
            </div>
            <div className="mt-3 rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
              <div className="flex items-center justify-between">
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>Provenance coverage</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-2)" }}>{snapshot.courses.coveragePct}%</span>
              </div>
              <span className="widget-progress mt-1.5 block"><span className="widget-progress__fill" style={{ width: `${snapshot.courses.coveragePct}%` }} /></span>
            </div>
          </WidgetCard>

          <WidgetCard number="13" label="Equipment (Live)" status="clubs" bodyClassName="p-4">
            <div className="grid grid-cols-3 gap-3">
              <RollupStat value={snapshot.equipment.total} label="Clubs" tone="ok" icon={<CircleStackIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.equipment.manufacturers} label="Brands" icon={<ServerStackIcon className="h-4 w-4" />} />
              <RollupStat value={snapshot.equipment.categories} label="Categories" icon={<ShieldCheckIcon className="h-4 w-4" />} />
            </div>
          </WidgetCard>

          <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-4)]">
            <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>All figures are live from Foundry data (clubs catalogue + course intake). The full Big Wedge course backend is in the <span className="font-medium">Course backend</span> view.</span>
          </p>
        </div>
      </div>
    </>
  );
}

// ── Course Backend (live, read-only) ─────────────────────────────────────────

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function CourseBackendView({ state }: { state: ReturnType<typeof useGolfCourseBackend> }) {
  const { data, isPending, isError, refetch } = state;

  if (isPending) return <Loading label="Reading the Big Wedge course backend…" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} label="Couldn't reach the course backend." />;

  const d = data as CourseBackendData;

  if (!d.connected || !d.stats) {
    return (
      <WidgetCard number="01" label="Course Backend" status="not connected" bodyClassName="p-6">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-500)]" />
          <div>
            <p className="text-[13px] font-medium text-[var(--text-2)]">Course backend not connected</p>
            <p className="mt-1 text-[12px] text-[var(--text-4)]">
              Add the Big Wedge admin token in <span className="font-medium">Care → Connectors → Analytics API</span>,
              and (if the course backend is on a different host) set <span style={{ fontFamily: MONO }}>WEDGE_COURSE_API_URL</span>.
            </p>
            {d.error ? <p className="mt-2 rounded-[6px] bg-[var(--surface-1)] px-2 py-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)" }}>{d.error}</p> : null}
          </div>
        </div>
      </WidgetCard>
    );
  }

  const s = d.stats;
  const gpsPct = pct(s.with_gps, s.courses);
  const completePct = pct(s.complete, s.courses);
  const sources = d.sources ?? {};
  const sourceRows = Object.entries(sources).filter(([k]) => k !== "_total").sort((a, b) => b[1] - a[1]);
  const sourceTotal = sources._total ?? s.courses;
  const holeDist = Object.entries(s.hole_distribution).sort((a, b) => Number(b[1]) - Number(a[1]));

  const tile = (value: string | number, label: string, tone?: ConsoleTone, sub?: string) => (
    <WidgetCard number="" label={label} bodyClassName="px-4 pb-3 pt-3">
      <span style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em", color: tone ? toneColor(tone) : "var(--text-1)" }}>{value}</span>
      {sub ? <div className="mt-1.5" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-4)" }}>{sub}</div> : null}
    </WidgetCard>
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--success-500)", fontFamily: MONO, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--success-500)" }} /> Connected
        </span>
        {d.baseUrl ? <span className="truncate" style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>· {d.baseUrl}</span> : null}
      </div>

      {/* Metric strip */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tile(s.courses.toLocaleString("en-GB"), "Courses")}
        {tile(s.clubs.toLocaleString("en-GB"), "Clubs")}
        {tile(`${gpsPct}%`, "GPS Coverage", gpsPct >= 80 ? "ok" : "warn", `${s.with_gps.toLocaleString("en-GB")} courses`)}
        {tile(s.gps_points.toLocaleString("en-GB"), "GPS Points")}
        {tile(s.holes.toLocaleString("en-GB"), "Holes")}
        {tile(s.countries.toLocaleString("en-GB"), "Countries")}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {/* Coverage by country */}
          <WidgetCard number="01" label="Coverage by Country" status={`${s.countries} countries`} bodyClassName="p-0">
            <div className="max-h-[340px] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr>{["Country", "Courses", "With GPS", "GPS %"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.by_country.map((c) => (
                    <tr key={c.country}>
                      <td className={td}><span className="flex items-center gap-1.5 text-[13px] text-[var(--text-1)]"><MapPinIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />{c.country}</span></td>
                      <td className={td} style={{ ...monoCell, color: "var(--text-2)" }}>{c.count.toLocaleString("en-GB")}</td>
                      <td className={td} style={monoCell}>{c.gps.toLocaleString("en-GB")}</td>
                      <td className={td}><ProgressCell value={pct(c.gps, c.count)} /></td>
                    </tr>
                  ))}
                  {s.by_country.length === 0 ? <tr><td className={td} colSpan={4} style={{ ...monoCell, textAlign: "center" }}>No country data</td></tr> : null}
                </tbody>
              </table>
            </div>
          </WidgetCard>

          {/* Recent activity */}
          <WidgetCard number="02" label="Recent Activity" status="enrichment · seeds" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr>{["Source", "Type", "Affected", "Skipped", "Errors", "When"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.activity.map((a) => (
                    <tr key={a.id}>
                      <td className={td} style={{ ...monoCell, color: "var(--text-2)" }}>{a.source}</td>
                      <td className={td} style={monoCell}>{a.event_type}</td>
                      <td className={td} style={monoCell}>{a.records_affected.toLocaleString("en-GB")}</td>
                      <td className={td} style={monoCell}>{a.skipped}</td>
                      <td className={td} style={{ ...monoCell, color: a.errors > 0 ? "var(--danger-500)" : "var(--text-4)" }}>{a.errors}</td>
                      <td className={td} style={monoCell}>{a.created_at.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                  {d.activity.length === 0 ? <tr><td className={td} colSpan={6} style={{ ...monoCell, textAlign: "center" }}>No recent activity</td></tr> : null}
                </tbody>
              </table>
            </div>
          </WidgetCard>
        </div>

        <div className="space-y-3">
          {/* Data quality */}
          <WidgetCard number="03" label="Data Quality" status={`${completePct}% complete`} bodyClassName="p-4">
            {[
              { l: "Complete records", n: s.complete },
              { l: "With GPS", n: s.with_gps },
              { l: "With image", n: s.with_image },
              { l: "With description", n: s.with_description },
              { l: "With architect", n: s.with_architect },
              { l: "With year opened", n: s.with_year },
              { l: "With rating", n: s.with_rating },
              { l: "With tees", n: s.courses - s.missing_tees },
            ].map((row) => {
              const p = pct(row.n, s.courses);
              return (
                <div key={row.l} className="mb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[var(--text-3)]">{row.l}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>{row.n.toLocaleString("en-GB")} · {p}%</span>
                  </div>
                  <span className="widget-progress mt-1 block"><span className="widget-progress__fill" style={{ width: `${p}%`, background: p >= 80 ? "var(--success-500)" : p >= 40 ? "var(--brand-600)" : "var(--warning-500)" }} /></span>
                </div>
              );
            })}
          </WidgetCard>

          {/* Sources */}
          <WidgetCard number="04" label="Source Coverage" status={`of ${sourceTotal.toLocaleString("en-GB")}`} bodyClassName="p-4">
            {sourceRows.length === 0 ? (
              <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>No source data</p>
            ) : (
              sourceRows.map(([k, n]) => {
                const p = pct(n, sourceTotal);
                return (
                  <div key={k} className="mb-2.5">
                    <div className="flex items-center justify-between">
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-3)" }}>{k}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-2)" }}>{n.toLocaleString("en-GB")}</span>
                    </div>
                    <span className="widget-progress mt-1 block"><span className="widget-progress__fill" style={{ width: `${p}%` }} /></span>
                  </div>
                );
              })
            )}
          </WidgetCard>

          {/* Hole distribution */}
          <WidgetCard number="05" label="Hole Distribution" bodyClassName="p-4">
            <div className="flex flex-wrap gap-2">
              {holeDist.map(([holes, count]) => (
                <div key={holes} className="rounded-[6px] border border-[var(--border-2)] px-3 py-2 text-center">
                  <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1, color: "var(--text-1)" }}>{Number(count).toLocaleString("en-GB")}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-4)" }}>{holes} holes</div>
                </div>
              ))}
              {holeDist.length === 0 ? <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--text-4)" }}>No hole data</p> : null}
            </div>
          </WidgetCard>

          <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-4)]">
            <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Read-only. Live from the Big Wedge course backend (<span style={{ fontFamily: MONO }}>/api/v1/stats · /sources · /activity</span>). Foundry never writes to it.</span>
          </p>
        </div>
      </div>
    </>
  );
}

// ── Clubs browser ─────────────────────────────────────────────────────────────

function clubLofts(c: GolfClubDTO): string {
  const lofts = Array.from(new Set(c.variants.map((v) => v.loft).filter(Boolean))) as string[];
  if (lofts.length) return lofts.join(", ");
  const set = c.specifications?.setComposition;
  if (typeof set === "string") return set;
  return "—";
}

function specSummary(c: GolfClubDTO): string {
  return Object.entries(c.specifications ?? {})
    .filter(([k]) => k !== "setComposition")
    .slice(0, 3)
    .map(([k, v]) => (typeof v === "boolean" ? (v ? k : "") : `${v}`))
    .filter(Boolean)
    .join(" · ");
}

function ClubsView({ state }: { state: ReturnType<typeof useGolfClubsList> }) {
  const { data, isPending, isError, refetch } = state;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");

  if (isPending) return <Loading label="Loading clubs…" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} label="Couldn't load clubs." />;

  const all = data.clubs;
  const categories = Array.from(new Set(all.map((c) => c.category))).sort();
  const brands = Array.from(new Set(all.map((c) => c.manufacturer))).sort();

  const ql = q.trim().toLowerCase();
  const filtered = all.filter((c) => {
    if (category !== "all" && c.category !== category) return false;
    if (brand !== "all" && c.manufacturer !== brand) return false;
    if (ql) {
      const hay = `${c.manufacturer} ${c.modelName} ${c.modelFamily ?? ""} ${c.category} ${c.aliases.join(" ")}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <MetricTile value={all.length.toLocaleString("en-GB")} label="Clubs" tone="ok" />
        <MetricTile value={String(brands.length)} label="Brands" />
        <MetricTile value={String(categories.length)} label="Types" />
      </div>

      <WidgetCard number="01" label="Clubs Catalogue" status={`${filtered.length} shown`} bodyClassName="p-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-2)] p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand, model…"
            className="app-input-compact min-w-[180px] flex-1"
          />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="app-select-compact">
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="app-select-compact">
            <option value="all">All types</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-0)]">
              <tr>{["Brand", "Model", "Type", "Year", "Lofts / Set", "Specs"].map((h) => <th key={h} className={th} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className={td}><span className="text-[13px] font-medium text-[var(--text-1)]">{c.manufacturer}</span></td>
                  <td className={td}>
                    <span className="text-[13px] text-[var(--text-2)]">{c.modelName}</span>
                    {c.aliases.length ? <span className="ml-1.5" style={{ fontFamily: MONO, fontSize: 9, color: "var(--text-4)" }}>({c.aliases[0]})</span> : null}
                  </td>
                  <td className={td} style={monoCell}>{c.category}</td>
                  <td className={td} style={monoCell}>{c.modelYear ?? "—"}</td>
                  <td className={td} style={{ ...monoCell, color: "var(--text-2)" }}>{clubLofts(c)}</td>
                  <td className={td} style={{ ...monoCell, fontSize: 11 }}>{specSummary(c)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td className={td} colSpan={6} style={{ ...monoCell, textAlign: "center" }}>No clubs match</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </WidgetCard>

      <p className="mt-3 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-4)]">
        <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Live from the <span className="font-medium">GolfClub</span> catalogue — the same Type · Brand · Model · Loft the Big Wedge app collects. The catalogue grows via the scheduled collector.</span>
      </p>
    </>
  );
}

// ── Integrations (connectors: monitor + run) ─────────────────────────────────

const TYPE_META: Record<CourseIntegration["type"], { label: string; tone: ConsoleTone }> = {
  paid: { label: "Licensed", tone: "warn" },
  free: { label: "Free (key)", tone: "info" },
  open: { label: "Open", tone: "ok" },
};

const STATUS_META: Record<CourseIntegration["status"], { label: string; tone: ConsoleTone }> = {
  active: { label: "Active", tone: "ok" },
  "needs-key": { label: "Needs key", tone: "warn" },
  idle: { label: "Idle", tone: "info" },
};

function TonePill({ label, tone }: { label: string; tone: ConsoleTone }) {
  const { bg, fg } = toneBg(tone);
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5" style={{ background: bg, color: fg, fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
      {label}
    </span>
  );
}

function ago(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function IntegrationCard({ slug, integ, canManage }: { slug: string; integ: CourseIntegration; canManage: boolean }) {
  const run = useRunGolfJob(slug);
  const [result, setResult] = useState<RunJobResult | null>(null);

  const doRun = async () => {
    setResult(null);
    try {
      const r = await run.mutateAsync({ job: integ.jobKey as string });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, job: integ.jobKey ?? "", detail: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-[var(--text-1)]">{integ.label}</span>
            {integ.role === "spine" ? <TonePill label="Spine" tone="info" /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <TonePill label={TYPE_META[integ.type].label} tone={TYPE_META[integ.type].tone} />
            <TonePill label={STATUS_META[integ.status].label} tone={STATUS_META[integ.status].tone} />
            {integ.needsKey ? (
              <span className="inline-flex items-center gap-0.5 text-[var(--text-4)]" title="Requires an API key set on the backend">
                <KeyIcon className="h-3 w-3" />
              </span>
            ) : null}
          </div>
        </div>
        {integ.coverage != null ? (
          <div className="shrink-0 text-right">
            <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1, color: "var(--text-1)" }}>{integ.coverage.toLocaleString("en-GB")}</div>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>courses</div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {integ.provides.map((p) => (
          <span key={p} className="rounded-[3px] px-1.5 py-0.5" style={{ background: "var(--surface-1)", color: "var(--text-3)", fontFamily: MONO, fontSize: 9 }}>{p}</span>
        ))}
      </div>

      <div className="mt-2 border-t border-[var(--border-2)] pt-2">
        {integ.lastRun ? (
          <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)" }}>
            Last: <span style={{ color: "var(--success-500)" }}>{integ.lastRun.recordsAffected.toLocaleString("en-GB")}</span> ·{" "}
            {integ.lastRun.skipped} skip ·{" "}
            <span style={{ color: integ.lastRun.errors > 0 ? "var(--danger-500)" : "var(--text-4)" }}>{integ.lastRun.errors} err</span> · {ago(integ.lastRun.createdAt)}
          </p>
        ) : (
          <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)" }}>No runs recorded</p>
        )}

        {integ.jobKey ? (
          <div className="mt-2 flex items-center gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={doRun}
                disabled={run.isPending}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                {run.isPending ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <PlayIcon className="h-3.5 w-3.5" />}
                {run.isPending ? "Running…" : "Run"}
              </button>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--text-4)" }}>Admins can run</span>
            )}
            {result ? (
              <span style={{ fontFamily: MONO, fontSize: 10, color: result.ok ? "var(--success-500)" : "var(--danger-500)" }}>
                {result.ok
                  ? `+${(result.enriched ?? result.seeded ?? 0).toLocaleString("en-GB")} enriched`
                  : (result.detail ?? "failed").slice(0, 60)}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-2" style={{ fontFamily: MONO, fontSize: 9, color: "var(--text-4)" }}>
            <BoltIcon className="mr-1 inline h-3 w-3" />Runs on the backend&apos;s daily schedule
          </p>
        )}
      </div>
    </div>
  );
}

function IntegrationsView({ slug, state }: { slug: string; state: ReturnType<typeof useGolfIntegrations> }) {
  const { data, isPending, isError, refetch } = state;
  const { canManageClients } = usePermissions();

  if (isPending) return <Loading label="Loading connectors…" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} label="Couldn't load integrations." />;

  if (!data.connected) {
    return (
      <WidgetCard number="01" label="Integrations" status="not connected" bodyClassName="p-6">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-500)]" />
          <div>
            <p className="text-[13px] font-medium text-[var(--text-2)]">Course backend not connected</p>
            <p className="mt-1 text-[12px] text-[var(--text-4)]">Set the login (Care → Connectors, or WEDGE_COURSE_API_USER/PASSWORD) to load connectors.</p>
            {data.error ? <p className="mt-2 rounded-[6px] bg-[var(--surface-1)] px-2 py-1.5" style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-4)" }}>{data.error}</p> : null}
          </div>
        </div>
      </WidgetCard>
    );
  }

  const list = data.integrations;
  const active = list.filter((i) => i.status === "active").length;
  const needsKey = list.filter((i) => i.status === "needs-key").length;
  const runnable = list.filter((i) => i.jobKey).length;

  const spine = list.filter((i) => i.role === "spine");
  const enrich = list.filter((i) => i.role === "enrichment");
  const seed = list.filter((i) => i.role === "seed");

  const section = (num: string, label: string, items: CourseIntegration[]) =>
    items.length ? (
      <WidgetCard number={num} label={label} status={`${items.length}`} bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <IntegrationCard key={i.key} slug={slug} integ={i} canManage={canManageClients} />
          ))}
        </div>
      </WidgetCard>
    ) : null;

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile value={String(list.length)} label="Connectors" />
        <MetricTile value={String(active)} label="Active" tone="ok" />
        <MetricTile value={String(needsKey)} label="Need a key" tone={needsKey > 0 ? "warn" : "ok"} />
        <MetricTile value={data.total.toLocaleString("en-GB")} label="Spine courses" />
      </div>

      <div className="mt-3 space-y-3">
        {section("01", "Spine (Licensed)", spine)}
        {section("02", "Enrichment", enrich)}
        {section("03", "Seeders", seed)}
      </div>

      <p className="mt-3 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-4)]">
        <ShieldCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {runnable} connectors are runnable on demand{canManageClients ? "" : " (admins only)"}; the rest run on the backend&apos;s
          daily schedule. Running enrichment executes <span className="font-medium">on the course backend</span> — it adds data to
          courses (GPS, images, ratings…) on top of the golfapi.io spine. Zero load on Foundry.
        </span>
      </p>
    </>
  );
}

function MetricTile({ value, label, tone }: { value: string; label: string; tone?: ConsoleTone }) {
  return (
    <WidgetCard number="" label={label} bodyClassName="px-4 pb-3 pt-3">
      <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, letterSpacing: "-0.02em", color: tone ? toneColor(tone) : "var(--text-1)" }}>{value}</span>
    </WidgetCard>
  );
}

// ── shared states ─────────────────────────────────────────────────────────────

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-sm text-[var(--text-4)]">{label}</div>
    </div>
  );
}

function ErrorState({ onRetry, label }: { onRetry: () => void; label: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-1)] py-14 text-center">
      <p className="text-[13px] text-[var(--text-4)]">{label}</p>
      <button className="app-button-secondary mt-3" onClick={onRetry}>Retry</button>
    </div>
  );
}
