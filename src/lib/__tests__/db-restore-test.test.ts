/**
 * The monthly restore test's rules (CLAUDE.md §148): it only ever touches its fixed throwaway
 * database, never the live one; it picks the newest of our backups; a copy that doesn't match
 * production fails; and the Platform popup never reads "couldn't tell" as a pass.
 */
import { describe, expect, it } from "vitest";
import {
  RESTORE_TEST_DB,
  assertThrowawayName,
  backupMonthPrefixes,
  backupTimeOf,
  countProblems,
  libpqEnv,
  newestBackupKey,
  parseListedKeys,
  restoreDatabaseUrl,
  restoreDiskProblem,
  restoreTestState,
} from "@/lib/db-restore-test";
import { backupObjectKey } from "@/lib/db-backup";

describe("the throwaway database", () => {
  it("is a different database on the same server, with the same credentials", () => {
    const u = new URL(restoreDatabaseUrl("postgresql://foundry:p%40ss@db:5432/foundry?sslmode=disable"));
    expect(u.pathname).toBe(`/${RESTORE_TEST_DB}`);
    expect(u.host).toBe("db:5432");
    expect(u.username).toBe("foundry");
    expect(u.password).toBe("p%40ss");
    expect(u.searchParams.get("sslmode")).toBe("disable");
  });

  it("refuses when the live database already has the throwaway's name", () => {
    expect(() => restoreDatabaseUrl(`postgresql://u:p@db:5432/${RESTORE_TEST_DB}`)).toThrow(/live database/);
  });

  it("only ever accepts its own fixed name", () => {
    expect(() => assertThrowawayName("foundry", "foundry_other")).toThrow();
    expect(() => assertThrowawayName(RESTORE_TEST_DB, RESTORE_TEST_DB)).toThrow();
    expect(() => assertThrowawayName(RESTORE_TEST_DB, "foundry")).not.toThrow();
  });

  it("refuses a URL that isn't Postgres or names no database", () => {
    expect(() => restoreDatabaseUrl("mysql://u@h/foundry")).toThrow();
    expect(() => restoreDatabaseUrl("postgresql://u@h:5432/")).toThrow();
  });

  it("passes the password to libpq in its own variable, decoded", () => {
    expect(libpqEnv("postgresql://foundry:p%40ss@db:5432/foundry_restore_test?sslmode=disable")).toEqual({
      PGHOST: "db",
      PGPORT: "5432",
      PGUSER: "foundry",
      PGPASSWORD: "p@ss",
      PGDATABASE: "foundry_restore_test",
      PGSSLMODE: "disable",
    });
  });
});

describe("finding the newest backup", () => {
  it("reads the keys out of a bucket listing", () => {
    const xml = `<ListBucketResult><Contents><Key>foundry/db/2026/11/a&amp;b</Key></Contents><Contents><Key>x</Key></Contents></ListBucketResult>`;
    expect(parseListedKeys(xml)).toEqual(["foundry/db/2026/11/a&b", "x"]);
  });

  it("looks in this month's folder and last month's, across a new year", () => {
    expect(backupMonthPrefixes(new Date("2026-11-02T05:15:00Z"))).toEqual(["foundry/db/2026/11/", "foundry/db/2026/10/"]);
    expect(backupMonthPrefixes(new Date("2027-01-02T05:15:00Z"))).toEqual(["foundry/db/2027/01/", "foundry/db/2026/12/"]);
  });

  it("reads a backup's time from the key the backup writes", () => {
    const at = new Date("2026-11-20T03:45:00Z");
    expect(backupTimeOf(backupObjectKey(at))?.toISOString()).toBe(at.toISOString());
    expect(backupTimeOf("foundry/db/2026/11/notes.txt")).toBeNull();
  });

  it("picks the newest of ours and ignores anything else in the bucket", () => {
    const keys = [
      backupObjectKey(new Date("2026-11-01T03:45:00Z")),
      "foundry/db/2026/11/zzz-not-a-backup.dump.enc",
      backupObjectKey(new Date("2026-11-20T03:45:00Z")),
      backupObjectKey(new Date("2026-11-19T03:45:00Z")),
    ];
    expect(newestBackupKey(keys)).toBe(backupObjectKey(new Date("2026-11-20T03:45:00Z")));
    expect(newestBackupKey(["other"])).toBeNull();
    expect(newestBackupKey([])).toBeNull();
  });
});

