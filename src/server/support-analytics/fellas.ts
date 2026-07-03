import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsSnapshot,
  type AnalyticsMetric,
  getJson,
  monthLabel,
} from "./types";

// ─── Fellas Loaded — subscription / revenue / audience analytics ─────────────────
//
// Pulls a comprehensive, month-scoped picture from the public Fellas API
// (api.fellasloaded.com — endpoints are Optional-JWT, so a token is not required).
// Everything period-scoped is keyed stably so runAnalytics() can merge the previous
// month in for month-over-month trends. A few lifetime snapshots (trials funnel,
// audience base) are included as context and simply show a flat trend.
//
// Endpoints used (all verified live):
//   /api/analytics/subscriptions/reports/?start_date&end_date        → summary + by_platform + by_subscription_type
//   /api/analytics/subscriptions/transactions/platform_comparison/   → avg transaction value per platform
//   /api/analytics/subscriptions/transactions/by_country/            → revenue by country (top N)
//   /api/analytics/trials/                                           → trial funnel (lifetime)
//   /api/analytics/users/                                            → audience base (lifetime)
//
// Every fetch is best-effort: a single endpoint failing degrades that group of
// metrics rather than blanking the whole report.

interface ReportsResp {
  summary?: {
    total_revenue?: number;
    transaction_count?: number;
    new_subscriptions?: number;
    renewals?: number;
  };
  by_platform?: Record<string, { revenue?: number; count?: number }>;
  by_subscription_type?: Record<string, { revenue?: number; count?: number }>;
}

interface PlatformCmpRow {
  platform_name?: string;
  total_revenue?: number;
  transaction_count?: number;
  avg_transaction_value?: number;
  new_subscriptions?: number;
  renewals?: number;
}
type PlatformCmpResp = Record<string, PlatformCmpRow>;

interface CountryRow {
  country_code?: string;
  total_revenue?: number;
  transaction_count?: number;
  avg_revenue?: number;
}

interface TrialsResp {
  total_trials?: number;
  active_trials?: number;
  expired_trials?: number;
  converted_trials?: number;
  canceled_trials?: number;
}

interface UsersResp {
  total_users?: number;
  verified?: number;
  active_subscriptions?: number;
  cancelled_subscriptions?: number;
}

/** Inclusive "YYYY-MM-DD" first/last day of the month (UTC-safe). */
function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

