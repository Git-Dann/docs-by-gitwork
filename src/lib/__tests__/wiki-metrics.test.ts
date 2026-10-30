/**
 * The Metrics section's rules. They decide what a CLIENT is told about their own product,
 * so the cases here are the ones where a plausible-looking figure would be wrong.
 */
import { describe, expect, it } from "vitest";
import {
  addMonths,
  carryMonthEndFigures,
  isHiddenMetric,
  listHideKey,
  endpointUrl,
  formatMetric,
  isFinal,
  listMetricEndpoints,
  metricTrend,
  modeForAdapter,
  periodsToFetch,
  readMetricsConfig,
  rekeyByCapture,
  selectMetricsView,
  readMetricCard,
  selectMonthToDate,
  tilesFor,
  headlineTileIndexes,
  metricPeriodOptions,
  metricsAt,
  HEADLINE_COUNT,
  SO_FAR,
  type StoredSnapshot,
  type WikiMetric,
} from "@/lib/wiki-metrics";

const NOW = new Date("2026-10-15T12:00:00Z");
const m = (key: string, value: number) => ({ key, label: key, value });
const snap = (period: string, capturedAt: string, metrics = [m("users", 100)]): StoredSnapshot => ({
  period,
  capturedAt,
  metrics,
});

describe("which month is final", () => {
  it("a capture taken during its own month is partial", () => {
    expect(isFinal(snap("2026-10", "2026-10-15T09:00:00Z"))).toBe(false);
    expect(isFinal(snap("2026-09", "2026-09-30T23:59:59Z"))).toBe(false);
  });

  it("a capture taken after the month ended is final", () => {
    expect(isFinal(snap("2026-09", "2026-10-01T00:00:00Z"))).toBe(true);
  });

  it("December rolls into the next year", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(isFinal(snap("2026-12", "2027-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("monthly source", () => {
  it("leads with the last COMPLETE month, never the one in progress", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [
        // October so far — would read as a collapse next to all of September.
        snap("2026-10", "2026-10-15T09:00:00Z", [m("users", 40)]),
        snap("2026-09", "2026-10-02T09:00:00Z", [m("users", 120)]),
        snap("2026-08", "2026-09-02T09:00:00Z", [m("users", 100)]),
      ],
    });
    expect(v.period).toBe("2026-09");
    expect(v.metrics[0].value).toBe(120);
    expect(v.metrics[0].previous).toBe(100);
    expect(v.needsRefresh).toBe(false);
  });

  it("never shows a partial capture as that month's figure", () => {
    // September captured on the 20th of September only: not final, so it is not shown,
    // and the section falls back to August and asks for a refresh.
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [
        snap("2026-09", "2026-09-20T09:00:00Z", [m("users", 60)]),
        snap("2026-08", "2026-09-02T09:00:00Z", [m("users", 100)]),
      ],
    });
    expect(v.period).toBe("2026-08");
    expect(v.metrics[0].value).toBe(100);
    expect(v.needsRefresh).toBe(true);
  });

  it("compares only with a final previous month, else says nothing", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [
        snap("2026-09", "2026-10-02T09:00:00Z", [m("users", 120)]),
        snap("2026-08", "2026-08-20T09:00:00Z", [m("users", 90)]), // partial
      ],
    });
    expect(v.metrics[0].previous).toBeNull();
    expect(v.previousPeriod).toBeNull();
  });

  it("history leaves a gap as null rather than drawing it as zero", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [
        snap("2026-09", "2026-10-02T09:00:00Z", [m("users", 120)]),
        snap("2026-07", "2026-08-02T09:00:00Z", [m("users", 80)]),
      ],
    });
    expect(v.historyPeriods).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(v.metrics[0].history).toEqual([null, null, null, 80, null, 120]);
  });

  it("nothing stored → empty, and asks for a refresh", () => {
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: [] });
    expect(v.period).toBeNull();
    expect(v.metrics).toEqual([]);
    expect(v.needsRefresh).toBe(true);
  });
});

