/**
 * Pulse projects: every scan of the same website, repository or store listing grouped into
 * one project with a history, so the home screen can answer "how is this going?" rather
 * than listing scans. Pure, so the server, the demo and the tests share one definition.
 *
 * A "project" is a target, not a name: two scans are the same project when they look at
 * the same thing (`targetKey`). Names change; the URL or repo is what was measured.
 */

import type { PulseScanListItem } from "@/types/pulse";
import { detectStoreTarget } from "@/lib/pulse-store-url";

/**
 * One key for "the same thing", used everywhere scans are matched (list, history, diff,
 * portfolio). Before this the list lower-cased and trimmed while history and diff matched
 * the raw string exactly, so `Example.com/` and `example.com` were one project on the home
 * screen and two in the history.
 */
export function targetKey(scan: { inputUrl: string | null; inputGithubRepo: string | null; projectName: string }): string {
  if (scan.inputGithubRepo) {
    return `repo:${scan.inputGithubRepo.trim().toLowerCase().replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "")}`;
  }
  if (scan.inputUrl) {
    const raw = scan.inputUrl.trim().toLowerCase();
    let host = raw;
    let path = "";
    try {
      const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
      host = u.hostname.replace(/^www\./, "");
      // Store listings are identified by their path (one host, many apps); websites by host + path.
      path = u.pathname.replace(/\/+$/, "");
    } catch {
      /* keep the raw string */
    }
    return `url:${host}${path}`;
  }
  return `name:${scan.projectName.trim().toLowerCase()}`;
}

/** A target key in a URL path segment, and back. Plain URL-encoding: runs in the browser too. */
export function encodeTargetKey(key: string): string {
  return encodeURIComponent(key);
}
export function decodeTargetKey(encoded: string): string | null {
  try {
    const key = decodeURIComponent(encoded);
    return /^(repo|url|name):/.test(key) ? key : null;
  } catch {
    return null;
  }
}

export interface ProjectPoint {
  scanId: string;
  at: string;
  score: number;
}

export interface PulseProject {
  key: string;
  /** URL-safe form of `key`, for the project page link. */
  slug: string;
  name: string;
  target: string;
  inputType: PulseScanListItem["inputType"];
  clientId: string | null;
  clientName: string | null;
  latestScanId: string;
  latestStatus: PulseScanListItem["status"];
  latestScore: number | null;
  /** The newest COMPLETED scan, the one the score and the open findings come from. */
  latestCompletedScanId: string | null;
  /**
   * Open findings on that scan, counted with the Findings tab's own rule
   * (src/lib/pulse-findings.ts). Null until the server (or demo) has counted them,
   * and when there is no completed scan.
   */
  openFindings: number | null;
  /** Of those, how many the Findings tab ranks P1. Null until counted. */
  urgentFindings: number | null;
  lastScannedAt: string;
  /** Completed scores, oldest first, with dates and links. */
  history: ProjectPoint[];
  /** Change on the latest completed scan against the one before it. Null with one scan. */
  change: { by: number; since: string } | null;
  scanCount: number;
  running: boolean;
  /** Why it needs looking at, in plain words, most important first. Empty when it is fine. */
  attention: string[];
  /** 0 = most urgent. The home screen sorts by this. */
  rank: number;
}

/** A fall this big since the last scan needs a look, whatever the score. */
export const DROP_ALERT = 5;
/** Not checked for this long and it is going stale. */
export const STALE_DAYS = 60;

const DAY = 86_400_000;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Group scans into projects and say which need attention. `now` is passed in so the
 * "not checked since" rule is testable.
 */
export function buildProjects(scans: PulseScanListItem[], now: number = Date.now()): PulseProject[] {
  const groups = new Map<string, PulseScanListItem[]>();
  for (const s of scans) {
    const k = targetKey(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  const projects: PulseProject[] = [];
  for (const [key, list] of groups) {
    const byDate = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const latest = byDate[byDate.length - 1];
    const history = byDate
      .filter((s) => s.status === "COMPLETED" && s.healthScore !== null)
      .map((s) => ({ scanId: s.id, at: s.createdAt, score: s.healthScore as number }));
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const change = last && prev ? { by: last.score - prev.score, since: prev.at } : null;

    const attention: string[] = [];
    let rank = 9;
    if (latest.status === "FAILED") {
      attention.push("The last scan failed to run");
      rank = Math.min(rank, 1);
    }
    if (change && change.by <= -DROP_ALERT) {
      attention.push(`Fell ${-change.by} points since ${fmtDate(change.since)}`);
      rank = Math.min(rank, 0);
    }
    if (last && last.score < 50) {
      attention.push("Score below 50");
      rank = Math.min(rank, 2);
    }
    if (last && now - Date.parse(last.at) > STALE_DAYS * DAY) {
      attention.push(`Not checked since ${fmtDate(last.at)}`);
      rank = Math.min(rank, 4);
    }
    if (rank === 9 && last && last.score < 75) rank = 5;
    if (rank === 9) rank = 6;

    projects.push({
      key,
      slug: encodeTargetKey(key),
      name: latest.projectName,
      target: latest.inputGithubRepo ?? latest.inputUrl ?? latest.projectName,
      inputType: latest.inputType,
      clientId: latest.clientId,
      clientName: latest.clientName,
      latestScanId: latest.id,
      latestStatus: latest.status,
      latestScore: last?.score ?? null,
      latestCompletedScanId: last?.scanId ?? null,
      openFindings: null,
      urgentFindings: null,
      lastScannedAt: latest.createdAt,
      history: history.slice(-24),
      change,
      scanCount: list.length,
      running: list.some((s) => s.status === "RUNNING"),
      attention,
      rank,
    });
  }

  // Most urgent first; within the same urgency, lowest score, then most recently scanned.
  return projects.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.latestScore ?? 101) - (b.latestScore ?? 101) ||
      Date.parse(b.lastScannedAt) - Date.parse(a.lastScannedAt),
  );
}

