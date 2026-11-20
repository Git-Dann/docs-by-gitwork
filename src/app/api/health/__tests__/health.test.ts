/**
 * /api/health: the plain form never touches the database; `?deep=1` asks it and answers 503 when
 * it can't, which is what the deploy's health check relies on to roll back a release that boots
 * but can't reach Postgres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ fail: false, calls: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => {
      db.calls += 1;
      if (db.fail) throw new Error("connection refused");
      return [{ "?column?": 1 }];
    }),
  },
}));

const cron = vi.hoisted(() => ({ stale: [] as { name: string; silentMinutes: number }[], fail: false }));
vi.mock("@/server/cron-watchdog", () => ({
  cronHealth: vi.fn(async () => {
    if (cron.fail) throw new Error("db down");
    return { stale: cron.stale, alerted: new Set() };
  }),
}));

import { GET } from "../route";

beforeEach(() => {
  db.fail = false;
  db.calls = 0;
  cron.stale = [];
  cron.fail = false;
  process.env.COMMIT_SHA = "abc1234def";
});

describe("GET /api/health", () => {
  it("answers without touching the database", async () => {
    const res = await GET(new Request("http://x/api/health"));
    expect(res.status).toBe(200);
    expect(db.calls).toBe(0);
    const body = await res.json();
    expect(body.commit).toBe("abc1234def");
    expect(body.database).toBeUndefined();
  });

  it("deep: reports the database reachable", async () => {
    const res = await GET(new Request("http://x/api/health?deep=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: "ok", commit: "abc1234def" });
  });

  it("deep: answers 503 when the database can't be reached", async () => {
    db.fail = true;
    const res = await GET(new Request("http://x/api/health?deep=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: "unreachable" });
  });

  it("cron: 200 while every scheduled job is running", async () => {
    const res = await GET(new Request("http://x/api/health?cron=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cron: "ok", stoppedJobs: [] });
  });

  it("cron: 503 naming the jobs that stopped", async () => {
    cron.stale = [{ name: "jobs", silentMinutes: 42 }];
    const res = await GET(new Request("http://x/api/health?cron=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, cron: "stopped", stoppedJobs: [{ name: "jobs", silentMinutes: 42 }] });
  });

  it("cron: 503 when the check can't be made, never a quiet 200", async () => {
    cron.fail = true;
    const res = await GET(new Request("http://x/api/health?cron=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ cron: "unreachable" });
  });
});