describe("current source", () => {
  it("belongs to the month it was CAPTURED in, whatever it was stored under", () => {
    // The Care report builder stored today's values under August. They are October's.
    const out = rekeyByCapture([snap("2026-08", "2026-10-10T09:00:00Z")]);
    expect(out[0].period).toBe("2026-10");
  });

  it("the section labels and compares a current source by capture month", () => {
    const v = selectMetricsView({
      mode: "current",
      now: NOW,
      snapshots: [
        snap("2026-08", "2026-10-10T09:00:00Z", [m("users", 300)]), // stored under the wrong month
        snap("2026-09", "2026-09-28T09:00:00Z", [m("users", 250)]),
      ],
    });
    expect(v.period).toBe("2026-10");
    expect(v.metrics[0].previous).toBe(250);
  });

  it("the latest capture in a month stands for that month", () => {
    const out = rekeyByCapture([
      snap("2026-10", "2026-10-01T09:00:00Z", [m("users", 1)]),
      snap("2026-10", "2026-10-12T09:00:00Z", [m("users", 2)]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].metrics[0].value).toBe(2);
  });

  it("is stale after six hours", () => {
    const fresh = selectMetricsView({
      mode: "current",
      now: NOW,
      snapshots: [snap("2026-10", "2026-10-15T10:00:00Z")],
    });
    const stale = selectMetricsView({
      mode: "current",
      now: NOW,
      snapshots: [snap("2026-10", "2026-10-15T05:00:00Z")],
    });
    expect(fresh.needsRefresh).toBe(false);
    expect(stale.needsRefresh).toBe(true);
  });

  it("a generic adapter is a current source; every other one is monthly", () => {
    expect(modeForAdapter("generic")).toBe("current");
    expect(modeForAdapter("fellas")).toBe("monthly");
    expect(modeForAdapter(null)).toBe("monthly");
  });
});

describe("hidden and featured", () => {
  const snaps = [snap("2026-09", "2026-10-02T09:00:00Z", [m("a", 1), m("b", 2), m("c", 3), m("d", 4)])];

  it("with nothing chosen, the first three visible metrics lead", () => {
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: snaps, hiddenKeys: ["a"] });
    expect(v.metrics.filter((x) => x.featured).map((x) => x.key)).toEqual(["b", "c", "d"]);
  });

  it("a hidden metric is never featured, even if it was chosen", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: snaps,
      hiddenKeys: ["c"],
      featuredKeys: ["c", "d"],
    });
    expect(v.metrics.find((x) => x.key === "c")).toMatchObject({ hidden: true, featured: false });
    expect(v.metrics.filter((x) => x.featured).map((x) => x.key)).toEqual(["d"]);
  });

  it("a duplicated or non-numeric metric is dropped, not shown twice", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [snap("2026-09", "2026-10-02T09:00:00Z", [m("a", 1), m("a", 2), { key: "x", label: "x", value: NaN }])],
    });
    expect(v.metrics.map((x) => x.key)).toEqual(["a"]);
  });
});

describe("what to fetch", () => {
  it("each of the last six complete months without a FINAL snapshot", () => {
    const out = periodsToFetch(
      [
        snap("2026-09", "2026-10-02T09:00:00Z"), // final — skip
        snap("2026-08", "2026-08-20T09:00:00Z"), // partial — fetch again
      ],
      NOW,
    );
    expect(out).toEqual(["2026-08", "2026-07", "2026-06", "2026-05", "2026-04"]);
  });
});

