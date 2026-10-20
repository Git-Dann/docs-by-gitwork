/**
 * Big Wedge user analytics — built from the shape the LIVE API returned in Oct 2026, because
 * the OpenAPI spec does not document it and the adapter had been wrong about it twice: it
 * sent date params the report ignores, and an expired token blanked every month silently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJson, bearer } = vi.hoisted(() => ({ getJson: vi.fn(), bearer: vi.fn() }));
vi.mock("@/server/support-analytics/types", async (orig) => ({
  ...(await orig<typeof import("@/server/support-analytics/types")>()),
  getJson: (...a: unknown[]) => getJson(...a),
}));
vi.mock("@/server/bigwedge-api-auth", () => ({ bigWedgeBearer: (...a: unknown[]) => bearer(...a) }));

import {
  bigwedgeAdapter,
  currencyUnit,
  dayBeforeMonth,
  estimateRevenueTaken,
  metricsFromReport,
  monthRange,
} from "@/server/support-analytics/bigwedge";

/** Trimmed from the real response for August 2026. */
const AUGUST = {
  status: "success",
  data: {
    user_growth: { new_users: 8466, user_growth_pct: -20.26, total_users: 111675, active_users: 7837 },
    business_growth: { premium_users: 2, free_vs_premium_ratio: { free_pct: 100, premium_pct: 0 } },
    revenue: { monthly_revenue: 0, arpu: 0 },
    engagement: {
      rounds_created: 25010,
      rounds_played: 21399,
      avg_rounds_per_user: 2.73,
      score_entries: 301204,
      top_active_users: [{ id: 1 }],
    },
    retention: { returning_users: 20741, dau: 269, mau: 7646, dau_mau_ratio: 3.28 },
  },
  filters: { start_date: "2026-08-01T00:00:00Z", end_date: "2026-08-31T00:00:00Z", applied_filter: "custom" },
};

const ctx = { baseUrl: "https://apiv1.bigwedgegolf.com", year: 2026, month: 8 };

beforeEach(() => {
  getJson.mockReset();
  bearer.mockReset();
  bearer.mockResolvedValue({ ok: true, token: "fresh", via: "login" });
});