/**
 * Attach a project's open and urgent finding counts, and let urgent findings decide whether it
 * needs a look. Without this a project read "On track" in the list while its scan page led
 * with P1 findings. Shared by the server and the demo so both say the same thing.
 */
export function applyFindingCounts(project: PulseProject, counts: { open: number; urgent: number } | null): PulseProject {
  if (!counts) return { ...project, openFindings: null, urgentFindings: null };
  const out: PulseProject = { ...project, openFindings: counts.open, urgentFindings: counts.urgent };
  if (counts.urgent > 0) {
    out.attention = [...project.attention, `${counts.urgent} urgent ${counts.urgent === 1 ? "finding" : "findings"}`];
    out.rank = Math.min(project.rank, 3);
  }
  return out;
}

/** Re-sort after counts are attached: the same order `buildProjects` uses. */
export function sortProjects(projects: PulseProject[]): PulseProject[] {
  return [...projects].sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.urgentFindings ?? 0) - (a.urgentFindings ?? 0) ||
      (a.latestScore ?? 101) - (b.latestScore ?? 101) ||
      Date.parse(b.lastScannedAt) - Date.parse(a.lastScannedAt),
  );
}

/** The average health across projects, counting each project once (its latest score). */
export function projectAverage(projects: PulseProject[]): number | null {
  const scores = projects.map((p) => p.latestScore).filter((s): s is number => s !== null);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

// ─── The Projects list: filter, sort, page ────────────────────────────────────

/** What a project is, for the type filter. Store listings are URLs, so they are told apart by host. */
export type ProjectKind = "website" | "repo" | "store" | "description";
export function projectKind(p: Pick<PulseProject, "inputType" | "target">): ProjectKind {
  if (p.inputType === "GITHUB_REPO") return "repo";
  if (p.inputType === "FREE_TEXT") return "description";
  return detectStoreTarget(p.target) ? "store" : "website";
}

export type ProjectStatusFilter = "all" | "attention" | "urgent" | "on_track" | "failed";

export interface ProjectFilters {
  query: string;
  status: ProjectStatusFilter;
  kind: ProjectKind | "all";
  /** A client id, "none" for projects with no client, or "all". */
  client: string;
}

export const DEFAULT_PROJECT_FILTERS: ProjectFilters = { query: "", status: "all", kind: "all", client: "all" };

export function filterProjects(projects: PulseProject[], f: ProjectFilters): PulseProject[] {
  const q = f.query.trim().toLowerCase();
  return projects.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.target.toLowerCase().includes(q) && !(p.clientName ?? "").toLowerCase().includes(q)) return false;
    if (f.kind !== "all" && projectKind(p) !== f.kind) return false;
    if (f.client === "none" ? p.clientId !== null : f.client !== "all" && p.clientId !== f.client) return false;
    switch (f.status) {
      case "attention": return p.attention.length > 0;
      case "urgent": return (p.urgentFindings ?? 0) > 0;
      case "on_track": return p.attention.length === 0 && !p.running;
      case "failed": return p.latestStatus === "FAILED";
      default: return true;
    }
  });
}

export type ProjectSortKey = "name" | "score" | "change" | "urgent" | "open" | "lastChecked";
export type SortDir = "asc" | "desc";

/** What a header click starts with: newest, highest and most first; names A to Z. */
export const SORT_START: Record<ProjectSortKey, SortDir> = { name: "asc", score: "desc", change: "desc", urgent: "desc", open: "desc", lastChecked: "desc" };

/** The list opens newest first. */
export const DEFAULT_PROJECT_SORT: { key: ProjectSortKey; dir: SortDir } = { key: "lastChecked", dir: "desc" };

/**
 * Sort projects by one column. A project with no value for it (no score yet, not counted)
 * goes to the bottom in either direction, so "highest score" never opens on a dash. Ties
 * fall back to newest first.
 */
export function sortProjectsBy(projects: PulseProject[], key: ProjectSortKey, dir: SortDir): PulseProject[] {
  const val = (p: PulseProject): number | string | null => {
    switch (key) {
      case "name": return p.name.toLowerCase();
      case "score": return p.latestScore;
      case "change": return p.change?.by ?? null;
      case "urgent": return p.urgentFindings;
      case "open": return p.openFindings;
      case "lastChecked": return Date.parse(p.lastScannedAt);
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      if (c !== 0) return c * sign;
    }
    return Date.parse(b.lastScannedAt) - Date.parse(a.lastScannedAt);
  });
}