describe("an empty month is not a month (old adapters stored one when a read failed)", () => {
  const empty = (period: string, capturedAt: string) => snap(period, capturedAt, []);

  it("is never shown, and is fetched again", () => {
    const snapshots = [
      snap("2026-09", "2026-10-16T09:00:00Z", [m("users", 120)]),
      empty("2026-08", "2026-09-03T13:00:00Z"), // final by date, but empty
    ];
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots });
    expect(v.period).toBe("2026-09");
    expect(v.metrics[0].previous).toBeNull();
    expect(v.metrics[0].history.at(-2)).toBeNull();
    expect(periodsToFetch(snapshots, NOW)).toContain("2026-08");
  });

  it("asks for a refresh even when the latest month is already in", () => {
    // Wedge in Oct 2026: September read, July and August stored empty by the old adapter.
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [
        snap("2026-09", "2026-10-16T09:00:00Z", [m("users", 120)]),
        empty("2026-08", "2026-08-03T13:00:00Z"),
        empty("2026-07", "2026-07-31T13:00:00Z"),
      ],
    });
    expect(v.needsRefresh).toBe(true);
  });

  it("does not keep asking for months that were never stored", () => {
    // Only September exists. Earlier months may predate the client's data; asking on every
    // open would only ever fail.
    const v = selectMetricsView({
      mode: "monthly",
      now: NOW,
      snapshots: [snap("2026-09", "2026-10-16T09:00:00Z", [m("users", 120)])],
    });
    expect(v.needsRefresh).toBe(false);
  });

  it("is ignored by a current-mode source too", () => {
    const v = selectMetricsView({
      mode: "current",
      now: NOW,
      snapshots: [
        snap("2026-10", "2026-10-15T11:00:00Z", []),
        snap("2026-10", "2026-10-14T11:00:00Z", [m("users", 80)]),
      ],
    });
    expect(v.metrics[0]?.value).toBe(80);
  });
});

describe("API Docs endpoints", () => {
  const content = {
    servers: [
      { url: "https://api.client.com/", label: "Production" },
      { url: "/relative", label: "Bad" },
      { url: "ftp://files.client.com", label: "Bad" },
    ],
    endpoints: [
      { method: "GET", path: "/v1/stats", summary: "Totals", auth: true },
      { method: "GET", path: "/v1/users/{id}", summary: "One user" },
      { method: "POST", path: "/v1/stats", summary: "Write" },
      { method: "get", path: "/v1/health" },
      { method: "GET", path: "no-slash" },
    ],
  };

  it("offers only GETs with no path parameters, on absolute http(s) servers", () => {
    const out = listMetricEndpoints(content);
    expect(out.map((o) => `${o.serverUrl}${o.path}`)).toEqual([
      "https://api.client.com/v1/stats",
      "https://api.client.com/v1/health",
    ]);
    expect(out[0]).toMatchObject({ auth: true, summary: "Totals", serverLabel: "Production" });
  });

  it("reads junk as no endpoints rather than throwing", () => {
    expect(listMetricEndpoints(null)).toEqual([]);
    expect(listMetricEndpoints({ servers: "x", endpoints: 3 })).toEqual([]);
  });

  it("joins server and path with exactly one slash", () => {
    expect(endpointUrl({ serverUrl: "https://a.com/", path: "/v1/x" })).toBe("https://a.com/v1/x");
    expect(endpointUrl({ serverUrl: "https://a.com", path: "v1/x" })).toBe("https://a.com/v1/x");
  });
});

describe("config and formatting", () => {
  it("malformed config reads as defaults, and featured is capped at three", () => {
    expect(readMetricsConfig("nope")).toEqual({
      hiddenKeys: [],
      featuredKeys: [],
      apiEndpoint: null,
      apiTokenCipher: null,
    });
    expect(readMetricsConfig({ featuredKeys: ["a", "b", "c", "d"] }).featuredKeys).toEqual(["a", "b", "c"]);
    expect(readMetricsConfig({ apiEndpoint: { serverUrl: "", path: "/x" } }).apiEndpoint).toBeNull();
  });

  it("no trend against nothing, or against zero", () => {
    expect(metricTrend(10, null)).toBeNull();
    expect(metricTrend(10, 0)).toBeNull();
    expect(metricTrend(110, 100)).toMatchObject({ direction: "up" });
    expect(metricTrend(90, 100)?.deltaPct).toBeCloseTo(-0.1);
  });

  it("puts a currency symbol before and other units after", () => {
    expect(formatMetric(1240, null)).toBe("1,240");
    expect(formatMetric(3410, "£")).toBe("£3,410");
    expect(formatMetric(62, "%")).toBe("62%");
    expect(formatMetric(12, "min")).toBe("12 min");
  });
});

