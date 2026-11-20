/**
 * The off-site backup: when it is off, that a half-set config is an error rather than "off",
 * that pg_dump gets a URL it accepts, and that what the code encrypts the decrypt script
 * restores byte for byte (and refuses with the wrong key).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/system-markers", () => ({ markSystem: vi.fn() }));
vi.mock("@/server/ops-alert", () => ({ sendOpsAlert: vi.fn() }));

import { backupObjectKey, parseBackupKey, pgDumpUrl } from "@/lib/db-backup";
import { __encryptFileForTests, backupConfig, runDbBackup } from "@/server/db-backup";
import { sendOpsAlert } from "@/server/ops-alert";

const KEY = randomBytes(32).toString("base64");
const S3 = {
  BACKUP_S3_BUCKET: "b",
  BACKUP_S3_REGION: "eu-west-2",
  BACKUP_S3_ACCESS_KEY_ID: "id",
  BACKUP_S3_SECRET_ACCESS_KEY: "secret",
};

describe("backupConfig", () => {
  it("is off, quietly, with nothing set", async () => {
    expect(backupConfig({})).toHaveProperty("skipped");
    expect(await runDbBackup({})).toHaveProperty("skipped");
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it("treats a half-set config as an error, not as off", () => {
    expect(backupConfig({ BACKUP_ENCRYPTION_KEY: KEY })).toHaveProperty("error");
    expect(backupConfig({ ...S3 })).toMatchObject({ error: "BACKUP_ENCRYPTION_KEY is not set." });
    expect(backupConfig({ ...S3, BACKUP_S3_BUCKET: "" , BACKUP_ENCRYPTION_KEY: KEY })).toHaveProperty("error");
    expect(backupConfig({ ...S3, BACKUP_ENCRYPTION_KEY: "short" })).toHaveProperty("error");
  });

  it("is on with the bucket and a 32-byte key", () => {
    const c = backupConfig({ ...S3, BACKUP_ENCRYPTION_KEY: KEY });
    expect(c).toHaveProperty("s3.bucket", "b");
  });

  it("never reads the uploads bucket's variables", () => {
    expect(backupConfig({ BLOB_S3_BUCKET: "b", BLOB_S3_REGION: "r", BLOB_S3_ACCESS_KEY_ID: "i", BLOB_S3_SECRET_ACCESS_KEY: "s" })).toHaveProperty("skipped");
  });
});

describe("pgDumpUrl", () => {
  it("keeps what libpq understands and drops Prisma's own parameters", () => {
    const u = pgDumpUrl("postgresql://foundry:p%40ss@db:5432/foundry?sslmode=disable&schema=public&connection_limit=5");
    expect(u).toBe("postgresql://foundry:p%40ss@db:5432/foundry?sslmode=disable");
  });
  it("refuses a URL that isn't Postgres", () => {
    expect(() => pgDumpUrl("mysql://x@y/z")).toThrow();
  });
});

describe("keys and names", () => {
  it("parses a base64 32-byte key", () => {
    expect(parseBackupKey(KEY)).toHaveProperty("key");
    expect(parseBackupKey(undefined)).toHaveProperty("error");
    expect(parseBackupKey(randomBytes(16).toString("base64"))).toHaveProperty("error");
  });
  it("names objects by date, a folder a month", () => {
    expect(backupObjectKey(new Date("2026-11-20T03:45:12Z"))).toBe("foundry/db/2026/11/foundry-2026-11-20T0345Z.dump.enc");
  });
});

describe("encryption round trip", () => {
  it("decrypts byte for byte with the right key and refuses the wrong one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "backup-"));
    try {
      const plain = randomBytes(200_000);
      writeFileSync(join(dir, "in.dump"), plain);
      await __encryptFileForTests(join(dir, "in.dump"), join(dir, "out.enc"), Buffer.from(KEY, "base64"));
      const enc = readFileSync(join(dir, "out.enc"));
      expect(enc.subarray(0, 4).toString()).toBe("FDB1");
      expect(enc.includes(plain.subarray(0, 64))).toBe(false);

      const script = join(process.cwd(), "scripts/decrypt-backup.mjs");
      const ok = spawnSync("node", [script, join(dir, "out.enc"), join(dir, "back.dump")], {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY: KEY },
        encoding: "utf8",
      });
      expect(ok.status).toBe(0);
      expect(readFileSync(join(dir, "back.dump")).equals(plain)).toBe(true);

      const bad = spawnSync("node", [script, join(dir, "out.enc"), join(dir, "bad.dump")], {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64") },
        encoding: "utf8",
      });
      expect(bad.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
