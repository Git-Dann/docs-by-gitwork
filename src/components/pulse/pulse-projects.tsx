"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePulseCompare, usePulseProject, usePulseProjects } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import {
  DEFAULT_PROJECT_FILTERS,
  DEFAULT_PROJECT_SORT,
  SORT_START,
  filterProjects,
  projectAverage,
  projectKind,
  sortProjectsBy,
  type ProjectFilters,
  type ProjectPoint,
  type ProjectSortKey,
  type ProjectStatusFilter,
  type PulseProject,
  type SortDir,
} from "@/lib/pulse-projects";
import { Pager } from "@/components/ui/pager";
import { SortHeader } from "@/components/ui/sort-header";
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

function Stat({ label, value, note, tone, onClick, pressed }: { label: string; value: string; note: string; tone?: "good" | "watch" | "bad"; onClick?: () => void; pressed?: boolean }) {
  const color = tone === "bad" ? "text-[var(--danger-500)]" : tone === "watch" ? "text-[var(--warning-500)]" : tone === "good" ? "text-[var(--success-500)]" : "text-[var(--text-1)]";
  const inner = (
    <>
      <span className="widget-data-label block">{label}</span>
      <span className={cn("mt-1 block font-serif text-3xl font-bold leading-none tabular-nums", color)}>{value}</span>
      <span className="mt-1 block font-mono text-[10px] text-[var(--text-4)]">{note}</span>
    </>
  );
  if (!onClick) return <div>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={pressed ? "Show every project" : "Show only these projects"}
      className={cn("-m-2 rounded-[6px] p-2 text-left hover:bg-[var(--surface-1)]", pressed && "bg-[var(--brand-50)] ring-1 ring-[var(--brand-600)]/30")}
    >
      {inner}
    </button>
  );
}

/** Projects per page: enough to scan in one screen, few enough that the newest are never buried. */
const PAGE_SIZE = 20;

/** Moved to components/ui so Staff and Platform can use it without importing Pulse. */
export { SortHeader };

/** What a project needs, in plain words: the most important reason, and how many more. */
function Needs({ project }: { project: PulseProject }) {
  if (project.running) return <span className="text-xs text-[var(--text-3)]">Scanning now…</span>;
  const [first, ...rest] = project.attention;
  if (!first) return <span className="text-xs text-[var(--success-500)]">On track</span>;
  return (
    <span className="text-xs font-medium text-[var(--danger-700)]" title={project.attention.join(". ")}>
      {first}
      {rest.length > 0 && <span className="font-normal text-[var(--text-3)]"> +{rest.length} more</span>}
    </span>
  );
}

function UrgentFindings({ project }: { project: PulseProject }) {
  if (project.urgentFindings === null || !project.latestCompletedScanId) return <span className="text-[var(--text-4)]">—</span>;
  if (project.urgentFindings === 0) return <span className="text-[var(--text-4)]">0</span>;
  return (
    <Link href={`/app/pulse/${project.latestCompletedScanId}?tab=findings`} className="font-semibold text-[var(--danger-500)] hover:underline">
      {project.urgentFindings}
    </Link>
  );
}

