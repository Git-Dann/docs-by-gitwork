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
const FIELDS: {
  key: string;
  label: string;
  group: string;
  /** Where it lives under `data`, e.g. ["business_growth", "free_vs_premium_ratio", "premium_pct"]. */
  path: string[];
  money?: boolean;
  /** "%" for a percentage. Money takes the report's currency instead. */
  unit?: string;
  /**
   * Today's state, whatever range is asked (checked against the live API). Shown for the month
   * still running; a finished month keeps it only from its last capture during the month
   * (`carryAtMonthEnd`), never from a read made after the month ended.
   */
  now?: true;
  card?: { id: string; title: string; part: string };
}[] = [
  { key: "users_new", label: "New users", group: "Users", path: ["user_growth", "new_users"] },
  { key: "users_active", label: "Active users", group: "Users", path: ["user_growth", "active_users"] },
  { key: "users_mau", label: "Monthly active users", group: "Users", path: ["retention", "mau"] },
  { key: "users_dau", label: "Daily active users", group: "Users", path: ["retention", "dau"], now: true, card: { id: "daily", title: "Daily active users", part: "Daily" } },
  // How many of the month's active users come back on a given day — the "stickiness" figure.
  { key: "users_stickiness", label: "Daily / monthly active", group: "Users", path: ["retention", "dau_mau_ratio"], unit: "%", now: true, card: { id: "daily", title: "Daily active users", part: "Of monthly active" } },
  { key: "rounds_played", label: "Rounds played", group: "Golf", path: ["engagement", "rounds_played"] },
  { key: "rounds_created", label: "Rounds started", group: "Golf", path: ["engagement", "rounds_created"] },
  { key: "score_entries", label: "Scores entered", group: "Golf", path: ["engagement", "score_entries"] },
  { key: "rounds_per_user", label: "Rounds per active user", group: "Golf", path: ["engagement", "avg_rounds_per_user"] },
  { key: "golf_handicap", label: "Average handicap", group: "Golf", path: ["golf_metrics", "average_handicap"], now: true },
  // ── Revenue (Premium launched 20 Oct 2026) ──
  // Worked out against the live API, because it is easy to misread: the subscription counts
  // are subscriptions ACTIVE during the range, not ones started in it, and `mrr` is their
  // monthly value with a yearly plan spread over 12. One yearly sub from August reads 2.50 in
  // August, again in September, and is still inside October's 39.75 (5 × 5.45 + 5 × 29.99 / 12).
  // One card: "Subscriptions — 12 Total | 6 Monthly | 6 Yearly". `premium_users` is Big Wedge's
  // own count of everyone on Premium (12 = 6 + 6 on launch day), so it is the total.
  { key: "premium_subscribers", label: "Premium subscribers", group: "Revenue", path: ["business_growth", "premium_users"], card: { id: "subs", title: "Subscriptions", part: "Total" } },
  { key: "subs_monthly", label: "Monthly subscriptions", group: "Revenue", path: ["revenue", "active_monthly_subs"], card: { id: "subs", title: "Subscriptions", part: "Monthly" } },
  { key: "subs_yearly", label: "Yearly subscriptions", group: "Revenue", path: ["revenue", "active_yearly_subs"], card: { id: "subs", title: "Subscriptions", part: "Yearly" } },
  { key: "revenue_mrr", label: "MRR", group: "Revenue", path: ["revenue", "mrr"], money: true },
  // Both match Big Wedge's own admin ("estimated average recurring revenue per subscriber per
  // month" and "estimated revenue per subscription"), checked on 30 Oct 2026.
  { key: "revenue_arpu", label: "Revenue per subscriber / month", group: "Revenue", path: ["revenue", "arpu"], money: true, now: true, card: { id: "per_sub", title: "Per subscriber", part: "A month" } },
  { key: "revenue_per_sub", label: "Revenue per subscription", group: "Revenue", path: ["revenue", "average_revenue_per_user"], money: true, now: true, card: { id: "per_sub", title: "Per subscriber", part: "In total" } },
  { key: "premium_share", label: "Premium share of users", group: "Revenue", path: ["business_growth", "free_vs_premium_ratio", "premium_pct"], unit: "%", now: true, card: { id: "subs", title: "Subscriptions", part: "Of all users" } },
  { key: "churn_rate", label: "Subscription churn", group: "Revenue", path: ["business_growth", "user_churn_rate"], unit: "%", now: true },
  // Cash actually taken in the range, a yearly plan counted IN FULL in the month it is paid.
  // Big Wedge added it on 21 Oct 2026, but it does NOT yet follow the date range — so it is
  // only shown once `revenueIsRangeScoped` says it does. Until then the estimate stands in.
  { key: "revenue_cash", label: "Revenue this month", group: "Revenue", path: ["revenue", "cash_revenue"], money: true },
];

