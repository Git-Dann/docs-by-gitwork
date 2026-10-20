import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsMetric,
  type AnalyticsSnapshot,
  getJson,
  monthLabel,
} from "./types";
import { bigWedgeBearer } from "@/server/bigwedge-api-auth";

// ─── Big Wedge Golf — user analytics ────────────────────────────────────────────
//
// https://apiv1.bigwedgegolf.com/api/v1/analytics/overall-report/ — one admin endpoint
// that returns user growth, engagement and retention for a date range.
//
// Checked against the LIVE API (Oct 2026), not the OpenAPI spec, because the spec does
// not document the shape — and three things about it are easy to get wrong:
//
//   1. The range is `start_date` / `end_date`. `date_from` / `date_to` (what this adapter
//      used to send) are silently IGNORED and the report falls back to "current month" —
//      so every month read back as this month's figures.
//   2. `end_date` is INCLUSIVE by day (31 Aug → 31 Aug returns that one day), so a month
//      is the 1st to its last day.
//   3. The body is wrapped: `{ status, data: { user_growth, engagement, retention, … },
//      filters }`. `filters.applied_filter` says "custom" when the range was honoured.
//
// Auth: Foundry logs in for itself with the service account (`bigWedgeBearer`, shared with
// the course feed), so an expired pasted token can no longer blank the figures.
//
// ⚠️ A failed read THROWS. It used to swallow every error and return an empty month,
// which was stored, and read on the page as "nothing happened" (CLAUDE.md §35).

/**
 * A month as the report's inclusive `start_date` / `end_date`. For the month still running
 * the range ends TODAY rather than on a day that has not happened yet, so "October so far"
 * asks for exactly what exists.
 */
export function monthRange(year: number, month: number, now: Date = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return { from, to: today >= from && today < last ? today : last };
}

/**
 * The metrics shown, and where each lives in the report. Curated rather than flattened:
 * the report also carries per-user arrays (`top_active_users`) and ratios whose meaning the
 * API does not document — neither belongs on a client's page as a bare number.
 *
 * ⚠️ `user_growth.total_users` and `retention.returning_users` are ALL-TIME counts: the
 * range does not change them (111,675 for August and 111,676 for September, read minutes
 * apart). Stored per month they would draw a flat line and claim no change, so they are
 * left out. Only figures the date range actually scopes belong in a monthly series.
 */
const FIELDS: { key: string; label: string; group: string; path: [string, string]; money?: boolean }[] = [
  { key: "users_new", label: "New users", group: "Users", path: ["user_growth", "new_users"] },
  { key: "users_active", label: "Active users", group: "Users", path: ["user_growth", "active_users"] },
  { key: "users_mau", label: "Monthly active users", group: "Users", path: ["retention", "mau"] },
  { key: "rounds_played", label: "Rounds played", group: "Golf", path: ["engagement", "rounds_played"] },
  { key: "rounds_created", label: "Rounds started", group: "Golf", path: ["engagement", "rounds_created"] },
  { key: "score_entries", label: "Scores entered", group: "Golf", path: ["engagement", "score_entries"] },
  { key: "rounds_per_user", label: "Rounds per active user", group: "Golf", path: ["engagement", "avg_rounds_per_user"] },
  // ── Revenue (Premium launched 20 Oct 2026) ──
  // Worked out against the live API, because it is easy to misread: the subscription counts
  // are subscriptions ACTIVE during the range, not ones started in it, and `mrr` is their
  // monthly value with a yearly plan spread over 12. One yearly sub from August reads 2.50 in
  // August, again in September, and is still inside October's 39.75 (5 × 5.45 + 5 × 29.99 / 12).
  { key: "premium_subscribers", label: "Premium subscribers", group: "Revenue", path: ["business_growth", "premium_users"] },
  { key: "subs_monthly", label: "Monthly subscriptions", group: "Revenue", path: ["revenue", "active_monthly_subs"] },
  { key: "subs_yearly", label: "Yearly subscriptions", group: "Revenue", path: ["revenue", "active_yearly_subs"] },
  { key: "revenue_mrr", label: "MRR", group: "Revenue", path: ["revenue", "mrr"], money: true },
  // Cash actually taken in the range, a yearly plan counted IN FULL in the month it is paid.
  // The report does not carry it yet (requested from Big Wedge, Oct 2026). Read here so it
  // appears the day it is added; until then it is simply absent, never shown as zero.
  { key: "revenue_cash", label: "Revenue this month", group: "Revenue", path: ["revenue", "cash_revenue"], money: true },
];

