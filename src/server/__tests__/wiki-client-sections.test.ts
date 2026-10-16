/**
 * Metrics, Meetings and Platforms in the client wiki — the server-side rules that decide
 * what reaches a CLIENT'S browser. Every case here is something that would be a leak or a
 * false figure if it regressed, which is why each is asserted on the actual query or the
 * actual DTO rather than on a component.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, getJson, fetchMonth } = vi.hoisted(() => ({
  getJson: vi.fn(),
  fetchMonth: vi.fn(),
  db: {
  clientWiki: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  meeting: { findMany: vi.fn(), updateMany: vi.fn() },
  task: { findMany: vi.fn() },
  clientPlatform: { findMany: vi.fn() },
  supportClient: { findFirst: vi.fn() },
  accountConnection: { findFirst: vi.fn() },
  supportAnalyticsSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  wikiMetricSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  clientWikiPage: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/server/support-analytics", () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  getAdapter: () => null,
  fetchAnalyticsMonth: (...a: unknown[]) => fetchMonth(...a),
}));
vi.mock("@/server/support-scraper-config", () => ({ decryptScraperConfig: (c: unknown) => c }));
vi.mock("@/lib/encryption", () => ({
  encryptNullable: (v: string | null | undefined) => (v ? `enc(${v})` : null),
  decryptNullable: (v: string | null | undefined) => (v ? v.replace(/^enc\((.*)\)$/, "$1") : null),
}));

import { actionDone, loadWikiMeetings, readDecisions, setMeetingShared } from "@/server/wiki-meetings";
import { loadWikiPlatforms } from "@/server/wiki-platforms";
import {
  EMPTY_METRICS,
  forPublicMetrics,
  loadWikiMetrics,
  MetricsConfigError,
  refreshWikiMetrics,
  setWikiMetricsConfig,
} from "@/server/wiki-metrics";

beforeEach(() => {
  for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset();
  fetchMonth.mockReset();
});

describe("Meetings", () => {
  it("only ever reads meetings someone shared", async () => {
    db.clientWiki.findUnique.mockResolvedValue({ meetingsEnabled: true });
    db.meeting.findMany.mockResolvedValue([]);
    await loadWikiMeetings("c1");
    const args = db.meeting.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clientId: "c1", sharedWithClientAt: { not: null } });
  });

  it("never loads the transcript, the notes text or the attendees", async () => {
    db.clientWiki.findUnique.mockResolvedValue({ meetingsEnabled: true });
    db.meeting.findMany.mockResolvedValue([]);
    await loadWikiMeetings("c1");
    const select = db.meeting.findMany.mock.calls[0][0].select;
    expect(select).toBeDefined();
    for (const field of ["transcriptText", "transcriptData", "attendees", "ownerUserId", "owner"]) {
      expect(select, field).not.toHaveProperty(field);
    }
  });

  it("is empty — and queries nothing — while the section is off", async () => {
    db.clientWiki.findUnique.mockResolvedValue({ meetingsEnabled: false });
    expect(await loadWikiMeetings("c1")).toEqual({ enabled: false, meetings: [] });
    expect(db.meeting.findMany).not.toHaveBeenCalled();
  });

  it("an action turned into a task is done when the TASK is done", () => {
    const status = new Map([["t1", "DONE"], ["t2", "DOING"]]);
    expect(actionDone({ done: false, taskId: "t1" }, status)).toBe(true);
    expect(actionDone({ done: true, taskId: "t2" }, status)).toBe(false);
    // A deleted task falls back to the checkbox rather than claiming either way.
    expect(actionDone({ done: true, taskId: "gone" }, status)).toBe(true);
    expect(actionDone({ done: false, taskId: null }, status)).toBe(false);
  });

  it("only reads task statuses for this client's tasks", async () => {
    db.clientWiki.findUnique.mockResolvedValue({ meetingsEnabled: true });
    db.meeting.findMany.mockResolvedValue([
      {
        id: "m1",
        title: "Call",
        startedAt: null,
        summary: null,
        decisions: null,
        actionItems: [{ id: "a1", title: null, text: "Do it", owner: null, done: false, taskId: "t9" }],
      },
    ]);
    db.task.findMany.mockResolvedValue([]);
    const out = await loadWikiMeetings("c1");
    expect(db.task.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["t9"] }, clientId: "c1" });
    expect(out.meetings[0].actions[0]).toEqual({ id: "a1", title: "Do it", owner: null, done: false });
  });

  it("reads decisions defensively", () => {
    expect(readDecisions(["a", " ", 3, "b "])).toEqual(["a", "b"]);
    expect(readDecisions("nope")).toEqual([]);
  });

  it("sharing is scoped to the client, so another client's meeting matches nothing", async () => {
    db.meeting.updateMany.mockResolvedValue({ count: 0 });
    expect(await setMeetingShared("c1", "other-clients-meeting", true)).toBe(false);
    expect(db.meeting.updateMany.mock.calls[0][0].where).toEqual({
      id: "other-clients-meeting",
      clientId: "c1",
    });
  });
});

describe("Platforms", () => {
  it("never loads logins, credential ciphers or internal notes", async () => {
    db.clientWiki.findUnique.mockResolvedValue({ platformsEnabled: true });
    db.clientPlatform.findMany.mockResolvedValue([]);
    await loadWikiPlatforms("c1");
    const args = db.clientPlatform.findMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    for (const field of ["logins", "credentials", "usernameCipher", "passwordCipher", "notes"]) {
      expect(args.select, field).not.toHaveProperty(field);
    }
  });
});

describe("Metrics", () => {
  const base = {
    ...EMPTY_METRICS,
    enabled: true,
    source: "api" as const,
    apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" },
    hasApiToken: true,
    metrics: [
      { key: "a", label: "A", value: 1, unit: null, group: null, previous: null, hidden: false, featured: true, history: [] },
      { key: "secret", label: "S", value: 2, unit: null, group: null, previous: null, hidden: true, featured: false, history: [] },
    ],
  };

  it("the client's copy has hidden metrics REMOVED and our settings dropped", () => {
    const pub = forPublicMetrics(base);
    expect(pub.metrics.map((m) => m.key)).toEqual(["a"]);
    expect(pub.apiEndpoint).toBeNull();
    expect(pub.hasApiToken).toBe(false);
  });

  it("the token never appears in the section, only whether one is set", async () => {
    db.clientWiki.findUnique.mockResolvedValue({
      id: "w1",
      metricsEnabled: true,
      metricsConfig: { apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" }, apiTokenCipher: "enc(tok)" },
    });
    db.supportClient.findFirst.mockResolvedValue(null);
    db.wikiMetricSnapshot.findMany.mockResolvedValue([]);
    const out = await loadWikiMetrics("c1");
    expect(JSON.stringify(out)).not.toContain("tok");
    expect(out.hasApiToken).toBe(true);
  });

  it("prefers the Care connector over an API endpoint", async () => {
    db.clientWiki.findUnique.mockResolvedValue({
      id: "w1",
      metricsEnabled: true,
      metricsConfig: { apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" } },
    });
    db.supportClient.findFirst.mockResolvedValue({ id: "care1", name: "Care" });
    db.accountConnection.findFirst.mockResolvedValue({ scraperConfig: { adapter: "fellas" } });
    db.supportAnalyticsSnapshot.findMany.mockResolvedValue([]);
    const out = await loadWikiMetrics("c1");
    expect(out.source).toBe("care");
    expect(db.wikiMetricSnapshot.findMany).not.toHaveBeenCalled();
  });

  it("refuses an endpoint that is not on the client's API Docs page", async () => {
    db.clientWiki.upsert.mockResolvedValue({ id: "w1", metricsConfig: null });
    db.clientWikiPage.findFirst.mockResolvedValue({
      content: {
        servers: [{ url: "https://api.c.com", label: "Prod" }],
        endpoints: [{ method: "GET", path: "/v1/stats" }],
      },
    });
    await expect(
      setWikiMetricsConfig("c1", { apiEndpoint: { serverUrl: "http://169.254.169.254", path: "/latest" } }),
    ).rejects.toBeInstanceOf(MetricsConfigError);
    expect(db.clientWiki.update).not.toHaveBeenCalled();

    await setWikiMetricsConfig("c1", { apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" } });
    expect(db.clientWiki.update).toHaveBeenCalledTimes(1);
  });

  it("stores the token encrypted, and an empty string clears it", async () => {
    db.clientWiki.upsert.mockResolvedValue({ id: "w1", metricsConfig: { apiTokenCipher: "enc(old)" } });
    await setWikiMetricsConfig("c1", { apiToken: "new" });
    expect(db.clientWiki.update.mock.calls[0][0].data.metricsConfig.apiTokenCipher).toBe("enc(new)");
    await setWikiMetricsConfig("c1", { apiToken: "" });
    expect(db.clientWiki.update.mock.calls[1][0].data.metricsConfig.apiTokenCipher).toBeNull();
    await setWikiMetricsConfig("c1", { hiddenKeys: ["x"] });
    expect(db.clientWiki.update.mock.calls[2][0].data.metricsConfig.apiTokenCipher).toBe("enc(old)");
  });

  it("does not store an empty fetch over last month's real figures", async () => {
    db.clientWiki.findUnique.mockResolvedValue({
      id: "w1",
      metricsConfig: { apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" } },
    });
    db.supportClient.findFirst.mockResolvedValue(null);
    getJson.mockResolvedValue({ message: "ok", items: [] });
    const out = await refreshWikiMetrics("c1", new Date("2026-10-15T12:00:00Z"));
    expect(db.wikiMetricSnapshot.upsert).not.toHaveBeenCalled();
    expect(out.failed[0].error).toMatch(/no numbers/);
  });

  it("a Care month with no figures is a failure, not a stored empty month", async () => {
    // Stored empty, it would read as "nothing happened" AND count as that month's final
    // figure — so it would never be fetched again. That is how Wedge's July and August
    // snapshots ended up with zero metrics when its token expired.
    db.clientWiki.findUnique.mockResolvedValue({ id: "w1", metricsConfig: null });
    db.supportClient.findFirst.mockResolvedValue({ id: "care1", name: "Wedge" });
    db.accountConnection.findFirst.mockResolvedValue({ scraperConfig: { adapter: "bigwedge" } });
    db.supportAnalyticsSnapshot.findMany.mockResolvedValue([]);
    fetchMonth.mockResolvedValue({ periodLabel: "x", metrics: [] });
    const out = await refreshWikiMetrics("c1", new Date("2026-10-15T12:00:00Z"));
    expect(db.supportAnalyticsSnapshot.upsert).not.toHaveBeenCalled();
    expect(out.fetched).toEqual([]);
    expect(out.failed).toHaveLength(6);
    expect(out.failed[0].error).toMatch(/no numbers/);
  });

  it("a failing endpoint is reported in words, never thrown at the page", async () => {
    db.clientWiki.findUnique.mockResolvedValue({
      id: "w1",
      metricsConfig: { apiEndpoint: { serverUrl: "https://api.c.com", path: "/v1/stats" } },
    });
    db.supportClient.findFirst.mockResolvedValue(null);
    getJson.mockRejectedValue(new Error("https://api.c.com/v1/stats → 401: unauthorised"));
    const out = await refreshWikiMetrics("c1", new Date("2026-10-15T12:00:00Z"));
    expect(out).toEqual({
      source: "api",
      fetched: [],
      failed: [{ period: "2026-10", error: "https://api.c.com/v1/stats → 401: unauthorised" }],
    });
  });
});
