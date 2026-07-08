/**
 * bigwedge-user-data.ts — READ-ONLY reader for Big Wedge **user** analytics from
 * the main app API (apiv1.bigwedgegolf.com), surfaced in the console's "User
 * data" view.
 *
 * The app API exposes AGGREGATE admin analytics, not a raw per-user PII dump, so
 * we ingest everything the admin endpoints return and flatten it into grouped
 * metrics (users, activity, platform/OS split, subscriptions, feedback, …):
 *   /api/v1/analytics/overall-report/  — the primary admin aggregate
 *   /api/v1/clubhouse/stats/           — clubhouse activity
 *   /api/v1/feedback/stats/            — feedback counts
 *   /api/v1/rounds/                    — rounds played (count)
 *   /api/v1/subscriptions/plans/       — subscription plans
 *
 * Auth reuses the Care → Connectors "Analytics API" admin JWT (same token the
 * analytics report uses), overridable with WEDGE_APP_API_URL / WEDGE_APP_API_TOKEN.
 * NEVER writes.
 */

import { getJson, type AnalyticsMetric } from "@/server/support-analytics/types";
import { flattenMetrics } from "@/server/support-analytics/generic";
import { resolveBigWedgeApi } from "@/server/wiki-bigwedge-sync";
import { cached } from "@/server/golf-cache";

/** The main Big Wedge app API (users/analytics). Non-secret; override with env. */
const DEFAULT_APP_API_URL = "https://apiv1.bigwedgegolf.com";

export interface UserDataLists {
  topActiveUsers: Array<{ username: string; count: number }>;
  mostPlayedCourses: Array<{ courseName: string; clubName: string; count: number }>;
  gameModes: Array<{ mode: string; count: number; percentage: number | null }>;
}

export interface UserDataSnapshot {
  connected: boolean;
  baseUrl: string | null;
  error: string | null;
  /** Flattened metrics, each tagged with a `group`. */
  metrics: AnalyticsMetric[];
  /** Non-numeric leaderboards pulled from the report (arrays flattenMetrics skips). */
  lists: UserDataLists;
  endpointsHit: string[];
  endpointsFailed: string[];
}