function findingsLine(p: PulseProject): string {
  if (p.openFindings === null) return "findings not counted";
  if (p.openFindings === 0) return "no open findings";
  return `${p.openFindings} open${p.urgentFindings ? `, ${p.urgentFindings} urgent` : ""}`;
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
  const [filters, setFiltersState] = useState<ProjectFilters>(DEFAULT_PROJECT_FILTERS);
  const [sort, setSortState] = useState(DEFAULT_PROJECT_SORT);
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = usePulseProjects();
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const matching = useMemo(() => sortProjectsBy(filterProjects(projects, filters), sort.key, sort.dir), [projects, filters, sort]);
  // Any change to what is shown starts again at page one, so a filter never lands on an empty page.
  const setFilters = (patch: Partial<ProjectFilters>) => { setFiltersState((f) => ({ ...f, ...patch })); setPage(0); };
  const setSort = (key: ProjectSortKey) => {
    setSortState((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: SORT_START[key] }));
    setPage(0);
  };
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = matching.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) if (p.clientId) m.set(p.clientId, p.clientName ?? "Unnamed client");
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);
  const kinds = useMemo(() => new Set(projects.map(projectKind)), [projects]);
  const filtered = filters.query.trim() !== "" || filters.status !== "all" || filters.kind !== "all" || filters.client !== "all";
  const needing = projects.filter((p) => p.attention.length > 0).length;
  const urgent = projects.reduce((n, p) => n + (p.urgentFindings ?? 0), 0);
  const counted = projects.some((p) => p.urgentFindings !== null);
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
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">01 // ALL SCANS</span>
          {toggle}
        </div>
        <div className="widget-body">{allScans}</div>
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
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <Stat label="Projects" value={String(projects.length)} note={`${projects.reduce((n, p) => n + p.scanCount, 0)} scans in all`} />
                <Stat label="Average health" value={avg === null ? "—" : String(avg)} note="latest score, each project once" tone={avg === null ? undefined : avg >= 75 ? "good" : avg >= 50 ? "watch" : "bad"} />
                <Stat
                  label="Need a look"
                  value={String(needing)}
                  note={needing ? "failed, falling, stale or urgent" : "nothing stands out"}
                  tone={needing ? "bad" : "good"}
                  onClick={needing ? () => setFilters({ status: filters.status === "attention" ? "all" : "attention" }) : undefined}
                  pressed={filters.status === "attention"}
                />
                <Stat
                  label="Urgent findings"
                  value={counted ? String(urgent) : "—"}
                  note="ranked P1, still open"
                  tone={!counted ? undefined : urgent ? "bad" : "good"}
                  onClick={urgent ? () => setFilters({ status: filters.status === "urgent" ? "all" : "urgent" }) : undefined}
                  pressed={filters.status === "urgent"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setFilters({ query: e.target.value })}
                  placeholder="Search projects, sites, repos or clients"
                  aria-label="Search projects"
                  className="app-input min-w-[220px] flex-1 basis-full text-base sm:w-auto sm:basis-auto sm:text-sm"
                />
                <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value as ProjectStatusFilter })} aria-label="Filter by status" className="app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:w-auto sm:flex-none sm:basis-auto sm:text-sm">
                  <option value="all">Any status</option>
                  <option value="attention">Needs a look</option>
                  <option value="urgent">Has urgent findings</option>
                  <option value="on_track">On track</option>
                  <option value="failed">Last scan failed</option>
                </select>
                {kinds.size > 1 && (
                  <select value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value as ProjectFilters["kind"] })} aria-label="Filter by type" className="app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:w-auto sm:flex-none sm:basis-auto sm:text-sm">
                    <option value="all">Any type</option>
                    {kinds.has("website") && <option value="website">Websites</option>}
                    {kinds.has("repo") && <option value="repo">Repositories</option>}
                    {kinds.has("store") && <option value="store">Store listings</option>}
                    {kinds.has("description") && <option value="description">Descriptions</option>}
                  </select>
                )}
                {clients.length > 0 && (
                  <select value={filters.client} onChange={(e) => setFilters({ client: e.target.value })} aria-label="Filter by client" className="app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:max-w-[220px] sm:w-auto sm:flex-none sm:basis-auto sm:text-sm">
                    <option value="all">Any client</option>
                    {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    <option value="none">No client</option>
                  </select>
                )}
                {/* Phones have no column headers to click, so the sort is a control of its own. */}
                <select
                  value={`${sort.key}:${sort.dir}`}
                  onChange={(e) => { const [key, dir] = e.target.value.split(":") as [ProjectSortKey, SortDir]; setSortState({ key, dir }); setPage(0); }}
                  aria-label="Sort projects"
                  className="app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:hidden"
                >
                  <option value="lastChecked:desc">Newest first</option>
                  <option value="lastChecked:asc">Oldest first</option>
                  <option value="score:asc">Lowest score</option>
                  <option value="score:desc">Highest score</option>
                  <option value="urgent:desc">Most urgent findings</option>
                  <option value="open:desc">Most open findings</option>
                  <option value="name:asc">Name A to Z</option>
                </select>
                {filtered && (
                  <button type="button" onClick={() => { setFiltersState(DEFAULT_PROJECT_FILTERS); setPage(0); }} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
              {filtered && projects.length > 0 && (
                <p className="text-xs text-[var(--text-3)]">{matching.length} of {projects.length} projects match.</p>
              )}
              {shown.length === 0 ? (
                <p className="text-sm text-[var(--text-3)]">{projects.length === 0 ? "No scans yet. Run one with New scan." : "No project matches these filters."}</p>
              ) : (
                <>
                  {/* Phones: one card per project, so the score and what needs doing are never
                      off the side of a scrolling table (the column people came for). */}
                  <ul className="divide-y divide-[var(--border-2)] sm:hidden">
                    {shown.map((p) => (
                      <li key={p.key} className="py-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <Link href={`/app/pulse/projects/${p.slug}`} className="block truncate text-sm font-medium text-[var(--brand-600)] hover:underline" title={p.target}>
                              {p.name}
                            </Link>
                            <span className="block truncate text-[11px] text-[var(--text-4)]" title={p.target}>
                              {[p.clientName, p.target].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                          <span className={cn("shrink-0 font-serif text-2xl font-bold leading-none tabular-nums", scoreClass(p.latestScore))}>{p.latestScore ?? "—"}</span>
                        </div>
                        <p className="mt-1.5"><Needs project={p} /></p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-3)]">
                          <Change project={p} />
                          <span>{findingsLine(p)}</span>
                          <span>checked {shortDate(p.lastScannedAt)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="app-table app-table--dense min-w-[760px]">
                      <thead>
                        <tr>
                          <SortHeader label="Project" k="name" sort={sort} onSort={setSort} />
                          <th className="text-left">Needs</th>
                          <SortHeader label="Score" k="score" sort={sort} onSort={setSort} align="right" />
                          <SortHeader label="Since last check" k="change" sort={sort} onSort={setSort} />
                          <SortHeader label="Urgent" k="urgent" sort={sort} onSort={setSort} align="right" title="Open findings the Findings tab ranks P1" />
                          <SortHeader label="Open" k="open" sort={sort} onSort={setSort} align="right" title="Failing or warning checks on the latest scan that nobody has sent to the board, fixed or dismissed" />
                          <SortHeader label="Last checked" k="lastChecked" sort={sort} onSort={setSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((p) => (
                          <tr key={p.key}>
                            <td className="max-w-[280px]">
                              <Link href={`/app/pulse/projects/${p.slug}`} className="block truncate text-sm font-medium text-[var(--brand-600)] hover:underline" title={p.target}>
                                {p.name}
                              </Link>
                              <span className="block truncate text-[11px] text-[var(--text-4)]" title={p.target}>
                                {[p.clientName, p.target].filter(Boolean).join(" · ")}
                              </span>
                            </td>
                            <td className="min-w-[170px]"><Needs project={p} /></td>
                            <td className={cn("text-right font-serif text-lg font-bold tabular-nums", scoreClass(p.latestScore))}>{p.latestScore ?? "—"}</td>
                            <td><Change project={p} /></td>
                            <td className="text-right text-xs tabular-nums"><UrgentFindings project={p} /></td>
                            <td className="text-right text-xs tabular-nums"><OpenFindings project={p} /></td>
                            <td className="whitespace-nowrap text-xs text-[var(--text-3)]" title={`${p.scanCount} ${p.scanCount === 1 ? "scan" : "scans"} of this project`}>{shortDate(p.lastScannedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={current} pageSize={PAGE_SIZE} total={matching.length} onPage={setPage} label="Project pages" />
                </>
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
  if (!from || !to) return <ComparePicker />;
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

/**
 * The Compare tab with nothing chosen yet. It used to say "pick two scans from a project's page"
 * and stop, a tab that sent you somewhere else. It now offers the comparison almost everyone
 * wants (each project's latest scan against the one before), and the project page for any other pair.
 */
function ComparePicker() {
  const { data, isLoading, error } = usePulseProjects();
  const comparable = (data?.projects ?? []).filter((p) => p.history.length >= 2);
  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">01 // PICK A PROJECT</span>
        {data && <span className="widget-header-right">{comparable.length} with two or more scans</span>}
      </div>
      <div className="widget-body space-y-3">
        <p className="text-sm text-[var(--text-3)]">
          Compare a project&apos;s latest scan with the one before it. To compare any other two, open the project and pick them.
        </p>
        {isLoading && <p className="text-sm text-[var(--text-3)]">Loading projects…</p>}
        {error && <p className="text-sm text-[var(--danger-700)]">Projects could not be loaded.</p>}
        {data && comparable.length === 0 && (
          <p className="text-sm text-[var(--text-3)]">No project has two completed scans yet. Scan one again to see what changed.</p>
        )}
        {comparable.length > 0 && (
          <ul className="divide-y divide-[var(--border-2)]">
            {comparable.map((p) => {
              const last = p.history[p.history.length - 1];
              const prev = p.history[p.history.length - 2];
              const by = last.score - prev.score;
              return (
                <li key={p.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <p className="truncate text-sm font-medium text-[var(--text-1)]" title={p.target}>{p.name}</p>
                    <p className="truncate text-[11px] text-[var(--text-4)]">
                      {shortDate(prev.at)} ({prev.score}) to {shortDate(last.at)} ({last.score})
                      {by !== 0 && <span className={by > 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]"}> · {by > 0 ? "up" : "down"} {Math.abs(by)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <Link href={`/app/pulse/projects/${p.slug}`} className="text-[var(--text-3)] hover:text-[var(--brand-600)] hover:underline">Other scans</Link>
                    <Link href={`/app/pulse/compare?from=${prev.scanId}&to=${last.scanId}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      What changed
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