describe("the month still running (\"October so far\")", () => {
  const SNAPS = [
    snap("2026-10", "2026-10-15T09:00:00Z", [m("mrr", 39.75), m("users", 40)]),
    snap("2026-09", "2026-10-02T09:00:00Z", [m("users", 120)]),
  ];

  it("is shown beside the last complete month — never AS it", () => {
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: SNAPS, monthToDate: true });
    expect(v.period).toBe("2026-09");
    expect(v.metrics.map((x) => x.key)).toEqual(["users"]);
    expect(v.monthToDate?.period).toBe("2026-10");
    expect(v.monthToDate?.metrics.map((x) => `${x.key}=${x.value}`)).toEqual(["mrr=39.75", "users=40"]);
  });

  it("is off unless the source opts in, and never for a 'current' source", () => {
    expect(selectMetricsView({ mode: "monthly", now: NOW, snapshots: SNAPS }).monthToDate).toBeNull();
    expect(selectMetricsView({ mode: "current", now: NOW, snapshots: SNAPS, monthToDate: true }).monthToDate).toBeNull();
  });

  it("⚠️ a partial capture of a month that has ENDED is not 'so far' — it is waiting to be replaced", () => {
    const v = selectMonthToDate([snap("2026-09", "2026-09-20T09:00:00Z")], NOW);
    expect(v).toBeNull();
  });

  it("is shown even before any whole month has been fetched", () => {
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: [SNAPS[0]], monthToDate: true });
    expect(v.period).toBeNull();
    expect(v.monthToDate?.metrics).toHaveLength(2);
  });

  it("carries the hidden flag, so the client's copy can drop it", () => {
    const v = selectMonthToDate(SNAPS, NOW, ["mrr"]);
    expect(v?.metrics.find((x) => x.key === "mrr")?.hidden).toBe(true);
  });

  it("is fetched first when missing or older than 15 minutes, and not otherwise", () => {
    // NOW is 12:00. 11:50 is fresh; 11:30 is behind (it used to be six hours, which read as
    // wrong next to the client's own live admin).
    const fresh = [snap("2026-10", "2026-10-15T11:50:00Z"), ...SNAPS.slice(1)];
    expect(periodsToFetch([snap("2026-10", "2026-10-15T11:30:00Z"), ...SNAPS.slice(1)], NOW, { monthToDate: true })[0]).toBe("2026-10");
    expect(periodsToFetch(fresh, NOW, { monthToDate: true })[0]).not.toBe("2026-10");
    expect(periodsToFetch(SNAPS.slice(1), NOW, { monthToDate: true })[0]).toBe("2026-10");
    const stale = [snap("2026-10", "2026-10-15T05:00:00Z"), ...SNAPS.slice(1)];
    expect(periodsToFetch(stale, NOW, { monthToDate: true })[0]).toBe("2026-10");
    // Without the opt-in the running month is never fetched.
    expect(periodsToFetch(SNAPS.slice(1), NOW)).not.toContain("2026-10");
  });

  it("a stale running month makes the section ask for a refresh", () => {
    const stale = [snap("2026-10", "2026-10-15T05:00:00Z"), ...SNAPS.slice(1)];
    // September is final and complete, so only the running month can be what is behind.
    const base = selectMetricsView({ mode: "monthly", now: NOW, snapshots: stale });
    expect(base.needsRefresh).toBe(false);
    expect(selectMetricsView({ mode: "monthly", now: NOW, snapshots: stale, monthToDate: true }).needsRefresh).toBe(true);
  });
});

