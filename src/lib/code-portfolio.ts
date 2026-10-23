/**
 * The code portfolio: every repository Pulse has measured, side by side, and a plan for
 * where the next N developer-days do the most good across all of them.
 *
 * Pure and framework-free, so the server builds the work items once and the browser
 * re-plans instantly as the days slider moves. Nothing here is AI: every item comes from
 * a measurement in the code-health report (the register, the import graph, the lockfile
 * audit, the git history), and every number in the plan can be traced back to one.
 */

import type {
  CodeHealthReport,
  DebtItem,
  DebtSeverity,
  VulnerabilitySeverity,
} from "@/types/code-health";

/** Working hours in a developer-day, matching the register's effort estimate (rules.ts). */
export const PLAN_HOURS_PER_DAY = 6;

export type WorkKind = "vulnerable_dependency" | "dependency_cycle" | "hub_module" | "debt";

export interface WorkItem {
  /** Stable within a repo, so a plan can be diffed and keyed in React. */
  id: string;
  repo: string;
  kind: WorkKind;
  /** What to do, in a sentence a developer can act on. */
  title: string;
  /** Why it is here: the measurement behind it. */
  why: string;
  path: string | null;
  /** Developer-days to do it, tests included. */
  days: number;
  /** Risk removed by doing it, in arbitrary but consistent points. Higher is worse left alone. */
  value: number;
  /** "security" sorts above everything else at equal value per day: a known exploit is not a style issue. */
  lane: "security" | "change_risk" | "maintainability";
}

/** Severity weights. Published here so the ranking can be argued with. */
export const DEBT_WEIGHT: Record<DebtSeverity, number> = { moderate: 3, high: 8, very_high: 15 };
export const VULN_WEIGHT: Record<VulnerabilitySeverity, number> = { critical: 100, high: 60, moderate: 20, low: 5, unknown: 10 };

/**
 * Debt in a file that changes all the time costs more than the same debt in a file nobody
 * touches, so hotspot score (0–1, from git history) multiplies the weight up to 4×. With no
 * history the multiplier is 1: unknown churn is treated as ordinary, never as zero.
 */
export function churnMultiplier(hotspotScore: number | null | undefined): number {
  if (hotspotScore == null) return 1;
  return 1 + 3 * Math.max(0, Math.min(1, hotspotScore));
}

function hotspotScores(report: CodeHealthReport): Map<string, number> {
  return new Map((report.history?.hotspots ?? []).map((h) => [h.path, h.score]));
}

function debtTitle(d: DebtItem): string {
  switch (d.kind) {
    case "complex_function": return `Split ${d.symbol} (${d.metrics.complexity ?? "?"} paths through it)`;
    case "long_function": return `Break up ${d.symbol} (${d.metrics.loc ?? "?"} lines)`;
    case "long_parameter_list": return `Group the parameters of ${d.symbol} (${d.metrics.params ?? "?"})`;
    case "deep_nesting": return `Flatten ${d.symbol} (nested ${d.metrics.nesting ?? d.metrics.maxNesting ?? "?"} deep)`;
    case "large_class": return `Separate the jobs in ${d.symbol}`;
    case "large_file": return `Split ${d.path.split("/").pop()} (${d.metrics.loc ?? "?"} lines)`;
  }
}

