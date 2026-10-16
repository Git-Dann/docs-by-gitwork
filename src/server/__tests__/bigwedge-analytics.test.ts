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

import { bigwedgeAdapter, metricsFromReport, monthRange } from "@/server/support-analytics/bigwedge";

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
  it("maps the report to labelled user metrics, skipping revenue, arrays and unclear ratios", () => {
    const m = metricsFromReport(AUGUST);
    expect(m.map((x) => `${x.label}=${x.value}`)).toEqual([
      "Total users=111675",
      "New users=8466",
      "Active users=7837",
      "Returning users=20741",
      "Monthly active users=7646",
      "Rounds played=21399",
      "Rounds started=25010",
      "Scores entered=301204",
      "Rounds per active user=2.73",
    ]);
  });

  it("leaves a missing field out rather than reporting it as zero", () => {
    const m = metricsFromReport({ data: { user_growth: { total_users: 10 } } });
    expect(m).toEqual([{ key: "users_total", label: "Total users", value: 10, group: "Users" }]);
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
