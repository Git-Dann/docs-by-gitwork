/**
 * The running month ("October so far") is refreshed in the background, about hourly, so a
 * client reading it never sees figures from whenever someone at Gitwork last opened the page
 * (Big Wedge, 30 Oct 2026: 131 subscriptions in Foundry, 134 in their own admin).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, fetchMonth } = vi.hoisted(() => ({
  fetchMonth: vi.fn(),
  db: {
    clientWiki: { findMany: vi.fn(), findUnique: vi.fn() },
    supportClient: { findFirst: vi.fn() },
    accountConnection: { findFirst: vi.fn() },
    supportAnalyticsSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/support-analytics", () => ({
  getJson: vi.fn(),
  getAdapter: (key?: string) => (key === "bigwedge" ? { monthToDate: true } : { monthToDate: false }),
  fetchAnalyticsMonth: (...a: unknown[]) => fetchMonth(...a),
}));
vi.mock("@/server/support-scraper-config", () => ({ decryptScraperConfig: (c: unknown) => c }));
vi.mock("@/lib/encryption", () => ({ encryptNullable: (v: unknown) => v, decryptNullable: (v: unknown) => v }));

import { refreshRunningMonths, RUNNING_MONTH_RETRY_MS } from "@/server/wiki-metrics";

const NOW = new Date("2026-10-30T17:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60000);

/** One metrics-enabled wiki whose Care connector uses `adapter`, last captured `capturedAt`. */
function setup(clientId: string, adapter: string, capturedAt: Date | null) {
  db.clientWiki.findMany.mockResolvedValue([{ clientId }]);
  db.clientWiki.findUnique.mockResolvedValue({ id: "wiki", metricsConfig: null });
  db.supportClient.findFirst.mockResolvedValue({ id: `care-${clientId}`, name: "Care" });
  db.accountConnection.findFirst.mockResolvedValue({ scraperConfig: { adapter } });
  db.supportAnalyticsSnapshot.findMany.mockImplementation(async ({ where }: { where: { period?: string } }) =>
    capturedAt && (where.period === undefined || where.period === "2026-10")
      ? [{ period: "2026-10", capturedAt, metrics: [{ key: "users_new", label: "New", value: 1 }] }]
      : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMonth.mockResolvedValue({ periodLabel: "x", metrics: [{ key: "users_new", label: "New", value: 2 }] });
  db.supportAnalyticsSnapshot.upsert.mockResolvedValue({});
});

describe("refreshRunningMonths", () => {
  it("refreshes a running month over an hour old", async () => {
    setup("wedge-1", "bigwedge", ago(90));
    const r = await refreshRunningMonths(NOW);
    expect(r.refreshed).toEqual(["wedge-1"]);
    expect(fetchMonth).toHaveBeenCalled();
    expect(fetchMonth.mock.calls.some((c) => c[1] === 2026 && c[2] === 10)).toBe(true);
  });

  it("⚠️ leaves a fresh one alone — no call to the client's API", async () => {
    setup("wedge-2", "bigwedge", ago(20));
    const r = await refreshRunningMonths(NOW);
    expect(r.refreshed).toEqual([]);
    expect(fetchMonth).not.toHaveBeenCalled();
  });

  it("ignores adapters that don't show a running month", async () => {
    setup("fellas-1", "fellas", ago(600));
    await refreshRunningMonths(NOW);
    expect(fetchMonth).not.toHaveBeenCalled();
  });

  it("⚠️ after a failed fetch, waits before asking the client's API again", async () => {
    setup("broken-1", "bigwedge", ago(600));
    fetchMonth.mockRejectedValue(new Error("503"));
    const first = await refreshRunningMonths(NOW);
    expect(first.failed).toEqual(["broken-1"]);
    const calls = fetchMonth.mock.calls.length;

    // A minute later (the next jobs run) it is still stale, but it is not asked again…
    await refreshRunningMonths(new Date(NOW.getTime() + 60_000));
    expect(fetchMonth.mock.calls.length).toBe(calls);

    // …until the retry window has passed.
    await refreshRunningMonths(new Date(NOW.getTime() + RUNNING_MONTH_RETRY_MS + 1));
    expect(fetchMonth.mock.calls.length).toBeGreaterThan(calls);
  });
});