/** Every piece of work the report supports, valued. Older reports simply yield fewer kinds. */
export function workItemsFor(report: CodeHealthReport): WorkItem[] {
  const repo = report.repo;
  const items: WorkItem[] = [];

  for (const p of report.dependencies?.status === "checked" ? report.dependencies.vulnerable : []) {
    const fixed = p.advisories.map((a) => a.fixedIn).filter((v): v is string => !!v).sort(compareVersions).pop();
    const ids = p.advisories.map((a) => a.aliases.find((x) => x.startsWith("CVE-")) ?? a.id);
    items.push({
      id: `vuln:${p.ecosystem}:${p.name}@${p.version}`,
      repo,
      kind: "vulnerable_dependency",
      title: fixed ? `Upgrade ${p.name} ${p.version} → ${fixed}` : `Replace or patch ${p.name} ${p.version} (no fixed version published)`,
      why: `${p.advisories.length} known ${p.advisories.length === 1 ? "vulnerability" : "vulnerabilities"}, worst ${p.severity}: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}. ${p.direct === false ? "Pulled in by another package." : p.direct ? "Declared by the project." : ""}`.trim(),
      path: p.lockfile,
      // A direct upgrade is a version bump and a test run; a transitive one usually means
      // upgrading or overriding the package that pulls it in.
      days: p.direct === false ? 0.5 : 0.25,
      value: VULN_WEIGHT[p.severity] * Math.max(1, Math.min(3, p.advisories.length)) ** 0.5,
      lane: "security",
    });
  }

  const hot = hotspotScores(report);

  for (const c of report.structure?.cycles ?? []) {
    const churn = Math.max(...c.files.map((f) => hot.get(f) ?? 0));
    items.push({
      id: `cycle:${c.files.join("|")}`,
      repo,
      kind: "dependency_cycle",
      title: `Break the import cycle between ${c.files.length} files`,
      why: `${c.path.map((p) => p.split("/").pop()).join(" → ")}. Files in a cycle cannot be changed, tested or reused on their own.`,
      path: c.files[0] ?? null,
      days: Math.max(0.5, Math.round(c.files.length * 0.25 * 4) / 4),
      value: (6 + 2 * c.files.length) * churnMultiplier(hot.size ? churn : null),
      lane: "change_risk",
    });
  }

  for (const h of report.structure?.hubs ?? []) {
    items.push({
      id: `hub:${h.path}`,
      repo,
      kind: "hub_module",
      title: `Put a stable interface in front of ${h.path.split("/").pop()}`,
      why: `${h.fanIn} files depend on it and its functions add up to a complexity of ${h.complexity}, so every change to it ripples.`,
      path: h.path,
      days: Math.min(5, Math.max(1, Math.round(h.complexity / 40))),
      value: Math.min(40, 4 + h.fanIn / 2) * churnMultiplier(hot.size ? hot.get(h.path) ?? 0 : null),
      lane: "change_risk",
    });
  }

  for (const d of report.debt) {
    const days = Math.max(0.25, Math.round(((d.effortHours ?? 3) / PLAN_HOURS_PER_DAY) * 4) / 4);
    const score = hot.size ? hot.get(d.path) ?? 0 : null;
    items.push({
      id: `debt:${d.kind}:${d.path}:${d.line}:${d.symbol}`,
      repo,
      kind: "debt",
      title: debtTitle(d),
      why: d.reason + (score != null && score >= 0.5 ? " It is in one of the most-changed files in the repository." : ""),
      path: `${d.path}:${d.line}`,
      days,
      value: DEBT_WEIGHT[d.severity] * churnMultiplier(score),
      lane: score != null && score >= 0.5 ? "change_risk" : "maintainability",
    });
  }

  return items;
}

/** Loose semver-ish ordering, good enough to pick the highest "fixed in" among advisories. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.+-]/);
  const pb = b.replace(/^v/, "").split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const LANE_ORDER = { security: 0, change_risk: 1, maintainability: 2 } as const;

export interface PortfolioPlan {
  budgetDays: number;
  usedDays: number;
  chosen: WorkItem[];
  /** Days per repository in the plan, largest first. */
  byRepo: { repo: string; days: number; items: number }[];
  /** Share of all measured risk the plan removes (0–1). */
  riskRemovedShare: number;
  /** Security items that did not fit the budget. Never silently dropped. */
  securityLeftOut: number;
}

/**
 * Fill the budget with the work that removes the most risk per day. Security items go
 * first regardless of value per day (a known exploit outranks any refactor), then
 * everything else by value per day. An item that does not fit is skipped and smaller
 * ones are still tried, so a half-day budget is not wasted on one three-day refactor.
 */
