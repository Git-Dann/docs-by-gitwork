/**
 * Monthly restore test of the off-site backup (CLAUDE.md §148), from `/api/cron/db-restore-test`.
 *
 * Downloads the NEWEST backup from the BACKUP_S3_* bucket, decrypts it with
 * BACKUP_ENCRYPTION_KEY, restores it into the throwaway database `foundry_restore_test` on the
 * same Postgres server, counts a handful of core tables against production, then drops the
 * throwaway database. Production's data is only ever READ (the counts); the only database this
 * creates, restores into or drops is the fixed throwaway, asserted not to be the live one.
 *
 * Off (`{ skipped }`) until the same secrets as the backup are set; half set is an error. A pass
 * records the `db-restore-ok` marker; a failure records `db-restore-failed` and alerts.
 */

import { spawn } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BACKUP_IV_BYTES, BACKUP_MAGIC, BACKUP_TAG_BYTES } from "@/lib/db-backup";
import {
  RESTORE_CHECK_TABLES,
  RESTORE_MAX_BACKUP_AGE_MS,
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
  type TableCount,
} from "@/lib/db-restore-test";
import { amzDateOf, awsUriEncode, canonicalQueryOf, s3ObjectUrl, signS3Request, type S3Config } from "@/server/blob-storage";
import { backupConfig } from "@/server/db-backup";
import { readDisk } from "@/server/disk-watch";
import { sendOpsAlert } from "@/server/ops-alert";
import { markSystem, readSystemMarkers } from "@/server/system-markers";

export type RestoreTestResult =
  | { skipped: string }
  | { ok: true; key: string; backupAt: string; counts: TableCount[]; seconds: number }
  | { ok: false; error: string };

type Env = Record<string, string | undefined>;

const EMPTY_HASH = createHash("sha256").update("").digest("hex");