const EMPTY_LISTS: UserDataLists = { topActiveUsers: [], mostPlayedCourses: [], gameModes: [] };

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}
function str(v: unknown, fallback = "—"): string {
  return v == null ? fallback : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function extractLists(report: Record<string, unknown>): UserDataLists {
  const eng = (report.engagement ?? {}) as Record<string, unknown>;
  const golf = (report.golf_metrics ?? {}) as Record<string, unknown>;
  const gm = (report.game_modes ?? {}) as Record<string, unknown>;
  return {
    topActiveUsers: asArray(eng.top_active_users)
      .map((u) => ({ username: str(u.username), count: num(u.count) }))
      .slice(0, 10),
    mostPlayedCourses: asArray(golf.most_played_courses)
      .map((c) => ({ courseName: str(c.course_name), clubName: str(c.club_name, ""), count: num(c.count) }))
      .slice(0, 10),
    gameModes: asArray(gm.distribution)
      .map((m) => ({ mode: str(m.mode_name), count: num(m.count), percentage: typeof m.percentage === "number" ? m.percentage : null }))
      .slice(0, 10),
  };
}

function humanize(s: string): string {
  return s.replace(/[_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mint a fresh app JWT from username/password (app tokens are short-lived). */
async function mintAppToken(baseUrl: string, username: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Foundry/1.0" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access?: string };
    return json.access ?? null;
  } catch {
    return null;
  }
}

async function resolveAppApi(
  workspaceClientId: string,
): Promise<{ baseUrl: string; token: string } | { error: string }> {
  const envUrl = process.env.WEDGE_APP_API_URL?.trim();
  const envUser = process.env.WEDGE_APP_API_USER?.trim();
  const envPass = process.env.WEDGE_APP_API_PASSWORD?.trim();
  const envToken = process.env.WEDGE_APP_API_TOKEN?.trim();

  const connector = await resolveBigWedgeApi(workspaceClientId);
  const connectorOk = !("error" in connector);
  const baseUrl = (envUrl || (connectorOk ? connector.baseUrl : "") || DEFAULT_APP_API_URL).replace(/\/$/, "");

  // 1) mint a fresh token from creds (most robust — app JWTs expire fast)
  if (envUser && envPass) {
    const token = await mintAppToken(baseUrl, envUser, envPass);
    if (token) return { baseUrl, token };
    return { error: `Login to ${baseUrl}/api/v1/auth/login/ failed (check WEDGE_APP_API_USER/PASSWORD).` };
  }
  // 2) static env token, or 3) the Care Analytics connector token
  if (envToken) return { baseUrl, token: envToken };
  if (connectorOk) return { baseUrl, token: connector.apiToken };
  return { error: connector.error };
}

interface Paginated {
  count?: number;
}

export async function getUserData(workspaceClientId: string, force = false): Promise<UserDataSnapshot> {
  return cached(`user-data:${workspaceClientId}`, () => loadUserData(workspaceClientId), { force });
}

async function loadUserData(workspaceClientId: string): Promise<UserDataSnapshot> {
  const r = await resolveAppApi(workspaceClientId);
  if ("error" in r) {
    return { connected: false, baseUrl: null, error: r.error, metrics: [], lists: EMPTY_LISTS, endpointsHit: [], endpointsFailed: [] };
  }
  const { baseUrl, token } = r;

  const now = new Date();
  const from = `${now.getUTCFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);

  const metrics: AnalyticsMetric[] = [];
  let lists: UserDataLists = EMPTY_LISTS;
  const hit: string[] = [];
  const failed: string[] = [];

  // Fire every endpoint concurrently — these are all independent reads, and the
  // prior sequential await-chain (~4-5 round trips to a remote API) was the main
  // cause of slow page loads. A failure on any one never sinks the others.
  const [overallResult, clubhouseResult, feedbackResult, roundsResult, plansResult] = await Promise.allSettled([
    getJson<Record<string, unknown>>(
      `${baseUrl}/api/v1/analytics/overall-report/?date_from=${from}&date_to=${to}`,
      token,
    ),
    getJson<unknown>(`${baseUrl}/api/v1/clubhouse/stats/`, token),
    getJson<unknown>(`${baseUrl}/api/v1/feedback/stats/`, token),
    getJson<Paginated>(`${baseUrl}/api/v1/rounds/?page=1`, token),
    getJson<unknown>(`${baseUrl}/api/v1/subscriptions/plans/`, token),
  ]);

  // Primary aggregate — also our connectivity probe. The report is
  // `{ status, data: { user_growth, engagement, retention, golf_metrics, … } }`;
  // flatten each sub-section into its own group so the view reads cleanly.
  if (overallResult.status === "rejected") {
    const err = overallResult.reason;
    return {
      connected: false,
      baseUrl,
      error: err instanceof Error ? err.message : String(err),
      metrics: [],
      lists: EMPTY_LISTS,
      endpointsHit: [],
      endpointsFailed: ["analytics/overall-report"],
    };
  }
  {
    const overall = overallResult.value;
    const report = (overall?.data && typeof overall.data === "object" ? overall.data : overall) as Record<string, unknown>;
    let grouped = 0;
    for (const [section, val] of Object.entries(report)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const before = metrics.length;
        metrics.push(...flattenMetrics(val, { group: humanize(section), limit: 30 }));
        grouped += metrics.length - before;
      }
    }
    // Fallback: if the shape wasn't the expected nested one, flatten whole.
    if (grouped === 0) metrics.push(...flattenMetrics(report, { group: "Overall", limit: 60 }));
    lists = extractLists(report);
    hit.push("analytics/overall-report");
  }

  if (clubhouseResult.status === "fulfilled") {
    metrics.push(...flattenMetrics(clubhouseResult.value, { group: "Clubhouse", limit: 24 }));
    hit.push("clubhouse/stats");
  } else {
    failed.push("clubhouse/stats");
  }

  if (feedbackResult.status === "fulfilled") {
    metrics.push(...flattenMetrics(feedbackResult.value, { group: "Feedback", prefix: "feedback", limit: 24 }));
    hit.push("feedback/stats");
  } else {
    failed.push("feedback/stats");
  }

  if (roundsResult.status === "fulfilled" && typeof roundsResult.value.count === "number") {
    metrics.push({ key: "rounds_total", label: "Rounds played", value: roundsResult.value.count, group: "Activity" });
    hit.push("rounds");
  } else {
    failed.push("rounds");
  }

  if (plansResult.status === "fulfilled") {
    const plans = plansResult.value;
    const list = Array.isArray(plans)
      ? plans
      : Array.isArray((plans as { results?: unknown[] })?.results)
        ? (plans as { results: unknown[] }).results
        : [];
    if (list.length) metrics.push({ key: "plans", label: "Subscription plans", value: list.length, group: "Subscriptions" });
    hit.push("subscriptions/plans");
  } else {
    failed.push("subscriptions/plans");
  }

  return { connected: true, baseUrl, error: null, metrics, lists, endpointsHit: hit, endpointsFailed: failed };
}
