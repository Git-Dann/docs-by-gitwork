import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsSnapshot,
  type AnalyticsMetric,
  getJson,
  monthLabel,
  monthPrefix,
} from "./types";

// ─── Fellas Loaded — subscription / user analytics ──────────────────────────────
//
// Two endpoints, both bearer-authenticated:
//   /api/analytics/subscriptions/transactions/monthly_summary/?year=YYYY  → SubRow[]
//   /api/analytics/users/monthly/                                          → UserMonthly
// (Previously fetched client-side via /api/support/fellas-proxy — now server-side.)

interface SubRow {
  platform: string; // "ios" | "android" | "stripe"
  subscription_type: string; // "monthly_subscription" | "yearly_subscription"
  month: string; // "2026-05"
  transaction_count: number; // active subs for the month
  new_subscriptions: number;
  renewals: number;
}

interface UserMonthly {
  stripe: Array<{ month: string; count: number }>;
  ios: Array<{ month: string; count: number }>;
  android: Array<{ month: string; count: number }>;
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const [subData, userData] = await Promise.all([
    getJson<SubRow[]>(
      `${base}/api/analytics/subscriptions/transactions/monthly_summary/?year=${ctx.year}`,
      ctx.apiToken,
    ),
    getJson<UserMonthly>(`${base}/api/analytics/users/monthly/`, ctx.apiToken),
  ]);

  const prefix = monthPrefix(ctx.year, ctx.month);
  const rows = (Array.isArray(subData) ? subData : []).filter((r) => r.month.startsWith(prefix));

  const active = (platform: string, type: string) =>
    rows.find((r) => r.platform === platform && r.subscription_type === type)?.transaction_count ?? 0;
  const platformTotal = (platform: string) =>
    rows.filter((r) => r.platform === platform).reduce((s, r) => s + r.transaction_count, 0);
  const monthUser = (arr: Array<{ month: string; count: number }> | undefined) =>
    arr?.find((r) => r.month.startsWith(prefix))?.count ?? 0;

  const metrics: AnalyticsMetric[] = [
    { key: "active_total", label: "Total active", value: rows.reduce((s, r) => s + r.transaction_count, 0), group: "Active subscriptions" },
    { key: "active_ios_monthly", label: "iOS monthly", value: active("ios", "monthly_subscription"), group: "Active subscriptions" },
    { key: "active_ios_yearly", label: "iOS yearly", value: active("ios", "yearly_subscription"), group: "Active subscriptions" },
    { key: "active_android_monthly", label: "Android monthly", value: active("android", "monthly_subscription"), group: "Active subscriptions" },
    { key: "active_android_yearly", label: "Android yearly", value: active("android", "yearly_subscription"), group: "Active subscriptions" },
    { key: "active_stripe_monthly", label: "Stripe monthly", value: active("stripe", "monthly_subscription"), group: "Active subscriptions" },
    { key: "active_stripe_yearly", label: "Stripe yearly", value: active("stripe", "yearly_subscription"), group: "Active subscriptions" },

    { key: "events_total", label: "Total events", value: rows.reduce((s, r) => s + r.transaction_count, 0), group: "Subscription events" },
    { key: "events_new", label: "New subscriptions", value: rows.reduce((s, r) => s + r.new_subscriptions, 0), group: "Subscription events" },
    { key: "events_renewals", label: "Renewals", value: rows.reduce((s, r) => s + r.renewals, 0), group: "Subscription events" },

    { key: "ios_total", label: "iOS total", value: platformTotal("ios"), group: "Platform activity" },
    { key: "ios_new", label: "iOS new users", value: monthUser(userData?.ios), group: "Platform activity" },
    { key: "android_total", label: "Android total", value: platformTotal("android"), group: "Platform activity" },
    { key: "android_new", label: "Android new users", value: monthUser(userData?.android), group: "Platform activity" },
    { key: "stripe_total", label: "Stripe total", value: platformTotal("stripe"), group: "Platform activity" },
    { key: "stripe_new", label: "Stripe new users", value: monthUser(userData?.stripe), group: "Platform activity" },
  ];

  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics };
}

export const fellasAdapter: AnalyticsAdapter = {
  key: "fellas",
  label: "Fellas Loaded",
  defaultBaseUrl: "https://api.fellasloaded.com",
  requiresToken: true,
  hint: "Subscription & user analytics — paste the Fellas API JWT.",
  fetchMonth,
};
