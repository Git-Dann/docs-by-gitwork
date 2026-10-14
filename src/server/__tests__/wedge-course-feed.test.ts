/**
 * The scheduled runner. What matters: an outage is recorded and announced ONCE, a partly
 * read window is not treated as read, and the daily status pass does not run hourly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  status: null as unknown,
  written: [] as unknown[],
  importResult: null as unknown,
  syncCalls: 0,
  notified: 0,
  slack: [] as string[],
  slackOk: true,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: {
      findFirst: vi.fn(async () => ({
        id: "wc1",
        name: "Big Wedge",
        slug: "wedge",
        wiki: { id: "w1", courseFeedStatus: h.status },
      })),
      findUnique: vi.fn(async () => ({
        slackExternalChannelId: "C_EXT",
        workspace: { slackBotToken: "xoxb", slackBotTokenEncrypted: null },
      })),
    },
    clientWiki: {
      update: vi.fn(async (args: { data: { courseFeedStatus: unknown } }) => {
        h.written.push(args.data.courseFeedStatus);
        h.status = args.data.courseFeedStatus;
      }),
    },
  },
}));
vi.mock("@/server/wiki-bigwedge-import", () => ({
  importBigWedgeCourseRequests: vi.fn(async () => h.importResult),
}));
vi.mock("@/server/wiki-bigwedge-sync", () => ({
  syncBigWedgeStatus: vi.fn(async () => {
    h.syncCalls++;
    return { markedCount: 1, errors: [] };
  }),
}));
vi.mock("@/server/notifications", () => ({
  dispatchNotification: vi.fn(() => {
    h.notified++;
  }),
}));

vi.mock("@/server/slack/client", () => ({
  getSlackBotToken: () => "xoxb",
  postMessage: vi.fn(async (_t: string, input: { channel: string; text: string }) => {
    if (h.slackOk) h.slack.push(`${input.channel}|${input.text}`);
    return { ok: h.slackOk, error: h.slackOk ? undefined : "ratelimited", data: {} };
  }),
}));

import { checkCourseFeedWatchdog, runWedgeCourseFeed } from "../wedge-course-feed";

const ok = (created: number) => ({ createdCount: created, errors: [] });
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  h.status = null;
  h.written = [];
  h.importResult = ok(0);
  h.syncCalls = 0;
  h.notified = 0;
  h.slack = [];
  h.slackOk = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the hourly run", () => {
  it("records a success and runs the status pass", async () => {
    h.importResult = ok(4);
    const [r] = await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    expect(r).toMatchObject({ slug: "wedge", ok: true, created: 4, marked: 1 });
    expect(h.status).toMatchObject({ lastSuccessAt: "2026-10-14T10:15:00.000Z", lastCreated: 4 });
  });

  it("does not run the status pass again an hour later", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    expect(h.syncCalls).toBe(1);
  });

  it("⚠️ a page that failed to fetch is a failed run — the window was not fully read", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    h.importResult = { createdCount: 2, errors: ["Fetch failed (page 2): HTTP 502"] };
    const [r] = await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    expect(r.ok).toBe(false);
    expect(h.status).toMatchObject({ lastSuccessAt: "2026-10-14T10:15:00.000Z", lastError: "Fetch failed (page 2): HTTP 502" });
  });

  it("announces an outage once, not every hour it stays down", async () => {
    h.importResult = { error: "Big Wedge rejected Foundry's login (Invalid credentials)." };
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    await runWedgeCourseFeed("ws1", at("2026-10-14T12:15:00Z"));
    expect(h.notified).toBe(1);
    expect(h.syncCalls).toBe(0);

    // Recovers, then breaks again — that is a new outage, and gets its own alert.
    h.importResult = ok(0);
    await runWedgeCourseFeed("ws1", at("2026-10-14T13:15:00Z"));
    h.importResult = { error: "again" };
    await runWedgeCourseFeed("ws1", at("2026-10-14T14:15:00Z"));
    expect(h.notified).toBe(2);
  });
});

describe("the client's Slack channel", () => {
  const login = { error: "Big Wedge rejected Foundry's login (Invalid credentials). Check BIGWEDGE_API_USERNAME / BIGWEDGE_API_PASSWORD." };

  it("⚠️ one failed run says nothing — a blip never reaches a channel the client reads", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    h.importResult = login;
    await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    expect(h.slack).toEqual([]);
  });

  it("the second failure posts once, to the EXTERNAL channel, and never names our settings", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T09:15:00Z"));
    h.importResult = login;
    for (const t of ["10:15", "11:15", "12:15", "13:15"]) await runWedgeCourseFeed("ws1", at(`2026-10-14T${t}:00Z`));
    expect(h.slack).toHaveLength(1);
    expect(h.slack[0]).toMatch(/^C_EXT\|/);
    expect(h.slack[0]).toContain("login to the Big Wedge API is being refused");
    expect(h.slack[0]).not.toMatch(/BIGWEDGE_|PASSWORD|USERNAME/);
  });

  it("recovery posts once, with how many were caught up", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T09:15:00Z"));
    h.importResult = login;
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    h.importResult = ok(7);
    await runWedgeCourseFeed("ws1", at("2026-10-14T12:15:00Z"));
    h.importResult = ok(0);
    await runWedgeCourseFeed("ws1", at("2026-10-14T13:15:00Z"));
    expect(h.slack).toHaveLength(2);
    expect(h.slack[1]).toContain("reaching Foundry again");
    expect(h.slack[1]).toContain("7 requests");
  });

  it("a failed Slack post is retried next run rather than lost", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T09:15:00Z"));
    h.importResult = login;
    await runWedgeCourseFeed("ws1", at("2026-10-14T10:15:00Z"));
    h.slackOk = false;
    await runWedgeCourseFeed("ws1", at("2026-10-14T11:15:00Z"));
    h.slackOk = true;
    await runWedgeCourseFeed("ws1", at("2026-10-14T12:15:00Z"));
    expect(h.slack).toHaveLength(1);
  });

  it("the watchdog notices the hourly run has stopped, and stays quiet while it is running", async () => {
    await runWedgeCourseFeed("ws1", at("2026-10-14T09:15:00Z"));
    await checkCourseFeedWatchdog("ws1", at("2026-10-14T10:40:00Z"));
    expect(h.slack).toEqual([]);
    await checkCourseFeedWatchdog("ws1", at("2026-10-14T11:25:00Z"));
    await checkCourseFeedWatchdog("ws1", at("2026-10-14T11:30:00Z"));
    expect(h.slack).toHaveLength(1);
    expect(h.slack[0]).toContain("hourly check has stopped running");
  });
});
