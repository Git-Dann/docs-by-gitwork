import { describe, expect, it } from "vitest";
import {
  AI_SOURCE_REGEX,
  changeBetween,
  classifyAiSource,
  compareQueries,
  daysIn,
  filterQueries,
  formatPeriod,
  freshnessOf,
  ga4Caveats,
  googleCaveats,
  lastKnown,
  mergeSync,
  periodsEnding,
  normaliseGa4PropertyId,
  normaliseSearchConsoleSite,
  parseAiSearchConfig,
  parseAiSearchRange,
  periodsFor,
  summariseAiVisits,
  summariseQueries,
  type QueryRow,
} from "@/lib/ai-search";

const TODAY = new Date("2026-11-02T10:00:00Z");

describe("periodsFor", () => {
  it("ends lagDays back and puts the previous period directly before it, same length", () => {
    const { current, previous } = periodsFor(7, TODAY, 3);
    expect(current).toEqual({ start: "2026-10-24", end: "2026-10-30" });
    expect(previous).toEqual({ start: "2026-10-17", end: "2026-10-23" });
    expect(daysIn(current)).toHaveLength(7);
    expect(daysIn(previous)).toHaveLength(7);
  });

  it("crosses a month and a year correctly", () => {
    const { current, previous } = periodsFor(28, new Date("2026-01-10T00:00:00Z"), 1);
    expect(current).toEqual({ start: "2025-12-13", end: "2026-01-09" });
    expect(daysIn(previous)).toHaveLength(28);
    expect(previous.end).toBe("2025-12-12");
  });

  it("falls back to 28 days for anything but 7, 28 or 90", () => {
    expect(parseAiSearchRange("7")).toBe(7);
    expect(parseAiSearchRange("90")).toBe(90);
    expect(parseAiSearchRange("30")).toBe(28);
    expect(parseAiSearchRange(null)).toBe(28);
  });
});

describe("classifyAiSource", () => {
  it.each([
    ["chatgpt.com", "chatgpt"],
    ["chat.openai.com", "chatgpt"],
    ["https://www.perplexity.ai/search?q=x", "perplexity"],
    ["CLAUDE.AI", "claude"],
    ["gemini.google.com", "gemini"],
    ["copilot.microsoft.com", "copilot"],
  ])("%s → %s", (source, id) => {
    expect(classifyAiSource(source)?.id).toBe(id);
  });

  it("matches the host, never a substring", () => {
    expect(classifyAiSource("notchatgpt.com")).toBeNull();
    expect(classifyAiSource("chatgpt.com.evil.example")).toBeNull();
    expect(classifyAiSource("google")).toBeNull();
    expect(classifyAiSource("openai.com")).toBeNull();
    expect(classifyAiSource("(direct)")).toBeNull();
    expect(classifyAiSource("")).toBeNull();
  });

  it("the GA4 filter covers every host the classifier accepts", () => {
    const re = new RegExp(AI_SOURCE_REGEX, "i");
    for (const host of ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com"]) {
      expect(re.test(host), host).toBe(true);
    }
  });
});

const rows: QueryRow[] = [
  { query: "gitwork", clicks: 40, impressions: 200, position: 1.2 },
  { query: "mvp agency uk", clicks: 5, impressions: 300, position: 3 },
  { query: "hire react developers", clicks: 2, impressions: 150, position: 9.9 },
  { query: "app cost uk", clicks: 0, impressions: 90, position: 10.4 },
  { query: "exactly ten", clicks: 0, impressions: 10, position: 10 },
  { query: "flutter agency", clicks: 0, impressions: 40, position: 27 },
];

describe("summariseQueries", () => {
  it("counts top 10 and top 3 on average position, inclusive", () => {
    expect(summariseQueries(rows)).toEqual({ queries: 6, top10: 4, top3: 2, clicks: 47, impressions: 790 });
  });

  it("an empty period is zero of zero, not an error", () => {
    expect(summariseQueries([])).toEqual({ queries: 0, top10: 0, top3: 0, clicks: 0, impressions: 0 });
  });
});

describe("compareQueries + filterQueries", () => {
  const previous: QueryRow[] = [{ query: "mvp agency uk", clicks: 1, impressions: 100, position: 6 }];
  const compared = compareQueries(rows, previous);

  it("orders by impressions and carries the previous position, null when new", () => {
    expect(compared.map((r) => r.query)[0]).toBe("mvp agency uk");
    expect(compared.find((r) => r.query === "mvp agency uk")?.previousPosition).toBe(6);
    expect(compared.find((r) => r.query === "gitwork")?.previousPosition).toBeNull();
  });

  it("filters by band and search, then sorts", () => {
    const top10 = filterQueries(compared, { band: "top10", search: "", sort: { key: "position", dir: "asc" } });
    expect(top10.map((r) => r.query)).toEqual(["gitwork", "mvp agency uk", "hire react developers", "exactly ten"]);
    const top3 = filterQueries(compared, { band: "top3", search: "MVP", sort: { key: "impressions", dir: "desc" } });
    expect(top3.map((r) => r.query)).toEqual(["mvp agency uk"]);
  });
});

