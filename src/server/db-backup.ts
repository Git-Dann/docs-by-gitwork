/**
 * Off-site, encrypted database backup (CLAUDE.md §144). Daily, from `/api/cron/db-backup`.
 *
 * pg_dump (custom format) → `pg_restore --list` to prove the file is readable → AES-256-GCM with
 * BACKUP_ENCRYPTION_KEY → one PUT to the BACKUP_S3_* bucket. The plain dump never leaves the
 * container and is deleted straight after; the bucket only ever holds ciphertext.
 *
 * Off until BACKUP_S3_* and BACKUP_ENCRYPTION_KEY are set: the route then answers
 * `{ skipped }` and alerts nobody. Once configured, a failure alerts Gitwork's admins with the
 * reason. How long backups are kept is the bucket's lifecycle rule, not this code.
 */

import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  BACKUP_IV_BYTES,
  BACKUP_MAGIC,
  BACKUP_MAX_BYTES,
  backupObjectKey,
  parseBackupKey,
  pgDumpUrl,
} from "@/lib/db-backup";
import { formatBytes } from "@/lib/disk-watch";
import { amzDateOf, resolveS3Config, s3ObjectUrl, signS3Request, type S3Config } from "@/server/blob-storage";
import { markSystem } from "@/server/system-markers";
import { sendOpsAlert } from "@/server/ops-alert";

export type BackupResult =
  | { skipped: string }
  | { ok: true; key: string; bytes: number; seconds: number }
  | { ok: false; error: string };

type Env = Record<string, string | undefined>;

/** The bucket and key, or why the backup is off. A half-set config is an error, not "off". */
export function backupConfig(env: Env = process.env): { s3: S3Config; key: Buffer } | { skipped: string } | { error: string } {
  let s3: S3Config | null;
  try {
    s3 = resolveS3Config(env, "BACKUP_S3_");
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const key = parseBackupKey(env.BACKUP_ENCRYPTION_KEY);
  if (!s3 && "error" in key && !env.BACKUP_ENCRYPTION_KEY?.trim()) {
    return { skipped: "Off-site backups are off: set BACKUP_S3_* and BACKUP_ENCRYPTION_KEY to switch them on." };
  }
  if (!s3) return { error: "BACKUP_ENCRYPTION_KEY is set but the BACKUP_S3_* bucket is not." };
  if ("error" in key) return { error: key.error };
  return { s3, key: key.key };
}

function run(cmd: string, args: string[], env: Env): Promise<void> {
  return new Promise((resolve, reject) => {
    const childEnv = { PATH: process.env.PATH, ...env } as unknown as NodeJS.ProcessEnv;
    const child = spawn(cmd, args, { env: childEnv, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      if (stderr.length < 2000) stderr += String(d);
    });
    child.on("error", (err) => reject(new Error(`${cmd} could not start: ${err.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.trim().split("\n").slice(-2).join(" ")}`)),
    );
  });
}

async function encryptFile(src: string, dest: string, key: Buffer): Promise<void> {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.from(BACKUP_MAGIC, "ascii"));
  out.write(iv);
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => out.end(cipher.getAuthTag(), (err?: Error | null) => (err ? reject(err) : resolve())));
}

async function upload(s3: S3Config, objectKey: string, body: Buffer): Promise<void> {
  const url = s3ObjectUrl(s3, objectKey);
  const amzDate = amzDateOf(new Date());
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const signed: Record<string, string> = {
    host: url.host,
    "content-type": "application/octet-stream",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const { authorization } = signS3Request({
    method: "PUT",
    canonicalPath: url.pathname,
    headers: signed,
    payloadHash,
    region: s3.region,
    service: "s3",
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    amzDate,
  });
  const { host: _host, ...headers } = signed;
  void _host;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, authorization },
    body: new Blob([new Uint8Array(body)]),
    cache: "no-store",
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const code = /<Code>([^<]+)<\/Code>/.exec(await res.text().catch(() => ""))?.[1];
    throw new Error(`the bucket refused the upload: HTTP ${res.status}${code ? ` (${code})` : ""}`);
  }
}

export async function runDbBackup(env: Env = process.env, now: Date = new Date()): Promise<BackupResult> {
  const config = backupConfig(env);
  if ("skipped" in config) return config;
  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "foundry-backup-"));
  try {
    if ("error" in config) throw new Error(config.error);
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const dump = join(dir, "foundry.dump");
    const enc = join(dir, "foundry.dump.enc");
    // The URL goes in the environment, not argv, so the password never shows in `ps`.
    await run("pg_dump", ["--format=custom", "--no-owner", "--file", dump], { PGDATABASE: pgDumpUrl(env.DATABASE_URL) });
    await run("pg_restore", ["--list", dump], {});
    await encryptFile(dump, enc, config.key);
    await rm(dump, { force: true });
    const { size } = await stat(enc);
    if (size > BACKUP_MAX_BYTES) {
      throw new Error(`the encrypted dump is ${formatBytes(size)}, over the ${formatBytes(BACKUP_MAX_BYTES)} this backup uploads in one go. It needs multipart upload now.`);
    }
    const key = backupObjectKey(now);
    await upload(config.s3, key, await readFile(enc));
    await markSystem("db-backup-ok", now);
    return { ok: true, key, bytes: size, seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await sendOpsAlert({ key: "db-backup", title: "The off-site database backup failed", body: `${error}. The last good one is still in the bucket.` });
    return { ok: false, error };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** For the round-trip test only. */
export const __encryptFileForTests = encryptFile;
