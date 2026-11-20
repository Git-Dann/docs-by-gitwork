import { describe, expect, it } from "vitest";
import { cronAlertChanges, cronNameFromPath, silentFor, staleJobs } from "@/lib/cron-watch";
import { diskAlertChange, formatBytes } from "@/lib/disk-watch";

const MIN = 60_000;
const now = new Date("2026-11-20T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * MIN);
const gaps = { jobs: 10 * MIN, daily: 26 * 60 * MIN };

describe("staleJobs", () => {
  it("reports a job silent past its gap, most silent first", () => {
    const stale = staleJobs({ jobs: ago(30), daily: ago(27 * 60) }, now, ago(100_000), gaps);
    expect(stale.map((s) => s.name)).toEqual(["daily", "jobs"]);
    expect(stale[1]).toMatchObject({ silentMinutes: 30, lastRun: ago(30).toISOString() });
  });

  it("leaves a job inside its gap alone", () => {
    expect(staleJobs({ jobs: ago(9), daily: ago(60) }, now, ago(100_000), gaps)).toEqual([]);
  });

  it("doesn't report a never-seen job until its gap has passed since watching began", () => {
    expect(staleJobs({}, now, ago(5), gaps)).toEqual([]);
    const stale = staleJobs({}, now, ago(20), gaps);
    expect(stale).toEqual([{ name: "jobs", lastRun: null, silentMinutes: 20 }]);
  });
});

describe("cronAlertChanges", () => {
  it("alerts once per stopped job and once when it recovers", () => {
    const stale = staleJobs({ jobs: ago(30) }, now, ago(20), { jobs: 10 * MIN });
    expect(cronAlertChanges(stale, new Set()).stopped.map((s) => s.name)).toEqual(["jobs"]);
    expect(cronAlertChanges(stale, new Set(["jobs"]))).toEqual({ stopped: [], recovered: [] });
    expect(cronAlertChanges([], new Set(["jobs"]))).toEqual({ stopped: [], recovered: ["jobs"] });
  });
});

describe("helpers", () => {
  it("reads the job name from a cron path only", () => {
    expect(cronNameFromPath("/api/cron/wiki-monitors")).toBe("wiki-monitors");
    expect(cronNameFromPath("/api/cron/jobs/")).toBe("jobs");
    expect(cronNameFromPath("/api/cron/a/b")).toBeNull();
    expect(cronNameFromPath("/api/health")).toBeNull();
  });

  it("words a silence", () => {
    expect(silentFor(40)).toBe("40 minutes");
    expect(silentFor(180)).toBe("3 hours");
    expect(silentFor(3 * 24 * 60)).toBe("3 days");
  });
});

describe("diskAlertChange", () => {
  it("alerts at 80%, clears below 75%, and stays quiet between", () => {
    expect(diskAlertChange(0.79, false)).toBeNull();
    expect(diskAlertChange(0.8, false)).toBe("alert");
    expect(diskAlertChange(0.9, true)).toBeNull();
    expect(diskAlertChange(0.77, true)).toBeNull();
    expect(diskAlertChange(0.74, true)).toBe("clear");
  });

  it("formats bytes as df -H does", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12_400_000_000)).toBe("12.4 GB");
    expect(formatBytes(160_000_000_000)).toBe("160 GB");
  });
});