export function planPortfolio(items: WorkItem[], budgetDays: number): PortfolioPlan {
  const budget = Math.max(0, budgetDays);
  const ranked = [...items].sort((a, b) => {
    const lane = (a.lane === "security" ? 0 : 1) - (b.lane === "security" ? 0 : 1);
    if (lane) return lane;
    const d = b.value / b.days - a.value / a.days;
    if (Math.abs(d) > 1e-9) return d;
    return LANE_ORDER[a.lane] - LANE_ORDER[b.lane] || a.id.localeCompare(b.id);
  });
  const chosen: WorkItem[] = [];
  let used = 0;
  for (const it of ranked) {
    if (used + it.days <= budget + 1e-9) {
      chosen.push(it);
      used += it.days;
    }
  }
  const total = items.reduce((s, i) => s + i.value, 0);
  const removed = chosen.reduce((s, i) => s + i.value, 0);
  const byRepoMap = new Map<string, { days: number; items: number }>();
  for (const c of chosen) {
    const r = byRepoMap.get(c.repo) ?? { days: 0, items: 0 };
    r.days += c.days;
    r.items++;
    byRepoMap.set(c.repo, r);
  }
  const chosenIds = new Set(chosen.map((c) => c.id + c.repo));
  return {
    budgetDays: budget,
    usedDays: Math.round(used * 100) / 100,
    chosen,
    byRepo: [...byRepoMap.entries()].map(([repo, v]) => ({ repo, ...v })).sort((a, b) => b.days - a.days || a.repo.localeCompare(b.repo)),
    riskRemovedShare: total ? removed / total : 0,
    securityLeftOut: items.filter((i) => i.lane === "security" && !chosenIds.has(i.id + i.repo)).length,
  };
}

/** One repository's line in the portfolio table. */
export interface PortfolioRepo {
  repo: string;
  scanId: string;
  projectName: string;
  clientName: string | null;
  measuredAt: string;
  commit: string | null;
  score: number;
  band: CodeHealthReport["band"];
  /** Code-health score on each measured scan, oldest first (sparkline). */
  history: { at: string; score: number }[];
  loc: number;
  primaryLanguage: string | null;
  debtDays: number | null;
  busFactor: number | null;
  cycles: number | null;
  hubs: number | null;
  vulnerable: { critical: number; high: number; other: number } | null;
  /** Why a column is empty: "not measured on this scan" vs a lookup that failed. */
  dependencyNote: string | null;
  /** Below this, a repo is one resignation from nobody understanding it. */
  knowledgeRisk: boolean;
}

export function summariseRepo(
  report: CodeHealthReport,
  meta: { scanId: string; projectName: string; clientName: string | null; history: { at: string; score: number }[] },
): PortfolioRepo {
  const deps = report.dependencies;
  return {
    repo: report.repo,
    scanId: meta.scanId,
    projectName: meta.projectName,
    clientName: meta.clientName,
    measuredAt: report.measuredAt,
    commit: report.commit,
    score: report.score,
    band: report.band,
    history: meta.history,
    loc: report.totals.loc,
    primaryLanguage: report.languages[0]?.language ?? null,
    debtDays: report.effort?.days ?? null,
    busFactor: report.history?.busFactor ?? null,
    cycles: report.structure ? report.structure.cycleCount : null,
    hubs: report.structure ? report.structure.hubs.length : null,
    vulnerable: deps?.status === "checked"
      ? { critical: deps.counts.critical, high: deps.counts.high, other: deps.counts.moderate + deps.counts.low + deps.counts.unknown }
      : null,
    dependencyNote: deps == null ? "Not checked on this scan. Re-scan to check libraries." : deps.status === "checked" ? null : deps.reason,
    knowledgeRisk: report.history?.busFactor === 1 && report.totals.loc >= 2_000,
  };
}
