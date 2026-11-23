import { describe, expect, it } from "vitest";
import { judge, overall, type PlatformHealth } from "@/lib/platform-health";

const now = "2026-11-20T23:00:00.000Z";
const healthy: PlatformHealth = {
  readAt: now,
  jobs: [{ name: "jobs", lastRun: now, maxGapMinutes: 10, stale: false }],
  disk: { usedShare: 0.4, freeBytes: 60e9, totalBytes: 100e9 },
  database: { bytes: 2e9, weekAgoBytes: 1.9e9, growthShare: 0.05 },
  memory: { usedBytes: 700e6, limitBytes: 6 * 2 ** 30, peakBytes: 715e6, hostBytes: 24e9 },
  backups: { state: "on", reason: null, lastOk: "2026-11-20T03:45:00.000Z" },
  restore: { state: "passed", at: "2026-11-02T05:20:00.000Z" },
  alerts: { slack: true },
};
const part = (h: PlatformHealth, key: string) => judge(h).find((p) => p.key === key)!;

describe("platform health", () => {
  it("is fine when everything is", () => {
    expect(overall(judge(healthy))).toBe("ok");
  });

  it("names a stopped job and makes it a problem", () => {
    const h = { ...healthy, jobs: [{ name: "curator", lastRun: null, maxGapMinutes: 11520, stale: true }] };
    expect(part(h, "jobs")).toMatchObject({ level: "problem", summary: "1 stopped: curator" });
    expect(overall(judge(h))).toBe("problem");
  });

  it("never reads a part it couldn't read as fine", () => {
    const h = { ...healthy, jobs: null, disk: null, memory: null };
    expect(part(h, "jobs").level).toBe("unknown");
    expect(part(h, "disk").level).toBe("unknown");
    expect(part(h, "memory").level).toBe("unknown");
    expect(overall(judge(h))).toBe("unknown");
  });

  it("disk at 80% is a problem", () => {
    expect(part({ ...healthy, disk: { ...healthy.disk!, usedShare: 0.8 } }, "disk").level).toBe("problem");
  });

  it("database growth needs a week of readings before it says anything", () => {
    expect(part({ ...healthy, database: { bytes: 2e9, weekAgoBytes: null, growthShare: null } }, "database")).toMatchObject({ level: "ok", summary: "Growth known after a week of readings" });
    expect(part({ ...healthy, database: { bytes: 6e9, weekAgoBytes: 4e9, growthShare: 0.5 } }, "database").level).toBe("attention");
  });

  it("backups off is worth a look; on but stale is a problem", () => {
    expect(part({ ...healthy, backups: { state: "off", reason: null, lastOk: null } }, "backups").level).toBe("attention");
    expect(part({ ...healthy, backups: { state: "on", reason: null, lastOk: "2026-11-18T03:45:00.000Z" } }, "backups").level).toBe("problem");
    expect(part({ ...healthy, backups: { state: "misconfigured", reason: "x", lastOk: null } }, "backups").level).toBe("problem");
  });

  it("the restore test: passed is fine, never run is worth a look, failed or overdue is a problem", () => {
    expect(part(healthy, "restore")).toMatchObject({ level: "ok", summary: "Last passed 2 Nov 2026" });
    expect(part({ ...healthy, restore: { state: "never" } }, "restore").level).toBe("attention");
    expect(part({ ...healthy, restore: { state: "off" } }, "restore").level).toBe("attention");
    expect(part({ ...healthy, restore: { state: "failed", at: "2026-11-02T05:20:00.000Z", lastPassed: null } }, "restore")).toMatchObject({ level: "problem", summary: "Failed 2 Nov 2026" });
    expect(part({ ...healthy, restore: { state: "overdue", lastPassed: "2026-09-02T05:20:00.000Z" } }, "restore").level).toBe("problem");
    expect(part({ ...healthy, restore: { state: "misconfigured", reason: "x" } }, "restore").level).toBe("problem");
  });

  it("memory near the cap is worth a look", () => {
    expect(part({ ...healthy, memory: { ...healthy.memory!, usedBytes: 0.9 * 6 * 2 ** 30 } }, "memory").level).toBe("attention");
  });
});