describe("money keeps its pence", () => {
  it("47.70, never 47.7 — and whole pounds still show .00", () => {
    expect(formatMetric(47.7, null, true)).toBe("47.70");
    expect(formatMetric(182.65, "£", true)).toBe("£182.65");
    expect(formatMetric(1234, null, true)).toBe("1,234.00");
    // Everything else is unchanged.
    expect(formatMetric(47.7, null)).toBe("47.7");
    expect(formatMetric(12, null)).toBe("12");
  });

  it("the money flag survives into the view, the running month included", () => {
    const snaps: StoredSnapshot[] = [
      { period: "2026-10", capturedAt: "2026-10-15T09:00:00Z", metrics: [{ key: "mrr", label: "MRR", value: 47.7, money: true }] },
      { period: "2026-09", capturedAt: "2026-10-02T09:00:00Z", metrics: [{ key: "mrr", label: "MRR", value: 2.5, money: true }] },
    ];
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: snaps, monthToDate: true });
    expect(v.metrics[0].money).toBe(true);
    expect(v.monthToDate?.metrics[0].money).toBe(true);
  });
});

describe("several metrics in one card", () => {
  const subs = (part: string) => ({ id: "subs", title: "Subscriptions", part });
  const row = (key: string, card: ReturnType<typeof subs> | null = null) => ({ key, card });

  it("groups by card where the first of them stood, in order, everything else untouched", () => {
    const t = tilesFor([row("users"), row("total", subs("Total")), row("mrr"), row("monthly", subs("Monthly")), row("yearly", subs("Yearly"))]);
    expect(t.map((x) => (x.kind === "single" ? x.metric.key : `${x.title}:${x.parts.map((p) => p.key).join("+")}`))).toEqual([
      "users",
      "Subscriptions:total+monthly+yearly",
      "mrr",
    ]);
  });

  it("⚠️ a card left with ONE part is just that metric — a lone 'Monthly' says nothing", () => {
    const t = tilesFor([row("monthly", subs("Monthly"))]);
    expect(t).toEqual([{ kind: "single", metric: row("monthly", subs("Monthly")) }]);
  });

  it("a malformed stored card is ignored, not trusted", () => {
    expect(readMetricCard({ id: "subs", title: "Subscriptions", part: "Total" })).toEqual(subs("Total"));
    expect(readMetricCard({ id: "", title: "x", part: "y" })).toBeNull();
    expect(readMetricCard({ id: "subs", title: 3, part: "y" })).toBeNull();
    expect(readMetricCard("subs")).toBeNull();
  });

  it("the card survives into both views", () => {
    const card = { id: "subs", title: "Subscriptions", part: "Total" };
    const snaps: StoredSnapshot[] = [
      { period: "2026-10", capturedAt: "2026-10-15T09:00:00Z", metrics: [{ key: "t", label: "T", value: 12, card }] },
      { period: "2026-09", capturedAt: "2026-10-02T09:00:00Z", metrics: [{ key: "t", label: "T", value: 1, card }] },
    ];
    const v = selectMetricsView({ mode: "monthly", now: NOW, snapshots: snaps, monthToDate: true });
    expect(v.metrics[0].card).toEqual(card);
    expect(v.monthToDate?.metrics[0].card).toEqual(card);
  });
});