describe("the month asked for", () => {
  it("is the 1st to the LAST day — end_date is inclusive", () => {
    expect(monthRange(2026, 8)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange(2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("is sent as start_date / end_date — the params the report actually honours", async () => {
    getJson.mockResolvedValue(AUGUST);
    await bigwedgeAdapter.fetchMonth(ctx);
    expect(getJson.mock.calls[0][0]).toBe(
      "https://apiv1.bigwedgegolf.com/api/v1/analytics/overall-report/?start_date=2026-08-01&end_date=2026-08-31",
    );
    expect(getJson.mock.calls[0][1]).toBe("fresh");
  });
});

describe("what is shown", () => {
  it("maps the report to labelled monthly metrics, skipping all-time counts, arrays and unclear ratios", () => {
    const m = metricsFromReport(AUGUST);
    expect(m.map((x) => `${x.label}=${x.value}`)).toEqual([
      "New users=8466",
      "Active users=7837",
      "Monthly active users=7646",
      "Rounds played=21399",
      "Rounds started=25010",
      "Scores entered=301204",
      "Rounds per active user=2.73",
      // August's report has no `mrr` and no subscription counts, so only this one shows.
      "Premium subscribers=2",
    ]);
  });

  it("leaves a missing field out rather than reporting it as zero", () => {
    const m = metricsFromReport({ data: { user_growth: { new_users: 10 } } });
    expect(m).toEqual([{ key: "users_new", label: "New users", value: 10, group: "Users" }]);
  });
});

/**
 * October 2026, 1st–20th, as the live API returned it on Premium's launch day. Reconciles to
 * the plan prices Big Wedge confirmed: 5 × 5.45 + 5 × 29.99 / 12 = 39.75 (one of the yearly
 * subs is a test account from August, still active — hence Syed's "real customers" 37.25).
 */
const OCTOBER_SO_FAR = {
  status: "success",
  data: {
    user_growth: { new_users: 49, total_users: 112121, active_users: 165 },
    business_growth: { premium_users: 10, free_vs_premium_ratio: { free_pct: 99.9, premium_pct: 0.1 }, user_churn_rate: 0 },
    revenue: { monthly_revenue: 39.75, mrr: 39.75, arpu: 3.98, active_monthly_subs: 5, active_yearly_subs: 5 },
    engagement: { rounds_created: 183, rounds_played: 73, avg_rounds_per_user: 1.11, score_entries: 1243 },
    retention: { returning_users: 20838, dau: 165, mau: 7931 },
  },
  filters: { start_date: "2026-10-01T00:00:00Z", end_date: "2026-10-20T00:00:00Z", applied_filter: "custom" },
};

describe("revenue", () => {
  const revenue = (json: unknown) =>
    metricsFromReport(json).filter((m) => m.group === "Revenue").map((m) => `${m.label}=${m.value}${m.unit ?? ""}`);

  it("is its own group: subscribers, the two plan counts, and MRR", () => {
    expect(revenue(OCTOBER_SO_FAR)).toEqual([
      "Premium subscribers=10",
      "Monthly subscriptions=5",
      "Yearly subscriptions=5",
      "MRR=39.75",
    ]);
  });

  it("⚠️ has no currency symbol when the report names no currency — never a guessed £", () => {
    for (const m of metricsFromReport(OCTOBER_SO_FAR)) expect(m.unit, m.key).toBeUndefined();
  });

  it("puts the report's currency on money figures only", () => {
    const withCurrency = {
      ...OCTOBER_SO_FAR,
      data: { ...OCTOBER_SO_FAR.data, revenue: { ...OCTOBER_SO_FAR.data.revenue, currency: "gbp" } },
    };
    const m = metricsFromReport(withCurrency);
    expect(m.find((x) => x.key === "revenue_mrr")?.unit).toBe("£");
    expect(m.find((x) => x.key === "subs_monthly")?.unit).toBeUndefined();
    expect(currencyUnit("USD")).toBe("$");
    expect(currencyUnit("AUD")).toBe("AUD");
    expect(currencyUnit("")).toBeUndefined();
  });

  it("shows cash taken in the month (yearly counted in full) once the report carries it", () => {
    expect(revenue(OCTOBER_SO_FAR)).not.toContain(expect.stringMatching(/^Revenue this month/));
    const withCash = {
      ...OCTOBER_SO_FAR,
      data: { ...OCTOBER_SO_FAR.data, revenue: { ...OCTOBER_SO_FAR.data.revenue, cash_revenue: 176.2 } },
    };
    expect(revenue(withCash)).toContain("Revenue this month=176.2");
  });
});

describe("revenue taken — the total MRR cannot give", () => {
  /** The day before October: only the August test yearly sub was active (live, 20 Oct). */
  const SEP_30 = { status: "success", data: { revenue: { active_monthly_subs: 0, active_yearly_subs: 1, mrr: 2.5 } } };
  const octCtx = { ...ctx, month: 10, now: new Date("2026-10-20T14:00:00Z") };

  it("monthly plans paid once each, NEW yearly plans paid in full", () => {
    // Live counts at 17:29 on launch day: 6 monthly, 6 yearly active, 1 yearly already on 30 Sep.
    expect(estimateRevenueTaken({ monthly: 6, yearly: 6 }, { monthly: 0, yearly: 1 })).toBe(182.65);
  });

  it("⚠️ a yearly sub from an earlier month is not counted again", () => {
    // September: the one August yearly sub is active in the month AND the day before it.
    expect(estimateRevenueTaken({ monthly: 0, yearly: 1 }, { monthly: 0, yearly: 1 })).toBe(0);
  });

  it("never goes negative when subscriptions lapse", () => {
    expect(estimateRevenueTaken({ monthly: 0, yearly: 1 }, { monthly: 0, yearly: 3 })).toBe(0);
  });

  it("the day before a month rolls back over a year end", () => {
    expect(dayBeforeMonth(2026, 10)).toBe("2026-09-30");
    expect(dayBeforeMonth(2027, 1)).toBe("2026-12-31");
  });

  it("reads the day before the month, and sits beside MRR labelled as an estimate", async () => {
    getJson.mockResolvedValueOnce(OCTOBER_SO_FAR).mockResolvedValueOnce(SEP_30);
    const snap = await bigwedgeAdapter.fetchMonth(octCtx);
    expect(getJson.mock.calls[1][0]).toBe(
      "https://apiv1.bigwedgegolf.com/api/v1/analytics/overall-report/?start_date=2026-09-30&end_date=2026-09-30",
    );
    const keys = snap.metrics.map((m) => m.key);
    expect(keys.indexOf("revenue_cash")).toBe(keys.indexOf("revenue_mrr") + 1);
    const total = snap.metrics.find((m) => m.key === "revenue_cash")!;
    // 5 × 5.45 + (5 − 1) × 29.99 — Syed's "real customers only" sum.
    expect(total).toMatchObject({ label: "Revenue this month (est.)", value: 147.21, money: true });
  });

  it("uses Big Wedge's own figure once the report carries it, and asks for nothing more", async () => {
    getJson.mockResolvedValueOnce({
      ...OCTOBER_SO_FAR,
      data: { ...OCTOBER_SO_FAR.data, revenue: { ...OCTOBER_SO_FAR.data.revenue, cash_revenue: 150 } },
    });
    const snap = await bigwedgeAdapter.fetchMonth(octCtx);
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(snap.metrics.find((m) => m.key === "revenue_cash")).toMatchObject({ label: "Revenue this month", value: 150 });
  });

  it("⚠️ leaves the total OUT when the day before cannot be read — the month still loads", async () => {
    getJson.mockResolvedValueOnce(OCTOBER_SO_FAR).mockRejectedValueOnce(new Error("503"));
    const snap = await bigwedgeAdapter.fetchMonth(octCtx);
    expect(snap.metrics.some((m) => m.key === "revenue_cash")).toBe(false);
    expect(snap.metrics.some((m) => m.key === "revenue_mrr")).toBe(true);
  });

  it("money figures are flagged so they keep their pence", () => {
    const m = metricsFromReport(OCTOBER_SO_FAR);
    expect(m.find((x) => x.key === "revenue_mrr")?.money).toBe(true);
    expect(m.find((x) => x.key === "subs_monthly")?.money).toBeUndefined();
  });
});

describe("the month still running", () => {
  it("ends its range TODAY, not on a day that has not happened", () => {
    const now = new Date("2026-10-20T14:00:00Z");
    expect(monthRange(2026, 10, now)).toEqual({ from: "2026-10-01", to: "2026-10-20" });
    // A finished month is unaffected, and so is the last day of the running one.
    expect(monthRange(2026, 9, now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange(2026, 10, new Date("2026-10-31T09:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("the adapter opts in to showing it", () => {
    expect(bigwedgeAdapter.monthToDate).toBe(true);
  });
});

describe("a month that cannot be read is an error, never an empty month", () => {
  it("throws when Foundry cannot log in", async () => {
    bearer.mockResolvedValue({ ok: false, error: "Big Wedge rejected Foundry's login (bad password)." });
    await expect(bigwedgeAdapter.fetchMonth(ctx)).rejects.toThrow(/rejected Foundry's login/);
    expect(getJson).not.toHaveBeenCalled();
  });

  it("throws when the report ignored the range — those figures are not that month's", async () => {
    getJson.mockResolvedValue({ ...AUGUST, filters: { applied_filter: "current_month" } });
    await expect(bigwedgeAdapter.fetchMonth(ctx)).rejects.toThrow(/ignored the date range/);
  });

  it("throws when the report carries none of the expected figures", async () => {
    getJson.mockResolvedValue({ status: "success", data: {}, filters: { applied_filter: "custom" } });
    await expect(bigwedgeAdapter.fetchMonth(ctx)).rejects.toThrow(/none of the expected figures/);
  });

  it("passes a request failure through", async () => {
    getJson.mockRejectedValue(new Error("https://apiv1… → 503: down"));
    await expect(bigwedgeAdapter.fetchMonth(ctx)).rejects.toThrow(/503/);
  });
});
