/**
 * The All scans list: filter and sort, pure so they can be tested. The same shape as the
 * Projects list (src/lib/pulse-projects.ts): opens newest first, one sorted column at a
 * time, rows with no value sort last in both directions.
 */

import type { PulseScanListItem, PulseScanStatus } from "@/types/pulse";
import { projectKind, targetKey, type ProjectKind, type SortDir } from "@/lib/pulse-projects";

export type ScanHealth = "all" | "good" | "fair" | "poor";
export type ScanMovement = "all" | "improved" | "regressed";
export type ScanMonitoring = "all" | "monitored" | "alerting";

export interface ScanFilters {
  query: string;
  status: PulseScanStatus | "all";
  health: ScanHealth;
  kind: ProjectKind | "all";
  movement: ScanMovement;
  monitoring: ScanMonitoring;
}

export const DEFAULT_SCAN_FILTERS: ScanFilters = { query: "", status: "all", health: "all", kind: "all", movement: "all", monitoring: "all" };

export function scanKind(s: PulseScanListItem): ProjectKind {
  return projectKind({ inputType: s.inputType, target: s.inputGithubRepo ?? s.inputUrl ?? s.projectName });
}

/** Same bands as the score pill and the report: 75 and up good, 50 to 74 fair, below 50 poor. */
export function scanHealth(score: number | null): Exclude<ScanHealth, "all"> | null {
  if (score === null) return null;
  return score >= 75 ? "good" : score >= 50 ? "fair" : "poor";
}

/**
 * Each completed scan's change against the previous completed scan of the same project,
 * matched with the shared `targetKey` rule. A first scan has no change (null).
 */
export function scanChanges(scans: PulseScanListItem[]): Map<string, number | null> {
  const byTarget = new Map<string, PulseScanListItem[]>();
  for (const s of scans) byTarget.set(targetKey(s), [...(byTarget.get(targetKey(s)) ?? []), s]);
  const out = new Map<string, number | null>();
  for (const list of byTarget.values()) {
    const done = list
      .filter((s) => s.status === "COMPLETED" && s.healthScore !== null)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    done.forEach((s, i) => out.set(s.id, i === 0 ? null : (s.healthScore as number) - (done[i - 1].healthScore as number)));
  }
  return out;
}

export function filterScans(
  scans: PulseScanListItem[],
  f: ScanFilters,
  ctx: { changes: Map<string, number | null>; monitorOf: (s: PulseScanListItem) => { active: boolean; alerting: boolean } | undefined },
): PulseScanListItem[] {
  const q = f.query.trim().toLowerCase();
  return scans.filter((s) => {
    if (q && ![s.projectName, s.inputUrl, s.inputGithubRepo, s.clientName].some((v) => v?.toLowerCase().includes(q))) return false;
    if (f.status !== "all" && s.status !== f.status) return false;
    if (f.health !== "all" && scanHealth(s.healthScore) !== f.health) return false;
    if (f.kind !== "all" && scanKind(s) !== f.kind) return false;
    if (f.movement !== "all") {
      const d = ctx.changes.get(s.id) ?? null;
      if (d === null || (f.movement === "improved" ? d <= 0 : d >= 0)) return false;
    }
    if (f.monitoring !== "all") {
      const m = ctx.monitorOf(s);
      if (f.monitoring === "monitored" ? !m?.active : !m?.alerting) return false;
    }
    return true;
  });
}

export type ScanSortKey = "name" | "score" | "change" | "scanned";
export const SCAN_SORT_START: Record<ScanSortKey, SortDir> = { name: "asc", score: "desc", change: "desc", scanned: "desc" };
export const DEFAULT_SCAN_SORT: { key: ScanSortKey; dir: SortDir } = { key: "scanned", dir: "desc" };

export function sortScansBy(scans: PulseScanListItem[], key: ScanSortKey, dir: SortDir, changes: Map<string, number | null>): PulseScanListItem[] {
  const val = (s: PulseScanListItem): number | string | null => {
    switch (key) {
      case "name": return s.projectName.toLowerCase();
      case "score": return s.healthScore;
      case "change": return changes.get(s.id) ?? null;
      case "scanned": return Date.parse(s.createdAt);
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...scans].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      if (c !== 0) return c * sign;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
