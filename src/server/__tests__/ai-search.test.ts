/**
 * Pulse → AI search, server side. The one property worth pinning hardest: a source that
 * could not be read is reported as unreadable with what to do, never as a zero.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ws: { aiSearchConfig: unknown; googleServiceAccountJson: string | null } = {
  aiSearchConfig: null,
  googleServiceAccountJson: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => ws),
      update: vi.fn(async ({ data }: { data: { aiSearchConfig: unknown } }) => {
        ws.aiSearchConfig = data.aiSearchConfig;
        return ws;
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

import { clearAiSearchCache, getAiSearchReport, setAiSearchConfig } from "@/server/ai-search";

const ACCOUNT = JSON.stringify({ client_email: "reader@x.iam.gserviceaccount.com", private_key: "k" });
const NOW = new Date("2026-11-02T10:00:00Z");

beforeEach(() => {
  ws.aiSearchConfig = null;
  ws.googleServiceAccountJson = null;
  scQuery.mockReset();
  gaRun.mockReset();
  clearAiSearchCache("w1");
});

describe("getAiSearchReport", () => {
  it("says what's missing when nothing is set up, and calls Google for nothing", async () => {
    const report = await getAiSearchReport("w1", 28, { now: NOW });
    expect(report.google.status).toBe("not_configured");
    expect(report.aiVisits.status).toBe("not_configured");
    expect(scQuery).not.toHaveBeenCalled();
    expect(gaRun).not.toHaveBeenCalled();
  });

  it("asks for a service account when the properties are set but there is none", async () => {
    ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: "412345678" };
    const report = await getAiSearchReport("w1", 28, { now: NOW });
    expect(report.google.status).toBe("no_credentials");
    expect(report.aiVisits.status).toBe("no_credentials");
  });

  it("turns a 403 into 'add this account', naming it, and never a zero", async () => {
    ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: "412345678" };
    ws.googleServiceAccountJson = ACCOUNT;
    scQuery.mockRejectedValue(Object.assign(new Error("User does not have sufficient permission"), { code: 403 }));
    gaRun.mockRejectedValue(Object.assign(new Error("boom"), { code: 500 }));
    const report = await getAiSearchReport("w1", 7, { now: NOW });
    expect(report.google).toMatchObject({ status: "no_access" });
    expect(report.google.status !== "ok" && report.google.message).toContain("reader@x.iam.gserviceaccount.com");
    expect(report.aiVisits.status).toBe("error");
    expect(report.setup.serviceAccountEmail).toBe("reader@x.iam.gserviceaccount.com");
  });

  it("summarises both sources over the right periods", async () => {
    ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: "412345678" };
    ws.googleServiceAccountJson = ACCOUNT;
    scQuery.mockImplementation(async ({ requestBody }: { requestBody: { startDate: string } }) => ({
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
    }));
    gaRun.mockImplementation(async ({ requestBody }: { requestBody: { dimensions: Array<{ name: string }>; dateRanges: Array<{ startDate: string }> } }) => {
      const dims = requestBody.dimensions.map((d) => d.name).join(",");
      if (dims === "date,sessionSource") {
        return { data: { rows: [
          { dimensionValues: [{ value: "20261101" }, { value: "chatgpt.com" }], metricValues: [{ value: "3" }] },
          { dimensionValues: [{ value: "20261101" }, { value: "notchatgpt.com" }], metricValues: [{ value: "9" }] },
        ] } };
      }
      if (dims === "sessionSource") {
        return { data: { rows: [{ dimensionValues: [{ value: "perplexity.ai" }], metricValues: [{ value: "2" }] }] } };
      }
      return { data: { rows: [{ dimensionValues: [{ value: "/services/mvp" }, { value: "chatgpt.com" }], metricValues: [{ value: "3" }] }] } };
    });

    const report = await getAiSearchReport("w1", 7, { now: NOW });
    expect(report.google.status).toBe("ok");
    if (report.google.status !== "ok" || report.aiVisits.status !== "ok") throw new Error("expected ok");
    expect(report.google.data.current).toMatchObject({ queries: 3, top10: 2, top3: 1 });
    expect(report.google.data.previous).toMatchObject({ queries: 1, top10: 1, top3: 1 });
    expect(report.google.data.period).toEqual({ start: "2026-10-24", end: "2026-10-30" });
    expect(report.aiVisits.data.period).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(report.aiVisits.data.current.total).toBe(3);
    expect(report.aiVisits.data.previousTotal).toBe(2);
    expect(report.aiVisits.data.pages).toEqual([{ path: "/services/mvp", sessions: 3 }]);
  });

  it("caches a good report, and refresh re-reads it", async () => {
    ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: null };
    ws.googleServiceAccountJson = ACCOUNT;
    scQuery.mockResolvedValue({ data: { rows: [] } });
    await getAiSearchReport("w1", 28, { now: NOW });
    await getAiSearchReport("w1", 28, { now: NOW });
    expect(scQuery).toHaveBeenCalledTimes(2); // current + previous, once
    await getAiSearchReport("w1", 28, { now: NOW, refresh: true });
    expect(scQuery).toHaveBeenCalledTimes(4);
  });

  it("saving the config drops the cached report", async () => {
    ws.googleServiceAccountJson = ACCOUNT;
    ws.aiSearchConfig = { searchConsoleSite: "sc-domain:gitwork.co.uk", ga4PropertyId: null };
    scQuery.mockResolvedValue({ data: { rows: [] } });
    await getAiSearchReport("w1", 28, { now: NOW });
    await setAiSearchConfig("w1", { searchConsoleSite: "sc-domain:gitwork.io", ga4PropertyId: null });
    await getAiSearchReport("w1", 28, { now: NOW });
    expect(scQuery).toHaveBeenCalledTimes(4);
    expect(scQuery.mock.calls[2][0].siteUrl).toBe("sc-domain:gitwork.io");
  });
});