describe("summariseAiVisits", () => {
  const period = { start: "2026-10-01", end: "2026-10-03" };

  it("adds sessions per assistant, zero-fills the days, and drops non-AI sources", () => {
    const out = summariseAiVisits(
      [
        { date: "20261001", source: "chatgpt.com", sessions: 3 },
        { date: "20261001", source: "chat.openai.com", sessions: 1 },
        { date: "20261003", source: "perplexity.ai", sessions: 2 },
        { date: "20261002", source: "notchatgpt.com", sessions: 50 },
      ],
      period,
    );
    expect(out.total).toBe(6);
    expect(out.byAssistant).toEqual([
      { id: "chatgpt", label: "ChatGPT", sessions: 4 },
      { id: "perplexity", label: "Perplexity", sessions: 2 },
    ]);
    expect(out.series).toEqual([
      { date: "2026-10-01", sessions: 4 },
      { date: "2026-10-02", sessions: 0 },
      { date: "2026-10-03", sessions: 2 },
    ]);
  });
});

describe("changeBetween", () => {
  it("gives a percentage only from a non-zero base", () => {
    expect(changeBetween(50, 37)).toEqual({ deltaPct: 13 / 37, direction: "up" });
    expect(changeBetween(5, 0)).toEqual({ deltaPct: null, direction: "up" });
    expect(changeBetween(4, 4).direction).toBe("flat");
  });
});

describe("config", () => {
  it("accepts domain and URL-prefix Search Console properties", () => {
    expect(normaliseSearchConsoleSite("sc-domain:Gitwork.co.uk")).toBe("sc-domain:gitwork.co.uk");
    expect(normaliseSearchConsoleSite("https://Gitwork.co.uk")).toBe("https://gitwork.co.uk/");
    expect(normaliseSearchConsoleSite("gitwork.co.uk")).toBeNull();
    expect(normaliseSearchConsoleSite("javascript:alert(1)")).toBeNull();
    expect(normaliseSearchConsoleSite("https://gitwork.co.uk/?a=1")).toBeNull();
  });

  it("accepts a GA4 id with or without the properties/ prefix", () => {
    expect(normaliseGa4PropertyId("properties/412345678")).toBe("412345678");
    expect(normaliseGa4PropertyId(" 412345678 ")).toBe("412345678");
    expect(normaliseGa4PropertyId("G-ABC123")).toBeNull();
  });

  it("reads a malformed stored config as not set", () => {
    expect(parseAiSearchConfig(null)).toEqual({ searchConsoleSite: null, ga4PropertyId: null });
    expect(parseAiSearchConfig({ searchConsoleSite: 42, ga4PropertyId: "nope" })).toEqual({ searchConsoleSite: null, ga4PropertyId: null });
  });

  it("formats a period", () => {
    expect(formatPeriod({ start: "2026-10-01", end: "2026-10-28" })).toBe("1–28 Oct");
    expect(formatPeriod({ start: "2026-09-29", end: "2026-10-26" })).toBe("29 Sep – 26 Oct");
  });
});

describe("freshness and carrying over the last good sync", () => {
  const good = { data: { n: 1 }, syncedAt: "2026-11-02T09:00:00Z", dataThrough: "2026-10-30", caveats: [] };
  const now = new Date("2026-11-02T10:00:00Z");

  it("a fresh read is fresh; one older than a day is stale", () => {
    expect(freshnessOf({ status: "ok", ...good }, now).kind).toBe("fresh");
    expect(freshnessOf({ status: "ok", ...good }, new Date("2026-11-03T10:00:01Z")).kind).toBe("stale");
  });

  it("a failure keeps the previous good read, and says it is failing", () => {
    const failed = { status: "error" as const, message: "down", attemptedAt: "2026-11-02T10:00:00Z", lastGood: null };
    const merged = mergeSync(failed, { status: "ok", ...good });
    expect(merged.status === "error" && merged.lastGood?.syncedAt).toBe(good.syncedAt);
    expect(freshnessOf(merged, now)).toMatchObject({ kind: "failing", syncedAt: good.syncedAt, message: "down" });
    // Two failures in a row still hold the same last good read.
    const twice = mergeSync({ ...failed, attemptedAt: "2026-11-02T11:00:00Z" }, merged);
    expect(lastKnown(twice)?.syncedAt).toBe(good.syncedAt);
  });

  it("a success always replaces the old figures", () => {
    const next = { status: "ok" as const, ...good, syncedAt: "2026-11-02T10:00:00Z" };
    expect(mergeSync(next, { status: "ok", ...good })).toBe(next);
  });

  it("never read at all is 'none', not zero", () => {
    expect(freshnessOf({ status: "not_configured", message: "x", attemptedAt: "", lastGood: null }, now).kind).toBe("none");
  });
});

describe("caveats", () => {
  it("states the share of impressions from searches Google won't list", () => {
    expect(googleCaveats({ listedImpressions: 80, totalImpressions: 100, truncated: false })[0]).toContain("20%");
    expect(googleCaveats({ listedImpressions: 100, totalImpressions: 100, truncated: false })).toEqual([]);
    expect(googleCaveats({ listedImpressions: 10, totalImpressions: 0, truncated: true })).toHaveLength(1);
  });

  it("passes on what GA4 says it withheld", () => {
    expect(ga4Caveats({ thresholded: false, otherRow: false, truncated: false })).toEqual([]);
    expect(ga4Caveats({ thresholded: true, otherRow: true, truncated: true })).toHaveLength(3);
  });

  it("periodsEnding ends exactly on the given day", () => {
    expect(periodsEnding(7, "2026-10-30").current).toEqual({ start: "2026-10-24", end: "2026-10-30" });
  });
});
