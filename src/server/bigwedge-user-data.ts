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

export interface UserDataSnapshot {
  connected: boolean;
  baseUrl: string | null;
  error: string | null;
  /** Flattened metrics, each tagged with a `group`. */
  metrics: AnalyticsMetric[];
  endpointsHit: string[];
  endpointsFailed: string[];
}

async function resolveAppApi(
  workspaceClientId: string,
): Promise<{ baseUrl: string; token: string } | { error: string }> {
  const envUrl = process.env.WEDGE_APP_API_URL?.trim();
  const envToken = process.env.WEDGE_APP_API_TOKEN?.trim();
  if (envUrl && envToken) return { baseUrl: envUrl.replace(/\/$/, ""), token: envToken };

  const r = await resolveBigWedgeApi(workspaceClientId);
  if ("error" in r) {
    if (envUrl && envToken) return { baseUrl: envUrl.replace(/\/$/, ""), token: envToken };
    return { error: r.error };
  }
  return { baseUrl: (envUrl || r.baseUrl).replace(/\/$/, ""), token: envToken || r.apiToken };
}

interface Paginated {
  count?: number;
}

export async function getUserData(workspaceClientId: string): Promise<UserDataSnapshot> {
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

  // Primary aggregate — also our connectivity probe.
  try {
    const overall = await getJson<unknown>(
      `${baseUrl}/api/v1/analytics/overall-report/?date_from=${from}&date_to=${to}`,
      token,
    );
    metrics.push(...flattenMetrics(overall, { group: "Overall", limit: 60 }));
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
