"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePulseCompare, usePulseProject, usePulseProjects } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import { projectAverage, type PulseProject, type ProjectPoint } from "@/lib/pulse-projects";
import { ScanDiffBody, ScoreChange } from "./pulse-scan-diff";
import { buttonStyles } from "@/components/ui/button";

/**
 * Pulse by project: one row per website, repo or store listing, with how it is trending and
 * what needs a look. A project's page shows every scan of it on a dated chart and lets you
 * compare any two. The flat list of scans stays available as "All scans".
 */

/** "6 Oct" — short enough for a table cell; the year only when it is not this year. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-[var(--text-4)]";
  return score >= 75 ? "text-[var(--success-500)]" : score >= 50 ? "text-[var(--warning-500)]" : "text-[var(--danger-500)]";
}

function Change({ project }: { project: PulseProject }) {
  if (!project.change) return <span className="text-xs text-[var(--text-4)]">first scan</span>;
  const by = project.change.by;
  if (by === 0) return <span className="text-xs text-[var(--text-3)]">no change</span>;
  return (
    <span className={cn("whitespace-nowrap text-xs font-medium", by > 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")}>
      {by > 0 ? "up" : "down"} {Math.abs(by)} since {shortDate(project.change.since)}
    </span>
  );
}

/** The open-findings figure for a project's latest completed scan, linking to that scan. */
function OpenFindings({ project }: { project: PulseProject }) {
  if (project.openFindings === null || !project.latestCompletedScanId) return <span className="text-[var(--text-4)]">—</span>;
  if (project.openFindings === 0) return <span className="text-[var(--success-500)]">None</span>;
  return (
    <Link
      href={`/app/pulse/${project.latestCompletedScanId}`}
      className="font-medium text-[var(--text-1)] hover:text-[var(--brand-600)] hover:underline"
      title={`${project.openFindings} open ${project.openFindings === 1 ? "finding" : "findings"} on the latest scan`}
    >
      {project.openFindings}
    </Link>
  );
}