/** £ / $ / € for the report's `revenue.currency`, the code itself for anything else. */
export function currencyUnit(code: unknown): string | undefined {
  if (typeof code !== "string" || !code.trim()) return undefined;
  const c = code.trim().toUpperCase();
  return ({ GBP: "£", USD: "$", EUR: "€" } as Record<string, string>)[c] ?? c;
}

/** The metrics in one report response. Fields the response lacks are left out, never zeroed. */
export function metricsFromReport(json: unknown): AnalyticsMetric[] {
  const data =
    json && typeof json === "object" && (json as { data?: unknown }).data && typeof (json as { data: unknown }).data === "object"
      ? ((json as { data: Record<string, unknown> }).data)
      : null;
  if (!data) return [];
  const revenue = data.revenue && typeof data.revenue === "object" ? (data.revenue as Record<string, unknown>) : {};
  // No currency in the report → no symbol. Guessing £ would be a confident wrong figure for
  // any customer charged in another currency.
  const money = currencyUnit(revenue.currency);
  const out: AnalyticsMetric[] = [];
  for (const f of FIELDS) {
    const section = data[f.path[0]];
    const value = section && typeof section === "object" ? (section as Record<string, unknown>)[f.path[1]] : undefined;
    if (typeof value === "number" && Number.isFinite(value)) {
      const m: AnalyticsMetric = { key: f.key, label: f.label, value, group: f.group };
      if (f.money && money) m.unit = money;
      out.push(m);
    }
  }
  return out;
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const bearer = await bigWedgeBearer({ baseUrl: base, storedToken: ctx.apiToken });
  if (!bearer.ok) throw new Error(bearer.error);

  const { from, to } = monthRange(ctx.year, ctx.month, ctx.now ?? new Date());
  const report = await getJson<unknown>(
    `${base}/api/v1/analytics/overall-report/?start_date=${from}&end_date=${to}`,
    bearer.token,
  );
  // If the range was not honoured the figures are "this month so far", whatever month was
  // asked for — storing them under another month would be a confident wrong figure.
  const applied = (report as { filters?: { applied_filter?: unknown } })?.filters?.applied_filter;
  if (applied !== undefined && applied !== "custom") {
    throw new Error(
      `Big Wedge ignored the date range (it applied "${String(applied)}"), so these figures are not for ${monthLabel(ctx.year, ctx.month)}.`,
    );
  }
  const metrics = metricsFromReport(report);
  if (metrics.length === 0) {
    throw new Error("Big Wedge's analytics report answered but carried none of the expected figures.");
  }
  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics };
}

export const bigwedgeAdapter: AnalyticsAdapter = {
  key: "bigwedge",
  label: "Big Wedge Golf",
  defaultBaseUrl: "https://apiv1.bigwedgegolf.com",
  // Foundry logs in with the service account (BIGWEDGE_API_USERNAME / _PASSWORD), so a
  // pasted token is optional — a fallback, checked for expiry before it is used.
  requiresToken: false,
  // Premium launched mid-month — waiting for 1 November to see October would be useless.
  monthToDate: true,
  hint: "User analytics, month by month. Foundry logs in with the Big Wedge service account; a token is only a fallback.",
  fetchMonth,
};
