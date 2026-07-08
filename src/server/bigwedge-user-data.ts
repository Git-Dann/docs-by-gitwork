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

export interface UserDataSnapshot {
  connected: boolean;
  baseUrl: string | null;
  error: string | null;
  /** Flattened metrics, each tagged with a `group`. */
  metrics: AnalyticsMetric[];
  endpointsHit: string[];
  endpointsFailed: string[];
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
    return { connected: false, baseUrl: null, error: r.error, metrics: [], endpointsHit: [], endpointsFailed: [] };
  }
  const { baseUrl, token } = r;

  const now = new Date();
  const from = `${now.getUTCFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);

  const metrics: AnalyticsMetric[] = [];
  const hit: string[] = [];
  const failed: string[] = [];

  // Primary aggregate — also our connectivity probe. The report is
  // `{ status, data: { user_growth, engagement, retention, golf_metrics, … } }`;
  // flatten each sub-section into its own group so the view reads cleanly.
  try {
    const overall = await getJson<Record<string, unknown>>(
      `${baseUrl}/api/v1/analytics/overall-report/?date_from=${from}&date_to=${to}`,
      token,
    );
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
    hit.push("analytics/overall-report");
  } catch (err) {
    return {
      connected: false,
      baseUrl,
      error: err instanceof Error ? err.message : String(err),
      metrics: [],
      endpointsHit: [],
      endpointsFailed: ["analytics/overall-report"],
    };
  }

  // Best-effort supplementary endpoints — a failure on one never sinks the rest.
  const extra: Array<{ name: string; url: string; group: string; prefix?: string }> = [
    { name: "clubhouse/stats", url: `${baseUrl}/api/v1/clubhouse/stats/`, group: "Clubhouse" },
    { name: "feedback/stats", url: `${baseUrl}/api/v1/feedback/stats/`, group: "Feedback", prefix: "feedback" },
  ];
  await Promise.all(
    extra.map(async (e) => {
      try {
        const data = await getJson<unknown>(e.url, token);
        metrics.push(...flattenMetrics(data, { group: e.group, prefix: e.prefix, limit: 24 }));
        hit.push(e.name);
      } catch {
        failed.push(e.name);
      }
    }),
  );

  // Rounds played (count from the paginated list).
  try {
    const rounds = await getJson<Paginated>(`${baseUrl}/api/v1/rounds/?page=1`, token);
    if (typeof rounds.count === "number") {
      metrics.push({ key: "rounds_total", label: "Rounds played", value: rounds.count, group: "Activity" });
    }
    hit.push("rounds");
  } catch {
    failed.push("rounds");
  }

  // Subscription plans (count of available plans).
  try {
    const plans = await getJson<unknown>(`${baseUrl}/api/v1/subscriptions/plans/`, token);
    const list = Array.isArray(plans)
      ? plans
      : Array.isArray((plans as { results?: unknown[] })?.results)
        ? (plans as { results: unknown[] }).results
        : [];
    if (list.length) metrics.push({ key: "plans", label: "Subscription plans", value: list.length, group: "Subscriptions" });
    hit.push("subscriptions/plans");
  } catch {
    failed.push("subscriptions/plans");
  }

  return { connected: true, baseUrl, error: null, metrics, endpointsHit: hit, endpointsFailed: failed };
}
