/**
 * Pulse → AI search, server side. What is pinned here is truth and freshness:
 *  - periods end on the last day Google says it has finished, not on a guess;
 *  - a failed sync keeps the last good figures, labelled, and never becomes a zero;
 *  - the last sync is stored, served while recent, and redone on Sync now;
 *  - changing the properties throws the old figures away;
 *  - what Google withholds is stated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ws: { aiSearchConfig: unknown; googleServiceAccountJson: string | null } = {
  aiSearchConfig: null,
  googleServiceAccountJson: null,
};
const syncs = new Map<string, { id: string; workspaceId: string; report: unknown; attemptedAt: Date }>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => ws),
      update: vi.fn(async ({ data }: { data: { aiSearchConfig: unknown } }) => {
        ws.aiSearchConfig = data.aiSearchConfig;
        return ws;
      }),
    },
    aiSearchSync: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => syncs.get(where.id) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const row = { ...(syncs.get(where.id) ?? create), ...(syncs.has(where.id) ? update : {}) } as never;
        syncs.set(where.id, row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { workspaceId: string } }) => {
        for (const [k, v] of syncs) if (v.workspaceId === where.workspaceId) syncs.delete(k);
        return { count: 0 };
      }),
    },
  },
}));

const scQuery = vi.fn();
const gaRun = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn(function GoogleAuth() { return {}; }) },
    searchconsole: () => ({ searchanalytics: { query: scQuery } }),
    analyticsdata: () => ({ properties: { runReport: gaRun } }),
  },
}));

import { getAiSearchReport, setAiSearchConfig } from "@/server/ai-search";

const ACCOUNT = JSON.stringify({ client_email: "reader@x.iam.gserviceaccount.com", private_key: "k" });
const NOW = new Date("2026-11-02T10:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

type ScBody = { startDate: string; dimensions?: string[]; dataState?: string };

/** A Search Console that has finished through 30 Oct (31 Oct still processing). */
function workingSearchConsole() {
  scQuery.mockImplementation(async ({ requestBody }: { requestBody: ScBody }) => {
    if (requestBody.dimensions?.[0] === "date") {
      return { data: { rows: [{ keys: ["2026-10-30"] }, { keys: ["2026-10-31"] }], metadata: { firstIncompleteDate: "2026-10-31" } } };
    }
    if (!requestBody.dimensions) {
      // Totals include the searches Google won't list: 200 impressions here vs 160 listed.
      return { data: { rows: [{ clicks: 12, impressions: requestBody.startDate === "2026-10-24" ? 200 : 40 }] } };
    }
    return {
      data: {
        rows:
          requestBody.startDate === "2026-10-24"
            ? [
                { keys: ["gitwork"], clicks: 10, impressions: 50, position: 1.1 },
                { keys: ["mvp agency"], clicks: 1, impressions: 80, position: 8 },
                { keys: ["app cost"], clicks: 0, impressions: 30, position: 22 },
              ]
            : [{ keys: ["gitwork"], clicks: 8, impressions: 40, position: 1.4 }],
      },
    };
  });
}

function workingAnalytics(thresholded = false) {
  gaRun.mockImplementation(async ({ requestBody }: { requestBody: { dimensions: Array<{ name: string }> } }) => {
    const dims = requestBody.dimensions.map((d) => d.name).join(",");
    const metadata = { subjectToThresholding: thresholded };
    if (dims === "date,sessionSource") {
      return { data: { metadata, rowCount: 2, rows: [
        { dimensionValues: [{ value: "20261031" }, { value: "chatgpt.com" }], metricValues: [{ value: "3" }] },
        { dimensionValues: [{ value: "20261031" }, { value: "notchatgpt.com" }], metricValues: [{ value: "9" }] },
      ] } };
    }
    if (dims === "sessionSource") {
      return { data: { metadata, rowCount: 1, rows: [{ dimensionValues: [{ value: "perplexity.ai" }], metricValues: [{ value: "2" }] }] } };
    }
    return { data: { metadata, rowCount: 1, rows: [{ dimensionValues: [{ value: "/services/mvp" }, { value: "chatgpt.com" }], metricValues: [{ value: "3" }] }] } };
  });
}

beforeEach(() => {
  ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: "412345678" };
  ws.googleServiceAccountJson = ACCOUNT;
  syncs.clear();
  scQuery.mockReset();
  gaRun.mockReset();
});