describe("choosing a period on the page", () => {
  const P = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const m = (key: string, group: string, history: (number | null)[], extra: Partial<WikiMetric> = {}): WikiMetric => ({
    key,
    label: key,
    value: history[history.length - 1] ?? 0,
    unit: null,
    group,
    previous: null,
    hidden: false,
    featured: false,
    history,
    ...extra,
  });
  const src = {
    historyPeriods: P,
    metrics: [
      m("users_new", "Users", [10, 20, 30, 40, 50]),
      m("users_active", "Users", [null, null, 5, 6, 7]),
      m("rounds", "Golf", [1, 2, 3, 4, 5]),
      m("secret", "Golf", [9, 9, 9, 9, 9], { hidden: true }),
    ],
    monthToDate: {
      period: "2026-10",
      capturedAt: "2026-10-22T09:00:00Z",
      metrics: [{ key: "users_new", label: "New users", value: 12, unit: null, group: "Users", hidden: false }],
    },
  };

  it("offers the running month first, then whole months newest first", () => {
    const opts = metricPeriodOptions(src);
    expect(opts.map((o) => o.value)).toEqual([SO_FAR, "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]);
    expect(opts[0].short).toBe("Oct so far");
    expect(opts[1]).toMatchObject({ label: "September 2026", short: "Sep" });
  });

  it("a past month shows that month's figure, compared with the month before, line up to it", () => {
    const rows = metricsAt(src, "2026-07");
    const u = rows.find((r) => r.key === "users_new")!;
    expect(u).toMatchObject({ value: 30, previous: 20 });
    expect(u.history.map((h) => h.period)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("⚠️ a metric with no figure that month is left out, never shown as 0", () => {
    expect(metricsAt(src, "2026-06").some((r) => r.key === "users_active")).toBe(false);
  });

  it("⚠️ a hidden metric never appears, in any period", () => {
    for (const o of metricPeriodOptions(src)) expect(metricsAt(src, o.value).some((r) => r.key === "secret")).toBe(false);
  });

  it("the running month carries no comparison at all", () => {
    expect(metricsAt(src, SO_FAR)[0].previous).toBeUndefined();
  });
});

describe("the headline row", () => {
  const t = (key: string, group: string) => ({ kind: "single" as const, metric: { key, group } });
  const tiles = [t("u1", "Users"), t("u2", "Users"), t("u3", "Users"), t("g1", "Golf"), t("g2", "Golf"), t("r1", "Revenue")];

  it("with nothing featured, takes one from each group in turn — not four user counts", () => {
    expect(headlineTileIndexes(tiles, []).map((i) => tiles[i].metric.key)).toEqual(["u1", "g1", "r1", "u2"]);
  });

  it("★ picks lead, in the order chosen, and the rest fill to four", () => {
    expect(headlineTileIndexes(tiles, ["r1", "g2"]).map((i) => tiles[i].metric.key)).toEqual(["r1", "g2", "u1", "g1"]);
  });

  it("a card counts once, found by any of its parts", () => {
    const withCard = [{ kind: "card" as const, id: "subs", title: "Subs", parts: [{ key: "s_total", group: "Revenue" }, { key: "s_m", group: "Revenue" }] }, ...tiles];
    expect(headlineTileIndexes(withCard, ["s_m"])[0]).toBe(0);
  });

  it("never more than four, and never a duplicate", () => {
    const idx = headlineTileIndexes(tiles, ["u1", "u1", "u2", "u3", "g1", "g2"]);
    expect(idx).toHaveLength(HEADLINE_COUNT);
    expect(new Set(idx).size).toBe(HEADLINE_COUNT);
  });
});

describe("Refresh now", () => {
  it("re-reads a running month that is still fresh when forced", () => {
    const NOW2 = new Date("2026-10-15T12:00:00Z");
    const fresh = [{ period: "2026-10", capturedAt: "2026-10-15T11:50:00Z", metrics: [{ key: "a", label: "a", value: 1 }] }];
    expect(periodsToFetch(fresh, NOW2, { monthToDate: true })).not.toContain("2026-10");
    expect(periodsToFetch(fresh, NOW2, { monthToDate: true, force: true })[0]).toBe("2026-10");
  });
});

describe("a finished month keeps its as-of-now figures from month end", () => {
  const KEYS = ["subs_monthly", "revenue_total"];
  const partial = {
    period: "2026-10",
    capturedAt: "2026-10-31T23:05:00Z",
    metrics: [
      { key: "users_new", label: "New", value: 4000 },
      { key: "subs_monthly", label: "Monthly", value: 41 },
      { key: "revenue_total", label: "Total estimated revenue", value: 3200, money: true },
    ],
  };
  const fresh = [{ key: "users_new", label: "New", value: 4100 }];

  it("carries the named keys the final read lacks, from the last capture during the month", () => {
    const out = carryMonthEndFigures(fresh, partial, KEYS);
    expect(out.map((m) => `${m.key}=${m.value}`)).toEqual(["users_new=4100", "subs_monthly=41", "revenue_total=3200"]);
  });

  it("never overwrites what the final read did return", () => {
    const out = carryMonthEndFigures([...fresh, { key: "subs_monthly", label: "Monthly", value: 42 }], partial, KEYS);
    // Exactly once, and the final read's value — not a second copy from month end.
    expect(out.filter((m) => m.key === "subs_monthly").map((m) => m.value)).toEqual([42]);
  });

  it("⚠️ carries nothing from a capture taken outside the month", () => {
    expect(carryMonthEndFigures(fresh, { ...partial, capturedAt: "2026-11-01T00:10:00Z" }, KEYS)).toBe(fresh);
    expect(carryMonthEndFigures(fresh, { ...partial, capturedAt: "2026-09-30T22:00:00Z" }, KEYS)).toBe(fresh);
  });

  it("does nothing for an adapter that names no keys", () => {
    expect(carryMonthEndFigures(fresh, partial, undefined)).toBe(fresh);
  });
});

describe("lists (most played courses, game modes)", () => {
  const card = (id: string, part: string) => ({ id, title: id, part, list: true });
  const listSnap = (capturedAt: string) => ({
    period: "2026-09",
    capturedAt,
    metrics: [
      { key: "users_new", label: "New", value: 100, group: "Users" },
      { key: "course_1", label: "#1", value: 300, group: "Golf", card: card("courses", "Old Course") },
      { key: "course_2", label: "#2", value: 200, group: "Golf", card: card("courses", "New Course") },
    ],
  });

  it("a list stays a list even with one item, and its rows keep their order", () => {
    const tiles = tilesFor([{ key: "course_1", card: card("courses", "Old Course") }]);
    expect(tiles[0].kind).toBe("card");
  });

  it("⚠️ hiding the list hides every item; its items are never featured", () => {
    const v = selectMetricsView({
      mode: "monthly",
      now: new Date("2026-10-15T12:00:00Z"),
      snapshots: [listSnap("2026-10-02T09:00:00Z")],
      hiddenKeys: [listHideKey("courses")],
    });
    expect(v.metrics.filter((m) => m.key.startsWith("course_")).every((m) => m.hidden)).toBe(true);
    expect(v.metrics.some((m) => m.key.startsWith("course_") && m.featured)).toBe(false);
    expect(isHiddenMetric({ key: "course_1", card: card("courses", "x") }, new Set([listHideKey("courses")]))).toBe(true);
    expect(isHiddenMetric({ key: "users_new" }, new Set([listHideKey("courses")]))).toBe(false);
  });

  it("a list never takes a headline slot", () => {
    const tiles = tilesFor([
      { key: "course_1", group: "Golf", card: card("courses", "a") },
      { key: "course_2", group: "Golf", card: card("courses", "b") },
      { key: "users_new", group: "Users", card: null },
    ]);
    const picked = headlineTileIndexes(tiles, ["course_1"]);
    expect(picked.every((i) => tiles[i].kind === "single")).toBe(true);
  });

  it("the stored card keeps its list flag", () => {
    expect(readMetricCard({ id: "c", title: "t", part: "p", list: true })?.list).toBe(true);
    expect(readMetricCard({ id: "c", title: "t", part: "p" })?.list).toBeUndefined();
  });
});
