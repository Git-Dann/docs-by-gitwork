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
import { debtImpact, libraryImpact, productArea } from "@/lib/plain-words";

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
  /** The part of the product it is in ("payments"…), for grouping a plan into themes. */
  area?: string | null;
  /** In one of the most-changed files (hotspot score ≥ 0.5). */
  hot?: boolean;
  /** The file it is in, for grouping several findings in one file into one step. */
  file?: string | null;
}

/** Severity weights. Published here so the ranking can be argued with. */
export const DEBT_WEIGHT: Record<DebtSeverity, number> = { moderate: 3, high: 8, very_high: 15 };
/**
 * How much each kind of debt matters, relative to a complex function. A long parameter list
 * is cheap to fix, so on value per day it would otherwise jump the queue ahead of the
 * tangled code that actually causes bugs (seen on a real app's plan).
 */
export const KIND_WEIGHT: Record<DebtItem["kind"], number> = {
  complex_function: 1,
  long_function: 0.8,
  large_class: 0.9,
  deep_nesting: 0.7,
  large_file: 0.5,
  long_parameter_list: 0.3,
};
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

/**
 * The files that count as "most changed": the top three hotspots that changed at least three
 * times. Relative on purpose: hotspot scores are relative to the repo's own maximum, and on a
 * quiet repo (69 commits a year on a real client app) none reaches a fixed cut-off, so a fixed
 * threshold found no hotspots at all.
 */
export function mostChangedFiles(report: Pick<CodeHealthReport, "history">): Set<string> {
  return new Set((report.history?.hotspots ?? []).filter((h) => h.changes >= 3).slice(0, 3).map((h) => h.path));
}

function hotspotScores(report: CodeHealthReport): Map<string, number> {
  return new Map((report.history?.hotspots ?? []).map((h) => [h.path, h.score]));
}

function debtTitle(d: DebtItem): string {
  const area = productArea(d.path);
  const inArea = area ? ` in ${area}` : "";
  switch (d.kind) {
    case "complex_function": return `Simplify ${d.symbol}${inArea}`;
    case "long_function": return `Break up ${d.symbol}${inArea}`;
    case "long_parameter_list": return `Make ${d.symbol} harder to call the wrong way${inArea}`;
    case "deep_nesting": return `Untangle the logic in ${d.symbol}${inArea}`;
    case "large_class": return `Split ${d.symbol} into smaller parts${inArea}`;
    case "large_file": return `Split ${d.path.split("/").pop()} into smaller files${inArea}`;
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
      // The consequence first, then the evidence, so a non-developer reads the part they need.
      why: `It ${libraryImpact(p)}. ${p.advisories.length} published ${p.advisories.length === 1 ? "warning" : "warnings"}, worst ${p.severity}: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}.`,
      path: p.lockfile,
      // A direct upgrade is a version bump and a test run; a transitive one usually means
      // upgrading or overriding the package that pulls it in.
      days: p.direct === false ? 0.5 : 0.25,
      value: VULN_WEIGHT[p.severity] * Math.max(1, Math.min(3, p.advisories.length)) ** 0.5,
      lane: "security",
    });
  }

  const hot = hotspotScores(report);
  const top = mostChangedFiles(report);

  for (const c of report.structure?.cycles ?? []) {
    const churn = Math.max(...c.files.map((f) => hot.get(f) ?? 0));
    items.push({
      id: `cycle:${c.files.join("|")}`,
      repo,
      kind: "dependency_cycle",
      title: `Untangle ${c.files.length} files that depend on each other in a loop`,
      why: `These files depend on each other in a loop (${c.path.map((p) => p.split("/").pop()).join(" → ")}), so a change to one can break the others and none can be tested on its own.`,
      path: c.files[0] ?? null,
      // Breaking a loop means cutting a few imports, not rewriting every file in it, so the
      // effort grows slowly with its size (a 181-file loop is days of work, not 45).
      days: Math.min(5, Math.max(0.5, Math.round((0.5 + c.files.length * 0.025) * 4) / 4)),
      area: productArea(c.files[0] ?? ""),
      hot: c.files.some((f) => top.has(f)),
      file: c.files[0] ?? null,
      value: (6 + 2 * c.files.length) * churnMultiplier(hot.size ? churn : null),
      lane: "change_risk",
    });
  }

  for (const h of report.structure?.hubs ?? []) {
    items.push({
      id: `hub:${h.path}`,
      repo,
      kind: "hub_module",
      title: `Make ${h.path.split("/").pop()} safer to change`,
      why: `${h.fanIn} other files depend on it and it is complicated, so every change to it can ripple out and break something far away.`,
      path: h.path,
      area: productArea(h.path),
      hot: top.has(h.path),
      file: h.path,
      days: Math.min(5, Math.max(1, Math.round(h.complexity / 40))),
      // Valued by how complicated it is, not how popular: popularity alone is good design.
      value: Math.min(20, h.complexity / 10) * churnMultiplier(hot.size ? hot.get(h.path) ?? 0 : null),
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
      why: debtImpact(d, top.has(d.path)),
      path: `${d.path}:${d.line}`,
      days,
      area: productArea(d.path),
      hot: top.has(d.path),
      file: d.path,
      value: DEBT_WEIGHT[d.severity] * KIND_WEIGHT[d.kind] * churnMultiplier(score),
      lane: top.has(d.path) ? "change_risk" : "maintainability",
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
  /** Why it needs attention, in words, and how urgently (0 = most). The portfolio sorts by this. */
  urgency: { rank: number; reason: string };
}

/**
 * How urgently a repository needs attention, and why. A score alone ranks a tidy repo with
 * a critical security hole below a messy one without: the order here is the order a person
 * would act in. Security, then getting worse, then one-person knowledge, then condition.
 */
export function urgencyOf(r: Omit<PortfolioRepo, "urgency">): PortfolioRepo["urgency"] {
  const serious = r.vulnerable ? r.vulnerable.critical + r.vulnerable.high : 0;
  if (serious > 0) return { rank: 0, reason: `${serious} serious security ${serious === 1 ? "hole" : "holes"}` };
  const last = r.history.length >= 2 ? r.history[r.history.length - 1].score - r.history[r.history.length - 2].score : 0;
  if (last < 0) return { rank: 1, reason: `Getting worse (down ${-last})` };
  if (r.knowledgeRisk) return { rank: 2, reason: "Only one person really knows it" };
  if (r.band === "poor") return { rank: 3, reason: "Hard to change safely" };
  if ((r.cycles ?? 0) > 0 || r.band === "fair") return { rank: 4, reason: "Some areas slow work down" };
  if (!r.vulnerable) return { rank: 5, reason: "Libraries not checked yet: scan it again" };
  return { rank: 6, reason: "In good shape" };
}

export function summariseRepo(
  report: CodeHealthReport,
  meta: { scanId: string; projectName: string; clientName: string | null; history: { at: string; score: number }[] },
): PortfolioRepo {
  const deps = report.dependencies;
  const base: Omit<PortfolioRepo, "urgency"> = {
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
  return { ...base, urgency: urgencyOf(base) };
}

/** Most urgent first; within the same urgency, the lower score first. */
export function byUrgency(a: PortfolioRepo, b: PortfolioRepo): number {
  return a.urgency.rank - b.urgency.rank || a.score - b.score || a.repo.localeCompare(b.repo);
}