/** Every field that is today's state for any range — dropped from a finished month's own read. */
export const NOW_KEYS: string[] = FIELDS.filter((f) => f.now).map((f) => f.key);

/**
 * Big Wedge's plan prices. Its API carries NO prices or payment amounts anywhere (checked
 * against the full OpenAPI schema, Oct 2026), so they live here — confirmed by Syed on launch
 * day, 20 Oct 2026. ⚠️ Change them here if Big Wedge changes its prices; nothing else will.
 */
export const BIG_WEDGE_PLAN_PRICES = { monthly: 5.45, yearly: 29.99 } as const;

/** The report's subscription counts, or null when it does not carry both. */
function subCounts(json: unknown): { monthly: number; yearly: number } | null {
  const r = (json as { data?: { revenue?: Record<string, unknown> } })?.data?.revenue;
  const m = r?.active_monthly_subs;
  const y = r?.active_yearly_subs;
  return typeof m === "number" && Number.isFinite(m) && typeof y === "number" && Number.isFinite(y)
    ? { monthly: m, yearly: y }
    : null;
}

/**
 * What was taken in the month, a yearly plan counted IN FULL — the total MRR cannot give.
 *
 *   monthly plans: every one ACTIVE in the month paid once in it            × 5.45
 *   yearly plans:  only the ones NEW this month paid in it (in full)        × 29.99
 *
 * "New" is active in the month minus active on the day BEFORE it started: the report counts
 * subscriptions active during a range, so a yearly sub from an earlier month is in both and
 * cancels out. That is also what drops the test yearly sub from August from October's total.
 *
 * ⚠️ An estimate, labelled as one. A yearly plan's renewal 12 months on is not counted (it was
 * already active the day before), nor are refunds or a mid-month plan change. Big Wedge's own
 * `cash_revenue`, once it exists, replaces this outright.
 */
export function estimateRevenueTaken(
  month: { monthly: number; yearly: number },
  dayBefore: { monthly: number; yearly: number },
): number {
  const newYearly = Math.max(0, month.yearly - dayBefore.yearly);
  const total = month.monthly * BIG_WEDGE_PLAN_PRICES.monthly + newYearly * BIG_WEDGE_PLAN_PRICES.yearly;
  return Math.round(total * 100) / 100;
}

/**
 * Does the report's revenue actually follow the date range? Compares the month with the
 * single day before it: a real "cash taken" figure for one day cannot equal the figure for
 * a whole month unless both are zero. True / false when it can tell; null when the report
 * carries no cash figure to compare.
 */