const gbp = (n: number | undefined) => Math.round(n ?? 0);
const money2 = (n: number | undefined) => Math.round((n ?? 0) * 100) / 100;
const int = (n: number | undefined) => Math.round(n ?? 0);

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const { start, end } = monthRange(ctx.year, ctx.month);
  const range = `start_date=${start}&end_date=${end}`;

  // Best-effort: one failing endpoint shouldn't blank the whole report.
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const [reports, platformCmp, byCountry, trials, users] = await Promise.all([
    safe(getJson<ReportsResp>(`${base}/api/analytics/subscriptions/reports/?${range}`, ctx.apiToken)),
    safe(getJson<PlatformCmpResp>(`${base}/api/analytics/subscriptions/transactions/platform_comparison/?${range}`, ctx.apiToken)),
    safe(getJson<CountryRow[]>(`${base}/api/analytics/subscriptions/transactions/by_country/?${range}&limit=5`, ctx.apiToken)),
    safe(getJson<TrialsResp>(`${base}/api/analytics/trials/`, ctx.apiToken)),
    safe(getJson<UsersResp>(`${base}/api/analytics/users/`, ctx.apiToken)),
  ]);

  const metrics: AnalyticsMetric[] = [];

  // ── Revenue (period, £, MoM) ──────────────────────────────────────────────
  if (reports?.summary) {
    const s = reports.summary;
    metrics.push({ key: "rev_total", label: "Total revenue", value: gbp(s.total_revenue), unit: "£", group: "Revenue" });
  }
  if (reports?.by_platform) {
    const p = reports.by_platform;
    metrics.push(
      { key: "rev_ios", label: "Apple revenue", value: gbp(p.ios?.revenue), unit: "£", group: "Revenue" },
      { key: "rev_stripe", label: "Stripe revenue", value: gbp(p.stripe?.revenue), unit: "£", group: "Revenue" },
      { key: "rev_android", label: "Google Play revenue", value: gbp(p.android?.revenue), unit: "£", group: "Revenue" },
    );
  }

  // ── Subscription activity (period, MoM) ───────────────────────────────────
  if (reports?.summary) {
    const s = reports.summary;
    metrics.push(
      { key: "subs_total", label: "Total transactions", value: int(s.transaction_count), group: "Subscription activity" },
      { key: "subs_new", label: "New subscriptions", value: int(s.new_subscriptions), group: "Subscription activity" },
      { key: "subs_renewals", label: "Renewals", value: int(s.renewals), group: "Subscription activity" },
    );
  }
  if (reports?.by_platform) {
    const p = reports.by_platform;
    metrics.push(
      { key: "subs_ios", label: "Apple subscriptions", value: int(p.ios?.count), group: "By platform" },
      { key: "subs_stripe", label: "Stripe subscriptions", value: int(p.stripe?.count), group: "By platform" },
      { key: "subs_android", label: "Google Play subscriptions", value: int(p.android?.count), group: "By platform" },
    );
  }

  // ── Plan mix (period, MoM) ────────────────────────────────────────────────
  if (reports?.by_subscription_type) {
    const t = reports.by_subscription_type;
    metrics.push(
      { key: "type_monthly", label: "Monthly plans", value: int(t.monthly_subscription?.count), group: "Plan mix" },
      { key: "type_yearly", label: "Yearly plans", value: int(t.yearly_subscription?.count), group: "Plan mix" },
    );
  }

  // ── Average transaction value per platform (period, £, MoM) ───────────────
  if (platformCmp && typeof platformCmp === "object") {
    metrics.push(
      { key: "avg_txn_ios", label: "Apple avg transaction", value: money2(platformCmp.ios?.avg_transaction_value), unit: "£", group: "Average value" },
      { key: "avg_txn_stripe", label: "Stripe avg transaction", value: money2(platformCmp.stripe?.avg_transaction_value), unit: "£", group: "Average value" },
      { key: "avg_txn_android", label: "Google Play avg transaction", value: money2(platformCmp.android?.avg_transaction_value), unit: "£", group: "Average value" },
    );
  }

  // ── Top countries by revenue (period, £, MoM — keyed by country) ──────────
  if (Array.isArray(byCountry)) {
    for (const row of byCountry.slice(0, 5)) {
      const cc = (row.country_code ?? "").trim();
      if (!cc) continue;
      metrics.push({
        key: `country_rev_${cc.toLowerCase()}`,
        label: `Revenue — ${cc}`,
        value: gbp(row.total_revenue),
        unit: "£",
        group: "Top countries by revenue",
      });
    }
  }

  // ── Trials funnel (lifetime snapshot — flat trend) ────────────────────────
  if (trials) {
    const total = int(trials.total_trials);
    metrics.push(
      { key: "trials_total", label: "Total trials", value: total, group: "Trials" },
      { key: "trials_active", label: "Active trials", value: int(trials.active_trials), group: "Trials" },
      { key: "trials_converted", label: "Converted trials", value: int(trials.converted_trials), group: "Trials" },
      {
        key: "trials_conversion",
        label: "Trial conversion rate (%)",
        value: total > 0 ? Math.round(((trials.converted_trials ?? 0) / total) * 100) : 0,
        group: "Trials",
      },
    );
  }

  // ── Audience base (lifetime snapshot — flat trend) ────────────────────────
  if (users) {
    metrics.push(
      { key: "users_total", label: "Total users", value: int(users.total_users), group: "Audience" },
      { key: "users_verified", label: "Verified users", value: int(users.verified), group: "Audience" },
      { key: "subs_active", label: "Active subscriptions", value: int(users.active_subscriptions), group: "Audience" },
      { key: "subs_cancelled", label: "Cancelled subscriptions", value: int(users.cancelled_subscriptions), group: "Audience" },
    );
  }

  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics };
}

export const fellasAdapter: AnalyticsAdapter = {
  key: "fellas",
  label: "Fellas Loaded",
  defaultBaseUrl: "https://api.fellasloaded.com",
  // The Fellas analytics endpoints are public (Optional JWT), so a token isn't required — the
  // connector works with just the base URL. A JWT is still sent when one is provided.
  requiresToken: false,
  hint: "Revenue, subscriptions, trials & audience. Base URL only — the API is public; a JWT is optional.",
  fetchMonth,
};