describe("comparing the restored copy with production", () => {
  it("passes when the counts are close (production has moved on a little)", () => {
    expect(countProblems([{ table: "Task", live: 5300, restored: 5210 }, { table: "Workspace", live: 3, restored: 3 }])).toEqual([]);
  });

  it("fails a table that is missing, empty or far off", () => {
    const problems = countProblems([
      { table: "Task", live: 5000, restored: null },
      { table: "User", live: 40, restored: 0 },
      { table: "Document", live: 10_000, restored: 6_000 },
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/Task is missing/);
    expect(problems[1]).toMatch(/User restored empty/);
    expect(problems[2]).toMatch(/Document has 6000 rows restored against 10000/);
  });

  it("never treats a table it couldn't count in production as a match", () => {
    expect(countProblems([{ table: "Task", live: null, restored: 10 }])).toHaveLength(1);
  });

  it("an empty table on both sides is fine", () => {
    expect(countProblems([{ table: "SupportConversation", live: 0, restored: 0 }])).toEqual([]);
  });
});

describe("disk room for the copy", () => {
  const GB = 1024 ** 3;
  it("starts only with room for a second copy and headroom to spare", () => {
    expect(restoreDiskProblem({ freeBytes: 60 * GB, totalBytes: 100 * GB, databaseBytes: 2 * GB })).toBeNull();
    expect(restoreDiskProblem({ freeBytes: 3 * GB, totalBytes: 100 * GB, databaseBytes: 2 * GB })).toMatch(/Not enough free disk/);
    expect(restoreDiskProblem({ freeBytes: 20 * GB, totalBytes: 100 * GB, databaseBytes: 10 * GB })).toMatch(/Not enough free disk/);
  });
  it("refuses when it can't read the database's size", () => {
    expect(restoreDiskProblem({ freeBytes: 60 * GB, totalBytes: 100 * GB, databaseBytes: null })).toMatch(/Couldn't read/);
  });
});

describe("what the Platform popup says", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  it("is off with the backup, and set up wrongly with it", () => {
    expect(restoreTestState({ config: "off", lastOk: null, lastFailed: null, now })).toEqual({ state: "off" });
    expect(restoreTestState({ config: "misconfigured", reason: "x", lastOk: null, lastFailed: null, now })).toEqual({ state: "misconfigured", reason: "x" });
  });
  it("says it hasn't run yet rather than that it passed", () => {
    expect(restoreTestState({ config: "on", lastOk: null, lastFailed: null, now }).state).toBe("never");
  });
  it("a failure newer than the last pass is a failure", () => {
    expect(restoreTestState({ config: "on", lastOk: "2026-10-02T05:20:00Z", lastFailed: "2026-11-02T05:20:00Z", now })).toMatchObject({ state: "failed", lastPassed: "2026-10-02T05:20:00Z" });
    expect(restoreTestState({ config: "on", lastOk: "2026-11-02T05:20:00Z", lastFailed: "2026-10-02T05:20:00Z", now }).state).toBe("passed");
  });
  it("is overdue after 35 days without a pass", () => {
    expect(restoreTestState({ config: "on", lastOk: "2026-10-20T05:20:00Z", lastFailed: null, now }).state).toBe("passed");
    expect(restoreTestState({ config: "on", lastOk: "2026-10-15T05:20:00Z", lastFailed: null, now }).state).toBe("overdue");
  });
});
