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

import { runWedgeCourseFeed } from "../wedge-course-feed";

const ok = (created: number) => ({ createdCount: created, errors: [] });
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  h.status = null;
  h.written = [];
  h.importResult = ok(0);
  h.syncCalls = 0;
  h.notified = 0;
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
