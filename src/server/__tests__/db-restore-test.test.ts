/**
 * The restore test's server half (CLAUDE.md §148): off quietly when the backup is off, an error
 * (with an alert) when half set, and what the backup encrypts the restore test decrypts byte for
 * byte, refusing a wrong key without leaving a file behind.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/system-markers", () => ({ markSystem: vi.fn(), readSystemMarkers: vi.fn(async () => ({})) }));
vi.mock("@/server/ops-alert", () => ({ sendOpsAlert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() } }));

import { __encryptFileForTests } from "@/server/db-backup";
import { decryptBackupFile, runRestoreTest } from "@/server/db-restore-test";
import { markSystem } from "@/server/system-markers";
import { sendOpsAlert } from "@/server/ops-alert";
import { prisma } from "@/lib/prisma";

const KEY = randomBytes(32);
const S3 = {
  BACKUP_S3_BUCKET: "b",
  BACKUP_S3_REGION: "eu-west-2",
  BACKUP_S3_ACCESS_KEY_ID: "id",
  BACKUP_S3_SECRET_ACCESS_KEY: "secret",
};

beforeEach(() => vi.clearAllMocks());

describe("runRestoreTest", () => {
  it("is off, quietly, with nothing set", async () => {
    expect(await runRestoreTest({})).toHaveProperty("skipped");
    expect(sendOpsAlert).not.toHaveBeenCalled();
    expect(markSystem).not.toHaveBeenCalled();
  });

  it("fails and alerts when half set, without touching any database", async () => {
    const r = await runRestoreTest({ ...S3, DATABASE_URL: "postgresql://u:p@db:5432/foundry" });
    expect(r).toMatchObject({ ok: false });
    expect(sendOpsAlert).toHaveBeenCalledTimes(1);
    expect(markSystem).toHaveBeenCalledWith("db-restore-failed", expect.any(Date));
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("refuses a live database already named like the throwaway, before listing anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await runRestoreTest({ ...S3, BACKUP_ENCRYPTION_KEY: KEY.toString("base64"), DATABASE_URL: "postgresql://u:p@db:5432/foundry_restore_test" });
    expect(r).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("canonicalQueryOf (SigV4 listing)", () => {
  it("encodes every name and value and sorts by name", async () => {
    const { canonicalQueryOf } = await import("@/server/blob-storage");
    expect(canonicalQueryOf({ prefix: "foundry/db/2026/11/", "list-type": "2" })).toBe("list-type=2&prefix=foundry%2Fdb%2F2026%2F11%2F");
  });
});

describe("decryptBackupFile", () => {
  it("restores what the backup encrypted, byte for byte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restore-test-"));
    try {
      const plain = randomBytes(300_000);
      writeFileSync(join(dir, "a.dump"), plain);
      await __encryptFileForTests(join(dir, "a.dump"), join(dir, "a.enc"), KEY);
      await decryptBackupFile(join(dir, "a.enc"), join(dir, "b.dump"), KEY);
      expect(readFileSync(join(dir, "b.dump")).equals(plain)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a wrong key and leaves no output behind", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restore-test-"));
    try {
      writeFileSync(join(dir, "a.dump"), randomBytes(1000));
      await __encryptFileForTests(join(dir, "a.dump"), join(dir, "a.enc"), KEY);
      await expect(decryptBackupFile(join(dir, "a.enc"), join(dir, "b.dump"), randomBytes(32))).rejects.toThrow(/could not be decrypted/);
      expect(existsSync(join(dir, "b.dump"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a file that isn't a Foundry backup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restore-test-"));
    try {
      writeFileSync(join(dir, "x.enc"), randomBytes(200));
      await expect(decryptBackupFile(join(dir, "x.enc"), join(dir, "y"), KEY)).rejects.toThrow(/not a Foundry backup/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