describe("getAiSearchReport", () => {
  it("says what's missing when nothing is set up, and calls Google for nothing", async () => {
    ws.aiSearchConfig = null;
    const report = await getAiSearchReport("w1", 28, { now: NOW });
    expect(report.google.status).toBe("not_configured");
    expect(report.aiVisits.status).toBe("not_configured");
    expect(scQuery).not.toHaveBeenCalled();
    expect(gaRun).not.toHaveBeenCalled();
  });

  it("asks for a service account when the properties are set but there is none", async () => {
    ws.googleServiceAccountJson = null;
    const report = await getAiSearchReport("w1", 28, { now: NOW });
    expect(report.google.status).toBe("no_credentials");
    expect(report.aiVisits.status).toBe("no_credentials");
  });

  it("ends the Google period on the last day Search Console has finished", async () => {
    workingSearchConsole();
    workingAnalytics();
    const report = await getAiSearchReport("w1", 7, { now: NOW });
    if (report.google.status !== "ok" || report.aiVisits.status !== "ok") throw new Error("expected ok");
    expect(report.google.dataThrough).toBe("2026-10-30");
    expect(report.google.data.period).toEqual({ start: "2026-10-24", end: "2026-10-30" });
    expect(report.google.data.previousPeriod).toEqual({ start: "2026-10-17", end: "2026-10-23" });
    // Every per-query and totals read asks for finished data only.
    for (const [{ requestBody }] of scQuery.mock.calls as Array<[{ requestBody: ScBody }]>) {
      if (requestBody.dimensions?.[0] !== "date") expect(requestBody.dataState).toBe("final");
    }
    // GA4 ends two days back, so every day in it is processed.
    expect(report.aiVisits.data.period).toEqual({ start: "2026-10-25", end: "2026-10-31" });
  });

  it("counts correctly and says what Google withheld", async () => {
    workingSearchConsole();
    workingAnalytics(true);
    const report = await getAiSearchReport("w1", 7, { now: NOW });
    if (report.google.status !== "ok" || report.aiVisits.status !== "ok") throw new Error("expected ok");
    expect(report.google.data.current).toMatchObject({ queries: 3, top10: 2, top3: 1, impressions: 160 });
    expect(report.google.data.totals.current).toEqual({ clicks: 12, impressions: 200 });
    expect(report.google.caveats.join(" ")).toContain("20%");
    expect(report.aiVisits.data.current.total).toBe(3);
    expect(report.aiVisits.data.previousTotal).toBe(2);
    expect(report.aiVisits.caveats.join(" ")).toContain("hides small numbers");
    expect(report.aiVisits.syncedAt).toBe(NOW.toISOString());
  });

  it("turns a 403 into 'add this account', naming it, and never a zero", async () => {
    scQuery.mockRejectedValue(Object.assign(new Error("User does not have sufficient permission"), { code: 403 }));
    gaRun.mockRejectedValue(Object.assign(new Error("boom"), { code: 500 }));
    const report = await getAiSearchReport("w1", 7, { now: NOW });
    expect(report.google).toMatchObject({ status: "no_access", lastGood: null, attemptedAt: NOW.toISOString() });
    expect(report.google.status !== "ok" && report.google.message).toContain("reader@x.iam.gserviceaccount.com");
    expect(report.aiVisits.status).toBe("error");
  });

  it("keeps the last good figures when a later sync fails, and only for the source that failed", async () => {
    workingSearchConsole();
    workingAnalytics();
    await getAiSearchReport("w1", 7, { now: NOW });

    scQuery.mockReset();
    scQuery.mockRejectedValue(Object.assign(new Error("backend error"), { code: 503 }));
    const later = minutes(90);
    const report = await getAiSearchReport("w1", 7, { now: later });

    expect(report.google.status).toBe("error");
    if (report.google.status === "ok") throw new Error("expected failure");
    expect(report.google.attemptedAt).toBe(later.toISOString());
    expect(report.google.lastGood?.syncedAt).toBe(NOW.toISOString());
    expect(report.google.lastGood?.data.current.queries).toBe(3);
    // GA4 still answered, so it is current, not carried over.
    expect(report.aiVisits).toMatchObject({ status: "ok", syncedAt: later.toISOString() });
  });

  it("serves the stored sync while it is recent, and Sync now reads Google again", async () => {
    workingSearchConsole();
    workingAnalytics();
    await getAiSearchReport("w1", 28, { now: NOW });
    const calls = scQuery.mock.calls.length;
    const again = await getAiSearchReport("w1", 28, { now: minutes(10) });
    expect(scQuery.mock.calls.length).toBe(calls);
    expect(again.attemptedAt).toBe(NOW.toISOString());

    const forced = await getAiSearchReport("w1", 28, { now: minutes(11), refresh: true });
    expect(scQuery.mock.calls.length).toBeGreaterThan(calls);
    expect(forced.attemptedAt).toBe(minutes(11).toISOString());
  });

  it("re-reads Google on its own once the stored sync is over 30 minutes old", async () => {
    workingSearchConsole();
    workingAnalytics();
    await getAiSearchReport("w1", 28, { now: NOW });
    const calls = scQuery.mock.calls.length;
    const report = await getAiSearchReport("w1", 28, { now: minutes(31) });
    expect(scQuery.mock.calls.length).toBeGreaterThan(calls);
    expect(report.attemptedAt).toBe(minutes(31).toISOString());
  });

  it("changing the properties throws away figures read from the old ones", async () => {
    workingSearchConsole();
    workingAnalytics();
    await getAiSearchReport("w1", 28, { now: NOW });
    await setAiSearchConfig("w1", { searchConsoleSite: "sc-domain:gitwork.io", ga4PropertyId: null });
    scQuery.mockReset();
    scQuery.mockRejectedValue(Object.assign(new Error("nope"), { code: 403 }));
    const report = await getAiSearchReport("w1", 28, { now: minutes(1) });
    // No last-good carried over from the previous property.
    expect(report.google).toMatchObject({ status: "no_access", lastGood: null });
    expect(scQuery.mock.calls[0][0].siteUrl).toBe("sc-domain:gitwork.io");
  });
});