/** A signed GET against the backup bucket (no body). */
async function s3Get(s3: S3Config, url: URL, canonicalQuery: string, timeoutMs: number): Promise<Response> {
  const amzDate = amzDateOf(new Date());
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": EMPTY_HASH, "x-amz-date": amzDate };
  const { authorization } = signS3Request({
    method: "GET",
    canonicalPath: url.pathname,
    canonicalQuery,
    headers,
    payloadHash: EMPTY_HASH,
    region: s3.region,
    service: "s3",
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    amzDate,
  });
  const { host: _host, ...rest } = headers;
  void _host;
  return fetch(url, { headers: { ...rest, authorization }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
}

function bucketUrl(s3: S3Config): URL {
  return s3.endpoint
    ? new URL(`${s3.endpoint}/${awsUriEncode(s3.bucket, false)}`)
    : new URL(`https://${s3.bucket}.s3.${s3.region}.amazonaws.com/`);
}

async function listKeys(s3: S3Config, prefix: string): Promise<string[]> {
  const params = { "list-type": "2", prefix };
  const query = canonicalQueryOf(params);
  const url = bucketUrl(s3);
  url.search = query;
  const res = await s3Get(s3, url, query, 30_000);
  const text = await res.text();
  if (!res.ok) {
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    throw new Error(`the bucket refused the listing: HTTP ${res.status}${code ? ` (${code})` : ""}`);
  }
  if (/<IsTruncated>true<\/IsTruncated>/.test(text)) {
    // A month's folder holds ~31 daily backups; 1,000 means something else is writing there.
    throw new Error(`the backup folder ${prefix} lists over 1,000 objects, which is not what the backup writes`);
  }
  return parseListedKeys(text);
}

async function download(s3: S3Config, key: string, dest: string): Promise<void> {
  const res = await s3Get(s3, s3ObjectUrl(s3, key), "", 600_000);
  if (!res.ok || !res.body) throw new Error(`the bucket refused the download of the newest backup: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(dest, { mode: 0o600 }));
}

/** Reverses src/server/db-backup.ts's encryption, streaming, so a large dump never sits in memory. */
export async function decryptBackupFile(src: string, dest: string, key: Buffer): Promise<void> {
  const { size } = await stat(src);
  const head = 4 + BACKUP_IV_BYTES;
  if (size < head + BACKUP_TAG_BYTES) throw new Error("the downloaded backup is too short to be one");
  const fh = await open(src, "r");
  const magic = Buffer.alloc(4);
  const iv = Buffer.alloc(BACKUP_IV_BYTES);
  const tag = Buffer.alloc(BACKUP_TAG_BYTES);
  try {
    await fh.read(magic, 0, 4, 0);
    await fh.read(iv, 0, BACKUP_IV_BYTES, 4);
    await fh.read(tag, 0, BACKUP_TAG_BYTES, size - BACKUP_TAG_BYTES);
  } finally {
    await fh.close();
  }
  if (magic.toString("ascii") !== BACKUP_MAGIC) throw new Error("the downloaded file is not a Foundry backup (no FDB1 header)");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(src, { start: head, end: size - BACKUP_TAG_BYTES - 1 }), decipher, createWriteStream(dest, { mode: 0o600 }));
  } catch {
    await rm(dest, { force: true });
    throw new Error("the newest backup could not be decrypted: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged");
  }
}

function run(cmd: string, args: string[], env: Env): Promise<void> {
  return new Promise((resolve, reject) => {
    const childEnv = { PATH: process.env.PATH, ...env } as unknown as NodeJS.ProcessEnv;
    const child = spawn(cmd, args, { env: childEnv, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      if (stderr.length < 4000) stderr += String(d);
    });
    child.on("error", (err) => reject(new Error(`${cmd} could not start: ${err.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" ")}`)),
    );
  });
}

/** Run one statement as the live connection's user. The name is checked before it is used. */
async function adminStatement(sql: "create" | "drop", liveName: string): Promise<void> {
  assertThrowawayName(RESTORE_TEST_DB, liveName);
  // Identifier is the fixed constant just asserted; nothing from outside reaches this string.
  const statement =
    sql === "create" ? `CREATE DATABASE "${RESTORE_TEST_DB}"` : `DROP DATABASE IF EXISTS "${RESTORE_TEST_DB}" WITH (FORCE)`;
  await prisma.$executeRawUnsafe(statement);
}

async function countTables(client: { $queryRawUnsafe: PrismaClient["$queryRawUnsafe"] }): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const table of RESTORE_CHECK_TABLES) {
    try {
      const rows = await client.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      out[table] = rows[0] ? Number(rows[0].n) : null;
    } catch {
      out[table] = null;
    }
  }
  return out;
}

export async function runRestoreTest(env: Env = process.env, now: Date = new Date()): Promise<RestoreTestResult> {
  const config = backupConfig(env);
  if ("skipped" in config) return { skipped: config.skipped.replace("Off-site backups are off", "The restore test is off") };

  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "foundry-restore-"));
  let created = false;
  let liveName = "";
  try {
    if ("error" in config) throw new Error(config.error);
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const restoreUrl = restoreDatabaseUrl(env.DATABASE_URL);
    liveName = decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1));

    let key: string | null = null;
    for (const prefix of backupMonthPrefixes(now)) {
      key = newestBackupKey(await listKeys(config.s3, prefix));
      if (key) break;
    }
    if (!key) throw new Error("there is no backup in the bucket from this month or last");
    const backupAt = backupTimeOf(key)!;
    if (now.getTime() - backupAt.getTime() > RESTORE_MAX_BACKUP_AGE_MS) {
      throw new Error(`the newest backup is from ${backupAt.toISOString().slice(0, 10)}, over 3 days old: the daily backup has stopped`);
    }

    const disk = await readDisk().catch(() => null);
    const diskProblem = disk ? restoreDiskProblem(disk) : "Couldn't read the disk, so the restore was not started.";
    if (diskProblem) throw new Error(diskProblem);

    const enc = join(dir, "backup.dump.enc");
    const dump = join(dir, "backup.dump");
    await download(config.s3, key, enc);
    await decryptBackupFile(enc, dump, config.key);
    await rm(enc, { force: true });
    await run("pg_restore", ["--list", dump], {});

    await adminStatement("drop", liveName);
    await adminStatement("create", liveName);
    created = true;
    await run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", "--dbname", RESTORE_TEST_DB, dump], libpqEnv(restoreUrl));

    const restoredClient = new PrismaClient({ datasourceUrl: restoreUrl });
    let restored: Record<string, number | null>;
    try {
      restored = await countTables(restoredClient);
    } finally {
      await restoredClient.$disconnect();
    }
    const live = await countTables(prisma);
    const counts: TableCount[] = RESTORE_CHECK_TABLES.map((table) => ({ table, live: live[table], restored: restored[table] }));
    const problems = countProblems(counts);
    if (problems.length) throw new Error(`the restored copy doesn't match production: ${problems.join("; ")}`);

    const markers = await readSystemMarkers(["db-restore-ok", "db-restore-failed"]).catch(() => null);
    const wasFailing = markers?.["db-restore-failed"] && (!markers["db-restore-ok"] || markers["db-restore-failed"] > markers["db-restore-ok"]);
    await markSystem("db-restore-ok", now);
    if (wasFailing) {
      await sendOpsAlert({ key: "db-restore-test", level: "resolved", title: "The backup restore test passes again", body: `Restored ${key.split("/").pop()} and the counts matched production.` });
    }
    return { ok: true, key, backupAt: backupAt.toISOString(), counts, seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await markSystem("db-restore-failed", now);
    await sendOpsAlert({
      key: "db-restore-test",
      title: "The monthly backup restore test failed",
      body: `${error}. Nothing in production was changed. Until this passes, assume the off-site backup can't be restored.`,
    });
    return { ok: false, error };
  } finally {
    if (created && liveName) {
      await adminStatement("drop", liveName).catch((e) =>
        console.warn(`[db-restore-test] could not drop ${RESTORE_TEST_DB}: ${e instanceof Error ? e.message : e}`),
      );
    }
    await rm(dir, { recursive: true, force: true });
  }
}

