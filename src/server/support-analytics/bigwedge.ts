import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsMetric,
  type AnalyticsSnapshot,
  getJson,
  monthLabel,
} from "./types";
import { flattenMetrics } from "./generic";

// ─── Big Wedge Golf — product analytics ─────────────────────────────────────────
//
// https://apiv1.bigwedgegolf.com — JWT (admin) bearer auth.
// Month-scoped, clean signal:
//   /api/v1/rounds/?date_from&date_to        → PaginatedRoundList.count (rounds played)
// Best-effort flattened (admin endpoints, shapes undocumented in the OpenAPI spec):
//   /api/v1/analytics/overall-report/?date_from&date_to  → "Overall" metrics
//   /api/v1/feedback/stats/                              → "Feedback" metrics
// Each call is independent — a 401/shape change on one doesn't sink the snapshot.

interface Paginated {
  count?: number;
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  return { from, to };
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const { from, to } = monthRange(ctx.year, ctx.month);
  const metrics: AnalyticsMetric[] = [];

  // Rounds played this month — clean, month-scoped count
  try {
    const rounds = await getJson<Paginated>(
      `${base}/api/v1/rounds/?date_from=${from}&date_to=${to}&page=1`,
      ctx.apiToken,
    );
    if (typeof rounds.count === "number") {
      metrics.push({ key: "rounds_played", label: "Rounds played", value: rounds.count, group: "Activity" });
    }
  } catch { /* skip — endpoint may be unavailable */ }

  // Overall analytics report (admin) — flatten whatever numeric fields it returns
  try {
    const overall = await getJson<unknown>(
      `${base}/api/v1/analytics/overall-report/?date_from=${from}&date_to=${to}`,
      ctx.apiToken,
    );
    metrics.push(...flattenMetrics(overall, { group: "Overall", limit: 24 }));
  } catch { /* skip */ }

  // Feedback stats (admin) — support-relevant counts
  try {
    const fb = await getJson<unknown>(`${base}/api/v1/feedback/stats/`, ctx.apiToken);
    metrics.push(...flattenMetrics(fb, { group: "Feedback", prefix: "feedback", limit: 12 }));
  } catch { /* skip */ }

  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics };
}

export const bigwedgeAdapter: AnalyticsAdapter = {
  key: "bigwedge",
  label: "Big Wedge Golf",
  defaultBaseUrl: "https://apiv1.bigwedgegolf.com",
  requiresToken: true,
  hint: "Golf analytics — paste an admin JWT. Rounds played is month-scoped for trends.",
  fetchMonth,
};