export function revenueIsRangeScoped(month: unknown, dayBefore: unknown): boolean | null {
  const cash = (json: unknown) => {
    const v = (json as { data?: { revenue?: { cash_revenue?: unknown } } })?.data?.revenue?.cash_revenue;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const a = cash(month);
  const b = cash(dayBefore);
  if (a === null || b === null) return null;
  return !(a === b && a !== 0);
}

/** Is `now` inside the given month? (The month still running.) */
export function isRunningMonth(year: number, month: number, now: Date): boolean {
  return now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
}

/** "YYYY-MM-DD" of the day before the 1st of the month. */
export function dayBeforeMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

/** £ / $ / € for the report's `revenue.currency`, the code itself for anything else. */
export function currencyUnit(code: unknown): string | undefined {
  if (typeof code !== "string" || !code.trim()) return undefined;
  const c = code.trim().toUpperCase();
  return ({ GBP: "£", USD: "$", EUR: "€" } as Record<string, string>)[c] ?? c;
}

/** "Strokeplay" → "strokeplay" — a stable key part from a name. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "item";
}

/**
 * The report's two rankings, as list rows (`card.list`): the month's most played courses (by
 * rounds) and how rounds split across game modes. Courses are keyed by RANK — the courses
 * change month to month, so a rank is the only stable key, and a list shows no trends. Game
 * modes are a fixed set, so they are keyed by name. User names (`top_active_users`) are never
 * read.
 */
export function listsFromReport(json: unknown): AnalyticsMetric[] {
  const data = (json as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") return [];
  const out: AnalyticsMetric[] = [];
  const courses = (data.golf_metrics as { most_played_courses?: unknown } | undefined)?.most_played_courses;
  if (Array.isArray(courses)) {
    courses.slice(0, 5).forEach((c, i) => {
      const row = c as { course_name?: unknown; club_name?: unknown; count?: unknown };
      if (typeof row.count !== "number" || !Number.isFinite(row.count)) return;
      const course = typeof row.course_name === "string" ? row.course_name.trim() : "";
      const club = typeof row.club_name === "string" ? row.club_name.trim() : "";
      // "Old Course · St Andrews Links" — the club adds nothing when it is the same name.
      const name = course && club && !club.toLowerCase().includes(course.toLowerCase()) ? `${course} · ${club}` : course || club;
      if (!name) return;
      out.push({
        key: `course_${i + 1}`,
        label: `Most played course #${i + 1}`,
        value: row.count,
        group: "Golf",
        card: { id: "courses", title: "Most played courses · rounds", part: name, list: true },
      });
    });
  }
  const modes = (data.game_modes as { distribution?: unknown } | undefined)?.distribution;
  if (Array.isArray(modes)) {
    for (const m of modes) {
      const row = m as { mode_name?: unknown; percentage?: unknown };
      if (typeof row.mode_name !== "string" || !row.mode_name.trim()) continue;
      if (typeof row.percentage !== "number" || !Number.isFinite(row.percentage)) continue;
      out.push({
        key: `mode_${slug(row.mode_name)}`,
        label: `Game mode: ${row.mode_name.trim()}`,
        value: row.percentage,
        unit: "%",
        group: "Golf",
        card: { id: "modes", title: "Game modes · share of rounds", part: row.mode_name.trim(), list: true },
      });
    }
  }
  return out;
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
    const value = f.path.reduce<unknown>(
      (at, k) => (at && typeof at === "object" ? (at as Record<string, unknown>)[k] : undefined),
      data,
    );
    if (typeof value === "number" && Number.isFinite(value)) {
      const m: AnalyticsMetric = { key: f.key, label: f.label, value, group: f.group };
      if (f.card) m.card = f.card;
      if (f.unit) m.unit = f.unit;
      if (f.money) {
        m.money = true;
        if (money) m.unit = money;
      }
      out.push(m);
    }
  }
  return out;
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const bearer = await bigWedgeBearer({ baseUrl: base, storedToken: ctx.apiToken });
  if (!bearer.ok) throw new Error(bearer.error);

  const now = ctx.now ?? new Date();
  const running = isRunningMonth(ctx.year, ctx.month, now);
  const { from, to } = monthRange(ctx.year, ctx.month, now);
  const day = dayBeforeMonth(ctx.year, ctx.month);
  // All three reads at once. The report alone takes ~4s at Big Wedge (30 Oct 2026); asked one
  // after another a refresh took twice that. The day-before and feedback reads may fail
  // without failing the month — what depends on them is left out, never guessed.
  const [reportRead, beforeRead, feedbackRead] = await Promise.allSettled([
    getJson<unknown>(`${base}/api/v1/analytics/overall-report/?start_date=${from}&end_date=${to}`, bearer.token),
    getJson<unknown>(`${base}/api/v1/analytics/overall-report/?start_date=${day}&end_date=${day}`, bearer.token),
    running ? getJson<unknown>(`${base}/api/v1/feedback/stats/`, bearer.token) : Promise.resolve(undefined),
  ]);
  if (reportRead.status === "rejected") throw reportRead.reason;
  const report = reportRead.value;
  // If the range was not honoured the figures are "this month so far", whatever month was
  // asked for — storing them under another month would be a confident wrong figure.
  const applied = (report as { filters?: { applied_filter?: unknown } })?.filters?.applied_filter;
  if (applied !== undefined && applied !== "custom") {
    throw new Error(
      `Big Wedge ignored the date range (it applied "${String(applied)}"), so these figures are not for ${monthLabel(ctx.year, ctx.month)}.`,
    );
  }
  const metrics = [...metricsFromReport(report), ...listsFromReport(report)];
  if (metrics.length === 0) {
    throw new Error("Big Wedge's analytics report answered but carried none of the expected figures.");
  }
  // Today's-state figures say nothing about a month that has ended (see `now` on FIELDS).
  if (!running) {
    const nowKeys = new Set(NOW_KEYS);
    for (let i = metrics.length - 1; i >= 0; i--) if (nowKeys.has(metrics[i].key)) metrics.splice(i, 1);
  }
  // Feedback: only "the last 30 days" exists, so it belongs to the month still running.
  const recent = (feedbackRead.status === "fulfilled" ? feedbackRead.value : undefined) as
    | { recent_count_30_days?: unknown; recent_count_7_days?: unknown }
    | undefined;
  if (running && typeof recent?.recent_count_30_days === "number") {
    const card = { id: "feedback", title: "Feedback received" };
    metrics.push({ key: "feedback_30d", label: "Feedback, last 30 days", value: recent.recent_count_30_days, group: "Feedback", card: { ...card, part: "Last 30 days" } });
    if (typeof recent.recent_count_7_days === "number") {
      metrics.push({ key: "feedback_7d", label: "Feedback, last 7 days", value: recent.recent_count_7_days, group: "Feedback", card: { ...card, part: "Last 7 days" } });
    }
  }

  // Revenue needs the day BEFORE the month too, for two reasons: to work the total out when
  // Big Wedge does not report it, and to check that the revenue it does report is for THIS
  // range at all (see `revenueIsRangeScoped`). If that read fails, figures that depend on it
  // are LEFT OUT, never guessed: the rest of the month is still good.
  const counts = subCounts(report);
  const reportsCash = metrics.some((m) => m.key === "revenue_cash");
  if (counts || reportsCash) {
    // Read alongside the month above; a failure here is "could not check".
    const before: unknown = beforeRead.status === "fulfilled" ? beforeRead.value : undefined;
    const scoped = before === undefined ? null : revenueIsRangeScoped(report, before);
    const drop = (keep: (m: AnalyticsMetric) => boolean) => {
      for (let i = metrics.length - 1; i >= 0; i--) if (!keep(metrics[i])) metrics.splice(i, 1);
    };

    if (scoped === false) {
      // Big Wedge answered the same revenue for one day as for the whole month, so its
      // revenue block is TODAY's state, not this month's (live, 22 Oct 2026: £373.81 and
      // 8 + 11 subscriptions for August, September, October and a single day alike).
      // "Revenue this month" would be a confident wrong figure, so it goes. The counts and
      // MRR are true NOW, which is right for the month still running and wrong for any
      // month that has ended, so a finished month keeps no revenue figures at all.
      if (isRunningMonth(ctx.year, ctx.month, ctx.now ?? new Date())) {
        // …but as of NOW it is exactly what Big Wedge's own admin shows as "Total estimated
        // revenue" (every active plan at its price: 39 × 5.45 + 95 × 29.99 ≈ £3,063 on 30 Oct
        // 2026). So the month still running keeps it, named for what it is, not as this
        // month's takings.
        const cash = metrics.find((m) => m.key === "revenue_cash");
        if (cash) {
          cash.key = "revenue_total";
          cash.label = "Total estimated revenue";
        }
      } else {
        drop((m) => m.key !== "revenue_cash");
        drop((m) => m.group !== "Revenue");
      }
    } else if (scoped === null && reportsCash) {
      // Could not check the range, so Big Wedge's total cannot be trusted as this month's.
      drop((m) => m.key !== "revenue_cash");
    } else if (!reportsCash && counts) {
      const prior = subCounts(before);
      if (prior) {
        const mrrAt = metrics.findIndex((m) => m.key === "revenue_mrr");
        const unit = metrics[mrrAt]?.unit;
        const total: AnalyticsMetric = {
          key: "revenue_cash",
          label: "Revenue this month (est.)",
          value: estimateRevenueTaken(counts, prior),
          group: "Revenue",
          money: true,
          ...(unit ? { unit } : {}),
        };
        // Beside MRR, so the two are read together.
        metrics.splice(mrrAt >= 0 ? mrrAt + 1 : metrics.length, 0, total);
      }
    }
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
  // All-time counts the date range never changed (111,675 for August, 111,676 for September):
  // a flat line that claims no change. Dropped from new captures in Oct 2026; older months
  // still hold them.
  retiredKeys: ["users_total", "users_returning"],
  // Today's state for any range asked, so a finished month keeps them from its last capture
  // during the month (refreshed every 15 minutes, so within 15 minutes of month end).
  carryAtMonthEnd: ["premium_subscribers", "subs_monthly", "subs_yearly", "revenue_mrr", "revenue_total", ...NOW_KEYS],
  hint: "User analytics, month by month. Foundry logs in with the Big Wedge service account; a token is only a fallback.",
  fetchMonth,
};
