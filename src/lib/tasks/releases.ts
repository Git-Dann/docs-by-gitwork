/**
 * Releases: the version a client's tasks ship in ("v2.0.0 · Q4 Refinement Session").
 *
 * Big Wedge plans by release (Luke's own Gantt groups every item under one), so tasks can
 * belong to a release as well as a category. A category says what a task is about; a release
 * says when it ships. Pure: the board, the timeline, the wiki and MCP all use these rules.
 */

import { blockSpan, type BlockSpan } from "@/lib/gantt-span";
import { buildTaskStatusCounts, type TaskStatus } from "@/types/tasks";

type DateLike = Date | string | null | undefined;

export interface ReleaseLike {
  version: string;
  name: string | null;
  /**
   * The number to show, when it isn't `version`: the client's changelog number (§161). Set on
   * the DTOs the server sends; computed from `changelogVersion` + the client's setting on rows.
   */
  displayVersion?: string | null;
  /** The changelog version this release ships as ("2.0.4"), when someone has said. */
  changelogVersion?: string | null;
  /** Rows read with the client's setting: number releases by the changelog. */
  client?: { releasesUseChangelog: boolean } | null;
}

/** "2.0.4" → "v2.0.4"; a value that already starts with v (or V) is left as it is. */
export function changelogLabel(v: string): string {
  const s = v.trim();
  return /^v/i.test(s) ? s : `v${s}`;
}

/**
 * The version a release is shown as. When the client numbers releases by their changelog (Big
 * Wedge's planning site reused "v2.0.0" for months) and this release has a changelog version,
 * that; otherwise its own version.
 */
export function shownVersion(r: ReleaseLike): string {
  if (r.displayVersion) return r.displayVersion;
  const cv = r.changelogVersion?.trim();
  return r.client?.releasesUseChangelog && cv ? changelogLabel(cv) : r.version;
}

/** Version limits, shared by the validator and the form. */
export const RELEASE_LIMITS = { version: 40, name: 120, docUrl: 2048 } as const;

/**
 * A release document link, if it's a plain http(s) URL. It's rendered as a link the client can
 * click, so anything else (javascript:, data:) is refused on save and ignored on render.
 */
export function safeReleaseDocUrl(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s || s.length > RELEASE_LIMITS.docUrl) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "v2.0.0 · Q4 Refinement Session", or just the version when there's no name. */
export function releaseLabel(r: ReleaseLike): string {
  const name = r.name?.trim();
  const v = shownVersion(r);
  return name ? `${v} · ${name}` : v;
}

/**
 * The numeric parts of a version, for ordering: "v2.10.1" → [2, 10, 1]. Anything that isn't a
 * number is ignored, so "Build 412" → [412]. An empty list means no number at all.
 */
export function versionParts(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map((n) => Number(n));
}

/** Compare versions numerically, part by part: 2.9 before 2.10, which a string sort gets wrong. */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  // A version with no number sorts after every numbered one.
  if (!pa.length || !pb.length) return pa.length === pb.length ? a.localeCompare(b) : pa.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
}

function time(d: DateLike): number | null {
  if (!d) return null;
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The order releases are listed in: by start date (a release with no start date goes after the
 * dated ones), then by version, then by the manual order key.
 */
export function compareReleases(
  a: ReleaseLike & { startDate: DateLike; orderKey: number },
  b: ReleaseLike & { startDate: DateLike; orderKey: number },
): number {
  const sa = time(a.startDate);
  const sb = time(b.startDate);
  if (sa !== sb) {
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa - sb;
  }
  const v = compareVersions(shownVersion(a), shownVersion(b));
  if (v !== 0) return v;
  return a.orderKey - b.orderKey;
}

export function sortReleases<T extends ReleaseLike & { startDate: DateLike; orderKey: number }>(releases: T[]): T[] {
  return [...releases].sort(compareReleases);
}

/** Where a release sits on a timeline: its own dates, else estimated from its tasks' due dates. */
export function releaseSpan(
  release: { startDate: DateLike; endDate: DateLike },
  tasks: Array<{ dueDate: DateLike }>,
): BlockSpan | null {
  return blockSpan(release, tasks.map((t) => t.dueDate));
}

/** Done tasks over all tasks, as a whole percentage. A release with no tasks is 0%, not 100%. */
export function releaseProgress(tasks: Array<{ status: TaskStatus }>): number {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "DONE").length;
  return Math.round((done / tasks.length) * 100);
}

export function releaseStatusCounts(tasks: Array<{ status: TaskStatus }>): Record<TaskStatus, number> {
  return buildTaskStatusCounts(tasks);
}

/**
 * Find a release by what someone typed (MCP, a paste): the exact version first, then the same
 * version ignoring case and a leading "v" ("2.0.0" finds "v2.0.0"). More than one match is
 * ambiguous and returns null rather than guessing.
 */
export function findReleaseByVersion<T extends { version: string }>(releases: T[], typed: string): T | null {
  const want = typed.trim();
  if (!want) return null;
  const exact = releases.filter((r) => r.version === want);
  if (exact.length === 1) return exact[0];
  const norm = (v: string) => v.trim().toLowerCase().replace(/^v(?=\d)/, "");
  const loose = releases.filter((r) => norm(r.version) === norm(want));
  return loose.length === 1 ? loose[0] : null;
}