/** Score over time with dates on the axis and the score on every point, so it reads without a legend. */
export function ScoreChart({ points, height = 180 }: { points: ProjectPoint[]; height?: number }) {
  if (points.length < 2) {
    return <p className="text-sm text-[var(--text-3)]">One scan so far. The trend appears from the second scan.</p>;
  }
  const W = 640;
  const H = height;
  const pad = { l: 28, r: 16, t: 18, b: 26 };
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Score over ${points.length} scans: ${points.map((p) => `${formatDate(p.at)} ${p.score}`).join(", ")}`}>
      {[25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--border-2)" strokeDasharray={g === 50 || g === 75 ? "3 3" : undefined} />
          <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--text-4)">{g}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--brand-600)" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={p.scanId}>
          <circle cx={x(i)} cy={y(p.score)} r="3.5" fill="var(--surface-0)" stroke="var(--brand-600)" strokeWidth="2" />
          <text x={x(i)} y={y(p.score) - 8} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-1)">{p.score}</text>
          {(i % labelEvery === 0 || i === points.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-4)">{shortDate(p.at)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function PulseProjectsView({ allScans }: { allScans: React.ReactNode }) {
  const [view, setView] = useState<"projects" | "scans">("projects");
  const [query, setQuery] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const { data, isLoading, error } = usePulseProjects();
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (!onlyAttention || p.attention.length > 0) &&
        (!q || p.name.toLowerCase().includes(q) || p.target.toLowerCase().includes(q) || (p.clientName ?? "").toLowerCase().includes(q)),
    );
  }, [projects, query, onlyAttention]);
  const needing = projects.filter((p) => p.attention.length > 0).length;
  const avg = projectAverage(projects);

  const toggle = (
    <div className="flex items-center gap-1" role="tablist" aria-label="View">
          {(["projects", "scans"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-[6px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                view === v ? "bg-[var(--surface-2)] text-[var(--text-1)]" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
              )}
            >
              {v === "projects" ? "By project" : "All scans"}
            </button>
          ))}
    </div>
  );

  if (view === "scans") {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{toggle}</div>
        {allScans}
      </div>
    );
  }

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">01 // PROJECTS</span>
        {toggle}
      </div>
        <div className="widget-body space-y-4">
          {isLoading && <p className="text-sm text-[var(--text-3)]">Loading projects…</p>}
          {error && <p className="text-sm text-[var(--danger-700)]">Projects could not be loaded.</p>}
          {data && (
            <>
              <p className="text-sm leading-6 text-[var(--text-2)]">
                <strong className="font-semibold text-[var(--text-1)]">{projects.length}</strong> {projects.length === 1 ? "project" : "projects"}
                {avg !== null && <>, average health <strong className="font-semibold text-[var(--text-1)]">{avg}</strong></>}
                {". "}
                {needing > 0 ? (
                  <span className="text-[var(--danger-700)]">{needing} {needing === 1 ? "needs" : "need"} a look.</span>
                ) : (
                  <span className="text-[var(--success-500)]">Nothing needs urgent attention.</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects, sites, repos or clients"
                  aria-label="Search projects"
                  className="app-input min-w-[220px] flex-1 text-base sm:text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                  <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
                  Needs a look only
                </label>
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-[var(--text-3)]">{projects.length === 0 ? "No scans yet. Run one with New scan." : "No project matches."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="app-table app-table--dense min-w-[840px]">
                    <thead>
                      <tr>
                        <th className="text-left">Project</th>
                        <th className="text-left">Needs</th>
                        <th className="text-right">Score</th>
                        <th className="text-right" title="Failing or warning checks on the latest scan that nobody has sent to the board, fixed or dismissed">Open findings</th>
                        <th className="text-left">Since last check</th>
                        <th className="text-right">Scans</th>
                        <th className="text-left">Last checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p) => (
                        <tr key={p.key}>
                          <td className="max-w-[300px]">
                            <Link href={`/app/pulse/projects/${p.slug}`} className="block truncate text-sm font-medium text-[var(--brand-600)] hover:underline" title={p.target}>
                              {p.name}
                            </Link>
                            <span className="block truncate text-[11px] text-[var(--text-4)]" title={p.target}>
                              {[p.clientName, p.target].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td className={cn("min-w-[170px] text-xs", p.attention.length ? "font-medium text-[var(--danger-700)]" : "text-[var(--success-500)]")}>
                            {p.running ? <span className="text-[var(--text-3)]">Scanning now…</span> : p.attention[0] ?? "On track"}
                          </td>
                          <td className={cn("text-right font-serif text-lg font-bold tabular-nums", scoreClass(p.latestScore))}>{p.latestScore ?? "—"}</td>
                          <td className="text-right text-xs tabular-nums">
                            <OpenFindings project={p} />
                          </td>
                          <td><Change project={p} /></td>
                          <td className="text-right text-xs tabular-nums text-[var(--text-3)]">{p.scanCount}</td>
                          <td className="whitespace-nowrap text-xs text-[var(--text-3)]">{shortDate(p.lastScannedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
}

export function PulseProjectPage({ slug }: { slug: string }) {
  const { data, isLoading, error } = usePulseProject(slug);
  const completed = useMemo(() => (data?.scans ?? []).filter((s) => s.status === "COMPLETED"), [data]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (isLoading) return <div className="widget-card"><div className="widget-body text-sm text-[var(--text-3)]">Loading…</div></div>;
  if (error || !data) return <div className="widget-card"><div className="widget-body text-sm text-[var(--danger-700)]">This project could not be found.</div></div>;

  const { project, scans } = data;
  const first = project.history[0];
  const last = project.history[project.history.length - 1];
  const fromId = from || completed[1]?.id || "";
  const toId = to || completed[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">01 // HOW IT IS GOING</span>
          <span className="widget-header-right">{project.scanCount} {project.scanCount === 1 ? "scan" : "scans"}</span>
        </div>
        <div className="widget-body space-y-4">
          <div>
            <p className="text-sm text-[var(--text-3)]">{[project.clientName, project.target].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-base leading-7 text-[var(--text-1)]">
              {last ? (
                <>
                  Health is <strong className={cn("font-semibold", scoreClass(last.score))}>{last.score}</strong>
                  {first && first.scanId !== last.scanId && (
                    <>
                      , {last.score > first.score ? "up" : last.score < first.score ? "down" : "unchanged"} from {first.score} on the first scan ({formatDate(first.at)})
                    </>
                  )}
                  .
                </>
              ) : (
                "No completed scan yet."
              )}
              {project.openFindings !== null && project.latestCompletedScanId && (
                <>
                  {" "}
                  <Link href={`/app/pulse/${project.latestCompletedScanId}`} className="text-[var(--brand-600)] hover:underline">
                    {project.openFindings === 0 ? "No open findings" : `${project.openFindings} open ${project.openFindings === 1 ? "finding" : "findings"}`}
                  </Link>{" "}
                  on the latest scan.
                </>
              )}
              {project.attention.length > 0 && <span className="text-[var(--danger-700)]"> {project.attention.join(". ")}.</span>}
            </p>
          </div>
          <ScoreChart points={project.history} />
        </div>
      </div>

      {completed.length >= 2 && (
        <div className="widget-card">
          <div className="widget-header"><span className="widget-header-label">02 // COMPARE TWO SCANS</span></div>
          <div className="widget-body">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--text-3)]">
                Earlier scan
                <select value={fromId} onChange={(e) => setFrom(e.target.value)} className="app-select mt-1 block min-w-[200px]">
                  {completed.map((s) => <option key={s.id} value={s.id}>{formatDate(s.createdAt)} · {s.healthScore ?? "—"}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--text-3)]">
                Later scan
                <select value={toId} onChange={(e) => setTo(e.target.value)} className="app-select mt-1 block min-w-[200px]">
                  {completed.map((s) => <option key={s.id} value={s.id}>{formatDate(s.createdAt)} · {s.healthScore ?? "—"}</option>)}
                </select>
              </label>
              {fromId && toId && fromId !== toId ? (
                <Link href={`/app/pulse/compare?from=${fromId}&to=${toId}`} className={buttonStyles({ variant: "primary" })}>
                  Compare
                </Link>
              ) : (
                <span className="text-xs text-[var(--text-4)]">Pick two different scans.</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="widget-card">
        <div className="widget-header"><span className="widget-header-label">{`${completed.length >= 2 ? "03" : "02"} // EVERY SCAN`}</span></div>
        <div className="widget-body">
          <div className="overflow-x-auto">
            <table className="app-table app-table--dense min-w-[520px]">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-right">Score</th>
                  <th className="text-left">Change</th>
                  <th className="text-left">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scans.map((s, i) => {
                  const older = scans.slice(i + 1).find((o) => o.status === "COMPLETED" && o.healthScore !== null);
                  const by = s.healthScore !== null && older?.healthScore != null ? s.healthScore - older.healthScore : null;
                  return (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap text-xs text-[var(--text-2)]">{formatDate(s.createdAt)}</td>
                      <td className={cn("text-right font-serif text-base font-bold tabular-nums", scoreClass(s.healthScore))}>{s.healthScore ?? "—"}</td>
                      <td className="text-xs">
                        {by === null ? <span className="text-[var(--text-4)]">—</span> : (
                          <span className={cn(by > 0 ? "text-[var(--success-500)]" : by < 0 ? "text-[var(--danger-500)]" : "text-[var(--text-3)]")}>
                            {by > 0 ? `up ${by}` : by < 0 ? `down ${-by}` : "no change"}
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-[var(--text-3)]">{s.status === "COMPLETED" ? "Done" : s.status === "RUNNING" ? "Scanning…" : s.status === "FAILED" ? "Failed" : s.status}</td>
                      <td className="text-right text-xs">
                        <Link href={`/app/pulse/${s.id}`} className="text-[var(--brand-600)] hover:underline">Open</Link>
                        {older && s.status === "COMPLETED" && (
                          <>
                            {" · "}
                            <Link href={`/app/pulse/compare?from=${older.id}&to=${s.id}`} className="text-[var(--brand-600)] hover:underline">What changed</Link>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PulseComparePage({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = usePulseCompare(to, from);
  if (!from || !to) return <div className="widget-card"><div className="widget-body text-sm text-[var(--text-3)]">Pick two scans to compare from a project&apos;s page.</div></div>;
  if (isLoading) return <div className="widget-card"><div className="widget-body text-sm text-[var(--text-3)]">Comparing…</div></div>;
  const diff = data?.diff;
  if (error || !diff) return <div className="widget-card"><div className="widget-body text-sm text-[var(--danger-700)]">These two scans could not be compared.</div></div>;
  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">01 // WHAT CHANGED</span>
        <span className="widget-header-right"><ScoreChange diff={diff} /></span>
      </div>
      <div className="widget-body space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          From the scan of {diff.previousCompletedAt ? formatDate(diff.previousCompletedAt) : "earlier"} (
          <Link href={`/app/pulse/${diff.previousScanId}`} className="text-[var(--brand-600)] hover:underline">open</Link>) to the scan of{" "}
          {diff.currentCompletedAt ? formatDate(diff.currentCompletedAt) : "later"} (
          <Link href={`/app/pulse/${to}`} className="text-[var(--brand-600)] hover:underline">open</Link>).
        </p>
        <ScanDiffBody diff={diff} showDate={false} />
      </div>
    </div>
  );
}
